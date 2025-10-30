/**
 * 交易所客户端
 * 直接连接交易所获取账户和仓位数据
 */

import ccxt from 'ccxt';

export interface ExchangeConfig {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  password?: string;
  useSandbox: boolean;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;  // 实际币数量（不是合约张数）
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  unrealizedPnl: number;
  margin: number;
}

export class ExchangeClient {
  private exchange: any;

  constructor(config: ExchangeConfig) {
    // 创建交易所实例
    const ExchangeClass = ccxt[config.exchange as keyof typeof ccxt] as any;
    
    this.exchange = new ExchangeClass({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      password: config.password,
      enableRateLimit: true,
      options: {
        defaultType: 'swap', // 永续合约
      },
    });

    // 设置沙盒模式
    if (config.useSandbox) {
      this.exchange.setSandboxMode(true);
    }
  }

  /**
   * 获取底层的 CCXT exchange 对象
   */
  getExchange(): any {
    return this.exchange;
  }

  /**
   * 获取账户余额（返回账户权益，包含未实现盈亏）
   */
  async getBalance(): Promise<number> {
    try {
      const balance = await this.exchange.fetchBalance();
      
      // OKX 返回的 balance.info.data[0] 包含账户详情
      // totalEq = 账户总权益（包含未实现盈亏）
      const accountData = balance.info?.data?.[0];
      
      // 从 details 中找到 USDT 的账户信息
      const usdtDetail = accountData?.details?.find((d: any) => d.ccy === 'USDT');
      
      console.log('[ExchangeClient] Balance info:', {
        'accountData.totalEq': accountData?.totalEq,
        'usdtDetail.eq': usdtDetail?.eq,
        'usdtDetail.frozenBal': usdtDetail?.frozenBal,
        'usdtDetail.isoEq': usdtDetail?.isoEq,
        'usdtDetail.isoUpl': usdtDetail?.isoUpl,
        'USDT.total': balance.USDT?.total
      });
      
      // 优先使用 USDT 的 eq（USDT 总权益，包含保证金和未实现盈亏）
      if (usdtDetail && usdtDetail.eq) {
        const usdtEquity = parseFloat(usdtDetail.eq);
        console.log('[ExchangeClient] Using usdtDetail.eq:', usdtEquity);
        return usdtEquity;
      }
      
      // 其次使用 accountData.totalEq（跨币种总权益）
      if (accountData && accountData.totalEq) {
        const totalEquity = parseFloat(accountData.totalEq);
        console.log('[ExchangeClient] Using accountData.totalEq:', totalEquity);
        return totalEquity;
      }
      
      // 降级方案：使用 USDT.total
      const fallback = balance.USDT?.total || 0;
      console.log('[ExchangeClient] Using USDT.total as fallback:', fallback);
      return fallback;
    } catch (error) {
      console.error('[ExchangeClient] Error fetching balance:', error);
      throw error;
    }
  }

  /**
   * 获取所有持仓
   */
  async getPositions(): Promise<Position[]> {
    try {
      const positions = await this.exchange.fetchPositions();
      
      // 调试：打印原始数据
      console.log(`[ExchangeClient] fetchPositions returned ${positions.length} positions`);
      if (positions.length > 0) {
        console.log('[ExchangeClient] First position raw data:', JSON.stringify(positions[0], null, 2));
      }
      
      return positions
        .filter((pos: any) => {
          // 检查多个可能的字段
          const contracts = parseFloat(String(pos.contracts || pos.info?.pos || '0'));
          const hasPosition = contracts > 0 || parseFloat(String(pos.info?.pos || '0')) !== 0;
          
          if (!hasPosition) {
            console.log(`[ExchangeClient] Filtered out position:`, {
              symbol: pos.symbol,
              contracts: pos.contracts,
              'info.pos': pos.info?.pos,
              side: pos.side
            });
          }
          
          return hasPosition;
        })
        .map((pos: any) => {
          const symbol = pos.symbol?.split('/')[0] || '';
          
          // 获取持仓方向：优先使用 posSide，其次从 side 推导
          // OKX API: posSide = 'long' | 'short' | 'net'
          const posSide = pos.info?.posSide || pos.side;
          const isShort = posSide === 'short';
          
          // OKX 使用 info.pos 字段表示持仓张数（绝对值）
          const posSize = Math.abs(parseFloat(String(pos.info?.pos || pos.contracts || '0')));
          // contractSize 表示每张合约代表多少个币
          const contractSize = parseFloat(String(pos.contractSize || '1'));
          // 实际币数量 = 合约张数 × 每张合约的币数量
          const quantity = posSize * contractSize;
          
          const entryPrice = parseFloat(String(pos.entryPrice || pos.info?.avgPx || '0'));
          const currentPrice = parseFloat(String(pos.markPrice || pos.info?.markPx || pos.entryPrice || '0'));
          const leverage = parseFloat(String(pos.leverage || pos.info?.lever || '1'));
          
          // 直接使用交易所返回的未实现盈亏，而不是自己计算
          // 交易所的计算已经考虑了手续费、资金费率等因素
          const unrealizedPnl = parseFloat(String(pos.unrealizedPnl || pos.info?.upl || '0'));
          
          console.log(`[ExchangeClient] ${symbol} position:`, {
            posSide,
            posSize,
            contractSize,
            quantity,
            side: isShort ? 'short' : 'long',
            entryPrice,
            currentPrice,
            unrealizedPnl: `${unrealizedPnl} (from API)`
          });
          
          const initialMargin = parseFloat(String(pos.initialMargin || pos.info?.margin || '0'));
          
          // 计算保证金（USDT）
          const margin = initialMargin < 1 && currentPrice > 100
            ? initialMargin * currentPrice
            : initialMargin;

          return {
            symbol,
            side: isShort ? 'short' : 'long',  // 使用 API 返回的方向
            quantity,  // 返回实际币数量（绝对值）
            entryPrice,
            currentPrice,
            leverage,
            unrealizedPnl,
            margin,
          };
        });
    } catch (error) {
      console.error('[ExchangeClient] Error fetching positions:', error);
      throw error;
    }
  }

  /**
   * 获取账户状态（余额 + 仓位）
   */
  async getAccountState(): Promise<{
    balance: number;
    positions: Position[];
    accountValue: number;
    totalUnrealizedPnl: number;
  }> {
    const balance = await this.getBalance(); // 这已经是 totalEq，包含未实现盈亏
    const positions = await this.getPositions();
    
    const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    
    // balance (totalEq) 已经包含未实现盈亏，所以 accountValue = balance
    const accountValue = balance;

    return {
      balance,
      positions,
      accountValue,
      totalUnrealizedPnl,
    };
  }

  /**
   * 获取历史已平仓位（最近100条）
   * 使用 CCXT 统一接口获取交易所的历史仓位
   */
  async getClosedPositions(limit: number = 100): Promise<Array<{
    symbol: string;
    side: 'long' | 'short';
    contracts: number;
    entryPrice: number;
    exitPrice: number;
    leverage: number;
    realizedPnl: number;
    entryTime: number;
    exitTime: number;
  }>> {
    try {
      // 直接使用 OKX 原生 API 获取历史仓位
      // https://www.okx.com/docs-v5/zh/#trading-account-rest-api-get-positions-history
      const response = await this.exchange.privateGetAccountPositionsHistory({
        instType: 'SWAP',
        limit: limit.toString()
      });
      
      const closedPositions = response.data || [];
      console.log(`[ExchangeClient] Fetched ${closedPositions.length} closed positions from OKX`);
      
      if (closedPositions.length > 0) {
        console.log('[ExchangeClient] First closed position sample:', JSON.stringify(closedPositions[0], null, 2));
      }
      
      return closedPositions
        .map((pos: any) => {
          const symbol = pos.instId?.split('-')[0] || ''; // OKX format: BTC-USDT-SWAP
          
          // 获取持仓方向
          const side = pos.posSide === 'short' ? 'short' : 'long';
          
          // 平仓数量（张数）转换为实际币数量
          const posSize = Math.abs(parseFloat(String(pos.closeTotalPos || '0')));
          // 需要从市场信息获取 contractSize，这里先用默认映射
          const contractSizeMap: {[key: string]: number} = {
            'BTC': 0.01, 'ETH': 0.1, 'SOL': 1, 'BNB': 0.01
          };
          const contractSize = contractSizeMap[symbol] || 1;
          const contracts = posSize * contractSize;
          
          const entryPrice = parseFloat(String(pos.openAvgPx || '0'));
          const exitPrice = parseFloat(String(pos.closeAvgPx || '0'));
          const leverage = parseFloat(String(pos.lever || '1'));
          
          // 使用 realizedPnl（已实现盈亏，包含手续费）而不是 pnl（不含手续费）
          // realizedPnl = pnl + fee
          const realizedPnl = parseFloat(String(pos.realizedPnl || pos.pnl || '0'));
          const fee = parseFloat(String(pos.fee || '0'));
          
          // 时间戳（毫秒）
          const entryTime = parseInt(pos.cTime || '0');
          const exitTime = parseInt(pos.uTime || '0');

          return {
            symbol,
            side,
            contracts,
            entryPrice,
            exitPrice,
            leverage,
            realizedPnl,
            entryTime,
            exitTime,
          };
        });
    } catch (error) {
      console.error('[ExchangeClient] Error fetching closed positions:', error);
      return [];
    }
  }
}
