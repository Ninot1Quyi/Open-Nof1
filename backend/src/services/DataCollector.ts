/**
 * 数据收集服务
 * 每15秒从交易所获取账户信息并保存到数据库
 */

import { ExchangeClient, ExchangeConfig } from './ExchangeClient.js';
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
const mcpPool = new Pool({
  host: process.env.MCP_DB_HOST || 'localhost',
  port: parseInt(process.env.MCP_DB_PORT || '5432'),
  database: process.env.MCP_DB_NAME || 'nof1',
  user: process.env.MCP_DB_USER || 'OpenNof1',
  password: process.env.MCP_DB_PASSWORD || '',
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
  private snapshotInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * 启动数据收集服务
   */
  async start(snapshotIntervalMs: number = 15000): Promise<void> {
    console.log('[DataCollector] Starting data collection service...');

    // 测试数据库连接
    const dbOk = await db.testConnection();
    if (!dbOk) {
      throw new Error('Database connection failed');
    }

    // 初始化交易所客户端
    await this.initializeExchangeClients();

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
          await db.savePosition({
            model_id: modelId,
            symbol: position.symbol,
            snapshot_id: snapshotId,
            entry_price: position.entryPrice,
            current_price: position.currentPrice,
            quantity: position.contracts,
            leverage: position.leverage,
            unrealized_pnl: position.unrealizedPnl,
            confidence: undefined,
            risk_usd: undefined,
            notional_usd: position.contracts * position.currentPrice,
            profit_target: undefined,
            stop_loss: undefined,
            invalidation_condition: undefined,
            timestamp,
          });
        }

        console.log(`[DataCollector] ✓ Saved snapshot for ${modelId}: $${accountState.accountValue.toFixed(2)} (${accountState.positions.length} positions)`);
      } catch (error) {
        console.error(`[DataCollector] Error collecting data for ${modelId}:`, error);
      }
    }

    // 同步已完成的交易
    await this.syncCompletedTrades();
  }

  /**
   * 从 MCP 数据库同步已完成的交易
   */
  private async syncCompletedTrades(): Promise<void> {
    try {
      const client = await mcpPool.connect();
      try {
        // 查询所有已完成的交易
        const result = await client.query(`
          SELECT 
            position_id,
            coin,
            side,
            entry_price,
            quantity,
            leverage,
            entry_time,
            exit_time,
            exit_price,
            realized_pnl,
            fees
          FROM mcp_trades
          WHERE status = 'closed'
          AND exit_time IS NOT NULL
          ORDER BY exit_time DESC
        `);

        let syncedCount = 0;
        for (const trade of result.rows) {
          // MCP 数据库中没有 model_id 字段
          // 暂时将所有历史交易归属到第一个启用的 Agent
          const modelId = Array.from(this.exchangeClients.keys())[0];
          if (!modelId) {
            continue;
          }

          try {
            // 保存到数据库（如果已存在会被忽略，因为 id 是主键）
            await db.saveCompletedTrade({
              id: trade.position_id,
              model_id: modelId,
              symbol: trade.coin,
              side: trade.side,
              quantity: parseFloat(trade.quantity),
              entry_price: parseFloat(trade.entry_price),
              exit_price: parseFloat(trade.exit_price),
              leverage: trade.leverage,
              realized_net_pnl: parseFloat(trade.realized_pnl || '0'),
              entry_time: Math.floor(new Date(trade.entry_time).getTime() / 1000),
              exit_time: Math.floor(new Date(trade.exit_time).getTime() / 1000),
              entry_human_time: trade.entry_time,
              exit_human_time: trade.exit_time,
            });

            syncedCount++;
          } catch (error: any) {
            // 忽略重复键错误
            if (error.code !== '23505') {
              console.error(`[DataCollector] Error saving trade ${trade.position_id}:`, error);
            }
          }
        }

        if (syncedCount > 0) {
          console.log(`[DataCollector] ✓ Synced ${syncedCount} completed trades from MCP database`);
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[DataCollector] Error syncing completed trades:', error);
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
