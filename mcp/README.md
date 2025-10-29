# NOF1 MCP Trading Server 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![CCXT](https://img.shields.io/badge/CCXT-4.2-orange)](https://github.com/ccxt/ccxt)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

基于 [NOF1 Alpha Arena](../nof1-analysis/README.md) 设计的MCP交易服务器，为AI模型提供专业的加密货币交易能力。

## ✨ 特性

- 🤖 **AI友好**: 为大语言模型设计的标准化MCP接口
- 📊 **实时数据**: 获取市场价格、技术指标、资金费率
- 💰 **完整交易**: 支持开多、开空、平仓操作
- 🛡️ **风险管理**: 内置多层风控机制
- 🧪 **模拟交易**: 支持OKX模拟盘，零风险测试
- 🔌 **易扩展**: 基于CCXT，轻松支持更多交易所

## 🎯 核心功能

| 功能 | 描述 |
|------|------|
| **get_market_data** | 获取实时价格、EMA、MACD、RSI等技术指标 |
| **get_account_state** | 查询账户余额、持仓、盈亏状态 |
| **execute_trade** | 执行交易（开仓/平仓），自动风控检查 |
| **update_exit_plan** | 动态调整止盈止损 |
| **get_performance_metrics** | 查看Sharpe比率、胜率等表现指标 |

## 🚀 快速开始

### 1. 安装

```bash
cd mcp
npm install
```

### 2. 配置

编辑 `../.env` 文件：

```env
EXCHANGE="okx"
OKX_API_KEY="your-api-key"
OKX_API_SECRET="your-api-secret"
OKX_API_PASSWORD="your-api-password"
OKX_USE_SANDBOX="true"  # 使用模拟盘
START_MONEY=30
```

### 3. 测试

```bash
# 运行所有测试
npm test

# 测试市场数据
npm run test:market

# 测试账户状态
npm run test:account

# 测试交易执行（模拟盘）
npm run test:trade
```

### 4. 可视化调试（推荐）

使用MCP Inspector进行可视化测试：

```bash
npm run inspector
```

浏览器会自动打开 `http://localhost:5173`，你可以：
- 📊 可视化测试所有MCP工具
- 🎯 交互式输入参数
- 📝 查看实时结果
- 📚 保存调用历史

详见：[MCP Inspector使用指南](./docs/MCP_INSPECTOR.md)

### 5. 启动服务器

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 📖 使用示例

### 获取市场数据

```typescript
const marketData = await mcp.callTool('get_market_data', {
  coins: ['BTC', 'ETH'],
  timeframe: '3m',
  indicators: ['price', 'ema20', 'ema50', 'macd', 'rsi14']
});

console.log(`BTC价格: $${marketData.coins.BTC.current_price}`);
console.log(`BTC RSI: ${marketData.coins.BTC.current_rsi}`);
```

### 查询账户

```typescript
const account = await mcp.callTool('get_account_state', {
  include_positions: true,
  include_performance: true
});

console.log(`账户价值: $${account.account_value}`);
console.log(`活跃持仓: ${account.active_positions.length}`);
```

### 执行交易

```typescript
// 开多仓
const result = await mcp.callTool('execute_trade', {
  action: 'open_long',
  coin: 'BTC',
  leverage: 10,
  margin_amount: 100,
  exit_plan: {
    profit_target: 110000,
    stop_loss: 105000,
    invalidation: 'If BTC closes below $105,000'
  },
  confidence: 75
});

if (result.success) {
  console.log(`✅ 开仓成功！Position ID: ${result.position_id}`);
}
```

### 平仓

```typescript
const closeResult = await mcp.callTool('execute_trade', {
  action: 'close_position',
  coin: 'BTC',
  position_id: 'abc-123-def'
});
```

## 🛡️ 风险管理

系统自动执行以下风控检查：

- ✅ **杠杆限制**: 最大25倍
- ✅ **仓位限制**: 单笔不超过账户50%
- ✅ **敞口限制**: 总敞口不超过账户90%
- ✅ **现金储备**: 保留至少5%现金
- ✅ **强制止损**: 开仓必须设置退出计划

## 📊 支持的币种

- BTC (Bitcoin)
- ETH (Ethereum)
- SOL (Solana)
- BNB (Binance Coin)
- DOGE (Dogecoin)
- XRP (Ripple)

## 📁 项目结构

```
mcp/
├── src/
│   ├── index.ts              # MCP服务器入口
│   ├── types.ts              # 类型定义
│   ├── config.ts             # 配置管理
│   ├── exchange/
│   │   └── ExchangeAdapter.ts # CCXT适配器
│   ├── database/
│   │   └── DatabaseManager.ts # 数据管理
│   ├── utils/
│   │   └── indicators.ts     # 技术指标
│   └── tools/
│       ├── MarketDataTool.ts
│       ├── AccountStateTool.ts
│       ├── TradeExecutionTool.ts
│       ├── UpdateExitPlanTool.ts
│       └── PerformanceMetricsTool.ts
├── tests/                    # 测试文件
├── docs/                     # 文档
│   ├── README.md            # 概述
│   ├── API.md               # API详细文档
│   └── DEPLOYMENT.md        # 部署指南
└── package.json
```

## 📚 文档

- 📖 [API详细文档](./docs/API.md)
- 🚀 [部署指南](./docs/DEPLOYMENT.md)
- 📊 [NOF1项目分析](../nof1-analysis/README.md)

## 🧪 测试覆盖

- ✅ 市场数据获取
- ✅ 技术指标计算
- ✅ 账户状态查询
- ✅ 交易执行（模拟盘）
- ✅ 风险管理验证
- ✅ 性能指标计算

## 🔐 安全建议

1. **使用模拟盘测试**: 设置 `OKX_USE_SANDBOX="true"`
2. **保护API密钥**: 不要提交到版本控制
3. **限制权限**: API密钥仅授予交易权限，禁用提现
4. **设置IP白名单**: 在交易所后台限制访问IP
5. **小额开始**: 真实交易从小金额开始

## 🤝 贡献

欢迎提交Issue和Pull Request！

### 开发流程

```bash
# 1. Fork项目
# 2. 创建特性分支
git checkout -b feature/amazing-feature

# 3. 提交更改
git commit -m 'Add amazing feature'

# 4. 推送到分支
git push origin feature/amazing-feature

# 5. 创建Pull Request
```

## 📊 性能指标

- **API响应时间**: < 500ms
- **市场数据延迟**: < 1s
- **交易执行时间**: < 2s
- **内存占用**: ~100MB
- **CPU使用**: < 5%

## 🗺️ 路线图

- [x] 核心MCP工具实现
- [x] OKX交易所支持
- [x] 技术指标计算
- [x] 风险管理系统
- [ ] PostgreSQL持久化
- [ ] WebSocket实时推送
- [ ] Binance交易所支持
- [ ] 回测功能
- [ ] Web管理界面

## ❓ 常见问题

### Q: 如何切换到真实盘？

A: 设置 `OKX_USE_SANDBOX="false"`，但请确保充分测试后再使用真实资金。

### Q: 支持哪些交易所？

A: 当前支持OKX，基于CCXT架构可轻松扩展到Binance、Bybit等。

### Q: 如何计算合理的仓位大小？

A: 建议单笔风险不超过账户的2-5%，使用公式：
```
仓位大小 = (账户价值 × 风险百分比) / 止损百分比
```

### Q: 技术指标如何解读？

A: 详见 [API文档 - 技术指标说明](./docs/API.md#技术指标说明)

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

## 🙏 致谢

- [NOF1 Alpha Arena](https://nof1.ai/) - 项目设计灵感
- [CCXT](https://github.com/ccxt/ccxt) - 统一交易所API
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Model Context Protocol

## 📞 联系方式

- 📧 Email: support@example.com
- 💬 Discord: [加入我们](https://discord.gg/example)
- 🐦 Twitter: [@example](https://twitter.com/example)

---

**⚠️ 风险提示**: 加密货币交易有高风险，请谨慎投资，本项目仅供学习研究使用。

**Built with ❤️ based on NOF1 Alpha Arena design**
