# AI Trading Agents

多 Agent 交易系统，支持同时运行多个 AI 模型进行交易决策。

## 🚀 快速启动

### 方式一：启动所有 Agents（推荐）

```bash
cd /Users/quyi/AI-IDE/AI-btc2/agents

# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 启动所有 Agents
npm start
```

这会启动 `main.ts`，自动运行所有启用的 Agents。

### 方式二：启动单个 Agent

```bash
# 使用启动脚本
./start-agent.sh gpt-5

# 或直接运行（需要先设置环境变量）
export MODEL_ID=gpt-5
npm run start:single
```

## 📁 项目结构

```
agents/
├── main.ts                    # 多 Agent 启动入口（新）
├── agent.ts                   # Agent 核心逻辑
├── configs/                   # Agent 配置文件
│   ├── gpt-5.env
│   ├── deepseek-chat-v3.1.env
│   ├── claude-sonnet-4-5.env
│   ├── gemini-2.5-pro.env
│   ├── grok-4.env
│   └── qwen3-max.env
├── logs/                      # Agent 日志
├── pids/                      # 进程 PID
├── start-agent.sh             # 单个 Agent 启动脚本
├── start-all-agents.sh        # 后台启动所有 Agents
└── stop-all-agents.sh         # 停止所有 Agents
```

## ⚙️ 配置 Agents

### 1. 启用/禁用 Agents

编辑 `main.ts` 中的 `AVAILABLE_AGENTS` 配置：

```typescript
const AVAILABLE_AGENTS: AgentInstanceConfig[] = [
  {
    modelId: 'gpt-5',
    configFile: 'configs/gpt-5.env',
    enabled: true,  // 设置为 true 启用
  },
  {
    modelId: 'deepseek-chat-v3.1',
    configFile: 'configs/deepseek-chat-v3.1.env',
    enabled: true,
  },
  // ... 更多 Agents
];
```

### 2. 配置 API Keys

编辑对应的配置文件：

```bash
# 编辑 GPT-5 配置
nano configs/gpt-5.env

# 修改 API Key
AI_API_KEY=sk-your-actual-openai-api-key
```

### 3. 调整执行间隔

在配置文件中修改：

```bash
# 每 3 分钟执行一次
INTERVAL_SECONDS=180

# 每 5 分钟执行一次
INTERVAL_SECONDS=300
```

## 📊 监控和管理

### 查看运行状态

```bash
# 查看所有 Agent 进程
ps aux | grep "node.*build/main.js"

# 查看实时日志
tail -f logs/*.log
```

### 查看数据库中的对话记录

```bash
# 查看所有 Agent 的对话
psql -d ai_trading -c "SELECT model_id, cycle_id, inserted_at FROM agent_conversations ORDER BY inserted_at DESC LIMIT 10;"

# 查看特定 Agent
psql -d ai_trading -c "SELECT * FROM agent_conversations WHERE model_id = 'gpt-5' ORDER BY inserted_at DESC LIMIT 5;"
```

### 停止 Agents

```bash
# 前台运行：按 Ctrl+C

# 后台运行：使用停止脚本
./stop-all-agents.sh
```

## 🎯 运行模式对比

| 模式 | 命令 | 说明 | 适用场景 |
|------|------|------|----------|
| **多 Agent（推荐）** | `npm start` | 运行 main.ts，启动所有 Agents | 生产环境，同时运行多个模型 |
| **单 Agent** | `./start-agent.sh gpt-5` | 只启动一个 Agent | 测试单个模型 |
| **后台多 Agent** | `./start-all-agents.sh` | 后台启动所有 Agents | 服务器部署 |

## 📝 添加新 Agent

### 1. 创建配置文件

```bash
cd configs
cp gpt-5.env my-new-agent.env
```

### 2. 编辑配置

```bash
nano my-new-agent.env
```

修改：
```bash
MODEL_ID=my-new-agent
MODEL_NAME=My New Agent
AI_API_ENDPOINT=https://api.example.com/v1/chat/completions
AI_API_KEY=your-api-key
AI_MODEL=model-name
```

### 3. 在 main.ts 中注册

编辑 `main.ts`，添加到 `AVAILABLE_AGENTS`：

```typescript
{
  modelId: 'my-new-agent',
  configFile: 'configs/my-new-agent.env',
  enabled: true,
},
```

### 4. 重新构建和启动

```bash
npm run build
npm start
```

## 🔍 日志说明

每个 Agent 的日志包含：
- 初始化信息
- 账户状态（交易前后）
- 决策过程
- 执行结果
- 错误信息

日志文件位置：
- 前台运行：直接输出到终端
- 后台运行：`logs/<model-id>.log`

## ⚠️ 注意事项

1. **API 限额**
   - 每个 Agent 独立调用 API
   - 注意 API 提供商的速率限制
   - 建议调整 `INTERVAL_SECONDS` 避免超限

2. **资源使用**
   - 所有 Agents 在同一进程中运行
   - 共享数据库连接池
   - 内存使用随 Agent 数量增加

3. **数据隔离**
   - 每个 Agent 通过 `model_id` 区分数据
   - 共享同一个 MCP 服务器
   - 对话记录独立存储

4. **配置安全**
   - 不要提交 `.env` 文件到 Git
   - API Keys 保密
   - 使用环境变量管理敏感信息

## 🆘 故障排除

### Agents 无法启动

```bash
# 检查构建
ls -la build/main.js

# 重新构建
npm run build

# 查看详细错误
npm start 2>&1 | tee error.log
```

### 某个 Agent 被跳过

检查配置文件：
```bash
# 查看配置
cat configs/gpt-5.env

# 确认 API Key 已设置
grep AI_API_KEY configs/gpt-5.env
```

### Agent 不保存对话

```bash
# 检查数据库连接
psql -d ai_trading -c "SELECT 1;"

# 查看 Agent 日志中的数据库错误
tail -f logs/*.log | grep -i "db\|database\|error"
```

## 📚 相关文档

- `README_MULTI_AGENT.md` - 多 Agent 详细配置指南
- `../BACKEND_DESIGN.md` - 后端系统设计
- `../START_GUIDE.md` - 系统启动指南

## 🎉 开始使用

```bash
# 1. 配置 API Keys
nano configs/deepseek-chat-v3.1.env

# 2. 启用需要的 Agents（编辑 main.ts）
nano main.ts

# 3. 构建并启动
npm run build
npm start
```

祝交易顺利！🚀
