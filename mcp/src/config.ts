/**
 * Configuration Management
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');
dotenv.config({ path: envPath });

export const config = {
  // Exchange Configuration
  exchange: (process.env.EXCHANGE || 'okx') as 'okx' | 'binance',
  
  // Trading Mode Configuration
  tradingMode: (process.env.TRADING_MODE || 'futures') as 'futures' | 'spot',
  
  // OKX Configuration
  okx: {
    apiKey: process.env.OKX_API_KEY || '',
    apiSecret: process.env.OKX_API_SECRET || '',
    password: process.env.OKX_API_PASSWORD || '',
    useSandbox: process.env.OKX_USE_SANDBOX === 'true',
  },
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Initial Balance (for PnL calculation)
  initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
  
  // Risk Management
  riskManagement: {
    maxLeverage: 40,                // 最大杠杆40倍（原25倍）
    maxPositionSizePercent: 0.8,    // 单仓位最大80%账户（原50%）
    maxTotalExposurePercent: 3.0,   // 总敞口最大300%账户（原90%）
    minCashReservePercent: 0.02,    // 最低保留2%现金（原5%）
  },
  
  // Supported Coins
  supportedCoins: ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP'],
  
  // Technical Indicators
  indicators: {
    ema20Period: 20,
    ema50Period: 50,
    rsi7Period: 7,
    rsi14Period: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
  },
};

// Validation
const isInspectorMode = process.env.MCP_INSPECTOR === 'true';

if (!isInspectorMode) {
  if (!config.okx.apiKey || !config.okx.apiSecret) {
    console.warn('[WARN] OKX API credentials not configured');
  }

  if (config.okx.useSandbox) {
    console.log('[INFO] Running in SANDBOX mode (demo trading)');
  } else {
    console.log('[WARN] Running in LIVE mode (real trading)');
  }
}

export default config;
