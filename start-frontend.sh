#!/bin/bash

# AI Trading 前端启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "========================================="
echo -e "${BLUE}  🚀 启动前端服务${NC}"
echo "========================================="
echo ""

# 项目根目录（自动获取脚本所在目录）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# 1. 检查前端依赖
echo -n "1. 检查前端依赖... "
cd "$PROJECT_ROOT/web"
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 正在安装...${NC}"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

# 2. 检查环境变量
echo -n "2. 检查环境配置... "
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}! .env.local 不存在${NC}"
    echo -e "${YELLOW}⚠️  将使用根目录的 .env 配置${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ 准备完成！${NC}"
echo "========================================="
echo ""

# 询问是否启动服务
echo "准备启动前端服务 (http://localhost:3000)"
echo ""
read -p "是否现在启动? (Y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo "取消启动。你可以手动启动："
    echo ""
    echo "  cd web && npm run dev"
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

# 启动前端（后台运行）
echo "启动前端服务..."
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

# 保存 PID
echo "$FRONTEND_PID" > "$PROJECT_ROOT/logs/frontend.pid"

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ 启动完成！${NC}"
echo "========================================="
echo ""
echo "服务地址："
echo -e "  前端: ${BLUE}http://localhost:3000${NC}"
echo ""
echo "日志文件："
echo "  前端: $PROJECT_ROOT/logs/frontend.log"
echo ""
echo "停止服务："
echo "  运行: kill $FRONTEND_PID"
echo "  或者: pkill -f 'npm run dev'"
echo ""
echo "查看日志："
echo "  tail -f logs/frontend.log"
echo ""

# 读取 .env 中的数据源配置
DATA_SOURCE=$(grep "^NEXT_PUBLIC_DATA_SOURCE=" "$PROJECT_ROOT/.env" | cut -d '=' -f2)
if [ "$DATA_SOURCE" = "official" ]; then
    echo -e "${BLUE}📊 数据源: 官方 API (nof1.ai)${NC}"
elif [ "$DATA_SOURCE" = "custom" ]; then
    echo -e "${BLUE}📊 数据源: 自定义后端 (需要启动后端服务)${NC}"
    echo -e "${YELLOW}⚠️  提示: 如果使用自定义数据源，请确保后端服务已启动${NC}"
    echo -e "${YELLOW}   启动后端: cd backend && tsx src/index.ts${NC}"
fi
echo ""

# 打开浏览器
echo -e "${BLUE}正在打开浏览器...${NC}"
sleep 2
open http://localhost:3000

echo ""
echo -e "${GREEN}🎉 前端服务已启动！${NC}"
echo ""
