#!/bin/bash

# AI Trading 系统停止脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "========================================="
echo -e "${BLUE}  🛑 停止 AI Trading 系统${NC}"
echo "========================================="
echo ""

# 项目根目录（自动获取脚本所在目录）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# 1. 停止 MCP 服务器
if [ -f "$PROJECT_ROOT/logs/mcp.pid" ]; then
    MCP_PID=$(cat "$PROJECT_ROOT/logs/mcp.pid")
    echo -n "[1/4] 停止 MCP 服务器 (PID: $MCP_PID)... "
    if kill $MCP_PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}! 进程不存在${NC}"
    fi
    rm "$PROJECT_ROOT/logs/mcp.pid"
else
    echo -e "${YELLOW}[1/4] 未找到 MCP PID 文件${NC}"
fi

# 2. 停止后端服务
if [ -f "$PROJECT_ROOT/logs/backend.pid" ]; then
    BACKEND_PID=$(cat "$PROJECT_ROOT/logs/backend.pid")
    echo -n "[2/4] 停止后端服务 (PID: $BACKEND_PID)... "
    if kill $BACKEND_PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}! 进程不存在${NC}"
    fi
    rm "$PROJECT_ROOT/logs/backend.pid"
else
    echo -e "${YELLOW}[2/4] 未找到后端 PID 文件${NC}"
fi

# 3. 停止前端服务
if [ -f "$PROJECT_ROOT/logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$PROJECT_ROOT/logs/frontend.pid")
    echo -n "[3/4] 停止前端服务 (PID: $FRONTEND_PID)... "
    if kill $FRONTEND_PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}! 进程不存在${NC}"
    fi
    rm "$PROJECT_ROOT/logs/frontend.pid"
else
    echo -e "${YELLOW}[3/4] 未找到前端 PID 文件${NC}"
fi

# 4. 停止 Trading Agents
if [ -f "$PROJECT_ROOT/logs/agents.pid" ]; then
    AGENTS_PID=$(cat "$PROJECT_ROOT/logs/agents.pid")
    echo -n "[4/4] 停止 Trading Agents (PID: $AGENTS_PID)... "
    if kill $AGENTS_PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}! 进程不存在${NC}"
    fi
    rm "$PROJECT_ROOT/logs/agents.pid"
else
    echo -e "${YELLOW}[4/4] 未找到 Agents PID 文件${NC}"
fi

# 清理可能残留的进程
echo -n "清理残留进程... "
pkill -f "tsx.*index.ts" 2>/dev/null || true
pkill -f "tsx.*main.ts" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
echo -e "${GREEN}✓${NC}"

echo ""
echo -e "${GREEN}✓ 所有服务已停止${NC}"
echo ""
