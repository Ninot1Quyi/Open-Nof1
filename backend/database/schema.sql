-- AI Trading Backend Database Schema
-- PostgreSQL Database

-- 1. 账户快照表 - 每15秒保存一次所有模型的账户状态
CREATE TABLE IF NOT EXISTS account_snapshots (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(50) NOT NULL,
  timestamp BIGINT NOT NULL,  -- Unix时间戳（秒）
  dollar_equity DECIMAL(18, 2) NOT NULL,
  total_unrealized_pnl DECIMAL(18, 2) NOT NULL,
  available_cash DECIMAL(18, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_snapshots_model_timestamp ON account_snapshots(model_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_account_snapshots_timestamp ON account_snapshots(timestamp DESC);

-- 2. 仓位表 - 每15秒保存一次所有模型的仓位信息
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10),  -- 'long' or 'short'
  snapshot_id INTEGER REFERENCES account_snapshots(id) ON DELETE CASCADE,
  entry_price DECIMAL(18, 8) NOT NULL,
  current_price DECIMAL(18, 8) NOT NULL,
  quantity DECIMAL(18, 8) NOT NULL,
  leverage INTEGER NOT NULL,
  unrealized_pnl DECIMAL(18, 2) NOT NULL,
  confidence DECIMAL(5, 2),
  risk_usd DECIMAL(18, 2),
  notional_usd DECIMAL(18, 2),
  profit_target DECIMAL(18, 8),
  stop_loss DECIMAL(18, 8),
  invalidation_condition TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_positions_model_symbol ON positions(model_id, symbol);
CREATE INDEX IF NOT EXISTS idx_positions_snapshot ON positions(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON positions(timestamp DESC);

-- 3. 已完成交易表 - 从MCP数据库同步
CREATE TABLE IF NOT EXISTS completed_trades (
  id VARCHAR(100) PRIMARY KEY,
  model_id VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,  -- 'long' or 'short'
  quantity DECIMAL(18, 8) NOT NULL,
  entry_price DECIMAL(18, 8) NOT NULL,
  exit_price DECIMAL(18, 8) NOT NULL,
  leverage INTEGER NOT NULL,
  realized_net_pnl DECIMAL(18, 2) NOT NULL,
  entry_time BIGINT NOT NULL,  -- Unix时间戳（秒）
  exit_time BIGINT NOT NULL,
  entry_human_time TIMESTAMP NOT NULL,
  exit_human_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_completed_trades_model_exit ON completed_trades(model_id, exit_time DESC);
CREATE INDEX IF NOT EXISTS idx_completed_trades_exit_time ON completed_trades(exit_time DESC);

-- 4. Agent对话记录表 - Agent保存决策和思考过程
CREATE TABLE IF NOT EXISTS agent_conversations (
  id VARCHAR(100) PRIMARY KEY,  -- 格式: {model_id}_{cycle_id}
  model_id VARCHAR(50) NOT NULL,
  cycle_id INTEGER NOT NULL,
  user_prompt TEXT NOT NULL,
  llm_response JSONB NOT NULL,  -- 存储完整的决策JSON
  cot_trace JSONB,  -- 思维链追踪
  cot_trace_summary TEXT,  -- 思维链摘要
  inserted_at BIGINT NOT NULL,  -- Unix时间戳（秒）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_model_cycle ON agent_conversations(model_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_inserted_at ON agent_conversations(inserted_at DESC);

-- 5. 创建视图：最新账户状态（用于快速查询）
CREATE OR REPLACE VIEW latest_account_snapshots AS
SELECT DISTINCT ON (model_id) 
  id, model_id, timestamp, dollar_equity, total_unrealized_pnl, available_cash, created_at
FROM account_snapshots
ORDER BY model_id, timestamp DESC;

-- 6. 创建视图：最新仓位（用于快速查询）
CREATE OR REPLACE VIEW latest_positions AS
SELECT DISTINCT ON (model_id, symbol) 
  id, model_id, symbol, side, snapshot_id, entry_price, current_price, quantity, 
  leverage, unrealized_pnl, confidence, risk_usd, notional_usd, 
  profit_target, stop_loss, invalidation_condition, timestamp, created_at
FROM positions
ORDER BY model_id, symbol, timestamp DESC;

-- 7. BTC Buy&Hold 基准策略表 - 存储初始BTC数量
CREATE TABLE IF NOT EXISTS btc_buyhold_baseline (
  id SERIAL PRIMARY KEY,
  initial_balance DECIMAL(18, 2) NOT NULL,  -- 初始资金（美元）
  initial_btc_quantity DECIMAL(18, 8) NOT NULL,  -- 初始购买的BTC数量
  initial_btc_price DECIMAL(18, 2) NOT NULL,  -- 初始BTC价格
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(initial_balance)  -- 确保同一个初始资金只有一条记录
);

-- 8. 数据清理函数：删除7天前的快照数据（可选，用于节省空间）
CREATE OR REPLACE FUNCTION cleanup_old_snapshots() RETURNS void AS $$
BEGIN
  DELETE FROM account_snapshots 
  WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days');
END;
$$ LANGUAGE plpgsql;

-- 注释
COMMENT ON TABLE account_snapshots IS '账户快照表 - 每15秒保存一次所有模型的账户状态';
COMMENT ON TABLE positions IS '仓位表 - 每15秒保存一次所有模型的仓位信息';
COMMENT ON TABLE completed_trades IS '已完成交易表 - 从MCP数据库同步的历史交易';
COMMENT ON TABLE agent_conversations IS 'Agent对话记录表 - 保存AI的决策过程和思考链';
COMMENT ON TABLE btc_buyhold_baseline IS 'BTC Buy&Hold 基准策略表 - 存储初始BTC购买数量，用于计算基准收益';
