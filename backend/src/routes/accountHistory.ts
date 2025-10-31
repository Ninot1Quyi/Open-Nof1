/**
 * API路由: GET /api/account-history
 * 返回所有账户历史快照数据（用于图表）
 */

import { Router, Request, Response } from 'express';
import * as db from '../database/db.js';

const router = Router();

router.get('/account-history', async (req: Request, res: Response) => {
  try {
    // 获取交易会话启动时间
    const startTimestamp = await db.getOrInitTradingSessionStartTime();
    
    // 获取所有账户快照
    const allSnapshots = await db.getAllAccountSnapshots();
    
    // 过滤：只保留启动时间之后的快照
    const snapshots = allSnapshots.filter((s: any) => parseInt(s.timestamp) >= startTimestamp);

    // 转换为前端需要的格式
    const accountTotals = snapshots.map(snapshot => ({
      model_id: snapshot.model_id,
      dollar_equity: parseFloat(snapshot.dollar_equity),
      total_unrealized_pnl: parseFloat(snapshot.total_unrealized_pnl),
      timestamp: parseInt(snapshot.timestamp),
      created_at: snapshot.created_at  // 添加数据库创建时间
    }));

    res.json({
      accountTotals,
      count: accountTotals.length,
      initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
      sessionStartTime: startTimestamp  // 返回会话启动时间
    });
  } catch (error) {
    console.error('[API] Error in /api/account-history:', error);
    res.status(500).json({
      error: 'Failed to fetch account history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
