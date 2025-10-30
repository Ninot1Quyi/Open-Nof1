/**
 * API路由: GET /api/trades
 * 实时从交易所获取已完成的交易列表（历史仓位）
 */

import { Router, Request, Response } from 'express';
import { ExchangeClient } from '../services/ExchangeClient.js';

const router = Router();

// 交易所客户端缓存
const exchangeClients: Map<string, ExchangeClient> = new Map();

// 交易数据缓存
let tradesCache: any[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30秒缓存

// 后台定时更新缓存
async function updateTradesCache() {
  try {
    console.log('[Background] Updating trades cache...');
    const modelIds = ['deepseek-chat-v3.1'];
    const allTrades: any[] = [];
    
    for (const modelId of modelIds) {
      try {
        const exchangeClient = getExchangeClient(modelId);
        const closedPositions = await exchangeClient.getClosedPositions(100);
        
        const formattedTrades = closedPositions.map((pos, index) => {
          const entryDate = new Date(pos.entryTime);
          const exitDate = new Date(pos.exitTime);
          const holdingTimeMs = pos.exitTime - pos.entryTime;
          const holdingHours = Math.floor(holdingTimeMs / (1000 * 60 * 60));
          const holdingMinutes = Math.floor((holdingTimeMs % (1000 * 60 * 60)) / (1000 * 60));
          
          return {
            id: `${modelId}_${pos.symbol}_${pos.exitTime}_${index}`,
            symbol: pos.symbol,
            model_id: modelId,
            side: pos.side,
            quantity: pos.contracts,
            realized_net_pnl: pos.realizedPnl,
            exit_human_time: exitDate.toISOString(),
            entry_human_time: entryDate.toISOString(),
            leverage: pos.leverage,
            entry_price: pos.entryPrice,
            exit_price: pos.exitPrice,
            entry_time: Math.floor(pos.entryTime / 1000),
            exit_time: Math.floor(pos.exitTime / 1000),
            holding_hours: holdingHours,
            holding_minutes: holdingMinutes,
            created_at: exitDate.toISOString()
          };
        });
        
        allTrades.push(...formattedTrades);
      } catch (error) {
        console.error(`[Background] Error fetching trades for ${modelId}:`, error);
      }
    }
    
    allTrades.sort((a, b) => b.exit_time - a.exit_time);
    tradesCache = allTrades.slice(0, 100);
    lastFetchTime = Date.now();
    console.log(`[Background] Updated cache with ${tradesCache.length} trades`);
  } catch (error) {
    console.error('[Background] Error updating trades cache:', error);
  }
}

// 启动后台定时任务（每30秒更新一次）
// 延迟5秒后启动，确保所有依赖都已初始化
setTimeout(() => {
  console.log('[Trades] Starting background cache update task...');
  updateTradesCache(); // 立即执行一次
  setInterval(updateTradesCache, 30000); // 然后每30秒执行一次
}, 5000);

// 初始化交易所客户端
function getExchangeClient(modelId: string): ExchangeClient {
  if (!exchangeClients.has(modelId)) {
    const client = new ExchangeClient({
      exchange: 'okx',
      apiKey: process.env.OKX_API_KEY || '',
      apiSecret: process.env.OKX_API_SECRET || '',
      password: process.env.OKX_API_PASSWORD || '',
      useSandbox: process.env.OKX_USE_SANDBOX === 'true',
    });
    exchangeClients.set(modelId, client);
  }
  return exchangeClients.get(modelId)!;
}

router.get('/trades', async (req: Request, res: Response) => {
  try {
    // 检查缓存是否有效
    const now = Date.now();
    if (tradesCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      console.log('[API] Returning cached trades data');
      return res.json({
        trades: tradesCache,
        count: tradesCache.length,
        cached: true
      });
    }
    
    console.log('[API] Fetching fresh trades data from exchange...');
    
    // 获取所有模型ID
    const modelIds = ['deepseek-chat-v3.1']; // TODO: 从配置读取
    
    const allTrades: any[] = [];
    
    for (const modelId of modelIds) {
      try {
        // 从交易所获取历史仓位
        const exchangeClient = getExchangeClient(modelId);
        const closedPositions = await exchangeClient.getClosedPositions(100);
        
        // 转换为前端需要的格式
        const formattedTrades = closedPositions.map((pos, index) => {
          const entryDate = new Date(pos.entryTime);
          const exitDate = new Date(pos.exitTime);
          
          // 计算持仓时间
          const holdingTimeMs = pos.exitTime - pos.entryTime;
          const holdingHours = Math.floor(holdingTimeMs / (1000 * 60 * 60));
          const holdingMinutes = Math.floor((holdingTimeMs % (1000 * 60 * 60)) / (1000 * 60));
          
          return {
            id: `${modelId}_${pos.symbol}_${pos.exitTime}_${index}`,
            symbol: pos.symbol,
            model_id: modelId,
            side: pos.side,
            quantity: pos.contracts,
            realized_net_pnl: pos.realizedPnl,
            exit_human_time: exitDate.toISOString(),
            entry_human_time: entryDate.toISOString(),
            leverage: pos.leverage,
            entry_price: pos.entryPrice,
            exit_price: pos.exitPrice,
            entry_time: Math.floor(pos.entryTime / 1000), // 转换为秒
            exit_time: Math.floor(pos.exitTime / 1000), // 转换为秒
            holding_hours: holdingHours,
            holding_minutes: holdingMinutes,
            created_at: exitDate.toISOString()
          };
        });
        
        allTrades.push(...formattedTrades);
      } catch (modelError) {
        console.error(`[API] Error fetching trades for ${modelId}:`, modelError);
      }
    }
    
    // 按退出时间排序（最新的在前）
    allTrades.sort((a, b) => b.exit_time - a.exit_time);
    
    // 更新缓存
    tradesCache = allTrades.slice(0, 100);
    lastFetchTime = now;
    console.log(`[API] Cached ${tradesCache.length} trades`);

    res.json({
      trades: tradesCache,
      count: tradesCache.length,
      cached: false
    });
  } catch (error) {
    console.error('[API] Error in /api/trades:', error);
    res.status(500).json({
      error: 'Failed to fetch trades',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
