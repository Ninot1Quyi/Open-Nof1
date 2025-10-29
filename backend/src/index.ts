/**
 * AI Trading Backend Server
 * 提供API端点并运行数据收集服务
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { DataCollector } from './services/DataCollector.js';
import accountHistoryRouter from './routes/accountHistory.js';
import accountTotalsRouter from './routes/accountTotals.js';
import tradesRouter from './routes/trades.js';
import conversationsRouter from './routes/conversations.js';
import cryptoPricesRouter from './routes/cryptoPrices.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API路由
app.use('/api', accountHistoryRouter);
app.use('/api', accountTotalsRouter);
app.use('/api', tradesRouter);
app.use('/api', conversationsRouter);
app.use('/api', cryptoPricesRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dataCollector: dataCollector.isServiceRunning()
  });
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: 'AI Trading Backend',
    version: '1.0.0',
    endpoints: [
      'GET /api/account-history',
      'GET /api/account-totals',
      'GET /api/trades',
      'GET /api/conversations',
      'GET /api/crypto-prices',
      'GET /health'
    ]
  });
});

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 初始化数据收集服务
const dataCollector = new DataCollector();

// 启动服务器
async function startServer() {
  try {
    // 启动数据收集服务
    console.log('[Server] Starting data collector...');
    await dataCollector.start(15000); // 15秒快照

    // 启动HTTP服务器
    app.listen(PORT, () => {
      console.log(`[Server] ✓ Backend server running on http://localhost:${PORT}`);
      console.log(`[Server] ✓ Data collector running (snapshot: 15s, price: 3s)`);
      console.log(`[Server] ✓ API endpoints available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  dataCollector.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  dataCollector.stop();
  process.exit(0);
});

// 启动
startServer();
