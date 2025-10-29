# Agent Profiles 配置目录

## 📁 目录说明

此目录包含所有 Agent 的配置文件。每个 `.env` 文件代表一个独立的 Agent 实例。

## 🔧 配置文件结构

每个 Agent 配置文件包含以下部分：

### 1. Agent 身份（必需）

```bash
# Agent 的唯一标识符（用于数据库区分）
MODEL_ID=deepseek-trader-001

# Agent 显示名称
MODEL_NAME=DeepSeek Trader
```

**重要**：
- `MODEL_ID` 必须唯一，用于在数据库中区分不同的 Agent
- `MODEL_NAME` 是人类可读的名称

### 2. AI 模型配置（必需）

```bash
# 使用哪个 AI 提供商
AI_PROVIDER=deepseek

# 使用的具体模型
AI_MODEL=deepseek-chat

# API Key（可选，默认使用全局配置）
# AI_API_KEY=

# API URL（可选，默认使用全局配置）
# AI_API_URL=
```

**支持的 AI_PROVIDER**：
- `deepseek` - DeepSeek API
- `openai` - OpenAI (GPT-4, GPT-5)
- `anthropic` - Anthropic (Claude)
- `google` - Google (Gemini)
- `xai` - X.AI (Grok)
- `qwen` - Alibaba (Qwen)
- `openrouter` - OpenRouter (多模型聚合)

### 3. Agent 行为配置

```bash
# 执行间隔（秒）
INTERVAL_SECONDS=180

# 保留的对话历史数量
MAX_HISTORY_LENGTH=10

# 是否绕过风险控制
BYPASS_RISK_CONTROL=true
```

### 4. 交易策略配置

```bash
# 最大持仓数量
MAX_POSITIONS=3

# 单次交易最大金额（USD）
MAX_TRADE_SIZE=1000

# 默认杠杆倍数
DEFAULT_LEVERAGE=3

# 风险偏好
RISK_PREFERENCE=moderate
```

## 📝 创建新 Agent

### 方法一：复制现有配置

```bash
cd /Users/quyi/AI-IDE/AI-btc2/profiles

# 复制模板
cp deepseek-trader.env my-new-agent.env

# 编辑配置
nano my-new-agent.env
```

### 方法二：从头创建

创建新文件 `my-agent.env`：

```bash
# Agent 身份
MODEL_ID=my-agent-001
MODEL_NAME=My Custom Agent

# AI 模型
AI_PROVIDER=openai
AI_MODEL=gpt-4

# 行为配置
INTERVAL_SECONDS=180
MAX_HISTORY_LENGTH=10
BYPASS_RISK_CONTROL=true

# 策略配置
MAX_POSITIONS=3
MAX_TRADE_SIZE=1000
DEFAULT_LEVERAGE=3
RISK_PREFERENCE=moderate
```

## 🚀 启用 Agent

编辑项目根目录的 `.env` 文件：

```bash
# 启用单个 Agent
ENABLED_AGENTS=deepseek-trader

# 启用多个 Agents
ENABLED_AGENTS=deepseek-trader,gpt5-trader,claude-trader

# 启用重复的 Agent（会创建多个实例）
ENABLED_AGENTS=deepseek-trader,deepseek-trader,gpt5-trader
```

## 🎯 配置示例

### 保守型交易 Agent

```bash
MODEL_ID=conservative-trader
MODEL_NAME=Conservative Trader
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-5
INTERVAL_SECONDS=300
MAX_POSITIONS=2
MAX_TRADE_SIZE=500
DEFAULT_LEVERAGE=2
RISK_PREFERENCE=conservative
BYPASS_RISK_CONTROL=false
```

### 激进型交易 Agent

```bash
MODEL_ID=aggressive-trader
MODEL_NAME=Aggressive Trader
AI_PROVIDER=openai
AI_MODEL=gpt-4
INTERVAL_SECONDS=120
MAX_POSITIONS=5
MAX_TRADE_SIZE=2000
DEFAULT_LEVERAGE=5
RISK_PREFERENCE=aggressive
BYPASS_RISK_CONTROL=true
```

### 多策略组合

创建多个配置文件，然后在 `.env` 中启用：

```bash
ENABLED_AGENTS=conservative-trader,moderate-trader,aggressive-trader
```

## 🔑 API Key 配置

### 方式一：使用全局 API Key（推荐）

在项目根目录的 `.env` 中配置：

```bash
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-xxx
```

Agent 配置文件中不设置 `AI_API_KEY`，会自动使用全局配置。

### 方式二：为每个 Agent 单独配置

在 Agent 配置文件中：

```bash
AI_API_KEY=sk-specific-key-for-this-agent
```

这会覆盖全局配置。

## 📊 配置优先级

1. **Agent 配置文件** 中的设置（最高优先级）
2. **全局 .env 文件** 中的设置
3. **代码默认值**（最低优先级）

## ⚠️ 注意事项

1. **MODEL_ID 必须唯一**
   - 每个 Agent 必须有不同的 `MODEL_ID`
   - 即使使用相同的 AI 模型，也要设置不同的 ID

2. **配置文件命名**
   - 文件名可以任意，但建议使用描述性名称
   - 必须以 `.env` 结尾
   - 示例：`deepseek-trader.env`, `gpt5-conservative.env`

3. **安全性**
   - 不要提交包含真实 API Key 的配置文件到 Git
   - 已在 `.gitignore` 中排除 `profiles/*.env`
   - 可以提交 `profiles/*.env.example` 作为模板

4. **资源使用**
   - 每个 Agent 是独立实例
   - 同时运行多个 Agent 会增加 API 调用和资源消耗
   - 建议根据实际需求调整 `INTERVAL_SECONDS`

## 🔄 配置更新

修改配置文件后，需要重启 Agent：

```bash
# 停止所有 Agents
./stop-all.sh

# 重新启动
./start-all.sh
```

或者使用新的 main.ts：

```bash
cd agents
npm run build
npm start
```

## 📚 相关文档

- `../.env.example` - 全局配置模板
- `../AGENTS_START_GUIDE.md` - Agent 启动指南
- `../agents/README.md` - Agent 系统文档
