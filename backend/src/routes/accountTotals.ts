/**
 * API路由: GET /api/account-totals
 * 返回最新的账户总览和仓位信息
 */

import { Router, Request, Response } from 'express';
import * as db from '../database/db.js';

const router = Router();

router.get('/account-totals', async (req: Request, res: Response) => {
  try {
    // 获取最新的账户快照
    const snapshots = await db.getLatestAccountSnapshots();
    
    // 获取最新的仓位信息
    const positions = await db.getLatestPositions();

    // 按model_id组织仓位数据
    const positionsByModel: { [key: string]: any } = {};
    for (const position of positions) {
      if (!positionsByModel[position.model_id]) {
        positionsByModel[position.model_id] = {};
      }
      
      positionsByModel[position.model_id][position.symbol] = {
        symbol: position.symbol,
        entry_price: parseFloat(position.entry_price),
        current_price: parseFloat(position.current_price),
        quantity: parseFloat(position.quantity),
        leverage: position.leverage,
        unrealized_pnl: parseFloat(position.unrealized_pnl),
        confidence: position.confidence ? parseFloat(position.confidence) : undefined,
        risk_usd: position.risk_usd ? parseFloat(position.risk_usd) : undefined,
        notional_usd: position.notional_usd ? parseFloat(position.notional_usd) : undefined,
        timestamp: parseInt(position.timestamp),  // 添加仓位时间戳
        created_at: position.created_at,  // 添加数据库创建时间
        exit_plan: {
          profit_target: position.profit_target ? parseFloat(position.profit_target) : undefined,
          stop_loss: position.stop_loss ? parseFloat(position.stop_loss) : undefined,
          invalidation_condition: position.invalidation_condition
        }
      };
    }

    // 组合账户和仓位数据
    const accountTotals = snapshots.map(snapshot => ({
      id: `${snapshot.model_id}_${snapshot.timestamp}`,
      model_id: snapshot.model_id,
      dollar_equity: parseFloat(snapshot.dollar_equity),
      total_unrealized_pnl: parseFloat(snapshot.total_unrealized_pnl),
      timestamp: parseInt(snapshot.timestamp),  // 添加Unix时间戳
      created_at: snapshot.created_at,  // 添加数据库创建时间
      positions: positionsByModel[snapshot.model_id] || {}
    }));

    res.json({
      accountTotals,
      lastHourlyMarkerRead: 0,
      serverTime: Math.floor(Date.now() / 1000)
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
