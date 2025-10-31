#!/bin/bash

# 数据库完全重置脚本
# 警告：此脚本将删除所有交易数据和历史记录！
# 支持两种模式：
#   1. 清空表数据（默认）
#   2. 删除并重建数据库（--drop-db）

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查参数
DROP_DATABASE=false
if [ "$1" = "--drop-db" ] || [ "$1" = "-d" ]; then
    DROP_DATABASE=true
fi

echo ""
echo "========================================="
if [ "$DROP_DATABASE" = true ]; then
    echo -e "${RED}  ⚠️  数据库完全删除并重建${NC}"
else
    echo -e "${RED}  ⚠️  数据库数据清空${NC}"
fi
echo "========================================="
echo ""

# 读取当前的 INITIAL_BALANCE 配置
INITIAL_BALANCE=${INITIAL_BALANCE:-10000}
if [ -f .env ]; then
  INITIAL_BALANCE=$(grep "^INITIAL_BALANCE=" .env | cut -d'=' -f2 || echo "10000")
fi

if [ "$DROP_DATABASE" = true ]; then
    echo -e "${YELLOW}警告: 此操作将完全删除并重建数据库:${NC}"
    echo ""
    echo "将删除:"
    echo "  - nof1 数据库（包含所有表和数据）"
    echo "  - ai_trading 数据库（如果存在）"
    echo ""
    echo "将重建:"
    echo "  - 空的 nof1 数据库"
    echo "  - 空的 ai_trading 数据库"
    echo "  - 所有表结构"
    echo ""
    echo -e "${RED}这是最彻底的重置方式，将删除所有历史数据！${NC}"
else
    echo -e "${YELLOW}警告: 此操作将清空 nof1 数据库中的所有数据:${NC}"
    echo ""
    echo "包括:"
    echo "  - 所有账户快照 (account_snapshots)"
    echo "  - 所有仓位记录 (positions)"
    echo "  - 所有已完成交易 (completed_trades)"
    echo "  - 所有对话记录 (agent_conversations)"
    echo "  - 交易会话启动时间 (trading_session)"
    echo "  - BTC Buy&Hold 基准数据 (btc_buyhold_baseline)"
    echo "    当前配置: INITIAL_BALANCE=\$${INITIAL_BALANCE}"
    echo "  - 所有 MCP 交易记录 (mcp_trades_*)"
    echo "  - 所有 MCP 快照记录 (mcp_snapshots_*)"
    echo ""
    echo -e "${BLUE}提示: 重置后，BTC Buy&Hold 将使用当前配置的初始资金重新初始化${NC}"
fi
echo ""
read -p "确认要继续吗? (输入 'yes' 确认): " -r
echo

if [ "$REPLY" != "yes" ]; then
    echo -e "${BLUE}操作已取消${NC}"
    exit 0
fi

echo ""
if [ "$DROP_DATABASE" = true ]; then
    echo -e "${BLUE}开始删除并重建数据库...${NC}"
else
    echo -e "${BLUE}开始清空数据库...${NC}"
fi
echo ""

if [ "$DROP_DATABASE" = true ]; then
    # 完全删除并重建数据库
    echo -e "${YELLOW}[1/4] 删除现有数据库...${NC}"
    
    # 断开所有连接
    psql postgres <<EOF > /dev/null 2>&1 || true
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname IN ('nof1', 'ai_trading')
  AND pid <> pg_backend_pid();
EOF
    
    # 删除数据库
    dropdb --if-exists nof1 2>/dev/null || true
    dropdb --if-exists ai_trading 2>/dev/null || true
    
    echo -e "${GREEN}✓ 数据库已删除${NC}"
    echo ""
    
    # 重建数据库
    echo -e "${YELLOW}[2/4] 重建数据库...${NC}"
    createdb nof1
    createdb ai_trading
    
    # 授予权限
    psql postgres -c 'GRANT ALL PRIVILEGES ON DATABASE nof1 TO "OpenNof1";' > /dev/null 2>&1
    psql postgres -c 'GRANT ALL PRIVILEGES ON DATABASE ai_trading TO "OpenNof1";' > /dev/null 2>&1
    
    echo -e "${GREEN}✓ 数据库已重建${NC}"
    echo ""
    
    # 创建表结构
    echo -e "${YELLOW}[3/4] 创建表结构...${NC}"
    
    # 获取项目根目录
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    
    # 执行 schema.sql
    if [ -f "$SCRIPT_DIR/backend/database/schema.sql" ]; then
        psql -d nof1 -f "$SCRIPT_DIR/backend/database/schema.sql" > /dev/null 2>&1
        echo -e "${GREEN}✓ 表结构已创建${NC}"
    else
        echo -e "${RED}✗ 找不到 schema.sql 文件${NC}"
        exit 1
    fi
    
    echo ""
    
    # 设置权限
    echo -e "${YELLOW}[4/4] 设置数据库权限...${NC}"
    
    psql nof1 <<EOF > /dev/null 2>&1
GRANT ALL ON SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "OpenNof1";
EOF
    
    psql ai_trading <<EOF > /dev/null 2>&1
GRANT ALL ON SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "OpenNof1";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "OpenNof1";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "OpenNof1";
EOF
    
    echo -e "${GREEN}✓ 权限设置完成${NC}"
    echo ""
    
    echo -e "${GREEN}✓ 数据库完全重建完成${NC}"
    
else
    # 只清空表数据（原有逻辑）
    echo -e "${YELLOW}[1/2] 清空 nof1 数据库（后端表）...${NC}"

psql -d nof1 <<EOF
-- 删除所有表数据（使用 DO 块来忽略不存在的表）
DO \$\$
BEGIN
    -- 删除账户快照
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account_snapshots') THEN
        TRUNCATE TABLE account_snapshots CASCADE;
    END IF;
    
    -- 删除仓位记录
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions') THEN
        TRUNCATE TABLE positions CASCADE;
    END IF;
    
    -- 删除已完成交易
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'completed_trades') THEN
        TRUNCATE TABLE completed_trades CASCADE;
    END IF;
    
    -- 删除对话记录
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_conversations') THEN
        TRUNCATE TABLE agent_conversations CASCADE;
    END IF;
    
    -- 清空交易会话启动时间
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trading_session') THEN
        TRUNCATE TABLE trading_session CASCADE;
        RAISE NOTICE '✓ 已清空交易会话启动时间';
    ELSE
        RAISE NOTICE '⚠ trading_session 表不存在，跳过';
    END IF;
    
    -- 清空 BTC Buy&Hold 基准数据
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'btc_buyhold_baseline') THEN
        TRUNCATE TABLE btc_buyhold_baseline CASCADE;
        RAISE NOTICE '✓ 已清空 BTC Buy&Hold 基准数据';
    ELSE
        RAISE NOTICE '⚠ btc_buyhold_baseline 表不存在，跳过';
    END IF;
END \$\$;

-- 重置序列
ALTER SEQUENCE IF EXISTS account_snapshots_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS positions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS trading_session_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS btc_buyhold_baseline_id_seq RESTART WITH 1;

EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ nof1 数据库（后端表）已清空${NC}"
    else
        echo -e "${RED}✗ nof1 数据库清空失败${NC}"
        exit 1
    fi
    
    echo ""

    # 清空 MCP 动态表
    echo -e "${YELLOW}[2/2] 清空 nof1 数据库（MCP 动态表）...${NC}"

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
        echo -e "${GREEN}✓ nof1 数据库（MCP 动态表）已清空${NC}"
    else
        echo -e "${RED}✗ MCP 表清空失败${NC}"
        exit 1
    fi
    
    echo ""
fi

# 只在清空模式下需要重新设置权限
if [ "$DROP_DATABASE" = false ]; then
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
fi

echo ""
echo "========================================="
if [ "$DROP_DATABASE" = true ]; then
    echo -e "${GREEN}  ✓ 数据库完全重建完成${NC}"
else
    echo -e "${GREEN}  ✓ 数据库清空完成${NC}"
fi
echo "========================================="
echo ""
echo "使用说明:"
if [ "$DROP_DATABASE" = true ]; then
    echo -e "  ${BLUE}数据库已完全删除并重建，所有表结构已重新创建${NC}"
else
    echo -e "  ${BLUE}数据库表数据已清空，表结构保持不变${NC}"
fi
echo ""
echo "下一步:"
echo "  ./start-all.sh    # 启动系统"
echo ""
echo "提示:"
echo "  - 清空数据: ./reset-database.sh"
echo "  - 完全重建: ./reset-database.sh --drop-db"
echo ""
