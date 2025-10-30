/**
 * API路由: GET /api/crypto-prices
 * 从交易所获取实时币价数据
 */

import { Router, Request, Response } from 'express';
import ccxt from 'ccxt';

const router = Router();

// 创建一个共享的交易所实例用于获取价格
let exchangeInstance: any = null;

function getExchangeInstance() {
  if (!exchangeInstance) {
    const ExchangeClass = ccxt['okx'] as any;
    exchangeInstance = new ExchangeClass({
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
      },
    });
    // 使用公开API，不需要认证
  }
  return exchangeInstance;
}

router.get('/crypto-prices', async (req: Request, res: Response) => {
  try {
    const exchange = getExchangeInstance();
    
    // 获取主要币种的价格
    const symbols = ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'BNB/USDT:USDT', 'DOGE/USDT:USDT', 'XRP/USDT:USDT'];
    const prices: { [key: string]: { symbol: string; price: number; timestamp: number } } = {};
    const serverTime = Math.floor(Date.now() / 1000);
    
    // 并行获取所有价格
    const pricePromises = symbols.map(async (symbol) => {
      try {
        const ticker = await exchange.fetchTicker(symbol);
        const coin = symbol.split('/')[0];
        prices[coin] = {
          symbol: coin,
          price: ticker.last || 0,
          timestamp: serverTime
        };
      } catch (error) {
        console.error(`[API] Error fetching price for ${symbol}:`, error);
        const coin = symbol.split('/')[0];
        prices[coin] = {
          symbol: coin,
          price: 0,
          timestamp: serverTime
        };
      }
    });
    
    await Promise.all(pricePromises);
    
    res.json({ prices, serverTime });
  } catch (error) {
    console.error('[API] Error in /api/crypto-prices:', error);
    res.status(500).json({
      error: 'Failed to fetch crypto prices',
      message: error instanceof Error ? error.message : 'Unknown error',
      prices: {},
      serverTime: Math.floor(Date.now() / 1000)
    });
  }
});

export default router;
