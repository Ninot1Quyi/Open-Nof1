-- 添加交易会话表的迁移脚本
-- 用于存储程序首次启动时间

-- 8. 交易会话表 - 存储程序首次启动时间
CREATE TABLE IF NOT EXISTS trading_session (
  id SERIAL PRIMARY KEY,
  session_start_time BIGINT NOT NULL,  -- Unix时间戳（秒），程序首次启动时间
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 确保只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_session_single_row ON trading_session((id IS NOT NULL));

-- 添加注释
COMMENT ON TABLE trading_session IS '交易会话表 - 存储程序首次启动时间，用于计算交易时长和过滤历史数据';
COMMENT ON COLUMN trading_session.session_start_time IS '程序首次启动的Unix时间戳（秒）';

-- 说明
-- 运行此脚本后，程序会在首次启动时自动写入启动时间
-- 如果需要重置启动时间，可以执行: DELETE FROM trading_session;
