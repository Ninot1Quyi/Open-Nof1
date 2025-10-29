#!/bin/bash

# 清理所有中间产物和依赖

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "========================================="
echo -e "${BLUE}  🧹 清理 AI Trading 系统${NC}"
echo "========================================="
echo ""

# 项目根目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# 1. 停止所有服务
echo "[1/8] 停止所有服务..."
if [ -f "$PROJECT_ROOT/stop-all.sh" ]; then
    "$PROJECT_ROOT/stop-all.sh" > /dev/null 2>&1 || true
fi
echo -e "${GREEN}✓${NC}"

# 2. 清理 node_modules
echo "[2/8] 清理 node_modules..."
rm -rf "$PROJECT_ROOT/mcp/node_modules"
rm -rf "$PROJECT_ROOT/backend/node_modules"
rm -rf "$PROJECT_ROOT/web/node_modules"
rm -rf "$PROJECT_ROOT/agents/node_modules"
echo -e "${GREEN}✓${NC}"

# 3. 清理 package-lock.json
echo "[3/8] 清理 package-lock.json..."
rm -f "$PROJECT_ROOT/mcp/package-lock.json"
rm -f "$PROJECT_ROOT/backend/package-lock.json"
rm -f "$PROJECT_ROOT/web/package-lock.json"
rm -f "$PROJECT_ROOT/agents/package-lock.json"
echo -e "${GREEN}✓${NC}"

# 4. 清理构建产物
echo "[4/8] 清理构建产物..."
rm -rf "$PROJECT_ROOT/web/.next"
rm -rf "$PROJECT_ROOT/web/out"
rm -rf "$PROJECT_ROOT/backend/dist"
rm -rf "$PROJECT_ROOT/mcp/dist"
rm -rf "$PROJECT_ROOT/agents/dist"
echo -e "${GREEN}✓${NC}"

# 5. 清理日志文件
echo "[5/8] 清理日志文件..."
rm -rf "$PROJECT_ROOT/logs"
rm -rf "$PROJECT_ROOT/agents/logs"
echo -e "${GREEN}✓${NC}"

# 6. 清理 PID 文件
echo "[6/8] 清理 PID 文件..."
rm -f "$PROJECT_ROOT/logs/*.pid" 2>/dev/null || true
echo -e "${GREEN}✓${NC}"

# 7. 删除数据库用户
echo "[7/8] 删除数据库用户 OpenNof1..."
if psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='OpenNof1'" | grep -q 1; then
    psql postgres -c 'REVOKE ALL PRIVILEGES ON DATABASE ai_trading FROM "OpenNof1";' > /dev/null 2>&1 || true
    psql postgres -c 'REVOKE ALL PRIVILEGES ON DATABASE nof1 FROM "OpenNof1";' > /dev/null 2>&1 || true
    psql postgres -c 'DROP USER "OpenNof1";' > /dev/null 2>&1 || true
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}! 用户不存在，跳过${NC}"
fi

# 8. 重置数据库
echo "[8/8] 重置数据库..."
if [ -f "$PROJECT_ROOT/reset-database.sh" ]; then
    "$PROJECT_ROOT/reset-database.sh" > /dev/null 2>&1 || true
fi
echo -e "${GREEN}✓${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}  ✓ 清理完成！${NC}"
echo "========================================="
echo ""
echo "已清理："
echo "  - 所有 node_modules"
echo "  - 所有 package-lock.json"
echo "  - 构建产物 (.next, dist, out)"
echo "  - 日志文件"
echo "  - 数据库用户 OpenNof1"
echo "  - 数据库数据"
echo ""
echo "下一步："
echo "  运行: ./start-all.sh"
echo ""
