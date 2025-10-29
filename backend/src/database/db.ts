/**
 * 数据库连接和查询模块
 * 使用 PostgreSQL
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载项目根目录的 .env 文件
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

// 数据库连接池
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_trading',
  user: process.env.DB_USER || 'OpenNof1',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 测试连接
pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL database');
});

pool.on('error', (err: Error) => {
  console.error('[DB] Unexpected error on idle client', err);
  process.exit(-1);
});

// ==================== 账户快照相关 ====================

/**
 * 保存账户快照
 */
export async function saveAccountSnapshot(data: {
  model_id: string;
  timestamp: number;
  dollar_equity: number;
  total_unrealized_pnl: number;
  available_cash: number;
}): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO account_snapshots (model_id, timestamp, dollar_equity, total_unrealized_pnl, available_cash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [data.model_id, data.timestamp, data.dollar_equity, data.total_unrealized_pnl, data.available_cash]
    );
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * 获取所有账户快照（用于历史图表）
 */
export async function getAllAccountSnapshots(limit?: number) {
  const client = await pool.connect();
  try {
    const query = limit
      ? `SELECT * FROM account_snapshots ORDER BY timestamp DESC LIMIT $1`
      : `SELECT * FROM account_snapshots ORDER BY timestamp DESC`;
    
    const result = limit 
      ? await client.query(query, [limit])
      : await client.query(query);
    
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 获取最新的账户快照（每个模型一条）
 */
export async function getLatestAccountSnapshots() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM latest_account_snapshots
      ORDER BY timestamp DESC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 获取指定模型的账户快照历史
 */
export async function getAccountSnapshotsByModel(modelId: string, limit?: number) {
  const client = await pool.connect();
  try {
    const query = limit
      ? `SELECT * FROM account_snapshots WHERE model_id = $1 ORDER BY timestamp DESC LIMIT $2`
      : `SELECT * FROM account_snapshots WHERE model_id = $1 ORDER BY timestamp DESC`;
    
    const result = limit
      ? await client.query(query, [modelId, limit])
      : await client.query(query, [modelId]);
    
    return result.rows;
  } finally {
    client.release();
  }
}

// ==================== 仓位相关 ====================

/**
 * 保存仓位信息
 */
export async function savePosition(data: {
  model_id: string;
  symbol: string;
  snapshot_id: number;
  entry_price: number;
  current_price: number;
  quantity: number;
  leverage: number;
  unrealized_pnl: number;
  confidence?: number;
  risk_usd?: number;
  notional_usd?: number;
  profit_target?: number;
  stop_loss?: number;
  invalidation_condition?: string;
  timestamp: number;
}): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO positions (
        model_id, symbol, snapshot_id, entry_price, current_price, quantity,
        leverage, unrealized_pnl, confidence, risk_usd, notional_usd,
        profit_target, stop_loss, invalidation_condition, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        data.model_id, data.symbol, data.snapshot_id, data.entry_price, data.current_price,
        data.quantity, data.leverage, data.unrealized_pnl, data.confidence, data.risk_usd,
        data.notional_usd, data.profit_target, data.stop_loss, data.invalidation_condition,
        data.timestamp
      ]
    );
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * 获取最新的仓位信息（每个模型+币种一条）
 */
export async function getLatestPositions() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM latest_positions
      ORDER BY model_id, symbol
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 获取指定快照的所有仓位
 */
export async function getPositionsBySnapshot(snapshotId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM positions WHERE snapshot_id = $1 ORDER BY symbol`,
      [snapshotId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 获取指定模型的最新仓位
 */
export async function getLatestPositionsByModel(modelId: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM latest_positions WHERE model_id = $1 ORDER BY symbol`,
      [modelId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ==================== 已完成交易相关 ====================

/**
 * 保存已完成交易
 */
export async function saveCompletedTrade(data: {
  id: string;
  model_id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  leverage: number;
  realized_net_pnl: number;
  entry_time: number;
  exit_time: number;
  entry_human_time: Date;
  exit_human_time: Date;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO completed_trades (
        id, model_id, symbol, side, quantity, entry_price, exit_price,
        leverage, realized_net_pnl, entry_time, exit_time, entry_human_time, exit_human_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        exit_price = $7,
        realized_net_pnl = $9,
        exit_time = $11,
        exit_human_time = $13`,
      [
        data.id, data.model_id, data.symbol, data.side, data.quantity,
        data.entry_price, data.exit_price, data.leverage, data.realized_net_pnl,
        data.entry_time, data.exit_time, data.entry_human_time, data.exit_human_time
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * 获取所有已完成交易
 */
export async function getAllCompletedTrades(limit?: number) {
  const client = await pool.connect();
  try {
    const query = limit
      ? `SELECT * FROM completed_trades ORDER BY exit_time DESC LIMIT $1`
      : `SELECT * FROM completed_trades ORDER BY exit_time DESC`;
    
    const result = limit
      ? await client.query(query, [limit])
      : await client.query(query);
    
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 获取指定模型的已完成交易
 */
export async function getCompletedTradesByModel(modelId: string, limit?: number) {
  const client = await pool.connect();
  try {
    const query = limit
      ? `SELECT * FROM completed_trades WHERE model_id = $1 ORDER BY exit_time DESC LIMIT $2`
      : `SELECT * FROM completed_trades WHERE model_id = $1 ORDER BY exit_time DESC`;
    
    const result = limit
      ? await client.query(query, [modelId, limit])
      : await client.query(query, [modelId]);
    
    return result.rows;
  } finally {
    client.release();
  }
}

// ==================== Agent对话记录相关 ====================

/**
 * 保存Agent对话记录
 */
export async function saveConversation(data: {
  id: string;
  model_id: string;
  cycle_id: number;
  user_prompt: string;
  llm_response: any;
  cot_trace?: any;
  cot_trace_summary?: string;
  inserted_at: number;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO agent_conversations (
        id, model_id, cycle_id, user_prompt, llm_response, cot_trace, cot_trace_summary, inserted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        user_prompt = $4,
        llm_response = $5,
        cot_trace = $6,
        cot_trace_summary = $7,
        inserted_at = $8`,
      [
        data.id, data.model_id, data.cycle_id, data.user_prompt,
        JSON.stringify(data.llm_response),
        data.cot_trace ? JSON.stringify(data.cot_trace) : null,
        data.cot_trace_summary,
        data.inserted_at
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * 获取所有对话记录
 */
export async function getAllConversations(limit?: number) {
  const client = await pool.connect();
  try {
    const query = limit
      ? `SELECT * FROM agent_conversations ORDER BY inserted_at DESC LIMIT $1`
      : `SELECT * FROM agent_conversations ORDER BY inserted_at DESC`;
    
    const result = limit
      ? await client.query(query, [limit])
      : await client.query(query);
    
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 获取指定模型的对话记录
 */
export async function getConversationsByModel(modelId: string, limit?: number) {
  const client = await pool.connect();
  try {
    const query = limit
      ? `SELECT * FROM agent_conversations WHERE model_id = $1 ORDER BY inserted_at DESC LIMIT $2`
      : `SELECT * FROM agent_conversations WHERE model_id = $1 ORDER BY inserted_at DESC`;
    
    const result = limit
      ? await client.query(query, [modelId, limit])
      : await client.query(query, [modelId]);
    
    return result.rows;
  } finally {
    client.release();
  }
}

// ==================== 工具函数 ====================

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('[DB] ✓ Database connection test successful');
    return true;
  } catch (error) {
    console.error('[DB] ✗ Database connection test failed:', error);
    return false;
  }
}

/**
 * 关闭数据库连接池
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('[DB] Connection pool closed');
}

export default pool;
