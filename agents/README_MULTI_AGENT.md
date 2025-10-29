# 多 Agent 配置和启动指南

## 📁 配置文件结构

每个 Agent 都有独立的配置文件，位于 `agents/configs/` 目录：

```
agents/
├── configs/
│   ├── gpt-5.env                    # GPT-5 配置
│   ├── deepseek-chat-v3.1.env       # DeepSeek 配置
│   ├── claude-sonnet-4-5.env        # Claude 配置
│   ├── gemini-2.5-pro.env           # Gemini 配置
│   ├── grok-4.env                   # Grok 配置（需创建）
│   └── qwen3-max.env                # Qwen 配置（需创建）
├── start-agent.sh                   # 启动单个 Agent
├── start-all-agents.sh              # 启动所有 Agents
└── stop-all-agents.sh               # 停止所有 Agents
```

## 🔧 配置文件格式

每个 `.env` 文件包含以下配置：

```bash
# Agent 基本信息
MODEL_ID=gpt-5                       # 模型ID（必需，唯一标识）
MODEL_NAME=GPT-5                     # 模型显示名称

# AI API 配置
AI_API_ENDPOINT=https://api.openai.com/v1/chat/completions
AI_API_KEY=your-api-key              # 你的 API Key（必需）
AI_MODEL=gpt-4                       # 使用的具体模型

# Agent 行为配置
MAX_HISTORY_LENGTH=10                # 保留的对话历史数量
INTERVAL_SECONDS=180                 # 执行间隔（秒）
BYPASS_RISK_CONTROL=true             # 是否绕过风险控制

# 数据库配置（所有 Agent 共享）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_trading
DB_USER=quyi
DB_PASSWORD=

# MCP 配置（所有 Agent 共享）
MCP_SERVER_PATH=/Users/quyi/AI-IDE/AI-btc2/mcp/build/index.js
```

## 🚀 启动单个 Agent

```bash
cd /Users/quyi/AI-IDE/AI-btc2/agents

# 启动 GPT-5 Agent
./start-agent.sh gpt-5

# 启动 DeepSeek Agent
./start-agent.sh deepseek-chat-v3.1

# 启动 Claude Agent
./start-agent.sh claude-sonnet-4-5
```

## 🎯 启动所有 Agents

```bash
cd /Users/quyi/AI-IDE/AI-btc2/agents

# 一键启动所有配置好的 Agents
./start-all-agents.sh
```

脚本会自动：
1. 检查每个配置文件是否存在
2. 验证 API Key 是否配置
3. 后台启动每个 Agent
4. 保存 PID 到 `pids/` 目录
5. 输出日志到 `logs/` 目录

## 🛑 停止所有 Agents

```bash
cd /Users/quyi/AI-IDE/AI-btc2/agents

# 停止所有运行中的 Agents
./stop-all-agents.sh
```

## 📊 查看 Agent 状态

### 查看日志

```bash
# 实时查看 GPT-5 Agent 日志
tail -f logs/gpt-5.log

# 查看 DeepSeek Agent 日志
tail -f logs/deepseek-chat-v3.1.log

# 查看所有 Agent 日志
tail -f logs/*.log
```

### 查看进程

```bash
# 查看运行中的 Agents
ps aux | grep "node.*agent.js"

# 查看 PID 文件
ls -la pids/
```

### 查看数据库中的对话记录

```bash
# 查看所有 Agent 的对话记录
psql -d ai_trading -c "SELECT id, model_id, cycle_id, inserted_at FROM agent_conversations ORDER BY inserted_at DESC LIMIT 10;"

# 查看特定 Agent 的对话
psql -d ai_trading -c "SELECT * FROM agent_conversations WHERE model_id = 'gpt-5' ORDER BY inserted_at DESC LIMIT 5;"
```

## 🔑 配置 API Keys

### 1. 编辑配置文件

```bash
# 编辑 GPT-5 配置
nano configs/gpt-5.env

# 修改这一行
AI_API_KEY=sk-your-actual-openai-api-key
```

### 2. 支持的 AI 提供商

#### OpenAI (GPT-5)
```bash
AI_API_ENDPOINT=https://api.openai.com/v1/chat/completions
AI_API_KEY=sk-...
AI_MODEL=gpt-4
```

#### DeepSeek
```bash
AI_API_ENDPOINT=https://api.deepseek.com/v1/chat/completions
AI_API_KEY=sk-...
AI_MODEL=deepseek-chat
```

#### Anthropic (Claude)
```bash
AI_API_ENDPOINT=https://api.anthropic.com/v1/messages
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-5
```

#### Google (Gemini)
```bash
AI_API_ENDPOINT=https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent
AI_API_KEY=...
AI_MODEL=gemini-2.5-pro
```

## 📝 添加新的 Agent

### 1. 创建配置文件

```bash
cd agents/configs
cp gpt-5.env grok-4.env
```

### 2. 编辑配置

```bash
nano grok-4.env
```

修改：
```bash
MODEL_ID=grok-4
MODEL_NAME=Grok 4
AI_API_ENDPOINT=https://api.x.ai/v1/chat/completions
AI_API_KEY=your-xai-api-key
AI_MODEL=grok-4
```

### 3. 启动新 Agent

```bash
./start-agent.sh grok-4
```

## 🎛️ 高级配置

### 调整执行间隔

不同的 Agent 可以有不同的执行间隔：

```bash
# GPT-5: 每 3 分钟执行一次
INTERVAL_SECONDS=180

# DeepSeek: 每 5 分钟执行一次
INTERVAL_SECONDS=300
```

### 调整对话历史长度

```bash
# 保留更多历史（消耗更多 tokens）
MAX_HISTORY_LENGTH=20

# 保留更少历史（节省 tokens）
MAX_HISTORY_LENGTH=5
```

### 风险控制

```bash
# 完全交给 AI 决策
BYPASS_RISK_CONTROL=true

# 启用风险控制（限制仓位大小等）
BYPASS_RISK_CONTROL=false
```

## 🔄 重启 Agent

```bash
# 停止特定 Agent
kill $(cat pids/gpt-5.pid)

# 重新启动
./start-agent.sh gpt-5
```

## 📈 监控和调试

### 实时监控所有 Agents

```bash
# 使用 tmux 或 screen 分屏查看
tmux new-session \; \
  split-window -h \; \
  split-window -v \; \
  select-pane -t 0 \; \
  send-keys 'tail -f logs/gpt-5.log' C-m \; \
  select-pane -t 1 \; \
  send-keys 'tail -f logs/deepseek-chat-v3.1.log' C-m \; \
  select-pane -t 2 \; \
  send-keys 'tail -f logs/claude-sonnet-4-5.log' C-m
```

### 检查 Agent 是否正常工作

```bash
# 查看最近的对话记录
psql -d ai_trading -c "
  SELECT 
    model_id, 
    cycle_id, 
    to_timestamp(inserted_at) as time,
    cot_trace_summary
  FROM agent_conversations 
  ORDER BY inserted_at DESC 
  LIMIT 10;
"
```

## ⚠️ 注意事项

1. **API Key 安全**
   - 不要将配置文件提交到 Git
   - 已在 `.gitignore` 中排除 `configs/*.env`

2. **资源使用**
   - 每个 Agent 是独立进程
   - 同时运行多个 Agent 会消耗更多 API 调用
   - 建议根据 API 限额调整 `INTERVAL_SECONDS`

3. **数据库连接**
   - 所有 Agent 共享同一个数据库
   - 每个 Agent 通过 `model_id` 区分数据

4. **MCP 服务器**
   - 所有 Agent 共享同一个 MCP 服务器
   - 确保 MCP 服务器已构建并可用

## 🆘 故障排除

### Agent 无法启动

```bash
# 检查配置文件
cat configs/gpt-5.env

# 检查构建
ls -la build/agent.js

# 重新构建
npm run build
```

### Agent 运行但不保存对话

```bash
# 检查数据库连接
psql -d ai_trading -c "SELECT 1;"

# 查看 Agent 日志
tail -f logs/gpt-5.log
```

### API 调用失败

```bash
# 检查 API Key
grep AI_API_KEY configs/gpt-5.env

# 测试 API 连接（以 OpenAI 为例）
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 📚 相关文档

- `BACKEND_DESIGN.md` - 后端系统设计
- `START_GUIDE.md` - 系统启动指南
- `TIMESTAMP_GUIDE.md` - 时间戳使用指南
