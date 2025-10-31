/**
 * MCP Tool: update_exit_plan
 * Updates the exit plan for an existing position
 */

import { DatabaseManager } from '../database/DatabaseManager.js';
import { ExchangeAdapter } from '../exchange/ExchangeAdapter.js';
import { UpdateExitPlanParams, UpdateExitPlanResponse, ExitPlan } from '../types.js';

export class UpdateExitPlanTool {
  constructor(
    private db: DatabaseManager,
    private exchange: ExchangeAdapter
  ) {}

  async execute(params: UpdateExitPlanParams): Promise<UpdateExitPlanResponse> {
    const { coin, side, new_profit_target, new_stop_loss, new_invalidation, confidence } = params;

    try {
      // 获取现有的 exit_plan 和仓位信息
      const existing = await this.db.getExitPlan(coin, side);
      
      if (!existing) {
        return {
          success: false,
          updated_exit_plan: {},
          message: `No exit plan found for ${coin} ${side}`,
        };
      }

      // 获取当前仓位数量（用于设置新的止损止盈订单）
      const allTrades = await this.db.getAllTrades();
      const trade = allTrades.find(t => t.coin === coin && t.side === side && t.status === 'open');
      
      if (!trade) {
        return {
          success: false,
          updated_exit_plan: {},
          message: `No open position found for ${coin} ${side}`,
        };
      }

      console.log(`[MCP] Updating exit plan for ${coin} ${side} (quantity: ${trade.quantity})`);

      // ========== 1. 取消所有现有的止损止盈订单 ==========
      console.log(`[MCP] Cancelling existing SL/TP orders for ${coin}...`);
      try {
        const openOrders = await this.exchange.getOpenOrders(coin);
        let cancelledCount = 0;
        for (const order of openOrders) {
          if (order.type === 'stop' || order.type === 'take_profit' || order.type === 'stop_market') {
            console.log(`[MCP] Cancelling order ${order.id} (${order.type})`);
            await this.exchange.cancelOrder(order.id, coin);
            cancelledCount++;
          }
        }
        console.log(`[MCP] ✓ Cancelled ${cancelledCount} existing SL/TP orders`);
      } catch (error) {
        console.error(`[MCP] Warning: Failed to cancel some orders:`, error);
        // 继续执行，不因为取消失败而中断
      }

      // ========== 2. 更新 exit_plan ==========
      const updatedExitPlan: ExitPlan = {
        ...existing.exit_plan,
        profit_target: new_profit_target ?? existing.exit_plan?.profit_target,
        stop_loss: new_stop_loss ?? existing.exit_plan?.stop_loss,
        invalidation: new_invalidation ?? existing.exit_plan?.invalidation,
      };

      // ========== 3. 创建新的止损止盈订单 ==========
      let stopLossOrderId: string | undefined;
      let takeProfitOrderId: string | undefined;
      let warnings: string[] = [];

      try {
        // 设置止损单
        if (updatedExitPlan.stop_loss) {
          console.log(`[MCP] Setting new stop loss at $${updatedExitPlan.stop_loss}...`);
          try {
            const slOrder = await this.exchange.setStopLoss(
              coin,
              side,
              trade.quantity,
              updatedExitPlan.stop_loss
            );
            stopLossOrderId = slOrder.id;
            console.log(`[MCP] ✓ Stop loss order created: ${stopLossOrderId}`);
          } catch (slError) {
            const errorMsg = slError instanceof Error ? slError.message : String(slError);
            console.error(`[MCP] Failed to set stop loss:`, slError);
            warnings.push(`Stop loss failed: ${errorMsg}`);
          }
        }

        // 设置止盈单
        if (updatedExitPlan.profit_target) {
          console.log(`[MCP] Setting new take profit at $${updatedExitPlan.profit_target}...`);
          try {
            const tpOrder = await this.exchange.setTakeProfit(
              coin,
              side,
              trade.quantity,
              updatedExitPlan.profit_target
            );
            takeProfitOrderId = tpOrder.id;
            console.log(`[MCP] ✓ Take profit order created: ${takeProfitOrderId}`);
          } catch (tpError) {
            const errorMsg = tpError instanceof Error ? tpError.message : String(tpError);
            console.error(`[MCP] Failed to set take profit:`, tpError);
            warnings.push(`Take profit failed: ${errorMsg}`);
          }
        }
      } catch (error) {
        console.error(`[MCP] Error setting SL/TP orders:`, error);
        warnings.push('Failed to set some SL/TP orders');
      }

      // ========== 4. 更新数据库（包括新的订单 ID）==========
      await this.db.saveExitPlan(coin, side, updatedExitPlan, confidence ?? existing.confidence);
      
      // 更新交易记录中的订单 ID
      if (stopLossOrderId || takeProfitOrderId) {
        await this.db.updateTrade(trade.position_id, {
          sl_oid: stopLossOrderId,
          tp_oid: takeProfitOrderId,
        });
      }

      console.log(`[MCP] ✓ Updated exit_plan for ${coin} ${side}:`, updatedExitPlan);

      const message = warnings.length > 0
        ? `Exit plan updated with warnings: ${warnings.join('; ')}`
        : 'Exit plan updated successfully and new SL/TP orders placed';

      return {
        success: true,
        updated_exit_plan: updatedExitPlan,
        message,
      };
    } catch (error: any) {
      console.error('[MCP] Error updating exit plan:', error);
      return {
        success: false,
        updated_exit_plan: {},
        message: `Failed to update exit plan: ${error.message}`,
      };
    }
  }
}
