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
echo -e "${YELLOW}警告: 此操作将删除以下数据库中的所有数据:${NC}"
echo "  - ai_trading (自定义后端数据库)"
echo "  - nof1 (MCP 数据库)"
echo ""
echo "包括:"
echo "  - 所有账户快照"
echo "  - 所有仓位记录"
echo "  - 所有已完成交易"
echo "  - 所有对话记录"
echo "  - 所有开仓记录"
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

# 重置 ai_trading 数据库
echo -e "${YELLOW}[1/2] 重置 ai_trading 数据库...${NC}"

psql -d ai_trading <<EOF
-- 删除所有表数据
TRUNCATE TABLE account_snapshots CASCADE;
TRUNCATE TABLE positions CASCADE;
TRUNCATE TABLE completed_trades CASCADE;
TRUNCATE TABLE agent_conversations CASCADE;
TRUNCATE TABLE btc_buyhold_baseline CASCADE;

-- 重置序列（如果有）
-- ALTER SEQUENCE IF EXISTS xxx_id_seq RESTART WITH 1;

EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ai_trading 数据库已重置${NC}"
else
    echo -e "${RED}✗ ai_trading 数据库重置失败${NC}"
    exit 1
fi

echo ""

# 重置 nof1 (MCP) 数据库 - 完全删除并重建
echo -e "${YELLOW}[2/2] 删除并重建 nof1 (MCP) 数据库...${NC}"

# 断开所有连接到 nof1 数据库的会话
psql -d postgres <<EOF
-- 终止所有连接到 nof1 数据库的会话
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'nof1'
  AND pid <> pg_backend_pid();
EOF

# 删除并重建 nof1 数据库
psql -d postgres <<EOF
-- 删除数据库
DROP DATABASE IF EXISTS nof1;

-- 重新创建数据库
CREATE DATABASE nof1 OWNER "OpenNof1";

EOF

# 连接到 nof1 数据库并创建表结构
psql -d nof1 <<EOF
-- 授予用户在 public schema 上的权限
GRANT ALL ON SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "OpenNof1";

-- ============================================
-- MCP 数据库表结构
-- ============================================
-- 注意：每个 Agent 会创建自己的表，格式为 mcp_trades_{agent_name} 和 mcp_snapshots_{agent_name}
-- 这里创建一个示例表结构供参考

-- 示例：创建通用的 MCP 交易记录表模板
-- 实际使用时，每个 Agent 会创建类似的表，但表名不同
COMMENT ON SCHEMA public IS 'MCP 数据库 - 每个 Agent 会创建独立的 trades 和 snapshots 表';

-- 表结构说明（实际表名会根据 Agent 名称动态生成）：
-- 
-- mcp_trades_{agent_name} 表结构：
--   - position_id TEXT PRIMARY KEY
--   - coin TEXT NOT NULL
--   - side TEXT NOT NULL
--   - entry_price NUMERIC NOT NULL
--   - quantity NUMERIC NOT NULL
--   - leverage INTEGER NOT NULL
--   - entry_time BIGINT NOT NULL
--   - exit_time BIGINT
--   - exit_price NUMERIC
--   - margin NUMERIC NOT NULL
--   - fees NUMERIC DEFAULT 0
--   - realized_pnl NUMERIC
--   - exit_plan JSONB
--   - confidence NUMERIC
--   - status TEXT NOT NULL DEFAULT 'open'
--   - sl_oid TEXT
--   - tp_oid TEXT
--   - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
--   - updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
--
-- mcp_snapshots_{agent_name} 表结构：
--   - id SERIAL PRIMARY KEY
--   - timestamp TIMESTAMP NOT NULL
--   - account_value NUMERIC NOT NULL
--   - total_pnl NUMERIC NOT NULL
--   - win_rate NUMERIC
--   - total_trades INTEGER
--   - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ nof1 数据库已完全删除并重建${NC}"
else
    echo -e "${RED}✗ nof1 数据库重置失败${NC}"
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
