# Prompter - AI交易Prompt生成器

自动生成AI交易系统的User Prompt，使用MCP工具获取实时市场数据和账户信息。

## 安装

```bash
npm install
```

## 使用方法

### 方法1：使用npm脚本（推荐）

```bash
# 编译并运行
npm run generate

# 或者分步执行
npm run build    # 编译TypeScript
npm run start    # 运行编译后的代码
```

### 方法2：使用ts-node直接运行

```bash
npm run dev
```

### 方法3：使用Node.js直接运行

```bash
# 先编译
npx tsc

# 运行
node build/prompter.js
```

## 输出

生成的prompt会保存到 `/logs` 目录下，文件名格式：

```
prompt_2025-10-28T12-38-45-123Z.txt
```

## 文件结构

```
prompts/
├── prompter.ts           # 主程序
├── mcp-client.ts         # MCP客户端
├── main-template.md      # 主模板
├── coin-template.md      # 币种数据模板
├── package.json          # 依赖配置
├── tsconfig.json         # TypeScript配置
└── README.md            # 说明文档
```

## 工作流程

1. 连接到MCP Trading Server
2. 获取6个币种的市场数据（BTC, ETH, SOL, BNB, XRP, DOGE）
3. 获取账户状态和持仓信息
4. 填充模板生成完整prompt
5. 保存到logs文件夹
6. 输出到控制台

## 配置

修改 `prompter.ts` 中的 `main()` 函数来调整：

- 开始时间（用于计算elapsed_minutes）
- 调用次数（invocation_count）
- 输出路径

## 依赖

- `@modelcontextprotocol/sdk` - MCP SDK
- `typescript` - TypeScript编译器
- `ts-node` - TypeScript运行时

## 注意事项

1. 确保MCP Trading Server已经启动
2. 确保有正确的API密钥配置
3. logs目录会自动创建
