#!/bin/bash

# 数据库完全重置脚本
# 警告：此脚本将删除所有交易数据和历史记录！

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "========================================="
echo -e "${RED}  ⚠️  数据库完全重置${NC}"
echo "========================================="
echo ""
echo -e "${YELLOW}警告: 此操作将删除 nof1 数据库中的所有数据:${NC}"
echo ""
echo "包括:"
echo "  - 所有账户快照 (account_snapshots)"
echo "  - 所有仓位记录 (positions)"
echo "  - 所有已完成交易 (completed_trades)"
echo "  - 所有对话记录 (agent_conversations)"
echo "  - BTC Buy&Hold 基准数据 (btc_buyhold_baseline)"
echo "  - 所有 MCP 交易记录 (mcp_trades_*)"
echo "  - 所有 MCP 快照记录 (mcp_snapshots_*)"
echo ""
read -p "确认要继续吗? (输入 'yes' 确认): " -r
echo

if [ "$REPLY" != "yes" ]; then
    echo -e "${BLUE}操作已取消${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}开始重置数据库...${NC}"
echo ""

# 重置 nof1 数据库
echo -e "${YELLOW}[1/2] 重置 nof1 数据库（后端表）...${NC}"

psql -d nof1 <<EOF
-- 删除所有表数据
TRUNCATE TABLE account_snapshots CASCADE;
TRUNCATE TABLE positions CASCADE;
TRUNCATE TABLE completed_trades CASCADE;
TRUNCATE TABLE agent_conversations CASCADE;
TRUNCATE TABLE btc_buyhold_baseline CASCADE;

-- 重置序列
ALTER SEQUENCE IF EXISTS account_snapshots_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS positions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS btc_buyhold_baseline_id_seq RESTART WITH 1;

EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ nof1 数据库（后端表）已重置${NC}"
else
    echo -e "${RED}✗ nof1 数据库重置失败${NC}"
    exit 1
fi

echo ""

# 重置 MCP 动态表
echo -e "${YELLOW}[2/2] 重置 nof1 数据库（MCP 动态表）...${NC}"

# 删除所有 MCP 动态表
psql -d nof1 <<EOF
-- 删除所有 mcp_trades_* 表
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mcp_trades_%')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END \$\$;

-- 删除所有 mcp_snapshots_* 表
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mcp_snapshots_%')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END \$\$;

EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ nof1 数据库（MCP 动态表）已重置${NC}"
else
    echo -e "${RED}✗ MCP 表重置失败${NC}"
    exit 1
fi

echo ""

# 确保权限正确
echo -e "${YELLOW}[3/3] 设置数据库权限...${NC}"

psql -d nof1 <<EOF
-- 授予用户在 public schema 上的权限
GRANT ALL ON SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "OpenNof1";

-- ============================================
-- MCP 数据库表结构说明
-- ============================================
-- 注意：每个 Agent 会动态创建自己的表
-- 表名格式：mcp_trades_{agent_name} 和 mcp_snapshots_{agent_name}
-- 例如：deepseek-chat-v3.1 会创建：
--   - mcp_trades_deepseek_chat_v3_1
--   - mcp_snapshots_deepseek_chat_v3_1

COMMENT ON SCHEMA public IS 'MCP 数据库 - 每个 Agent 动态创建独立的 trades 和 snapshots 表';

-- ============================================
-- 表结构模板（由 DatabaseManager 自动创建）
-- ============================================

-- mcp_trades_{agent_name} 表结构：
-- CREATE TABLE IF NOT EXISTS mcp_trades_{agent_name} (
--   position_id TEXT PRIMARY KEY,              -- 仓位ID，格式：{COIN}_{side}_{timestamp}
--   coin TEXT NOT NULL,                        -- 币种：BTC, ETH, SOL, BNB
--   side TEXT NOT NULL,                        -- 方向：long, short
--   entry_price NUMERIC NOT NULL,              -- 开仓价格
--   quantity NUMERIC NOT NULL,                 -- 数量（实际币数量，不是合约张数）
--   leverage INTEGER NOT NULL,                 -- 杠杆倍数
--   entry_time BIGINT NOT NULL,                -- 开仓时间（Unix时间戳，秒）
--   exit_time BIGINT,                          -- 平仓时间（Unix时间戳，秒）
--   exit_price NUMERIC,                        -- 平仓价格
--   margin NUMERIC NOT NULL,                   -- 保证金（USDT）
--   fees NUMERIC DEFAULT 0,                    -- 手续费（USDT）
--   realized_pnl NUMERIC,                      -- 已实现盈亏（USDT，包含手续费）
--   exit_plan JSONB,                           -- 退出计划：{profit_target, stop_loss, invalidation}
--   confidence NUMERIC,                        -- 信心度：0-1
--   status TEXT NOT NULL DEFAULT 'open',       -- 状态：open, closed
--   sl_oid TEXT,                               -- 止损订单ID
--   tp_oid TEXT,                               -- 止盈订单ID
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- mcp_snapshots_{agent_name} 表结构：
-- CREATE TABLE IF NOT EXISTS mcp_snapshots_{agent_name} (
--   id SERIAL PRIMARY KEY,
--   timestamp TIMESTAMP NOT NULL,              -- 快照时间
--   account_value NUMERIC NOT NULL,            -- 账户总价值（USDT）
--   total_pnl NUMERIC NOT NULL,                -- 总盈亏（USDT）
--   win_rate NUMERIC,                          -- 胜率（0-1）
--   total_trades INTEGER,                      -- 总交易次数
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- 注意：表会在 Agent 首次启动时由 DatabaseManager 自动创建
-- 如果需要手动创建特定 Agent 的表，请参考上述模板

EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 数据库权限设置完成${NC}"
else
    echo -e "${RED}✗ 权限设置失败${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ 数据库重置完成${NC}"
echo "========================================="
echo ""
echo "现在可以重新启动系统:"
echo "  ./start-all.sh"
echo ""
