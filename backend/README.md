# AI Trading Backend

后端服务，为AI交易平台提供API端点和数据收集服务。

## 功能

1. **数据收集服务** - 每15秒从MCP获取账户信息并保存到数据库
2. **API服务** - 提供RESTful API供前端调用
3. **数据同步** - 自动同步MCP数据库中的已完成交易

## 技术栈

- **Node.js + TypeScript**
- **Express.js** - Web框架
- **PostgreSQL** - 数据库
- **MCP SDK** - 与MCP服务器通信

## 数据库设置

### 1. 创建数据库

```bash
# 登录PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE ai_trading;

# 退出
\q
```

### 2. 初始化表结构

```bash
# 方式1: 使用npm脚本
npm run init-db

# 方式2: 手动执行
psql -U postgres -d ai_trading -f database/schema.sql
```

## 安装和运行

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑.env文件，填入正确的数据库配置
nano .env
```

### 3. 构建

```bash
npm run build
```

### 4. 运行

```bash
# 生产模式
npm start

# 开发模式（自动重新编译）
npm run dev
```

## API端点

### 1. 账户历史 - `GET /api/account-history`
返回所有账户历史快照（用于图表）

**响应格式**:
```json
{
  "accountTotals": [
    {
      "model_id": "gpt-5",
      "dollar_equity": 10500.50,
      "total_unrealized_pnl": 500.50,
      "timestamp": 1234567890
    }
  ],
  "count": 100
}
```

### 2. 账户总览 - `GET /api/account-totals`
返回最新的账户状态和仓位信息

**响应格式**:
```json
{
  "accountTotals": [
    {
      "id": "gpt-5_1234567890",
      "model_id": "gpt-5",
      "dollar_equity": 10500.50,
      "total_unrealized_pnl": 500.50,
      "positions": {
        "BTC": {
          "symbol": "BTC",
          "entry_price": 100000,
          "current_price": 101000,
          "quantity": 0.1,
          "leverage": 10,
          "unrealized_pnl": 100,
          "exit_plan": {
            "profit_target": 105000,
            "stop_loss": 98000,
            "invalidation_condition": "..."
          }
        }
      }
    }
  ]
}
```

### 3. 已完成交易 - `GET /api/trades`
返回已完成的交易列表

**响应格式**:
```json
{
  "trades": [
    {
      "id": "trade-uuid",
      "symbol": "BTC",
      "model_id": "gpt-5",
      "side": "long",
      "quantity": 0.1,
      "realized_net_pnl": 150.50,
      "entry_price": 100000,
      "exit_price": 101500,
      "leverage": 10,
      "entry_time": 1234567890,
      "exit_time": 1234567900,
      "entry_human_time": "2025-01-01T00:00:00Z",
      "exit_human_time": "2025-01-01T01:00:00Z"
    }
  ],
  "count": 50
}
```

### 4. 对话记录 - `GET /api/conversations`
返回Agent的对话和决策记录

**响应格式**:
```json
{
  "conversations": [
    {
      "id": "gpt-5_1",
      "user_prompt": "...",
      "llm_response": {
        "BTC": {
          "signal": "buy_to_enter",
          "quantity": 0.1,
          "leverage": 10,
          "profit_target": 105000,
          "stop_loss": 98000,
          "justification": "..."
        }
      },
      "cycle_id": 1,
      "inserted_at": 1234567890,
      "cot_trace_summary": "..."
    }
  ],
  "count": 20
}
```

### 5. 实时币价 - `GET /api/crypto-prices`
代理请求到 https://nof1.ai/api/crypto-prices

**响应格式**:
```json
{
  "prices": {
    "BTC": { "price": 100000 },
    "ETH": { "price": 3500 }
  }
}
```

### 6. 健康检查 - `GET /health`
检查服务状态

**响应格式**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00Z",
  "dataCollector": true
}
```

## 数据收集服务

### 工作原理

1. **每15秒执行一次**:
   - 从MCP获取所有模型的账户状态
   - 保存账户快照到 `account_snapshots` 表
   - 保存仓位信息到 `positions` 表
   - 同步已完成交易到 `completed_trades` 表

2. **数据流**:
   ```
   MCP Server → DataCollector → PostgreSQL → API → Frontend
   ```

### 支持的模型

- gpt-5
- claude-sonnet-4-5
- gemini-2.5-pro
- grok-4
- deepseek-chat-v3.1
- qwen3-max
- buynhold_btc

## 目录结构

```
backend/
├── src/
│   ├── database/
│   │   └── db.ts              # 数据库连接和查询
│   ├── routes/
│   │   ├── accountHistory.ts  # 账户历史API
│   │   ├── accountTotals.ts   # 账户总览API
│   │   ├── trades.ts          # 交易记录API
│   │   ├── conversations.ts   # 对话记录API
│   │   └── cryptoPrices.ts    # 币价代理API
│   ├── services/
│   │   └── DataCollector.ts   # 数据收集服务
│   └── index.ts               # 主入口
├── database/
│   └── schema.sql             # 数据库表结构
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 开发

### 监听文件变化

```bash
# 终端1: 监听TypeScript编译
npm run watch

# 终端2: 运行服务器
npm start
```

### 数据库管理

```bash
# 查看账户快照
psql -U postgres -d ai_trading -c "SELECT * FROM account_snapshots ORDER BY timestamp DESC LIMIT 10;"

# 查看仓位
psql -U postgres -d ai_trading -c "SELECT * FROM positions ORDER BY timestamp DESC LIMIT 10;"

# 查看已完成交易
psql -U postgres -d ai_trading -c "SELECT * FROM completed_trades ORDER BY exit_time DESC LIMIT 10;"

# 查看对话记录
psql -U postgres -d ai_trading -c "SELECT * FROM agent_conversations ORDER BY inserted_at DESC LIMIT 10;"

# 清理7天前的数据
psql -U postgres -d ai_trading -c "SELECT cleanup_old_snapshots();"
```

## 故障排除

### 数据库连接失败

1. 检查PostgreSQL是否运行: `pg_isready`
2. 检查数据库是否存在: `psql -U postgres -l`
3. 检查.env配置是否正确

### MCP连接失败

1. 检查MCP服务器路径是否正确
2. 检查MCP服务器是否可以独立运行
3. 查看日志输出

### API返回空数据

1. 检查DataCollector是否正常运行
2. 检查数据库中是否有数据
3. 查看服务器日志

## 许可证

MIT
