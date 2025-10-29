/**
 * API路由: GET /api/trades
 * 返回已完成的交易列表
 */

import { Router, Request, Response } from 'express';
import * as db from '../database/db.js';

const router = Router();

router.get('/trades', async (req: Request, res: Response) => {
  try {
    // 获取已完成交易，限制返回最近100条
    const trades = await db.getAllCompletedTrades(100);

    // 转换为前端需要的格式
    const formattedTrades = trades.map(trade => ({
      id: trade.id,
      symbol: trade.symbol,
      model_id: trade.model_id,
      side: trade.side,
      quantity: parseFloat(trade.quantity),
      realized_net_pnl: parseFloat(trade.realized_net_pnl),
      exit_human_time: trade.exit_human_time,
      entry_human_time: trade.entry_human_time,
      leverage: trade.leverage,
      entry_price: parseFloat(trade.entry_price),
      exit_price: parseFloat(trade.exit_price),
      entry_time: parseInt(trade.entry_time),
      exit_time: parseInt(trade.exit_time),
      created_at: trade.created_at  // 添加数据库创建时间
    }));

    res.json({
      trades: formattedTrades,
      count: formattedTrades.length
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
