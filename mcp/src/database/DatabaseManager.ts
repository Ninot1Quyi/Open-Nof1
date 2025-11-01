/**
 * Database Manager for storing trades and performance metrics
 * Uses PostgreSQL for persistence
 */

import { TradeRecord, PerformanceSnapshot, Position } from '../types.js';
import pg from 'pg';
const { Pool } = pg;

export class DatabaseManager {
  private pool: pg.Pool;
  private agentName: string;
  private tradesTable: string;
  private snapshotsTable: string;

  constructor(agentName: string = 'default') {
    // 连接到PostgreSQL数据库
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'nof1',
      user: process.env.DB_USER || 'OpenNof1',
      password: process.env.DB_PASSWORD || '',
    });
    
    // 设置 Agent 名称和对应的表名
    this.agentName = agentName;
    // 将 agent 名称转换为安全的表名（移除特殊字符，转为小写）
    const safeName = agentName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    this.tradesTable = `mcp_trades_${safeName}`;
    this.snapshotsTable = `mcp_snapshots_${safeName}`;
    
    console.error(`[DB] Initializing DatabaseManager for agent: ${agentName}`);
    console.error(`[DB] safeName: ${safeName}`);
    console.error(`[DB] Trades table: ${this.tradesTable}`);
    console.error(`[DB] Snapshots table: ${this.snapshotsTable}`);
    console.error(`[DB] Database: ${process.env.DB_NAME || 'nof1'}`);
    console.error(`[DB] Host: ${process.env.DB_HOST || 'localhost'}`);
    console.error(`[DB] User: ${process.env.DB_USER || 'OpenNof1'}`);
    
    // 初始化表结构（同步等待）
    this.initTables().then(() => {
      console.error('[DB] ✓ Tables initialization completed');
    }).catch(err => {
      console.error('[DB] ✗ Failed to initialize tables:', err);
      console.error('[DB] Error stack:', err.stack);
    });
  }

  /**
   * 初始化数据库表结构
   */
  private async initTables(): Promise<void> {
    console.error(`[DB] Starting initTables() for agent: ${this.agentName}`);
    const client = await this.pool.connect();
    try {
      console.error(`[DB] Database connection established`);
      
      // 创建交易记录表（使用 Agent 特定的表名）
      console.error(`[DB] Creating trades table: ${this.tradesTable}`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tradesTable} (
          position_id TEXT PRIMARY KEY,
          coin TEXT NOT NULL,
          side TEXT NOT NULL,
          entry_price NUMERIC NOT NULL,
          quantity NUMERIC NOT NULL,
          leverage INTEGER NOT NULL,
          entry_time BIGINT NOT NULL,
          exit_time BIGINT,
          exit_price NUMERIC,
          margin NUMERIC NOT NULL,
          fees NUMERIC DEFAULT 0,
          realized_pnl NUMERIC,
          exit_plan JSONB,
          confidence NUMERIC,
          status TEXT NOT NULL DEFAULT 'open',
          sl_oid TEXT,
          tp_oid TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.error(`[DB] ✓ Trades table created: ${this.tradesTable}`);
      
      // 创建性能快照表（使用 Agent 特定的表名）
      console.error(`[DB] Creating snapshots table: ${this.snapshotsTable}`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.snapshotsTable} (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP NOT NULL,
          account_value NUMERIC NOT NULL,
          total_pnl NUMERIC NOT NULL,
          win_rate NUMERIC,
          total_trades INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.error(`[DB] ✓ Snapshots table created: ${this.snapshotsTable}`);
      
      console.error(`[DB] Tables initialized successfully for agent: ${this.agentName}`);
    } catch (error) {
      console.error(`[DB] ✗ Error in initTables():`, error);
      throw error;
    } finally {
      client.release();
      console.error(`[DB] Database connection released`);
    }
  }

  /**
   * 保存或更新 exit_plan（通过 coin + side）
   * 注意：这个方法现在只更新已存在的交易记录
   */
  async saveExitPlan(coin: string, side: string, exitPlan: any, confidence?: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE ${this.tradesTable} SET
           exit_plan = $3,
           confidence = $4,
           updated_at = CURRENT_TIMESTAMP
         WHERE coin = $1 AND side = $2 AND status = 'open'`,
        [coin, side, exitPlan ? JSON.stringify(exitPlan) : null, confidence]
      );
    } finally {
      client.release();
    }
  }

  /**
   * 获取 exit_plan（通过 coin + side）
   */
  async getExitPlan(coin: string, side: string): Promise<{
    exit_plan: any;
    confidence?: number;
  } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT exit_plan, confidence FROM ${this.tradesTable}
         WHERE coin = $1 AND side = $2 AND status = 'open'
         ORDER BY created_at DESC LIMIT 1`,
        [coin, side]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        exit_plan: result.rows[0].exit_plan,
        confidence: result.rows[0].confidence ? parseFloat(result.rows[0].confidence) : undefined,
      };
    } finally {
      client.release();
    }
  }

  /**
   * 删除 exit_plan（平仓时调用）
   * 注意：这个方法现在只清空 exit_plan，不删除记录
   */
  async deleteExitPlan(coin: string, side: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE ${this.tradesTable} SET
           exit_plan = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE coin = $1 AND side = $2 AND status = 'open'`,
        [coin, side]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Save a new trade record
   */
  async saveTrade(trade: Omit<TradeRecord, 'exit_time' | 'exit_price' | 'net_pnl'>): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Convert Date to Unix timestamp if needed
      const entryTime = trade.entry_time instanceof Date 
        ? Math.floor(trade.entry_time.getTime() / 1000) 
        : trade.entry_time;

      await client.query(
        `INSERT INTO ${this.tradesTable} 
         (position_id, coin, side, entry_price, quantity, leverage, entry_time, margin, fees, exit_plan, confidence, status, sl_oid, tp_oid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          trade.position_id,
          trade.coin,
          trade.side,
          trade.entry_price,
          trade.quantity,
          trade.leverage,
          entryTime,
          trade.margin,
          trade.fees || 0,
          trade.exit_plan ? JSON.stringify(trade.exit_plan) : null,
          trade.confidence,
          trade.status || 'open',
          trade.sl_oid || null,
          trade.tp_oid || null,
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing trade
   */
  async updateTrade(positionId: string, updates: Partial<TradeRecord>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.exit_time !== undefined) {
        setClauses.push(`exit_time = $${paramIndex++}`);
        // 将 Date 对象转换为 Unix 时间戳（秒）
        const exitTimeValue = updates.exit_time instanceof Date 
          ? Math.floor(updates.exit_time.getTime() / 1000)
          : updates.exit_time;
        values.push(exitTimeValue);
      }
      if (updates.exit_price !== undefined) {
        setClauses.push(`exit_price = $${paramIndex++}`);
        values.push(updates.exit_price);
      }
      if (updates.net_pnl !== undefined) {
        setClauses.push(`realized_pnl = $${paramIndex++}`);
        values.push(updates.net_pnl);
      }
      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.fees !== undefined) {
        setClauses.push(`fees = $${paramIndex++}`);
        values.push(updates.fees);
      }

      if (setClauses.length > 0) {
        values.push(positionId);
        await client.query(
          `UPDATE ${this.tradesTable} SET ${setClauses.join(', ')} WHERE position_id = $${paramIndex}`,
          values
        );
      }
    } finally {
      client.release();
    }
  }

  /**
   * Update trade status only
   */
  async updateTradeStatus(positionId: string, status: 'open' | 'closed'): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE ${this.tradesTable} SET status = $1 WHERE position_id = $2`,
        [status, positionId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get a trade by position ID
   */
  async getTrade(positionId: string): Promise<TradeRecord | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.tradesTable} WHERE position_id = $1`,
        [positionId]
      );
      
      if (result.rows.length === 0) {
        return undefined;
      }
      
      const row = result.rows[0];
      return this.rowToTradeRecord(row);
    } finally {
      client.release();
    }
  }

  /**
   * Get all trades
   */
  async getAllTrades(): Promise<TradeRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`SELECT * FROM ${this.tradesTable} ORDER BY created_at DESC`);
      return result.rows.map(row => this.rowToTradeRecord(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get open trades
   */
  async getOpenTrades(): Promise<TradeRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.tradesTable} WHERE status = 'open' ORDER BY entry_time DESC`
      );
      return result.rows.map(row => this.rowToTradeRecord(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get closed trades
   */
  async getClosedTrades(): Promise<TradeRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.tradesTable} WHERE status = 'closed' ORDER BY exit_time DESC`
      );
      return result.rows.map(row => this.rowToTradeRecord(row));
    } finally {
      client.release();
    }
  }

  /**
   * Save performance snapshot
   */
  async saveSnapshot(snapshot: PerformanceSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO ${this.snapshotsTable} (timestamp, account_value, total_pnl, win_rate, total_trades)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          snapshot.timestamp,
          snapshot.account_value,
          snapshot.total_pnl,
          snapshot.win_rate,
          snapshot.total_trades,
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(): Promise<PerformanceSnapshot | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.snapshotsTable} ORDER BY timestamp DESC LIMIT 1`
      );
      
      if (result.rows.length === 0) {
        return undefined;
      }
      
      const row = result.rows[0];
      return {
        timestamp: row.timestamp,
        account_value: parseFloat(row.account_value),
        total_pnl: parseFloat(row.total_pnl),
        win_rate: row.win_rate ? parseFloat(row.win_rate) : undefined,
        total_trades: row.total_trades,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get all snapshots
   */
  async getAllSnapshots(): Promise<PerformanceSnapshot[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.snapshotsTable} ORDER BY timestamp ASC`
      );
      
      return result.rows.map(row => ({
        timestamp: row.timestamp,
        account_value: parseFloat(row.account_value),
        total_pnl: parseFloat(row.total_pnl),
        win_rate: row.win_rate ? parseFloat(row.win_rate) : undefined,
        total_trades: row.total_trades,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * 将数据库行转换为TradeRecord对象
   */
  private rowToTradeRecord(row: any): TradeRecord {
    return {
      position_id: row.position_id,
      coin: row.coin,
      side: row.side,
      entry_price: parseFloat(row.entry_price),
      quantity: parseFloat(row.quantity),
      leverage: row.leverage,
      entry_time: row.entry_time,
      exit_time: row.exit_time,
      exit_price: row.exit_price ? parseFloat(row.exit_price) : undefined,
      margin: parseFloat(row.margin),
      fees: parseFloat(row.fees || 0),
      net_pnl: row.realized_pnl ? parseFloat(row.realized_pnl) : undefined,
      exit_plan: row.exit_plan || undefined,
      confidence: row.confidence ? parseFloat(row.confidence) : undefined,
      status: row.status,
      sl_oid: row.sl_oid,
      tp_oid: row.tp_oid,
    };
  }

  /**
   * Calculate total PnL
   */
  async calculateTotalPnL(): Promise<number> {
    const trades = await this.getClosedTrades();
    return trades.reduce((sum, trade) => sum + (trade.net_pnl || 0), 0);
  }

  /**
   * Calculate total fees
   */
  async calculateTotalFees(): Promise<number> {
    const trades = await this.getAllTrades();
    return trades.reduce((sum, trade) => sum + trade.fees, 0);
  }

  /**
   * Calculate win rate
   */
  async calculateWinRate(): Promise<number> {
    const closedTrades = await this.getClosedTrades();
    if (closedTrades.length === 0) return 0;

    const winningTrades = closedTrades.filter(t => (t.net_pnl || 0) > 0);
    return winningTrades.length / closedTrades.length;
  }

  /**
   * Get biggest win
   */
  async getBiggestWin(): Promise<number> {
    const closedTrades = await this.getClosedTrades();
    if (closedTrades.length === 0) return 0;

    return Math.max(...closedTrades.map(t => t.net_pnl || 0));
  }

  /**
   * Get biggest loss
   */
  async getBiggestLoss(): Promise<number> {
    const closedTrades = await this.getClosedTrades();
    if (closedTrades.length === 0) return 0;

    return Math.min(...closedTrades.map(t => t.net_pnl || 0));
  }

  /**
   * Calculate Sharpe Ratio
   * Uses completed_trades table from backend (synced from exchange)
   * Only includes trades after the earliest account snapshot (INITIAL_BALANCE reset point)
   * Includes unrealized P&L from current open positions for real-time calculation
   */
  async calculateSharpeRatio(openPositions?: any[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Get the earliest snapshot timestamp (when INITIAL_BALANCE was set)
      const snapshotResult = await client.query(
        `SELECT MIN(timestamp) as start_time 
         FROM account_snapshots 
         WHERE model_id = $1`,
        [this.agentName]
      );
      
      const startTime = snapshotResult.rows[0]?.start_time;
      if (!startTime) {
        console.log('[DB] No snapshots found, cannot calculate Sharpe Ratio');
        return 0;
      }
      
      // Get completed trades from backend table after start_time
      const result = await client.query(
        `SELECT realized_net_pnl, quantity, entry_price, leverage
         FROM completed_trades 
         WHERE model_id = $1 
         AND exit_time >= $2
         AND realized_net_pnl IS NOT NULL 
         AND quantity > 0
         AND entry_price > 0
         AND leverage > 0
         ORDER BY exit_time DESC`,
        [this.agentName, startTime]
      );
      
      const trades = result.rows;

      // Calculate returns for each completed trade
      const returns = trades.map(t => {
        const netPnl = parseFloat(t.realized_net_pnl);
        const quantity = parseFloat(t.quantity);
        const entryPrice = parseFloat(t.entry_price);
        const leverage = parseFloat(t.leverage);
        
        // Calculate margin (position value / leverage)
        const margin = (quantity * entryPrice) / leverage;
        
        // Return = net PnL / margin
        return netPnl / margin;
      });

      // Add unrealized returns from open positions
      if (openPositions && openPositions.length > 0) {
        for (const pos of openPositions) {
          const unrealizedPnl = pos.unrealized_pnl || pos.unrealizedPnl || 0;
          const quantity = pos.quantity || 0;
          const entryPrice = pos.entry_price || pos.entryPrice || 0;
          const leverage = pos.leverage || 1;
          
          if (quantity > 0 && entryPrice > 0) {
            const margin = (quantity * entryPrice) / leverage;
            const unrealizedReturn = unrealizedPnl / margin;
            returns.push(unrealizedReturn);
          }
        }
      }
      
      // Need at least 2 data points to calculate std dev
      if (returns.length < 2) return 0;
      
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) return 0;
      
      // Annualized Sharpe (assuming daily returns)
      return (avgReturn / stdDev) * Math.sqrt(365);
    } finally {
      client.release();
    }
  }

  /**
   * Calculate average leverage
   */
  async calculateAverageLeverage(): Promise<number> {
    const trades = await this.getAllTrades();
    if (trades.length === 0) return 0;

    const totalLeverage = trades.reduce((sum, t) => sum + t.leverage, 0);
    return totalLeverage / trades.length;
  }

  /**
   * Calculate average confidence
   */
  async calculateAverageConfidence(): Promise<number> {
    const trades = await this.getAllTrades();
    const tradesWithConfidence = trades.filter(t => t.confidence !== undefined);
    
    if (tradesWithConfidence.length === 0) return 0;

    const totalConfidence = tradesWithConfidence.reduce((sum, t) => sum + (t.confidence || 0), 0);
    return totalConfidence / tradesWithConfidence.length;
  }

  /**
   * Clear all data (for testing)
   */
  async clearAll(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`DELETE FROM ${this.tradesTable}`);
      await client.query(`DELETE FROM ${this.snapshotsTable}`);
    } finally {
      client.release();
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
