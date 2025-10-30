#!/bin/bash

# 清理旧的 MCP 表结构

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "========================================="
echo -e "${YELLOW}  🧹 清理 MCP 表结构${NC}"
echo "========================================="
echo ""

# 获取所有 mcp_ 开头的表
echo -e "${BLUE}[1/2] 查找 MCP 交易表...${NC}"
TRADE_TABLES=$(psql -d nof1 -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'mcp_trades_%';" | xargs)

echo -e "${BLUE}[2/2] 查找 MCP 快照表...${NC}"
SNAPSHOT_TABLES=$(psql -d nof1 -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'mcp_snapshots_%';" | xargs)

echo ""

if [ -z "$TRADE_TABLES" ] && [ -z "$SNAPSHOT_TABLES" ]; then
  echo -e "${GREEN}✓ 没有找到需要清理的 MCP 表${NC}"
else
  if [ ! -z "$TRADE_TABLES" ]; then
    echo -e "${YELLOW}找到交易表:${NC}"
    for table in $TRADE_TABLES; do
      echo "  - $table"
    done
    echo ""
  fi
  
  if [ ! -z "$SNAPSHOT_TABLES" ]; then
    echo -e "${YELLOW}找到快照表:${NC}"
    for table in $SNAPSHOT_TABLES; do
      echo "  - $table"
    done
    echo ""
  fi
  
  read -p "确认删除这些表吗? (输入 'yes' 确认): " -r
  echo
  
  if [ "$REPLY" != "yes" ]; then
    echo -e "${BLUE}操作已取消${NC}"
    exit 0
  fi
  
  echo -e "${YELLOW}开始删除表...${NC}"
  
  for table in $TRADE_TABLES $SNAPSHOT_TABLES; do
    echo -e "${BLUE}删除表: $table${NC}"
    psql -d nof1 -c "DROP TABLE IF EXISTS $table CASCADE;" > /dev/null 2>&1
  done
  
  echo ""
  echo -e "${GREEN}✓ 清理完成！${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ MCP 表清理完成${NC}"
echo "========================================="
echo ""
echo "新的表结构将在 MCP 启动时自动创建"
echo ""
