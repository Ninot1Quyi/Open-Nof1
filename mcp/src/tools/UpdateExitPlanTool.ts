/**
 * MCP Tool: update_exit_plan
 * Updates the exit plan for an existing position
 */

import { DatabaseManager } from '../database/DatabaseManager.js';
import { UpdateExitPlanParams, UpdateExitPlanResponse, ExitPlan } from '../types.js';

export class UpdateExitPlanTool {
  constructor(private db: DatabaseManager) {}

  async execute(params: UpdateExitPlanParams): Promise<UpdateExitPlanResponse> {
    const { coin, side, new_profit_target, new_stop_loss, new_invalidation, confidence } = params;

    try {
      // 获取现有的 exit_plan
      const existing = await this.db.getExitPlan(coin, side);
      
      if (!existing) {
        return {
          success: false,
          updated_exit_plan: {},
          message: `No exit plan found for ${coin} ${side}`,
        };
      }

      // 更新 exit_plan
      const updatedExitPlan: ExitPlan = {
        ...existing.exit_plan,
        profit_target: new_profit_target ?? existing.exit_plan?.profit_target,
        stop_loss: new_stop_loss ?? existing.exit_plan?.stop_loss,
        invalidation: new_invalidation ?? existing.exit_plan?.invalidation,
      };

      // 保存到数据库
      await this.db.saveExitPlan(coin, side, updatedExitPlan, confidence ?? existing.confidence);
      console.log(`[MCP] ✓ Updated exit_plan for ${coin} ${side}:`, updatedExitPlan);

      return {
        success: true,
        updated_exit_plan: updatedExitPlan,
        message: 'Exit plan updated successfully',
      };
    } catch (error: any) {
      console.error('Error updating exit plan:', error);
      return {
        success: false,
        updated_exit_plan: {},
        message: 'Failed to update exit plan',
      };
    }
  }
}
