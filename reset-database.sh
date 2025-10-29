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

# 重置 nof1 (MCP) 数据库
echo -e "${YELLOW}[2/2] 重置 nof1 (MCP) 数据库...${NC}"

psql -d nof1 <<EOF
-- 删除所有开仓记录
DELETE FROM mcp_trades WHERE status = 'open';

-- 删除所有已完成交易（可选，如果想保留历史可以注释掉）
DELETE FROM mcp_trades WHERE status = 'closed';

-- 删除快照数据（如果有）
DELETE FROM mcp_snapshots;

EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ nof1 数据库已重置${NC}"
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
