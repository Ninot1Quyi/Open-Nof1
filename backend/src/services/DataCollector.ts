/**
 * 数据收集服务
 * 每15秒从交易所获取账户信息并保存到数据库
 */

import { ExchangeClient, ExchangeConfig } from './ExchangeClient.js';
import { BtcBuyHoldBaseline } from './BtcBuyHoldBaseline.js';
import * as db from '../database/db.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 项目根目录
const projectRoot = path.join(__dirname, '..', '..', '..');

// MCP 数据库连接池（用于同步已完成交易）
// 注意：MCP 和后端使用同一个数据库 nof1
const mcpPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'nof1',
  user: process.env.DB_USER || 'OpenNof1',
  password: process.env.DB_PASSWORD || '',
});

// 支持的模型列表（将在运行时从 profiles 目录动态读取）
// 只收集有配置文件的模型

interface AgentConfig {
  modelId: string;
  exchange: string;
  apiKey: string;
  apiSecret: string;
  password?: string;
  useSandbox: boolean;
}

export class DataCollector {
  private exchangeClients: Map<string, ExchangeClient> = new Map();
  private btcBuyHoldBaseline: BtcBuyHoldBaseline | null = null;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastBtcSnapshotTime: number = 0; // 上次 BTC Buy&Hold 快照时间

  /**
   * 启动数据收集服务
   */
  async start(snapshotIntervalMs: number = 3000): Promise<void> {
    console.log('[DataCollector] Starting data collection service...');

    // 测试数据库连接
    const dbOk = await db.testConnection();
    if (!dbOk) {
      throw new Error('Database connection failed');
    }

    // 初始化交易所客户端
    await this.initializeExchangeClients();

    // 初始化 BTC Buy&Hold 基准策略
    const initialBalance = parseFloat(process.env.INITIAL_BALANCE || '10000');
    this.btcBuyHoldBaseline = new BtcBuyHoldBaseline(initialBalance);
    
    // 异步初始化，不阻塞启动
    this.btcBuyHoldBaseline.initialize()
      .then(() => {
        console.log('[DataCollector] ✓ BTC Buy&Hold baseline initialized');
      })
      .catch((error) => {
        console.error('[DataCollector] ⚠ BTC Buy&Hold initialization failed, will retry later:', error.message);
      });

    this.isRunning = true;

    // 立即执行一次
    await this.collectSnapshots();

    // 定时执行
    this.snapshotInterval = setInterval(() => {
      this.collectSnapshots();
    }, snapshotIntervalMs);

    console.log(`[DataCollector] ✓ Started (snapshot interval: ${snapshotIntervalMs}ms)`);
  }

  /**
   * 停止数据收集
   */
  stop(): void {
    console.log('[DataCollector] Stopping data collection service...');

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    this.exchangeClients.clear();
    this.isRunning = false;
    console.log('[DataCollector] ✓ Stopped');
  }

  /**
   * 初始化交易所客户端
   */
  private async initializeExchangeClients(): Promise<void> {
    console.log('[DataCollector] Initializing exchange clients...');

    // 从全局 .env 读取 ENABLED_AGENTS
    const enabledAgentsStr = process.env.ENABLED_AGENTS || '';
    if (!enabledAgentsStr) {
      console.error('[DataCollector] No ENABLED_AGENTS configured in .env');
      return;
    }

    const enabledProfiles = enabledAgentsStr
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    console.log(`[DataCollector] Loading ${enabledProfiles.length} enabled agents...`);

    for (const profilePath of enabledProfiles) {
      const fullPath = path.join(projectRoot, profilePath);
      
      if (!fs.existsSync(fullPath)) {
        console.error(`[DataCollector] Profile not found: ${profilePath}`);
        continue;
      }
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // 解析配置
        const config: Record<string, string> = {};
        content.split('\n').forEach(line => {
          line = line.trim();
          if (line && !line.startsWith('#')) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
              const key = match[1].trim();
              let value = match[2].trim();
              value = value.replace(/^["']|["']$/g, '');
              config[key] = value;
            }
          }
        });

        // 检查是否有必需的配置
        if (!config.MODEL_ID) {
          console.log(`[DataCollector] Skipping ${profilePath}: no MODEL_ID`);
          continue;
        }

        // 如果 profile 中没有配置 OKX_API_KEY，使用全局环境变量
        const apiKey = config.OKX_API_KEY || process.env.OKX_API_KEY;
        const apiSecret = config.OKX_API_SECRET || process.env.OKX_API_SECRET;
        const apiPassword = config.OKX_API_PASSWORD || process.env.OKX_API_PASSWORD;
        const useSandbox = config.OKX_USE_SANDBOX === 'true' || process.env.OKX_USE_SANDBOX === 'true';

        if (!apiKey) {
          console.log(`[DataCollector] Skipping ${config.MODEL_ID}: no OKX_API_KEY in profile or global env`);
          continue;
        }

        const modelId = config.MODEL_ID;
        const exchangeClient = new ExchangeClient({
          exchange: config.EXCHANGE || process.env.EXCHANGE || 'okx',
          apiKey: apiKey,
          apiSecret: apiSecret || '',
          password: apiPassword,
          useSandbox: useSandbox,
        });

        this.exchangeClients.set(modelId, exchangeClient);
        console.log(`[DataCollector] ✓ Initialized exchange client for ${modelId} (${profilePath})`);
      } catch (error) {
        console.error(`[DataCollector] Failed to initialize client from ${profilePath}:`, error);
      }
    }

    console.log(`[DataCollector] ✓ Initialized ${this.exchangeClients.size} exchange clients`);
  }


  /**
   * 收集账户快照和仓位数据
   */
  private async collectSnapshots(): Promise<void> {
    if (!this.isRunning) return;

    const timestamp = Math.floor(Date.now() / 1000);
    console.log(`[DataCollector] Collecting snapshots at ${new Date().toISOString()}`);

    for (const [modelId, exchangeClient] of this.exchangeClients.entries()) {
      try {
        // 获取账户状态
        const accountState = await exchangeClient.getAccountState();

        // 保存账户快照
        const snapshotId = await db.saveAccountSnapshot({
          model_id: modelId,
          timestamp,
          dollar_equity: accountState.accountValue,
          total_unrealized_pnl: accountState.totalUnrealizedPnl,
          available_cash: accountState.balance,
        });

        // 保存仓位信息
        for (const position of accountState.positions) {
          // 从 MCP 数据库获取 exit_plan（通过 symbol + side 查询）
          const exitPlanData = await this.getExitPlanFromMCP(modelId, position.symbol, position.side);
          
          await db.savePosition({
            model_id: modelId,
            symbol: position.symbol,
            side: position.side,
            snapshot_id: snapshotId,
            entry_price: position.entryPrice,
            current_price: position.currentPrice,
            quantity: position.quantity,  // 实际币数量
            leverage: position.leverage,
            unrealized_pnl: position.unrealizedPnl,
            confidence: exitPlanData?.confidence,
            risk_usd: exitPlanData?.risk_usd,
            notional_usd: Math.abs(position.quantity * position.currentPrice),  // notional 使用绝对值
            profit_target: exitPlanData?.profit_target,
            stop_loss: exitPlanData?.stop_loss,
            invalidation_condition: exitPlanData?.invalidation_condition,
            timestamp,
          });
        }

        console.log(`[DataCollector] ✓ Saved snapshot for ${modelId}: $${accountState.accountValue.toFixed(2)} (${accountState.positions.length} positions)`);
      } catch (error) {
        console.error(`[DataCollector] Error collecting data for ${modelId}:`, error);
      }
    }

    // 收集 BTC Buy&Hold 基准数据（每小时保存一次，而不是每 3 秒）
    const BTC_SNAPSHOT_INTERVAL = 3; // 1 小时（秒）
    if (this.btcBuyHoldBaseline && (timestamp - this.lastBtcSnapshotTime >= BTC_SNAPSHOT_INTERVAL)) {
      try {
        await this.btcBuyHoldBaseline.collectSnapshot(timestamp);
        this.lastBtcSnapshotTime = timestamp;
        console.log('[DataCollector] ✓ BTC Buy&Hold snapshot saved (next in 1 hour)');
      } catch (error) {
        console.error('[DataCollector] Error collecting BTC Buy&Hold snapshot:', error);
      }
    }

    console.log('[DataCollector] DEBUG: Finished collecting snapshots, now syncing trades...');
    // 同步已完成的交易（从交易所 API 获取）
    try {
      await this.syncCompletedTrades();
    } catch (error) {
      console.error('[DataCollector] Error in syncCompletedTrades:', error);
    }
    console.log('[DataCollector] DEBUG: Finished syncing trades');
  }

  /**
   * 从交易所 API 同步已完成的交易（历史仓位）
   * 使用 getClosedPositions() 获取完整的仓位信息，包括正确的杠杆倍数
   */
  private async syncCompletedTrades(): Promise<void> {
    try {
      console.log('[DataCollector] Starting to sync completed trades from exchange...');
      // 遍历所有 Agent 的交易所客户端
      for (const [modelId, exchangeClient] of this.exchangeClients.entries()) {
        try {
          // 使用 getClosedPositions() 获取历史仓位（包含完整信息）
          const closedPositions = await exchangeClient.getClosedPositions(100);
          console.log(`[DataCollector] Fetched ${closedPositions.length} closed positions for ${modelId}`);
          
          let syncedCount = 0;
          for (const position of closedPositions) {
            try {
              // 生成唯一 ID（使用 symbol + exitTime）
              const tradeId = `${modelId}_${position.symbol}_${position.exitTime}`;
              
              await db.saveCompletedTrade({
                id: tradeId,
                model_id: modelId,
                symbol: position.symbol,
                side: position.side,
                quantity: position.contracts, // 实际币数量
                entry_price: position.entryPrice,
                exit_price: position.exitPrice,
                leverage: position.leverage, // ✅ 使用真实的杠杆倍数
                realized_net_pnl: position.realizedPnl,
                entry_time: Math.floor(position.entryTime / 1000), // 转换为秒
                exit_time: Math.floor(position.exitTime / 1000), // 转换为秒
                entry_human_time: new Date(position.entryTime),
                exit_human_time: new Date(position.exitTime),
              });
              
              syncedCount++;
            } catch (error: any) {
              // 忽略重复键错误（23505 = unique_violation）
              if (error.code !== '23505') {
                console.error(`[DataCollector] Error saving position ${position.symbol}:`, error);
              }
            }
          }
          
          if (syncedCount > 0) {
            console.log(`[DataCollector] ✓ Synced ${syncedCount} completed positions for ${modelId}`);
          }
        } catch (error) {
          console.error(`[DataCollector] Error fetching positions for ${modelId}:`, error);
        }
      }
    } catch (error) {
      console.error('[DataCollector] Error syncing completed trades:', error);
    }
  }

  /**
   * 从 MCP 数据库获取 exit_plan（通过 symbol + side 查询）
   */
  private async getExitPlanFromMCP(modelId: string, symbol: string, side: 'long' | 'short'): Promise<{
    confidence?: number;
    risk_usd?: number;
    profit_target?: number;
    stop_loss?: number;
    invalidation_condition?: string;
  } | null> {
    try {
      const client = await mcpPool.connect();
      try {
        // 将 modelId 转换为安全的表名
        const safeName = modelId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const tableName = `mcp_trades_${safeName}`;
        
        // 检查表是否存在
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          )
        `, [tableName]);
        
        if (!tableExists.rows[0].exists) {
          return null;
        }
        
        // 查询该币种的 exit_plan（通过 symbol + side 匹配）
        const result = await client.query(`
          SELECT exit_plan, confidence
          FROM ${tableName}
          WHERE coin = $1 AND side = $2
          LIMIT 1
        `, [symbol, side]);
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const row = result.rows[0];
        const exitPlan = row.exit_plan;
        
        if (!exitPlan) {
          return {
            confidence: row.confidence ? parseFloat(row.confidence) : undefined,
          };
        }
        
        return {
          confidence: row.confidence ? parseFloat(row.confidence) : undefined,
          risk_usd: exitPlan.risk_usd ? parseFloat(exitPlan.risk_usd) : undefined,
          profit_target: exitPlan.profit_target ? parseFloat(exitPlan.profit_target) : undefined,
          stop_loss: exitPlan.stop_loss ? parseFloat(exitPlan.stop_loss) : undefined,
          invalidation_condition: exitPlan.invalidation || exitPlan.invalidation_condition,
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[DataCollector] Error fetching exit plan from MCP for ${modelId}/${symbol}/${side}:`, error);
      return null;
    }
  }

  /**
   * 从 position_id 提取 model_id
   * 格式: deepseek-chat-v3.1_uuid 或 qwen3-max_uuid
   */
  private extractModelIdFromPositionId(positionId: string): string | null {
    // 尝试匹配已知的模型 ID
    const knownModels = Array.from(this.exchangeClients.keys());
    for (const modelId of knownModels) {
      if (positionId.startsWith(modelId + '_')) {
        return modelId;
      }
    }
    return null;
  }

  /**
   * 获取运行状态
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
