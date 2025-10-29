/**
 * API路由: GET /api/crypto-prices
 * 代理请求到 https://nof1.ai/api/crypto-prices
 * 实时获取币价数据，不存储到数据库
 */

import { Router, Request, Response } from 'express';

const router = Router();

router.get('/crypto-prices', async (req: Request, res: Response) => {
  try {
    // 代理请求到 nof1.ai
    const response = await fetch('https://nof1.ai/api/crypto-prices');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 直接返回原始数据
    res.json(data);
  } catch (error) {
    console.error('[API] Error in /api/crypto-prices:', error);
    res.status(500).json({
      error: 'Failed to fetch crypto prices',
      message: error instanceof Error ? error.message : 'Unknown error',
      prices: {}
    });
  }
});

export default router;
