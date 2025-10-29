#!/bin/bash

# AI Trading 系统一键启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "========================================="
echo -e "${BLUE}  🚀 AI Trading 系统启动${NC}"
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

# 2. 检查 ai_trading 数据库
echo -n "2. 检查数据库 ai_trading... "
if psql -lqt | cut -d \| -f 1 | grep -qw ai_trading; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}! 数据库不存在，正在创建...${NC}"
    createdb ai_trading
    echo -e "${GREEN}✓ 创建成功${NC}"
fi

# 3. 检查 nof1 (MCP) 数据库
echo -n "3. 检查数据库 nof1... "
if psql -lqt | cut -d \| -f 1 | grep -qw nof1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}! 数据库不存在，正在创建...${NC}"
    createdb nof1
    echo -e "${GREEN}✓ 创建成功${NC}"
fi

# 4. 初始化数据库表
echo -n "4. 初始化数据库表... "
cd "$PROJECT_ROOT/backend"
psql -d ai_trading -f database/schema.sql > /dev/null 2>&1
echo -e "${GREEN}✓${NC}"

# 5. 检查后端配置
echo -n "5. 检查后端配置... "
if [ ! -f .env ]; then
    echo -e "${YELLOW}! .env 不存在，从示例复制${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  请编辑 backend/.env 配置数据库密码${NC}"
    echo ""
    read -p "按回车继续..."
else
    echo -e "${GREEN}✓${NC}"
fi

# 6. 检查 MCP 依赖
echo -n "6. 检查 MCP 依赖... "
cd "$PROJECT_ROOT/mcp"
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 正在安装...${NC}"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

# 7. 检查后端依赖
echo -n "7. 检查后端依赖... "
cd "$PROJECT_ROOT/backend"
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 正在安装...${NC}"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

# 8. 检查前端依赖
echo -n "8. 检查前端依赖... "
cd "$PROJECT_ROOT/web"
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 正在安装...${NC}"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

# 9. 检查 Agents 依赖
echo -n "9. 检查 Agents 依赖... "
cd "$PROJECT_ROOT/agents"
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 正在安装...${NC}"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

# 10. 检查 tsx（用于直接运行 TypeScript）
echo -n "10. 检查 tsx... "
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

# 询问是否启动服务
echo "准备启动以下服务："
echo "  1. MCP 服务器"
echo "  2. 后端服务 (http://localhost:3001)"
echo "  3. 前端服务 (http://localhost:3000)"
echo "  4. Trading Agents"
echo ""
read -p "是否现在启动? (Y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo "取消启动。你可以手动启动："
    echo ""
    echo "  MCP: cd mcp && tsx src/index.ts"
    echo "  后端: cd backend && tsx src/index.ts"
    echo "  前端: cd web && npm run dev"
    echo "  Agents: cd agents && tsx main.ts"
    echo ""
    exit 0
fi

echo ""
echo "========================================="
echo -e "${BLUE}  🚀 启动服务${NC}"
echo "========================================="
echo ""

# 创建日志目录
mkdir -p "$PROJECT_ROOT/logs"

# 1. 启动 MCP 服务器（后台运行，使用 tsx）
echo "[1/4] 启动 MCP 服务器..."
cd "$PROJECT_ROOT/mcp"
nohup tsx src/index.ts > "$PROJECT_ROOT/logs/mcp.log" 2>&1 &
MCP_PID=$!
echo -e "${GREEN}✓ MCP 已启动 (PID: $MCP_PID)${NC}"
sleep 2

# 2. 启动后端（后台运行，使用 tsx）
echo "[2/4] 启动后端服务..."
cd "$PROJECT_ROOT/backend"
nohup tsx src/index.ts > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ 后端已启动 (PID: $BACKEND_PID)${NC}"

# 等待后端启动
echo -n "等待后端就绪..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/account-totals > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    sleep 1
    echo -n "."
done

# 3. 启动前端（后台运行）
echo "[3/4] 启动前端服务..."
cd "$PROJECT_ROOT/web"
nohup npm run dev > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ 前端已启动 (PID: $FRONTEND_PID)${NC}"

# 等待前端启动
echo -n "等待前端就绪..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    sleep 1
    echo -n "."
done

# 4. 启动 Trading Agents（后台运行，使用 tsx）
echo "[4/4] 启动 Trading Agents..."
cd "$PROJECT_ROOT/agents"
nohup tsx main.ts > "$PROJECT_ROOT/logs/agents.log" 2>&1 &
AGENTS_PID=$!
echo -e "${GREEN}✓ Agents 已启动 (PID: $AGENTS_PID)${NC}"
sleep 2

# 保存 PID
echo "$MCP_PID" > "$PROJECT_ROOT/logs/mcp.pid"
echo "$BACKEND_PID" > "$PROJECT_ROOT/logs/backend.pid"
echo "$FRONTEND_PID" > "$PROJECT_ROOT/logs/frontend.pid"
echo "$AGENTS_PID" > "$PROJECT_ROOT/logs/agents.pid"

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ 启动完成！${NC}"
echo "========================================="
echo ""
echo "服务地址："
echo -e "  MCP: stdio (agents 通过 stdio 连接)"
echo -e "  后端: ${BLUE}http://localhost:3001${NC}"
echo -e "  前端: ${BLUE}http://localhost:3000${NC}"
echo ""
echo "日志文件："
echo "  MCP: $PROJECT_ROOT/logs/mcp.log"
echo "  后端: $PROJECT_ROOT/logs/backend.log"
echo "  前端: $PROJECT_ROOT/logs/frontend.log"
echo "  Agents: $PROJECT_ROOT/logs/agents.log"
echo ""
echo "停止服务："
echo "  运行: ./stop-all.sh"
echo ""
echo "查看日志："
echo "  MCP: tail -f logs/mcp.log"
echo "  后端: tail -f logs/backend.log"
echo "  前端: tail -f logs/frontend.log"
echo "  Agents: tail -f logs/agents.log"
echo ""
echo -e "${YELLOW}提示: DataCollector 每15秒收集一次数据${NC}"
echo ""

# 打开浏览器
echo -e "${BLUE}正在打开浏览器...${NC}"
sleep 2
open http://localhost:3000

echo ""
echo -e "${GREEN}🎉 系统已完全启动！${NC}"
echo ""
