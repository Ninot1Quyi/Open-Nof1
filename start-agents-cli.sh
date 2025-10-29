#!/bin/bash

# Agent CLI 启动脚本
# 只启动 MCP 和 Agents，实时显示日志

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "========================================="
echo -e "${BLUE}  🤖 AI Trading Agents (CLI Mode)${NC}"
echo "========================================="
echo ""

# 项目根目录（自动获取脚本所在目录）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# 1. 检查 PostgreSQL
echo -n "1. 检查 PostgreSQL... "
if pg_isready -q; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ PostgreSQL 未运行${NC}"
    echo "请先启动 PostgreSQL: brew services start postgresql@14"
    exit 1
fi

# 2. 检查数据库
echo -n "2. 检查数据库... "
if psql -lqt | cut -d \| -f 1 | grep -qw nof1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}! 数据库 nof1 不存在，正在创建...${NC}"
    createdb nof1
    echo -e "${GREEN}✓ 创建成功${NC}"
fi

# 3. 检查 Agents 依赖
echo -n "3. 检查 Agents 依赖... "
cd "$PROJECT_ROOT/agents"
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 正在安装...${NC}"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

# 4. 检查 tsx
echo -n "4. 检查 tsx... "
if ! command -v tsx &> /dev/null; then
    echo -e "${YELLOW}! 正在全局安装 tsx...${NC}"
    npm install -g tsx > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ 准备完成！${NC}"
echo "========================================="
echo ""
echo -e "${CYAN}提示: 按 Ctrl+C 停止 Agents${NC}"
echo ""
sleep 2

# 清理旧的日志
rm -f "$PROJECT_ROOT/logs/agents-cli.log"

# 启动 Agents（前台运行，直接显示日志）
echo "========================================="
echo -e "${BLUE}  🚀 启动 Trading Agents${NC}"
echo "========================================="
echo ""

cd "$PROJECT_ROOT/agents"
exec tsx main.ts 2>&1 | tee "$PROJECT_ROOT/logs/agents-cli.log"
