/**
 * MCP Tool: update_exit_plan
 * Updates the exit plan for an existing position
 */

import { DatabaseManager } from '../database/DatabaseManager.js';
import { UpdateExitPlanParams, UpdateExitPlanResponse, ExitPlan } from '../types.js';

export class UpdateExitPlanTool {
  constructor(private db: DatabaseManager) {}

  async execute(params: UpdateExitPlanParams): Promise<UpdateExitPlanResponse> {
    const { position_id, new_profit_target, new_stop_loss, new_invalidation } = params;

    try {
      // Get existing trade
      const trade = await this.db.getTrade(position_id);
      
      if (!trade) {
        return {
          success: false,
          position_id,
          updated_exit_plan: {},
          message: 'Position not found',
        };
      }

      if (trade.status === 'closed') {
        return {
          success: false,
          position_id,
          updated_exit_plan: trade.exit_plan || {},
          message: 'Cannot update exit plan for closed position',
        };
      }

      // Update exit plan
      const updatedExitPlan: ExitPlan = {
        ...trade.exit_plan,
        profit_target: new_profit_target ?? trade.exit_plan?.profit_target,
        stop_loss: new_stop_loss ?? trade.exit_plan?.stop_loss,
        invalidation: new_invalidation ?? trade.exit_plan?.invalidation,
      };

      // Save to database
      await this.db.updateTrade(position_id, {
        exit_plan: updatedExitPlan,
      });

      return {
        success: true,
        position_id,
        updated_exit_plan: updatedExitPlan,
        message: 'Exit plan updated successfully',
      };
    } catch (error: any) {
      console.error('Error updating exit plan:', error);
      return {
        success: false,
        position_id,
        updated_exit_plan: {},
        message: 'Failed to update exit plan',
      };
    }
  }
}
