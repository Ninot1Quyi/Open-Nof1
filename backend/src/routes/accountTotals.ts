/**
 * API路由: GET /api/account-totals
 * 实时从交易所获取账户总览和仓位信息
 * 然后从 MCP 数据库获取 position_id 和 exit_plan
 */

import { Router, Request, Response } from 'express';
import * as db from '../database/db.js';
import { ExchangeClient } from '../services/ExchangeClient.js';
import pg from 'pg';
const { Pool } = pg;

const router = Router();

// MCP 数据库连接池
const mcpPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'nof1',
  user: process.env.DB_USER || 'OpenNof1',
  password: process.env.DB_PASSWORD || '',
});

// 交易所客户端缓存
const exchangeClients: Map<string, ExchangeClient> = new Map();

// 初始化交易所客户端
function getExchangeClient(modelId: string): ExchangeClient {
  if (!exchangeClients.has(modelId)) {
    const client = new ExchangeClient({
      exchange: 'okx',
      apiKey: process.env.OKX_API_KEY || '',
      apiSecret: process.env.OKX_API_SECRET || '',
      password: process.env.OKX_API_PASSWORD || '',
      useSandbox: process.env.OKX_USE_SANDBOX === 'true',  // 修正环境变量名
    });
    exchangeClients.set(modelId, client);
  }
  return exchangeClients.get(modelId)!;
}

router.get('/account-totals', async (req: Request, res: Response) => {
  try {
    // 获取所有模型ID（从环境变量或配置）
    const modelIds = ['deepseek-chat-v3.1']; // TODO: 从配置读取
    
    const accountTotals = [];
    
    // 1. 处理交易 Agent 模型
    for (const modelId of modelIds) {
      try {
        // 1. 实时从交易所获取账户状态
        const exchangeClient = getExchangeClient(modelId);
        const accountState = await exchangeClient.getAccountState();
        
        // 2. 从 MCP 数据库获取每个持仓的详细信息
        const positionsBySymbol: { [key: string]: any } = {};
        
        for (const pos of accountState.positions) {
          const coin = pos.symbol;
          const side = pos.side;
          console.log(`[API] Processing position: ${coin}, quantity=${pos.quantity}`);
          
          // 从 MCP 数据库查询 position_id 和 exit_plan
          const safeName = modelId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const tradesTable = `mcp_trades_${safeName}`;
          
          try {
            const mcpClient = await mcpPool.connect();
            try {
              const result = await mcpClient.query(
                `SELECT position_id, exit_plan, confidence, sl_oid, tp_oid 
                 FROM ${tradesTable} 
                 WHERE coin = $1 AND side = $2 AND status = 'open'
                 ORDER BY created_at DESC LIMIT 1`,
                [coin, side]
              );
              
              const tradeRecord = result.rows[0];
              
              // pos.quantity 已经是实际币数量（ExchangeClient 已经转换过了）
              // 添加正负号：多头为正，空头为负
              const actualQuantity = pos.quantity;
              const signedQuantity = side === 'short' ? -actualQuantity : actualQuantity;
              
              // 转换 exit_plan 字段名：invalidation -> invalidation_condition
              const originalExitPlan = tradeRecord?.exit_plan || {};
              const exitPlan = {
                ...originalExitPlan,
                invalidation_condition: originalExitPlan.invalidation || originalExitPlan.invalidation_condition
              };

              positionsBySymbol[coin] = {
                symbol: coin,
                side: side,
                entry_price: pos.entryPrice,
                current_price: pos.currentPrice,
                quantity: signedQuantity,  // 带符号的数量
                leverage: pos.leverage,
                unrealized_pnl: pos.unrealizedPnl,
                margin: pos.margin,
                notional_usd: Math.abs(actualQuantity * pos.currentPrice),
                position_id: tradeRecord?.position_id,
                exit_plan: exitPlan,
                confidence: tradeRecord?.confidence,
                sl_oid: tradeRecord?.sl_oid,
                tp_oid: tradeRecord?.tp_oid,
                timestamp: Math.floor(Date.now() / 1000),
              };
            } finally {
              mcpClient.release();
            }
          } catch (dbError) {
            console.error(`[API] Error querying MCP database for ${coin}:`, dbError);
            // 即使数据库查询失败，也返回基本的持仓信息
            const actualQuantity = pos.quantity;
            const signedQuantity = side === 'short' ? -actualQuantity : actualQuantity;
            
            positionsBySymbol[coin] = {
              symbol: coin,
              side: side,
              entry_price: pos.entryPrice,
              current_price: pos.currentPrice,
              quantity: signedQuantity,  // 带符号的数量
              leverage: pos.leverage,
              unrealized_pnl: pos.unrealizedPnl,
              margin: pos.margin,
              notional_usd: Math.abs(actualQuantity * pos.currentPrice),
              timestamp: Math.floor(Date.now() / 1000),
            };
          }
        }
        
        // 3. 组装返回数据
        accountTotals.push({
          id: `${modelId}_${Math.floor(Date.now() / 1000)}`,
          model_id: modelId,
          dollar_equity: accountState.accountValue,
          total_unrealized_pnl: accountState.totalUnrealizedPnl,
          available_cash: accountState.balance - accountState.totalUnrealizedPnl,
          timestamp: Math.floor(Date.now() / 1000),
          positions: positionsBySymbol,
        });
      } catch (modelError) {
        console.error(`[API] Error fetching data for ${modelId}:`, modelError);
        // 继续处理其他模型
      }
    }
    
    // 2. 添加 BTC Buy&Hold 基准数据（从数据库读取最新快照）
    try {
      const btcBuyHoldSnapshots = await db.getLatestAccountSnapshots();
      const btcBuyHoldSnapshot = btcBuyHoldSnapshots.find(s => s.model_id === 'btc-buy-hold');
      
      if (btcBuyHoldSnapshot) {
        // 获取 BTC Buy&Hold 的持仓信息
        const btcPositions = await db.getLatestPositionsByModel('btc-buy-hold');
        const positionsBySymbol: { [key: string]: any } = {};
        
        for (const pos of btcPositions) {
          positionsBySymbol[pos.symbol] = {
            symbol: pos.symbol,
            side: pos.side,
            entry_price: pos.entry_price,
            current_price: pos.current_price,
            quantity: pos.quantity,
            leverage: pos.leverage,
            unrealized_pnl: pos.unrealized_pnl,
            notional_usd: pos.notional_usd,
            timestamp: pos.timestamp,
          };
        }
        
        accountTotals.push({
          id: `btc-buy-hold_${btcBuyHoldSnapshot.timestamp}`,
          model_id: 'btc-buy-hold',
          dollar_equity: parseFloat(btcBuyHoldSnapshot.dollar_equity),
          total_unrealized_pnl: parseFloat(btcBuyHoldSnapshot.total_unrealized_pnl),
          available_cash: parseFloat(btcBuyHoldSnapshot.available_cash),
          timestamp: btcBuyHoldSnapshot.timestamp,
          positions: positionsBySymbol,
        });
      }
    } catch (btcError) {
      console.error('[API] Error fetching BTC Buy&Hold data:', btcError);
    }
    
    res.json({
      accountTotals,
      lastHourlyMarkerRead: 0,
      serverTime: Math.floor(Date.now() / 1000),
      initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000')
    });
  } catch (error) {
    console.error('[API] Error in /api/account-totals:', error);
    res.status(500).json({
      error: 'Failed to fetch account totals',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
