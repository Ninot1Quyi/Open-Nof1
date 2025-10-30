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
    
    // 初始化表结构
    this.initTables().catch(err => {
      console.error('[DB] Failed to initialize tables:', err);
    });
  }

  /**
   * 初始化数据库表结构
   */
  private async initTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // 创建交易记录表（使用 Agent 特定的表名）
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tradesTable} (
          position_id TEXT PRIMARY KEY,
          coin TEXT NOT NULL,
          side TEXT NOT NULL,
          entry_price NUMERIC NOT NULL,
          quantity NUMERIC NOT NULL,
          leverage INTEGER NOT NULL,
          entry_time TIMESTAMP NOT NULL,
          exit_time TIMESTAMP,
          exit_price NUMERIC,
          margin NUMERIC NOT NULL,
          fees NUMERIC DEFAULT 0,
          realized_pnl NUMERIC,
          exit_plan JSONB,
          confidence NUMERIC,
          status TEXT NOT NULL DEFAULT 'open',
          sl_oid TEXT,
          tp_oid TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // 创建性能快照表（使用 Agent 特定的表名）
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
      
      console.error(`[DB] Tables initialized successfully for agent: ${this.agentName}`);
    } finally {
      client.release();
    }
  }

  /**
   * Save a new trade
   */
  async saveTrade(trade: TradeRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO ${this.tradesTable} (
          position_id, coin, side, entry_price, quantity, leverage,
          entry_time, margin, fees, exit_plan, confidence, status, sl_oid, tp_oid
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (position_id) DO UPDATE SET
          quantity = $5,
          margin = $8,
          fees = $9,
          exit_plan = $10,
          confidence = $11,
          status = $12,
          sl_oid = $13,
          tp_oid = $14`,
        [
          trade.position_id,
          trade.coin,
          trade.side,
          trade.entry_price,
          trade.quantity,
          trade.leverage,
          trade.entry_time,
          trade.margin,
          trade.fees || 0,
          trade.exit_plan ? JSON.stringify(trade.exit_plan) : null,
          trade.confidence,
          trade.status,
          trade.sl_oid,
          trade.tp_oid,
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
        values.push(updates.exit_time);
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
      const result = await client.query(`SELECT * FROM ${this.tradesTable} ORDER BY entry_time DESC`);
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
   * Simplified version: (average return) / (standard deviation of returns)
   */
  async calculateSharpeRatio(): Promise<number> {
    const closedTrades = await this.getClosedTrades();
    if (closedTrades.length < 2) return 0;

    const returns = closedTrades.map(t => (t.net_pnl || 0) / t.margin);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;
    
    // Annualized Sharpe (assuming daily returns)
    return (avgReturn / stdDev) * Math.sqrt(365);
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
