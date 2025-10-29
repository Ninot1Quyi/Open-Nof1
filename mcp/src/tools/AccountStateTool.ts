/**
 * MCP Tool: get_account_state
 * Fetches account balance, positions, and performance metrics
 */

import { ExchangeAdapter } from '../exchange/ExchangeAdapter.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { AccountStateParams, AccountStateResponse, Position } from '../types.js';
import config from '../config.js';

export class AccountStateTool {
  private agentName: string;

  constructor(
    private exchange: ExchangeAdapter,
    private db: DatabaseManager,
    agentName: string = 'default'
  ) {
    this.agentName = agentName;
  }

  private log(message: string): void {
    // console.error(`[${this.agentName}][MCP] ${message}`);
  }

  async execute(params: AccountStateParams): Promise<AccountStateResponse> {
    const {
      include_positions = true,
      include_history = true,
      include_performance = true,
    } = params;

    // Get balance
    const balance = await this.exchange.getBalance();
    // console.error('[DEBUG-BALANCE] Raw balance from exchange:', JSON.stringify(balance, null, 2));
    // console.error('[DEBUG-BALANCE] balance.USDT:', balance.USDT);
    // console.error('[DEBUG-BALANCE] balance keys:', Object.keys(balance));
    const usdtBalance = balance.USDT || { free: 0, used: 0, total: 0 };
    // console.error('[DEBUG-BALANCE] usdtBalance:', usdtBalance);

    // Step 1: 从交易所获取实时仓位数据
    const exchangePositions = include_positions
      ? await this.exchange.getPositions()
      : [];
    
    // this.log(`Found ${exchangePositions.length} positions from exchange`);

    // Step 2: 同步交易所数据到数据库
    // 获取数据库中所有开仓记录
    const allTrades = await this.db.getAllTrades();
    const openTrades = allTrades.filter(t => t.status === 'open');
    
    // 创建交易所仓位的映射 (coin + side -> position)
    const exchangePositionMap = new Map<string, any>();
    for (const pos of exchangePositions) {
      const coin = pos.symbol?.split('/')[0] || '';
      const side = pos.side === 'long' ? 'long' : 'short';
      const key = `${coin}_${side}`;
      exchangePositionMap.set(key, pos);
    }
    
    // 检查数据库中的仓位，如果交易所已经没有了，标记为已关闭
    for (const trade of openTrades) {
      const key = `${trade.coin}_${trade.side}`;
      if (!exchangePositionMap.has(key)) {
        // this.log(`Position ${trade.coin} ${trade.side} no longer exists on exchange, marking as closed`);
        await this.db.updateTradeStatus(trade.position_id, 'closed');
      }
    }
    
    // Step 3: 构建返回的仓位列表（从数据库读取完整信息）
    const positions: Position[] = [];
    let totalUnrealizedPnl = 0;

    for (const pos of exchangePositions) {
      const contracts = parseFloat(String(pos.contracts || '0'));
      if (contracts === 0) continue;

      const entryPrice = parseFloat(String(pos.entryPrice || '0'));
      const currentPrice = parseFloat(String(pos.markPrice || '0'));
      const leverage = parseFloat(String(pos.leverage || '1'));
      const side = pos.side === 'long' ? 'long' : 'short';
      const coin = pos.symbol?.split('/')[0] || '';

      // Use unrealized PnL from exchange API (more accurate)
      // OKX API already calculates this correctly considering contract size, fees, etc.
      const unrealizedPnl = parseFloat(String(pos.unrealizedPnl || '0'));
      
      totalUnrealizedPnl += unrealizedPnl;

      // 从数据库查找对应的交易记录（获取 position_id 和 exit_plan）
      const tradeRecord = openTrades.find(t => 
        t.coin === coin && 
        t.side === side
      );
      
      if (tradeRecord) {
        // this.log(`Found DB record for ${coin} ${side}: position_id=${tradeRecord.position_id}`);
      } else {
        // this.log(`No DB record for ${coin} ${side}, this is an untracked position`);
      }

      // Calculate margin in USDT
      const initialMarginRaw = parseFloat(String(pos.initialMargin || '0'));
      const marginInUsdt = initialMarginRaw < 1 && currentPrice > 100
        ? initialMarginRaw * currentPrice
        : initialMarginRaw;
      
      positions.push({
        coin,
        side,
        entry_price: entryPrice,
        entry_time: pos.timestamp ? new Date(pos.timestamp).toISOString() : new Date().toISOString(),
        quantity: contracts,
        leverage,
        liquidation_price: parseFloat(String(pos.liquidationPrice || '0')),
        margin: marginInUsdt,
        unrealized_pnl: unrealizedPnl,
        current_price: currentPrice,
        exit_plan: tradeRecord?.exit_plan,      // 从数据库读取
        position_id: tradeRecord?.position_id,  // 从数据库读取我们的 UUID
      });
    }

    // Step 4: 同步委托订单到数据库
    // this.log(`Syncing open orders to database...`);
    try {
      const openOrders = await this.exchange.getOpenOrders();
      // this.log(`Found ${openOrders.length} open orders from exchange`);
      
      // 为每个有数据库记录的仓位更新委托订单 ID
      for (const trade of openTrades) {
        // 查找该仓位的止损/止盈订单
        const slOrder = openOrders.find(o => 
          o.symbol?.includes(trade.coin) && 
          o.type === 'stop' &&
          o.side === (trade.side === 'long' ? 'sell' : 'buy')
        );
        
        const tpOrder = openOrders.find(o => 
          o.symbol?.includes(trade.coin) && 
          o.type === 'limit' &&
          o.side === (trade.side === 'long' ? 'sell' : 'buy')
        );
        
        // 更新数据库中的订单 ID
        const needsUpdate = (slOrder && trade.sl_oid !== slOrder.id) || 
                           (tpOrder && trade.tp_oid !== tpOrder.id);
        
        if (needsUpdate) {
          // this.log(`Updating orders for ${trade.coin}: SL=${slOrder?.id}, TP=${tpOrder?.id}`);
          await this.db.updateTrade(trade.position_id, {
            sl_oid: slOrder?.id,
            tp_oid: tpOrder?.id,
          });
        }
      }
    } catch (error) {
      // this.log(`Failed to sync orders: ${error}`);
      // 不影响主流程
    }

    // 计算账户指标
    // Total PnL = 当前账户价值 - 初始资金
    const initialBalance = config.initialBalance || 10000;
    const accountValue = (usdtBalance.total || 0) + totalUnrealizedPnl;
    const totalPnl = accountValue - initialBalance;
    
    // 从数据库获取历史统计（用于性能分析）
    const dbTotalPnl = await this.db.calculateTotalPnL();
    const totalFees = await this.db.calculateTotalFees();
    const netRealized = dbTotalPnl - totalFees;

    // Performance metrics
    let sharpeRatio: number | undefined;
    let winRate: number | undefined;
    let tradeCount = 0;

    if (include_performance) {
      sharpeRatio = await this.db.calculateSharpeRatio();
      winRate = await this.db.calculateWinRate();
      tradeCount = allTrades.length;
    }

    return {
      account_value: accountValue,
      available_cash: usdtBalance.free || 0,
      total_pnl: totalPnl,
      total_fees: totalFees,
      net_realized: netRealized,
      sharpe_ratio: sharpeRatio,
      win_rate: winRate,
      trade_count: tradeCount,
      active_positions: positions,
    };
  }
}
