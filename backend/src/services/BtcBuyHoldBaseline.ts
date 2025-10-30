/**
 * BTC Buy&Hold 基准策略服务
 * 用于计算和跟踪 BTC Buy&Hold 策略的表现
 */

import * as db from '../database/db.js';
import { ExchangeClient } from './ExchangeClient.js';

export class BtcBuyHoldBaseline {
  private exchangeClient: ExchangeClient;
  private initialBalance: number;
  private initialBtcQuantity: number | null = null;
  private modelId = 'btc-buy-hold';

  constructor(initialBalance: number = 10000) {
    this.initialBalance = initialBalance;
    
    // 初始化交易所客户端（用于获取 BTC 价格）
    this.exchangeClient = new ExchangeClient({
      exchange: 'okx',
      apiKey: process.env.OKX_API_KEY || '',
      apiSecret: process.env.OKX_API_SECRET || '',
      password: process.env.OKX_API_PASSWORD || '',
      useSandbox: process.env.OKX_USE_SANDBOX === 'true',
    });

    console.log(`[BtcBuyHold] Initialized with initial balance: $${initialBalance}`);
  }

  /**
   * 初始化基准数据
   */
  async initialize(): Promise<void> {
    try {
      // 获取当前 BTC 价格
      const btcPrice = await this.getBtcPrice();
      
      // 获取或初始化 BTC 数量
      this.initialBtcQuantity = await db.getOrInitBtcBuyHoldBaseline(
        this.initialBalance,
        btcPrice
      );

      console.log(`[BtcBuyHold] Initial BTC quantity: ${this.initialBtcQuantity.toFixed(8)} BTC`);
      console.log(`[BtcBuyHold] Initial BTC price: $${btcPrice.toFixed(2)}`);
    } catch (error) {
      console.error('[BtcBuyHold] Error initializing baseline:', error);
      throw error;
    }
  }

  /**
   * 获取当前 BTC 价格
   */
  private async getBtcPrice(): Promise<number> {
    try {
      const ticker = await this.exchangeClient.getExchange().fetchTicker('BTC/USDT');
      return ticker.last || ticker.close || 0;
    } catch (error) {
      console.error('[BtcBuyHold] Error fetching BTC price:', error);
      throw error;
    }
  }

  /**
   * 收集快照数据
   */
  async collectSnapshot(): Promise<void> {
    try {
      if (this.initialBtcQuantity === null) {
        await this.initialize();
      }

      // 获取当前 BTC 价格
      const currentBtcPrice = await this.getBtcPrice();
      
      // 计算当前账户价值
      const currentValue = this.initialBtcQuantity! * currentBtcPrice;
      
      // 计算未实现盈亏
      const unrealizedPnl = currentValue - this.initialBalance;
      
      const timestamp = Math.floor(Date.now() / 1000);

      // 保存账户快照
      const snapshotId = await db.saveAccountSnapshot({
        model_id: this.modelId,
        timestamp,
        dollar_equity: currentValue,
        total_unrealized_pnl: unrealizedPnl,
        available_cash: 0, // Buy&Hold 策略没有可用现金
      });

      // 保存 BTC 持仓信息
      await db.savePosition({
        model_id: this.modelId,
        symbol: 'BTC',
        side: 'long',
        snapshot_id: snapshotId,
        entry_price: this.initialBalance / this.initialBtcQuantity!,
        current_price: currentBtcPrice,
        quantity: this.initialBtcQuantity!,
        leverage: 1,
        unrealized_pnl: unrealizedPnl,
        notional_usd: currentValue,
        timestamp,
      });

      console.log(`[BtcBuyHold] Snapshot saved: $${currentValue.toFixed(2)} (PnL: ${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)})`);
    } catch (error) {
      console.error('[BtcBuyHold] Error collecting snapshot:', error);
    }
  }

  /**
   * 获取当前状态
   */
  async getCurrentState(): Promise<{
    initialBalance: number;
    initialBtcQuantity: number;
    currentBtcPrice: number;
    currentValue: number;
    unrealizedPnl: number;
    returnPct: number;
  }> {
    if (this.initialBtcQuantity === null) {
      await this.initialize();
    }

    const currentBtcPrice = await this.getBtcPrice();
    const currentValue = this.initialBtcQuantity! * currentBtcPrice;
    const unrealizedPnl = currentValue - this.initialBalance;
    const returnPct = (unrealizedPnl / this.initialBalance) * 100;

    return {
      initialBalance: this.initialBalance,
      initialBtcQuantity: this.initialBtcQuantity!,
      currentBtcPrice,
      currentValue,
      unrealizedPnl,
      returnPct,
    };
  }
}
