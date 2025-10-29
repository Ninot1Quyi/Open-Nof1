#!/bin/bash

# AI Trading Backend 启动脚本

set -e

echo "========================================="
echo "  AI Trading Backend 启动脚本"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查PostgreSQL是否运行
echo -n "检查 PostgreSQL 数据库... "
if pg_isready -q; then
    echo -e "${GREEN}✓ 运行中${NC}"
else
    echo -e "${RED}✗ 未运行${NC}"
    echo "请先启动 PostgreSQL 数据库"
    exit 1
fi

# 检查数据库是否存在
echo -n "检查数据库 ai_trading... "
if psql -lqt | cut -d \| -f 1 | grep -qw ai_trading; then
    echo -e "${GREEN}✓ 存在${NC}"
else
    echo -e "${YELLOW}! 不存在，正在创建...${NC}"
    createdb ai_trading
    echo -e "${GREEN}✓ 数据库创建成功${NC}"
fi

# 初始化数据库表结构
echo -n "初始化数据库表结构... "
psql -U postgres -d ai_trading -f database/schema.sql > /dev/null 2>&1
echo -e "${GREEN}✓ 完成${NC}"

# 检查 .env 文件
echo -n "检查配置文件... "
if [ ! -f .env ]; then
    echo -e "${YELLOW}! .env 不存在，从示例复制...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}! 请编辑 .env 文件配置数据库连接${NC}"
    exit 1
else
    echo -e "${GREEN}✓ 存在${NC}"
fi

# 检查 node_modules
echo -n "检查依赖... "
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}! 依赖未安装，正在安装...${NC}"
    npm install
    echo -e "${GREEN}✓ 依赖安装完成${NC}"
else
    echo -e "${GREEN}✓ 已安装${NC}"
fi

# 构建项目
echo -n "构建项目... "
npm run build > /dev/null 2>&1
echo -e "${GREEN}✓ 构建完成${NC}"

echo ""
echo "========================================="
echo "  启动后端服务"
echo "========================================="
echo ""

# 启动服务
npm start
