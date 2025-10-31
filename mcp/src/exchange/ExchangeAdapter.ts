/**
 * CCXT Exchange Adapter
 * Supports OKX (and easily extensible to other exchanges)
 */

import ccxt, { Exchange, OHLCV, Balances, Position as CCXTPosition, Order } from 'ccxt';
import { ExchangeConfig, Position } from '../types.js';

export class ExchangeAdapter {
  private exchange: Exchange;
  private config: ExchangeConfig;

  constructor(config: ExchangeConfig) {
    this.config = config;
    
    // Initialize exchange based on config
    const ExchangeClass = ccxt[config.exchange] as typeof ccxt.Exchange;
    
    this.exchange = new ExchangeClass({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      password: config.password,
      enableRateLimit: true,
      options: {
        defaultType: 'swap', // Perpetual contracts
      },
    });

    // Set sandbox mode if configured
    if (config.useSandbox) {
      this.exchange.setSandboxMode(true);
    }
  }

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.exchange.fetchTicker(this.formatSymbol(symbol));
      return ticker.last || ticker.close || 0;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get OHLCV data (with retry)
   */
  async getOHLCV(
    symbol: string,
    timeframe: string = '3m',
    limit: number = 100
  ): Promise<OHLCV[]> {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const ohlcv = await this.exchange.fetchOHLCV(
          this.formatSymbol(symbol),
          timeframe,
          undefined,
          limit
        );
        return ohlcv;
      } catch (error) {
        lastError = error;
        console.warn(`[WARN] Error fetching OHLCV for ${symbol} (attempt ${i + 1}/${maxRetries}):`, error instanceof Error ? error.message : error);
        
        if (i < maxRetries - 1) {
          const waitMs = Math.pow(2, i) * 1000;
          console.log(`[INFO] Retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }

    console.error(`[ERROR] Failed to fetch OHLCV for ${symbol} after ${maxRetries} attempts`);
    throw lastError;
  }

  /**
   * Get account balance (with retry)
   */
  async getBalance(): Promise<Balances> {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const balance = await this.exchange.fetchBalance();
        return balance;
      } catch (error) {
        lastError = error;
        console.warn(`[WARN] Error fetching balance (attempt ${i + 1}/${maxRetries}):`, error instanceof Error ? error.message : error);
        
        if (i < maxRetries - 1) {
          // 等待后重试（指数退避）
          const waitMs = Math.pow(2, i) * 1000;
          console.log(`[INFO] Retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }

    console.error('[ERROR] Failed to fetch balance after', maxRetries, 'attempts');
    throw lastError;
  }

  /**
   * Get open positions
   */
  async getPositions(): Promise<CCXTPosition[]> {
    try {
      const positions = await this.exchange.fetchPositions();
      return positions.filter(p => parseFloat(String(p.contracts || '0')) > 0);
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw error;
    }
  }

  /**
   * Set leverage for a symbol
   */
  async setLeverage(symbol: string, leverage: number, marginMode: 'isolated' | 'cross' = 'isolated', posSide?: 'long' | 'short'): Promise<void> {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      // console.log(`[DEBUG] Setting leverage for ${symbol} (${formattedSymbol}) to ${leverage}x in ${marginMode} mode for ${posSide || 'both sides'}...`);
      
      // 先取消该币种的所有挂单，避免OKX的59668错误
      try {
        // console.log(`[DEBUG] Cancelling all pending orders for ${symbol}...`);
        await this.exchange.cancelAllOrders(formattedSymbol);
        // console.log(`[DEBUG] All pending orders cancelled for ${symbol}`);
      } catch (cancelError) {
        // 如果没有挂单，会报错，但可以忽略
        // console.log(`[DEBUG] No pending orders to cancel for ${symbol} (or cancel failed):`, cancelError instanceof Error ? cancelError.message : cancelError);
      }
      
      // OKX requires mgnMode and posSide parameters
      // If posSide is not specified, set for both long and short
      const sidesToSet = posSide ? [posSide] : ['long', 'short'];
      
      for (const side of sidesToSet) {
        const params = {
          mgnMode: marginMode,
          posSide: side,
        };
        
        // console.log(`[DEBUG] Setting ${side} leverage...`);
      
        const result = await this.exchange.setLeverage(leverage, formattedSymbol, params);
        
        // console.log(`[DEBUG] setLeverage API response for ${side}:`, JSON.stringify(result, null, 2));
      }
      
      console.log(`[SUCCESS] Leverage set to ${leverage}x for ${symbol} (${marginMode}) for ${sidesToSet.join(' and ')}`);
    } catch (error) {
      console.error(`[ERROR] Failed to set leverage for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get current leverage for a symbol
   */
  async getLeverage(symbol: string): Promise<any> {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      // console.log(`[DEBUG] Getting leverage info for ${symbol} (${formattedSymbol})...`);
      
      // OKX API: GET /api/v5/account/leverage-info
      // Use fetchLeverage instead of fetchLeverageTiers
      const result = await this.exchange.fetchLeverage(formattedSymbol);
      
      // console.log(`[DEBUG] getLeverage API response:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`[ERROR] Failed to get leverage for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Open long position
   */
  async openLong(symbol: string, quantity: number, leverage: number, marginAmount?: number): Promise<Order> {
    console.log(`\n[EXCHANGE] openLong() called:`);
    console.log(`  - symbol: ${symbol}`);
    console.log(`  - quantity: ${quantity}`);
    console.log(`  - leverage: ${leverage}`);
    console.log(`  - marginAmount: ${marginAmount}`);
    
    try {
      // Step 1: Set leverage for long position
      // console.log(`[EXCHANGE] Step 1: Setting leverage to ${leverage}x for long position...`);
      await this.setLeverage(symbol, leverage, 'isolated', 'long');
      
      const formattedSymbol = this.formatSymbol(symbol);
      const params: any = {
        posSide: 'long',
        tdMode: 'isolated', // 使用逐仓模式
      };
      
      console.log(`[EXCHANGE] Order parameters:`);
      console.log(`  - formattedSymbol: ${formattedSymbol}`);
      console.log(`  - posSide: long`);
      console.log(`  - tdMode: isolated`);
      
      // 如果指定了保证金金额，计算正确的数量
      if (marginAmount) {
        const currentPrice = await this.getPrice(symbol);
        const targetNotional = marginAmount * leverage;
        const calculatedQuantity = targetNotional / currentPrice;
        
        console.log(`[EXCHANGE] Recalculating quantity based on margin:`);
        console.log(`  - Current price: $${currentPrice}`);
        console.log(`  - Margin: $${marginAmount}`);
        console.log(`  - Leverage: ${leverage}x`);
        console.log(`  - Target notional: $${targetNotional.toFixed(2)}`);
        console.log(`  - Calculated quantity: ${calculatedQuantity.toFixed(6)} ${symbol}`);
        
        quantity = calculatedQuantity;
      }
      
      console.log(`[EXCHANGE] Step 2: Creating market buy order...`);
      console.log(`  - Symbol: ${formattedSymbol}`);
      console.log(`  - Quantity: ${quantity}`);
      console.log(`  - Params:`, params);
      
      const order = await this.exchange.createMarketBuyOrder(formattedSymbol, quantity, params);
      
      console.log(`[EXCHANGE] Order created successfully:`);
      console.log(`  - Order ID: ${order.id}`);
      console.log(`  - Status: ${order.status}`);
      
      return order;
    } catch (error) {
      console.error(`Error opening long position for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Open short position
   */
  async openShort(symbol: string, quantity: number, leverage: number, marginAmount?: number): Promise<Order> {
    console.log(`\n[EXCHANGE] openShort() called:`);
    console.log(`  - symbol: ${symbol}`);
    console.log(`  - quantity: ${quantity}`);
    console.log(`  - leverage: ${leverage}`);
    console.log(`  - marginAmount: ${marginAmount}`);
    
    try {
      // Step 1: Set leverage for short position
      // console.log(`[EXCHANGE] Step 1: Setting leverage to ${leverage}x for short position...`);
      await this.setLeverage(symbol, leverage, 'isolated', 'short');
      
      const formattedSymbol = this.formatSymbol(symbol);
      const params: any = {
        posSide: 'short',
        tdMode: 'isolated', // 使用逐仓模式
      };
      
      // 如果指定了保证金金额，计算正确的数量
      if (marginAmount) {
        const currentPrice = await this.getPrice(symbol);
        const targetNotional = marginAmount * leverage;
        const calculatedQuantity = targetNotional / currentPrice;
        
        // console.error(`[INFO] Using isolated margin mode:`);
        // console.error(`  Margin: $${marginAmount}, Leverage: ${leverage}x`);
        // console.error(`  Target notional: $${targetNotional.toFixed(2)}`);
        // console.error(`  Calculated quantity: ${calculatedQuantity.toFixed(6)} ${symbol}`);
        
        quantity = calculatedQuantity;
      }
      
      const order = await this.exchange.createMarketSellOrder(formattedSymbol, quantity, params);
      return order;
    } catch (error) {
      console.error(`Error opening short position for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Create market buy order (for spot trading)
   */
  async createMarketBuyOrder(symbol: string, quantity: number): Promise<Order> {
    console.log(`[EXCHANGE] Creating market buy order: ${symbol}, quantity: ${quantity}`);
    const order = await this.exchange.createMarketBuyOrder(symbol, quantity);
    return order;
  }

  /**
   * Create market sell order (for spot trading)
   */
  async createMarketSellOrder(symbol: string, quantity: number): Promise<Order> {
    console.log(`[EXCHANGE] Creating market sell order: ${symbol}, quantity: ${quantity}`);
    const order = await this.exchange.createMarketSellOrder(symbol, quantity);
    return order;
  }

  /**
   * Partially close long position
   */
  async closeLongPartial(symbol: string, quantity: number): Promise<Order> {
    const formattedSymbol = this.formatSymbol(symbol);
    const params: any = {
      posSide: 'long',
      tdMode: 'isolated',
    };
    
    console.log(`[EXCHANGE] Partially closing long position: ${symbol}, quantity: ${quantity}`);
    const order = await this.exchange.createMarketSellOrder(formattedSymbol, quantity, params);
    return order;
  }

  /**
   * Partially close short position
   */
  async closeShortPartial(symbol: string, quantity: number): Promise<Order> {
    const formattedSymbol = this.formatSymbol(symbol);
    const params: any = {
      posSide: 'short',
      tdMode: 'isolated',
    };
    
    console.log(`[EXCHANGE] Partially closing short position: ${symbol}, quantity: ${quantity}`);
    const order = await this.exchange.createMarketBuyOrder(formattedSymbol, quantity, params);
    return order;
  }

  /**
   * Close a position
   */
  async closePosition(symbol: string, side: 'long' | 'short'): Promise<Order> {
    try {
      // OKX API需要原生格式：BTC-USDT-SWAP，不是ccxt格式BTC/USDT:USDT
      const okxInstId = `${symbol}-USDT-SWAP`;
      
      console.log(`[EXCHANGE] Closing ${side} position for ${symbol}...`);
      console.log(`[EXCHANGE] OKX instId: ${okxInstId}`);
      
      // 使用OKX专用的市价仓位全平API
      // https://www.okx.com/docs-v5/zh/#order-book-trading-trade-post-close-position
      const params: any = {
        instId: okxInstId,  // 使用OKX原生格式
        mgnMode: 'isolated',  // 保证金模式
        posSide: side,  // 仓位方向
      };
      
      console.log(`[EXCHANGE] Calling OKX closePosition API with params:`, params);
      
      // ccxt的closePosition方法会调用OKX的 /api/v5/trade/close-position
      const result = await (this.exchange as any).privatePostTradeClosePosition(params);
      
      console.log(`[EXCHANGE] Close position result:`, JSON.stringify(result, null, 2));
      
      // 将OKX的响应转换为ccxt Order格式
      const order: any = {
        id: result.data?.[0]?.clOrdId || '',
        symbol: `${symbol}/USDT:USDT`,  // ccxt格式
        type: 'market',
        side: side === 'long' ? 'sell' : 'buy',
        amount: 0,
        price: 0,
        status: 'closed',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        info: result,
      };
      
      return order;
    } catch (error) {
      console.error(`Error closing position for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Set stop loss order (止损单)
   */
  async setStopLoss(
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    stopPrice: number
  ): Promise<Order> {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      
      // 止损单：多头用止损卖出，空头用止损买入
      const orderSide = side === 'long' ? 'sell' : 'buy';
      
      const params: any = {
        stopLossPrice: stopPrice,
        posSide: side,
        tdMode: 'isolated',  // 必须指定逐仓模式，与仓位保持一致
        reduceOnly: true,
      };
      
      const order = await this.exchange.createOrder(
        formattedSymbol,
        'market',
        orderSide,
        quantity,
        undefined,
        params
      );
      
      // console.error(`[INFO] Stop loss order set for ${symbol} at $${stopPrice}`);
      return order;
    } catch (error) {
      console.error(`Error setting stop loss for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Set take profit order (止盈单)
   */
  async setTakeProfit(
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    profitPrice: number
  ): Promise<Order> {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      
      // 止盈单：多头用限价卖出，空头用限价买入
      const orderSide = side === 'long' ? 'sell' : 'buy';
      
      const params: any = {
        takeProfitPrice: profitPrice,
        posSide: side,
        tdMode: 'isolated',  // 必须指定逐仓模式，与仓位保持一致
        reduceOnly: true,
      };
      
      const order = await this.exchange.createOrder(
        formattedSymbol,
        'market',
        orderSide,
        quantity,
        undefined,
        params
      );
      
      // console.error(`[INFO] Take profit order set for ${symbol} at $${profitPrice}`);
      return order;
    } catch (error) {
      console.error(`Error setting take profit for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Cancel order (取消订单)
   */
  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    try {
      await this.exchange.cancelOrder(orderId, this.formatSymbol(symbol));
      console.error(`[INFO] Order ${orderId} cancelled for ${symbol}`);
    } catch (error) {
      console.error(`Error cancelling order ${orderId} for ${symbol}:`, error);
      // 不抛出错误，因为订单可能已经执行了
    }
  }

  /**
   * Get funding rate
   */
  async getFundingRate(symbol: string): Promise<number> {
    try {
      const fundingRate = await this.exchange.fetchFundingRate(
        this.formatSymbol(symbol)
      );
      return fundingRate.fundingRate || 0;
    } catch (error) {
      console.error(`Error fetching funding rate for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get open interest (total outstanding contracts in the market)
   * 使用 fetch 直接调用 OKX REST API，完全绕过 ccxt
   * OKX API: https://www.okx.com/docs-v5/zh/#public-data-rest-api-get-open-interest
   */
  async getOpenInterest(symbol: string): Promise<number> {
    try {
      const instId = `${symbol}-USDT-SWAP`;
      // 根据沙盒模式选择 URL
      const baseUrl = this.config.useSandbox 
        ? 'https://www.okx.com'  // 沙盒也使用正式环境的公共数据
        : 'https://www.okx.com';
      const url = `${baseUrl}/api/v5/public/open-interest?instId=${instId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data: any = await response.json();
      
      if (data.code === '0' && data.data && data.data.length > 0) {
        // oiCcy 字段是持仓量（币的数量）
        const oiCcy = parseFloat(data.data[0].oiCcy || '0');
        const oiUsd = parseFloat(data.data[0].oiUsd || '0');
        
        console.log(`[ExchangeAdapter] ${symbol} Open Interest: ${oiCcy.toFixed(2)} ${symbol} ($${(oiUsd / 1e9).toFixed(2)}B)`);
        
        return oiCcy;
      }
      
      return 0;
    } catch (error) {
      console.warn(`Could not fetch open interest for ${symbol}:`, error);
      return 0;
    }
  }

  /**
   * Format symbol for exchange (e.g., BTC -> BTC/USDT:USDT for perpetuals)
   */
  private formatSymbol(coin: string): string {
    // For perpetual contracts on most exchanges
    return `${coin}/USDT:USDT`;
  }

  /**
   * Get exchange instance (for advanced usage)
   */
  getExchange(): Exchange {
    return this.exchange;
  }

  /**
   * Get open orders (委托订单)
   */
  async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      const formattedSymbol = symbol ? this.formatSymbol(symbol) : undefined;
      const orders = await this.exchange.fetchOpenOrders(formattedSymbol);
      return orders;
    } catch (error) {
      console.error(`Error fetching open orders:`, error);
      throw error;
    }
  }

  /**
   * Check if exchange is in sandbox mode
   */
  isSandbox(): boolean {
    return this.config.useSandbox;
  }
}
