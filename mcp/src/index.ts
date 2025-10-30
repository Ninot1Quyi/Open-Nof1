#!/usr/bin/env node

/**
 * NOF1 MCP Trading Server
 * Provides AI models with cryptocurrency trading capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ExchangeAdapter } from './exchange/ExchangeAdapter.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { MarketDataTool } from './tools/MarketDataTool.js';
import { AccountStateTool } from './tools/AccountStateTool.js';
import { TradeExecutionTool } from './tools/TradeExecutionTool.js';
import { UpdateExitPlanTool } from './tools/UpdateExitPlanTool.js';
import { PerformanceMetricsTool } from './tools/PerformanceMetricsTool.js';
import config from './config.js';
import { v4 as uuidv4 } from 'uuid';

// 从命令行参数获取 Agent 名称
console.error('[MCP] process.argv:', process.argv);
console.error('[MCP] process.argv[2]:', process.argv[2]);
console.error('[MCP] process.env.AGENT_NAME:', process.env.AGENT_NAME);
const agentName = process.argv[2] || process.env.AGENT_NAME || 'default';
const logPrefix = `[${agentName}][MCP]`;
console.log(`${logPrefix} Starting server for agent: ${agentName}`);

// Initialize components
const exchange = new ExchangeAdapter({
  exchange: config.exchange,
  apiKey: config.okx.apiKey,
  apiSecret: config.okx.apiSecret,
  password: config.okx.password,
  useSandbox: config.okx.useSandbox,
});

const db = new DatabaseManager(agentName);

// Initialize tools
const marketDataTool = new MarketDataTool(exchange);
const accountStateTool = new AccountStateTool(exchange, db, agentName);
const tradeExecutionTool = new TradeExecutionTool(exchange, db);
const updateExitPlanTool = new UpdateExitPlanTool(db);
const performanceMetricsTool = new PerformanceMetricsTool(db);

// Create MCP server
const server = new Server(
  {
    name: 'nof1-trading-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_market_data',
        description: 'Fetch real-time cryptocurrency market data including prices, technical indicators (EMA, MACD, RSI), funding rates, and open interest. Use this to analyze market conditions before making trading decisions. Supports multiple coins and customizable timeframes.',
        inputSchema: {
          type: 'object',
          properties: {
            coins: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of cryptocurrency symbols to fetch data for. Supported coins: BTC, ETH, SOL, BNB, DOGE, XRP. Example: ["BTC", "ETH"]',
            },
            timeframe: {
              type: 'string',
              description: 'Candlestick timeframe for technical analysis. Options: "1m", "3m", "5m", "15m", "1h", "4h", "1d". Default: "3m". Shorter timeframes for scalping, longer for swing trading.',
              default: '3m',
            },
            indicators: {
              type: 'array',
              items: { type: 'string' },
              description: 'Technical indicators to calculate. Available: "price" (current price), "ema20" (20-period EMA), "ema50" (50-period EMA), "macd" (MACD indicator), "rsi7" (7-period RSI), "rsi14" (14-period RSI). Returns both current values and historical series.',
              default: ['price', 'ema20', 'ema50', 'macd', 'rsi7', 'rsi14'],
            },
            include_funding: {
              type: 'boolean',
              description: 'Include perpetual contract funding rate. Positive rate means longs pay shorts, negative means shorts pay longs. Useful for identifying market sentiment.',
              default: true,
            },
            include_open_interest: {
              type: 'boolean',
              description: 'Include open interest (total outstanding contracts). Rising OI with rising price indicates strong trend, falling OI suggests weakening momentum.',
              default: true,
            },
          },
          required: ['coins'],
        },
      },
      {
        name: 'get_account_state',
        description: 'Retrieve complete account information including USDT balance, active positions with unrealized P&L, trading history, and performance metrics (Sharpe ratio, win rate). Use this before executing trades to check available capital and existing positions.',
        inputSchema: {
          type: 'object',
          properties: {
            include_positions: {
              type: 'boolean',
              description: 'Include detailed information about all active positions: entry price, current price, leverage, unrealized P&L, liquidation price, and exit plan.',
              default: true,
            },
            include_history: {
              type: 'boolean',
              description: 'Include historical trade records with timestamps, entry/exit prices, realized P&L, and fees paid.',
              default: true,
            },
            include_performance: {
              type: 'boolean',
              description: 'Include performance analytics: Sharpe ratio (risk-adjusted returns), win rate, average leverage used, and total fees paid.',
              default: true,
            },
          },
        },
      },
      {
        name: 'execute_trade',
        description: 'Execute trading operations: open long/short positions or close existing positions. IMPORTANT: All trades undergo automatic risk validation (max 25x leverage, max 50% position size, 90% total exposure limit). Opening positions REQUIRES an exit_plan with profit_target and stop_loss. Uses OKX perpetual contracts with USDT margin.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['open_long', 'open_short', 'close_position'],
              description: 'Trading action: "open_long" (buy/bullish), "open_short" (sell/bearish), "close_position" (exit existing position). For close_position, must provide position_id.',
            },
            coin: {
              type: 'string',
              description: 'Cryptocurrency symbol to trade. Supported: BTC, ETH, SOL, BNB, DOGE, XRP. Example: "BTC"',
            },
            leverage: {
              type: 'number',
              description: 'Leverage multiplier (1-25). Higher leverage = higher risk and reward. Example: 10x leverage with $100 margin = $1000 position size. Recommended: 3-10x for beginners, 10-25x for experienced traders.',
              default: 1,
            },
            margin_amount: {
              type: 'number',
              description: 'Margin amount in USDT to allocate for this position. Position size = margin_amount × leverage. Must not exceed 50% of account value. Example: $100 margin with 5x leverage = $500 position.',
            },
            position_id: {
              type: 'string',
              description: 'Unique position identifier returned when opening a position. Required only for close_position action. Get this from get_account_state or from the open trade response.',
            },
            exit_plan: {
              type: 'object',
              properties: {
                profit_target: { 
                  type: 'number',
                  description: 'Target price to take profit. For long: > entry price. For short: < entry price.'
                },
                stop_loss: { 
                  type: 'number',
                  description: 'Stop loss price to limit losses. For long: < entry price. For short: > entry price.'
                },
                invalidation: { 
                  type: 'string',
                  description: 'Condition that invalidates the trade thesis. Example: "If BTC closes below $100k on 1h candle"'
                },
              },
              description: 'REQUIRED for opening positions. Defines profit target, stop loss, and invalidation conditions. Example: {profit_target: 120000, stop_loss: 110000, invalidation: "Break below support"}',
            },
            confidence: {
              type: 'number',
              description: 'Your confidence level in this trade (0-100). Higher confidence can justify larger position sizes. Example: 80 = high confidence, 50 = medium, 30 = low confidence.',
            },
          },
          required: ['action', 'coin'],
        },
      },
      {
        name: 'update_exit_plan',
        description: 'Modify the exit plan (profit target, stop loss, invalidation) for an active position. Use this to implement trailing stops, adjust targets based on market conditions, or tighten risk management. Does not affect the position itself, only the exit parameters.',
        inputSchema: {
          type: 'object',
          properties: {
            position_id: {
              type: 'string',
              description: 'Unique identifier of the position to update. Get this from get_account_state or from the original trade execution response.',
            },
            new_profit_target: {
              type: 'number',
              description: 'Updated profit target price. Use this to raise targets when price moves favorably or lower them to secure profits earlier.',
            },
            new_stop_loss: {
              type: 'number',
              description: 'Updated stop loss price. Common use: move stop to breakeven after profit, or implement trailing stop by raising stop as price increases.',
            },
            new_invalidation: {
              type: 'string',
              description: 'Updated invalidation condition describing when the trade thesis no longer holds. Example: "If support at $110k breaks" or "If RSI drops below 30"',
            },
          },
          required: ['position_id'],
        },
      },
      {
        name: 'get_performance_metrics',
        description: 'Retrieve detailed trading performance analytics including Sharpe ratio (risk-adjusted returns), win rate, profit factor, average leverage, biggest win/loss, total fees, and time distribution (long/short/flat). Use this to evaluate strategy effectiveness and identify areas for improvement.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_market_data': {
        const result = await marketDataTool.execute(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_account_state': {
        const result = await accountStateTool.execute(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'execute_trade': {
        const result = await tradeExecutionTool.execute(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'update_exit_plan': {
        const result = await updateExitPlanTool.execute(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_performance_metrics': {
        const result = await performanceMetricsTool.execute();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            stack: error.stack,
          }),
        },
      ],
      isError: true,
    };
  }
});

/**
 * 同步交易所仓位到数据库
 */
async function syncPositionsFromExchange(
  exchange: ExchangeAdapter,
  db: DatabaseManager,
  agentName: string
): Promise<number> {
  const logPrefix = `[${agentName}][MCP]`;
  // 获取交易所的所有仓位
  const positions = await exchange.getPositions();
  
  // console.error(`[DEBUG] Found ${positions.length} positions from exchange`);
  // if (positions.length > 0) {
  //   console.error(`[DEBUG] First position:`, JSON.stringify(positions[0], null, 2));
  // }
  
  if (positions.length === 0) {
    return 0;
  }
  
  let syncedCount = 0;
  
  for (const pos of positions) {
    const contracts = parseFloat(String(pos.contracts || '0'));
    if (contracts === 0) continue;
    
    const coin = pos.symbol?.split('/')[0] || '';
    const entryPrice = parseFloat(String(pos.entryPrice || '0'));
    const leverage = parseFloat(String(pos.leverage || '1'));
    const side = pos.side === 'long' ? 'long' : 'short';
    
    // Convert contracts to actual quantity based on contract size
    const contractSize = parseFloat(String(pos.contractSize || '1'));
    const actualQuantity = contracts * contractSize;
    
    // 检查数据库中是否已有该币种的未平仓记录
    const existingTrades = await db.getAllTrades();
    const existingTrade = existingTrades.find(
      t => t.coin === coin && t.status === 'open'
    );
    
    if (existingTrade) {
      // console.error(`${logPrefix} Position for ${coin} already exists in database, skipping`);
      continue;
    }
    
    // 创建新的交易记录
    const positionId = uuidv4();
    const tradeRecord = {
      position_id: positionId,
      coin,
      side: side as 'long' | 'short',
      entry_price: entryPrice,
      quantity: actualQuantity,  // Use actual quantity instead of contracts
      leverage,
      entry_time: pos.timestamp ? new Date(pos.timestamp) : new Date(),
      margin: parseFloat(String(pos.initialMargin || '0')),
      fees: 0, // 无法获取历史手续费，设为0
      exit_plan: undefined,
      confidence: undefined,
      status: 'open' as const,
    };
    
    await db.saveTrade(tradeRecord);
    syncedCount++;
    // console.error(`${logPrefix} Synced ${side} position for ${coin}: ${actualQuantity} @ ${entryPrice}`);
  }
  
  return syncedCount;
}

// Start server
async function main() {
  // Only log when not using stdio (e.g., when running with inspector)
  const isInspectorMode = process.env.MCP_INSPECTOR === 'true';
  
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup info (only in non-inspector mode)
  if (!isInspectorMode) {
    // console.error(`${logPrefix} NOF1 MCP Trading Server starting...`);
    // console.error(`${logPrefix} Exchange: ${config.exchange.toUpperCase()}`);
    // console.error(`${logPrefix} Sandbox Mode: ${config.okx.useSandbox ? 'ON' : 'OFF'}`);
    
    // 获取真实账户余额并初始化
    try {
      const balance = await exchange.getBalance();
      const usdtBalance = balance.USDT?.total || 0;
      // console.error(`${logPrefix} Initial Account Balance: $${usdtBalance.toFixed(2)} USDT`);
    } catch (error) {
      console.error(`${logPrefix} Unable to fetch account balance:`, error instanceof Error ? error.message : error);
    }
    
    // 同步交易所仓位到数据库
    try {
      // console.error(`${logPrefix} Syncing positions from exchange...`);
      const syncedCount = await syncPositionsFromExchange(exchange, db, agentName);
      // console.error(`${logPrefix} Synced ${syncedCount} position(s) from exchange`);
    } catch (error) {
      console.error(`${logPrefix} Failed to sync positions:`, error instanceof Error ? error.message : error);
    }

    // 启动完成
  }

  if (!isInspectorMode) {
    // console.error(`${logPrefix} Server ready and listening for requests`);
  }
}

main().catch((error) => {
  console.error('[ERROR] Fatal error:', error);
  process.exit(1);
});
