#!/bin/bash

# 数据库初始化脚本

set -e

echo "========================================="
echo "  AI Trading 数据库初始化"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 数据库配置
DB_NAME=${DB_NAME:-nof1}
DB_USER=${DB_USER:-OpenNof1}

echo "数据库名称: $DB_NAME"
echo "数据库用户: $DB_USER"
echo ""

# 检查PostgreSQL是否运行
echo -n "1. 检查 PostgreSQL... "
if pg_isready -q; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ PostgreSQL 未运行${NC}"
    exit 1
fi

# 删除旧数据库（可选）
read -p "是否删除已存在的数据库? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -n "2. 删除旧数据库... "
    dropdb --if-exists $DB_NAME 2>/dev/null || true
    echo -e "${GREEN}✓${NC}"
fi

# 创建数据库
echo -n "3. 创建数据库... "
if psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}已存在${NC}"
else
    createdb $DB_NAME
    echo -e "${GREEN}✓${NC}"
fi

# 初始化表结构
echo -n "4. 初始化表结构... "
psql -U $DB_USER -d $DB_NAME -f ../database/schema.sql > /dev/null 2>&1
echo -e "${GREEN}✓${NC}"

# 验证表创建
echo -n "5. 验证表创建... "
TABLE_COUNT=$(psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
if [ "$TABLE_COUNT" -ge 4 ]; then
    echo -e "${GREEN}✓ ($TABLE_COUNT 个表)${NC}"
else
    echo -e "${RED}✗ 表创建失败${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}  数据库初始化完成！${NC}"
echo "========================================="
echo ""
echo "表列表:"
psql -U $DB_USER -d $DB_NAME -c "\dt"
echo ""
echo "视图列表:"
psql -U $DB_USER -d $DB_NAME -c "\dv"
