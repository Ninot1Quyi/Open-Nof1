/**
 * MCP Tool: get_performance_metrics
 * Retrieves comprehensive trading performance metrics
 */

import { DatabaseManager } from '../database/DatabaseManager.js';
import { PerformanceMetricsResponse } from '../types.js';

export class PerformanceMetricsTool {
  constructor(private db: DatabaseManager) {}

  async execute(): Promise<PerformanceMetricsResponse> {
    try {
      // Get all trades
      const allTrades = await this.db.getAllTrades();
      const closedTrades = await this.db.getClosedTrades();
      const openTrades = await this.db.getOpenTrades();

      // Calculate metrics
      const sharpeRatio = await this.db.calculateSharpeRatio();
      const winRate = await this.db.calculateWinRate();
      const averageLeverage = await this.db.calculateAverageLeverage();
      const averageConfidence = await this.db.calculateAverageConfidence();
      const biggestWin = await this.db.getBiggestWin();
      const biggestLoss = await this.db.getBiggestLoss();
      const totalFees = await this.db.calculateTotalFees();
      const totalPnl = await this.db.calculateTotalPnL();

      // Count profitable and losing trades
      const profitableTrades = closedTrades.filter(t => (t.net_pnl || 0) > 0).length;
      const losingTrades = closedTrades.filter(t => (t.net_pnl || 0) < 0).length;

      // Calculate hold times
      const holdTimes = this.calculateHoldTimes(allTrades);

      return {
        sharpe_ratio: sharpeRatio,
        win_rate: winRate,
        average_leverage: averageLeverage,
        average_confidence: averageConfidence,
        biggest_win: biggestWin,
        biggest_loss: biggestLoss,
        total_trades: allTrades.length,
        profitable_trades: profitableTrades,
        losing_trades: losingTrades,
        hold_times: holdTimes,
        total_fees: totalFees,
        net_pnl: totalPnl,
      };
    } catch (error) {
      console.error('Error calculating performance metrics:', error);
      
      // Return default values on error
      return {
        sharpe_ratio: 0,
        win_rate: 0,
        average_leverage: 0,
        average_confidence: 0,
        biggest_win: 0,
        biggest_loss: 0,
        total_trades: 0,
        profitable_trades: 0,
        losing_trades: 0,
        hold_times: { long: 0, short: 0, flat: 1 },
        total_fees: 0,
        net_pnl: 0,
      };
    }
  }

  private calculateHoldTimes(trades: any[]): { long: number; short: number; flat: number } {
    if (trades.length === 0) {
      return { long: 0, short: 0, flat: 1 };
    }

    // Calculate total time in each position type
    let totalTime = 0;
    let longTime = 0;
    let shortTime = 0;

    for (const trade of trades) {
      const entryTime = new Date(trade.entry_time).getTime();
      const exitTime = trade.exit_time
        ? new Date(trade.exit_time).getTime()
        : Date.now();

      const duration = exitTime - entryTime;
      totalTime += duration;

      if (trade.side === 'long') {
        longTime += duration;
      } else {
        shortTime += duration;
      }
    }

    // Calculate percentages
    const longPercent = totalTime > 0 ? longTime / totalTime : 0;
    const shortPercent = totalTime > 0 ? shortTime / totalTime : 0;
    const flatPercent = 1 - longPercent - shortPercent;

    return {
      long: longPercent,
      short: shortPercent,
      flat: Math.max(0, flatPercent),
    };
  }
}
