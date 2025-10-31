/**
 * MCP Tool: execute_trade
 * Executes trades with risk management checks
 */

import { ExchangeAdapter } from '../exchange/ExchangeAdapter.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { TradeParams, TradeResponse, TradeRecord } from '../types.js';
import config from '../config.js';
import { v4 as uuidv4 } from 'uuid';

export class TradeExecutionTool {
  constructor(
    private exchange: ExchangeAdapter,
    private db: DatabaseManager
  ) {}

  async execute(params: TradeParams): Promise<TradeResponse> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[MCP-TOOL] TradeExecutionTool.execute() called`);
    console.log(`${'='.repeat(80)}`);
    
    const {
      action,
      coin,
      leverage = 1,
      margin_amount = 0,
      position_id,
      exit_plan,
      confidence,
      bypass_risk_check = false,
    } = params;

    console.log(`[MCP-TOOL] Received parameters:`);
    console.log(`  - action: ${action}`);
    console.log(`  - coin: ${coin}`);
    console.log(`  - leverage: ${leverage}`);
    console.log(`  - margin_amount: ${margin_amount}`);
    console.log(`  - exit_plan:`, exit_plan);
    console.log(`  - bypass_risk_check: ${bypass_risk_check}`);

    try {
      // Validate parameters (除非绕过风险检查)
      if (!bypass_risk_check) {
        const validation = await this.validateTrade(params);
        if (!validation.valid) {
          return {
            success: false,
            message: 'Trade validation failed',
            error: validation.errors.join('; '),
          };
        }
      } else {
        console.log('[WARN] Risk validation bypassed - AI has full control');
      }

      // Execute based on action
      // 支持新旧两种 action 名称
      if (action === 'buy' || action === 'buy_to_enter' || action === 'open_long') {
        // 买入：开多仓或加仓
        return await this.openPosition('open_long', coin, leverage, margin_amount, exit_plan, confidence);
      } else if (action === 'sell_to_enter' || action === 'open_short') {
        // 卖出开仓：开空仓
        return await this.openPosition('open_short', coin, leverage, margin_amount, exit_plan, confidence);
      } else if (action === 'sell' || action === 'close_position') {
        // 平仓
        return await this.closePosition(coin);
      } else if (action === 'reduce_position') {
        // 减仓
        return await this.reducePosition(coin, params.quantity, exit_plan);
      } else if (action === 'hold') {
        // 持有：不执行任何操作
        return {
          success: true,
          message: `Holding position for ${coin}`
        };
      } else {
        return {
          success: false,
          message: `Invalid action: ${action}`,
          error: 'Invalid action'
        };
      }
    } catch (error: any) {
      console.error('Trade execution error:', error);
      return {
        success: false,
        message: 'Trade execution failed',
        error: error.message,
      };
    }
  }

  private async openPosition(
    action: 'open_long' | 'open_short',
    coin: string,
    leverage: number,
    marginAmount: number,
    exitPlan: any,
    confidence?: number
  ): Promise<TradeResponse> {
    console.log(`\n[MCP-TOOL] openPosition() called:`);
    console.log(`  - action: ${action}`);
    console.log(`  - coin: ${coin}`);
    console.log(`  - leverage: ${leverage}`);
    console.log(`  - marginAmount: ${marginAmount}`);
    
    const side = action === 'open_long' ? 'long' : 'short';

    // ========== POSITION CHECK & ORDER CANCELLATION ==========
    // 检查是否已有该币种的仓位（允许加仓，但需要先取消现有委托）
    console.log(`[CHECK] Checking for existing ${coin} position...`);
    const existingTrades = await this.db.getOpenTrades();
    const existingPosition = existingTrades.find(t => t.coin === coin && t.side === side);
    
    // ⚠️ 重要：无论是否有现有仓位，都先取消该币种的所有止损止盈订单
    // 这样可以避免重复创建订单
    console.log(`[INFO] Cancelling all existing SL/TP orders for ${coin}...`);
    try {
      const openOrders = await this.exchange.getOpenOrders(coin);
      let cancelledCount = 0;
      for (const order of openOrders) {
        if (order.type === 'stop' || order.type === 'take_profit' || order.type === 'stop_market') {
          console.log(`[INFO] Cancelling order ${order.id} (${order.type})`);
          await this.exchange.cancelOrder(order.id, coin);
          cancelledCount++;
        }
      }
      if (cancelledCount > 0) {
        console.log(`[INFO] ✓ Cancelled ${cancelledCount} SL/TP orders for ${coin}`);
      } else {
        console.log(`[INFO] ✓ No existing SL/TP orders to cancel for ${coin}`);
      }
    } catch (error) {
      console.error(`[WARN] Failed to cancel some orders:`, error);
      // 继续执行，不阻止开仓
    }
    
    if (existingPosition) {
      console.log(`[INFO] Found existing ${side} position for ${coin}. Will ADD to position.`);
      
      // 检查杠杆是否一致
      if (existingPosition.leverage && existingPosition.leverage !== leverage) {
        console.warn(`[WARN] Leverage mismatch! Existing: ${existingPosition.leverage}x, Requested: ${leverage}x`);
        console.warn(`[WARN] Using existing leverage ${existingPosition.leverage}x to maintain consistency`);
        leverage = existingPosition.leverage;  // 强制使用现有杠杆
      }
    } else {
      console.log(`[CHECK] ✓ No existing ${side} position found for ${coin}. Opening new position.`);
    }
    // ========================================

    // Get current price to calculate quantity
    const currentPrice = await this.exchange.getPrice(coin);
    console.log(`[MCP-TOOL] Current ${coin} price: $${currentPrice}`);
    
    const totalNotionalValue = marginAmount * leverage;
    const totalQuantity = totalNotionalValue / currentPrice;
    
    console.log(`[MCP-TOOL] Position calculation:`);
    console.log(`  - Margin: $${marginAmount}`);
    console.log(`  - Leverage: ${leverage}x`);
    console.log(`  - Notional Value: $${totalNotionalValue}`);
    console.log(`  - Quantity: ${totalQuantity} ${coin}`);
    
    // 尝试执行订单，如果太大则自动拆分
    const order = await this.executeOrderWithSplit(
      side,
      coin,
      totalQuantity,
      leverage,
      marginAmount
    );

    // Calculate liquidation price (simplified)
    const liquidationPrice = side === 'long'
      ? currentPrice * (1 - 1 / leverage * 0.9)
      : currentPrice * (1 + 1 / leverage * 0.9);

    // 计算手续费
    const totalFees = parseFloat(String(order.fee?.cost || '0'));

    // 设置止损/止盈订单
    let stopLossOrderId: string | undefined;
    let takeProfitOrderId: string | undefined;
    let slTpWarning: string | undefined;

    try {
      // 如果有止损价格，设置止损单
      if (exitPlan?.stop_loss) {
        console.error(`[INFO] Setting stop loss at $${exitPlan.stop_loss}...`);
        try {
          const slOrder = await this.exchange.setStopLoss(
            coin,
            side,
            totalQuantity,
            exitPlan.stop_loss
          );
          stopLossOrderId = slOrder.id;
          // console.error(`[INFO] Stop loss order set for ${coin} at $${exitPlan.stop_loss}`);
        } catch (slError) {
          const errorMsg = slError instanceof Error ? slError.message : String(slError);
          console.error(`[ERROR] Failed to set stop loss:`, slError);
          slTpWarning = `Stop loss failed: ${errorMsg}`;
        }
      }

      // 如果有止盈价格，设置止盈单
      if (exitPlan?.profit_target) {
        // console.error(`[INFO] Setting take profit at $${exitPlan.profit_target}...`);
        try {
          const tpOrder = await this.exchange.setTakeProfit(
            coin,
            side,
            totalQuantity,
            exitPlan.profit_target
          );
          takeProfitOrderId = tpOrder.id;
          // console.error(`[INFO] Take profit order set for ${coin} at $${exitPlan.profit_target}`);
        } catch (tpError) {
          const errorMsg = tpError instanceof Error ? tpError.message : String(tpError);
          console.error(`[ERROR] Failed to set take profit:`, tpError);
          slTpWarning = slTpWarning 
            ? `${slTpWarning}; Take profit failed: ${errorMsg}`
            : `Take profit failed: ${errorMsg}`;
        }
      }
    } catch (error) {
      console.error(`[WARN] Failed to set stop loss/take profit orders:`, error);
      // 继续执行，不因为止损/止盈设置失败而失败整个交易
    }

    // 保存交易记录到数据库
    const positionId = `${coin}_${side}_${Date.now()}`;
    const tradeRecord: Omit<import('../types.js').TradeRecord, 'exit_time' | 'exit_price' | 'net_pnl'> = {
      position_id: positionId,
      coin,
      side: side as 'long' | 'short',
      entry_price: currentPrice,
      quantity: totalQuantity,
      leverage,
      entry_time: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
      margin: marginAmount,
      fees: totalFees,
      exit_plan: exitPlan,
      confidence: confidence || 0.5,
      status: 'open' as const,
      sl_oid: stopLossOrderId,
      tp_oid: takeProfitOrderId,
    };
    
    await this.db.saveTrade(tradeRecord);
    console.log(`[MCP] ✓ Saved trade record for ${coin} ${side}, position_id: ${positionId}`);

    const baseMessage = `Successfully opened ${side} position for ${coin}`;
    const finalMessage = slTpWarning 
      ? `${baseMessage}. WARNING: ${slTpWarning}. Current price: $${currentPrice}`
      : baseMessage;

    return {
      success: true,
      position_id: positionId,
      entry_price: currentPrice,
      quantity: totalQuantity,
      notional_value: totalNotionalValue,
      liquidation_price: liquidationPrice,
      message: finalMessage,
      warning: slTpWarning, // 添加警告字段
    };
  }

  /**
   * 执行订单，如果订单太大则自动拆分
   * 使用二分法递归拆分直到满足交易所限制
   */
  private async executeOrderWithSplit(
    side: 'long' | 'short',
    coin: string,
    quantity: number,
    leverage: number,
    marginAmount: number,
    splitCount: number = 1
  ): Promise<any> {
    const maxSplits = 4; // 最多拆分4次（最多16个订单）
    
    try {
      console.log(`[ORDER-SPLIT] Attempting to execute order (split ${splitCount}):`);
      console.log(`  - Quantity: ${quantity}`);
      console.log(`  - Margin per order: $${marginAmount}`);
      
      // 尝试执行订单
      const order = side === 'long'
        ? await this.exchange.openLong(coin, quantity, leverage, marginAmount)
        : await this.exchange.openShort(coin, quantity, leverage, marginAmount);
      
      console.log(`[ORDER-SPLIT] Order executed successfully!`);
      return order;
      
    } catch (error: any) {
      // 检查是否是"订单金额太大"的错误
      const errorMsg = error.message || String(error);
      const isAmountTooLarge = errorMsg.includes('51202') || 
                               errorMsg.includes('exceeds the maximum amount') ||
                               errorMsg.includes('Market order amount exceeds');
      
      if (isAmountTooLarge && splitCount < maxSplits) {
        console.log(`[ORDER-SPLIT] Order too large, splitting into 2 smaller orders...`);
        
        // 二分拆分
        const halfQuantity = quantity / 2;
        const halfMargin = marginAmount / 2;
        
        console.log(`[ORDER-SPLIT] Split ${splitCount}: ${quantity} → 2 × ${halfQuantity}`);
        
        // 递归执行两个小订单
        const order1 = await this.executeOrderWithSplit(
          side, coin, halfQuantity, leverage, halfMargin, splitCount + 1
        );
        
        const order2 = await this.executeOrderWithSplit(
          side, coin, halfQuantity, leverage, halfMargin, splitCount + 1
        );
        
        console.log(`[ORDER-SPLIT] Both split orders executed successfully!`);
        
        // 合并两个订单的结果
        return {
          ...order1,
          quantity: (order1.amount || 0) + (order2.amount || 0),
          fee: {
            cost: (order1.fee?.cost || 0) + (order2.fee?.cost || 0),
          },
          info: {
            split: true,
            splitCount: splitCount,
            orders: [order1, order2],
          },
        };
      } else {
        // 不是金额太大的错误，或者已经拆分太多次了
        if (splitCount >= maxSplits) {
          console.error(`[ORDER-SPLIT] Max splits (${maxSplits}) reached, giving up`);
        }
        throw error;
      }
    }
  }

  /**
   * 减仓（部分平仓）
   */
  private async reducePosition(coin: string, reduceQuantity?: number, exitPlan?: any): Promise<TradeResponse> {
    console.log(`\n[MCP-TOOL] reducePosition() called:`);
    console.log(`  - coin: ${coin}`);
    console.log(`  - reduceQuantity: ${reduceQuantity}`);
    
    // 从数据库查找开仓记录
    const allTrades = await this.db.getAllTrades();
    const trade = allTrades.find(t => t.coin === coin && t.status === 'open');
    
    if (!trade) {
      return {
        success: false,
        message: 'Position not found',
        error: `No open position found for ${coin}`,
      };
    }
    
    const side = trade.side;
    console.log(`[INFO] Found ${side} position for ${coin}, current quantity: ${trade.quantity}`);
    
    // 如果没有指定减仓数量，默认减半
    const quantityToReduce = reduceQuantity || trade.quantity / 2;
    
    if (quantityToReduce >= trade.quantity) {
      console.warn(`[WARN] Reduce quantity (${quantityToReduce}) >= current quantity (${trade.quantity}), closing entire position instead`);
      return await this.closePosition(coin);
    }
    
    console.log(`[INFO] Reducing ${coin} ${side} position by ${quantityToReduce} (keeping ${trade.quantity - quantityToReduce})`);
    
    // 1. 取消现有的止损止盈委托
    console.log(`[INFO] Cancelling existing SL/TP orders...`);
    try {
      const openOrders = await this.exchange.getOpenOrders(coin);
      for (const order of openOrders) {
        if (order.type === 'stop' || order.type === 'take_profit' || order.type === 'stop_market') {
          console.log(`[INFO] Cancelling order ${order.id}`);
          await this.exchange.cancelOrder(order.id, coin);
        }
      }
    } catch (error) {
      console.error(`[WARN] Failed to cancel orders:`, error);
    }
    
    // 2. 执行部分平仓
    const currentPrice = await this.exchange.getPrice(coin);
    const order = side === 'long' 
      ? await this.exchange.closeLongPartial(coin, quantityToReduce)
      : await this.exchange.closeShortPartial(coin, quantityToReduce);
    
    // 3. 计算盈亏
    const pnl = side === 'long'
      ? (currentPrice - trade.entry_price) * quantityToReduce
      : (trade.entry_price - currentPrice) * quantityToReduce;
    
    const fees = parseFloat(String(order.fee?.cost || '0'));
    const netPnl = pnl - fees;
    
    // 4. 更新数据库（减少数量，不关闭仓位）
    const newQuantity = trade.quantity - quantityToReduce;
    await this.db.updateTrade(trade.position_id, {
      quantity: newQuantity,
      fees: trade.fees + fees,
      // 保持 position 为 open 状态
    });
    
    // 5. 如果提供了新的退出计划，设置新的止损止盈
    if (exitPlan) {
      console.log(`[INFO] Setting new SL/TP for remaining position...`);
      try {
        if (exitPlan.stop_loss) {
          await this.exchange.setStopLoss(coin, side, newQuantity, exitPlan.stop_loss);
        }
        if (exitPlan.profit_target) {
          await this.exchange.setTakeProfit(coin, side, newQuantity, exitPlan.profit_target);
        }
      } catch (error) {
        console.error(`[WARN] Failed to set new SL/TP:`, error);
      }
    }
    
    console.log(`[SUCCESS] Reduced ${coin} position. Net P&L from reduction: ${netPnl.toFixed(2)} USDT`);
    
    return {
      success: true,
      position_id: trade.position_id,
      entry_price: trade.entry_price,
      quantity: newQuantity,
      message: `Successfully reduced ${coin} position by ${quantityToReduce}. Remaining: ${newQuantity}. Net P&L: ${netPnl.toFixed(2)} USDT`,
    };
  }

  private async closePosition(coin: string): Promise<TradeResponse> {
    // 根据 coin 从数据库查找开仓记录
    console.error(`[INFO] Searching for open position by coin: ${coin}`);
    const allTrades = await this.db.getAllTrades();
    const trade = allTrades.find(t => 
      t.coin === coin && 
      t.status === 'open'
    );
    
    if (trade) {
      console.error(`[INFO] Found position for ${coin} in database: ${trade.position_id}`);
    }
    
    // 如果数据库中没有记录，尝试从交易所获取仓位信息并平仓
    if (!trade) {
      console.warn(`[WARN] Position for ${coin} not found in database, attempting to close from exchange`);
      
      try {
        // 从交易所获取该币种的仓位
        // console.log(`[DEBUG] Fetching positions from exchange for coin: ${coin}`);
        const positions = await this.exchange.getPositions();
        // console.log(`[DEBUG] Found ${positions.length} positions from exchange`);
        
        const position = positions.find(p => p.symbol?.includes(coin));
        // console.log(`[DEBUG] Matched position for ${coin}:`, position ? JSON.stringify(position, null, 2) : 'NOT FOUND');
        
        if (!position) {
          return {
            success: false,
            message: 'Position not found in database or exchange',
            error: 'Invalid position_id',
          };
        }
        
        // 确定仓位方向
        const side = position.side === 'long' ? 'long' : 'short';
        // console.log(`[DEBUG] Closing ${side} position for ${coin}`);
        
        // 平仓
        const order = await this.exchange.closePosition(coin, side);
        const exitPrice = await this.exchange.getPrice(coin);
        
        // 尝试在数据库中查找匹配的记录并更新状态
        try {
          const allTrades = await this.db.getAllTrades();
          const matchingTrade = allTrades.find(t => 
            t.coin === coin && 
            t.side === side && 
            t.status === 'open'
          );
          
          if (matchingTrade) {
            console.log(`[INFO] Found matching trade in DB, updating status to closed`);
            
            // 计算PnL
            let pnl = 0;
            if (side === 'long') {
              pnl = (exitPrice - matchingTrade.entry_price) * matchingTrade.quantity;
            } else {
              pnl = (matchingTrade.entry_price - exitPrice) * matchingTrade.quantity;
            }
            
            const fees = parseFloat(String(order.fee?.cost || '0'));
            const netPnl = pnl - fees - matchingTrade.fees;
            
            // 更新数据库
            await this.db.updateTrade(matchingTrade.position_id, {
              exit_price: exitPrice,
              exit_time: new Date(),
              net_pnl: netPnl,
              status: 'closed',
            });
            
            console.log(`[INFO] Database updated: ${coin} position closed with P&L: ${netPnl.toFixed(2)}`);
          } else {
            console.warn(`[WARN] No matching trade found in DB for ${coin} ${side}, skipping DB update`);
          }
        } catch (dbError) {
          console.error(`[ERROR] Failed to update database:`, dbError);
          // 不影响返回结果，因为交易所层面已经平仓成功了
        }
        
        return {
          success: true,
          message: `Successfully closed untracked ${side} position for ${coin} at ${exitPrice}`,
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to close untracked position',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // 正常流程：数据库中有记录
    
    // 平仓（OKX 会自动取消关联的止损/止盈订单，无需手动取消）
    console.error(`[INFO] Closing ${trade.side} position for ${coin}...`);
    
    // Close position on exchange
    const order = await this.exchange.closePosition(coin, trade.side);

    // Get exit price
    const exitPrice = await this.exchange.getPrice(coin);

    // Calculate PnL
    let pnl = 0;
    if (trade.side === 'long') {
      pnl = (exitPrice - trade.entry_price) * trade.quantity;
    } else {
      pnl = (trade.entry_price - exitPrice) * trade.quantity;
    }

    const fees = parseFloat(String(order.fee?.cost || '0'));
    const netPnl = pnl - fees - trade.fees;

    // 删除 exit_plan（平仓后不再需要）
    await this.db.deleteExitPlan(coin, trade.side);
    console.log(`[MCP] ✓ Deleted exit_plan for ${coin} ${trade.side}`);

    return {
      success: true,
      entry_price: trade.entry_price,
      message: `Successfully closed position for ${coin}. Net P&L: ${netPnl.toFixed(2)} USDT`,
    };
  }

  private async validateTrade(params: TradeParams): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if exit plan is provided for new positions
    if (params.action === 'buy' && !params.exit_plan) {
      errors.push('Exit plan is required for opening positions');
    }

    // Check leverage limits
    if (params.leverage && params.leverage > config.riskManagement.maxLeverage) {
      errors.push(`Leverage ${params.leverage}X exceeds maximum ${config.riskManagement.maxLeverage}X`);
    }

    // Check if coin is supported
    if (!config.supportedCoins.includes(params.coin)) {
      errors.push(`Coin ${params.coin} is not supported`);
    }

    // Get account state for risk checks
    if (params.action === 'buy' && params.margin_amount) {
      const balance = await this.exchange.getBalance();
      const availableCash = balance.USDT?.free || 0;

      // Check if sufficient margin
      if (params.margin_amount > availableCash) {
        errors.push(`Insufficient margin: need ${params.margin_amount}, have ${availableCash}`);
      }

      // Check position size limits
      const accountValue = balance.USDT?.total || 0;
      if (accountValue === 0) {
        errors.push('Unable to determine account value');
        return { valid: false, errors };
      }
      const maxPositionSize = accountValue * config.riskManagement.maxPositionSizePercent;
      
      if (params.margin_amount > maxPositionSize) {
        errors.push(`Position size ${params.margin_amount} exceeds maximum ${maxPositionSize.toFixed(2)}`);
      }

      // Check total exposure
      const positions = await this.exchange.getPositions();
      const currentExposure = positions.reduce((sum, p) => {
        return sum + parseFloat(String(p.notional || '0'));
      }, 0);

      const newExposure = currentExposure + (params.margin_amount * (params.leverage || 1));
      const maxExposure = accountValue * config.riskManagement.maxTotalExposurePercent;

      if (newExposure > maxExposure) {
        errors.push(`Total exposure ${newExposure.toFixed(2)} exceeds maximum ${maxExposure.toFixed(2)}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 现货买入
   */
  private async spotBuy(
    coin: string,
    quantity: number,
    exitPlan?: any,
    confidence?: number
  ): Promise<TradeResponse> {
    console.log(`\n[MCP-TOOL] spotBuy() called:`);
    console.log(`  - coin: ${coin}`);
    console.log(`  - quantity: ${quantity}`);
    
    try {
      // 获取当前价格
      const currentPrice = await this.exchange.getPrice(coin);
      console.log(`[SPOT] Current ${coin} price: $${currentPrice}`);
      
      // 计算购买金额
      const totalCost = quantity * currentPrice;
      console.log(`[SPOT] Total cost: $${totalCost.toFixed(2)}`);
      
      // 执行现货买入
      const order = await this.exchange.createMarketBuyOrder(`${coin}/USDT`, quantity);
      console.log(`[SPOT] Buy order executed:`, order.id);
      
      // 保存到数据库
      const positionId = `spot_${coin}_${Date.now()}`;
      const tradeRecord = {
        position_id: positionId,
        coin,
        side: 'long' as const,
        entry_price: currentPrice,
        quantity,
        leverage: 1,  // 现货固定1x
        entry_time: new Date(),
        margin: totalCost,
        fees: parseFloat(String(order.fee?.cost || '0')),
        exit_plan: exitPlan,
        confidence: confidence || 0.5,
        status: 'open' as const,
      };
      
      await this.db.saveTrade(tradeRecord);
      
      return {
        success: true,
        position_id: positionId,
        entry_price: currentPrice,
        quantity,
        notional_value: totalCost,
        message: `Successfully bought ${quantity} ${coin} at $${currentPrice}`,
      };
    } catch (error: any) {
      console.error(`[SPOT] Buy error:`, error);
      return {
        success: false,
        message: 'Spot buy failed',
        error: error.message,
      };
    }
  }

  /**
   * 现货卖出
   */
  private async spotSell(coin: string, quantity: number): Promise<TradeResponse> {
    console.log(`\n[MCP-TOOL] spotSell() called:`);
    console.log(`  - coin: ${coin}`);
    console.log(`  - quantity: ${quantity}`);
    
    try {
      // 从数据库查找持仓
      const allTrades = await this.db.getAllTrades();
      const trade = allTrades.find(t => 
        t.coin === coin && 
        t.status === 'open' &&
        t.leverage === 1  // 现货标识
      );
      
      if (!trade) {
        return {
          success: false,
          message: 'No spot position found',
          error: `No open spot position for ${coin}`,
        };
      }
      
      // 如果未指定数量，卖出全部
      const sellQuantity = quantity || trade.quantity;
      
      if (sellQuantity > trade.quantity) {
        return {
          success: false,
          message: 'Insufficient quantity',
          error: `Cannot sell ${sellQuantity}, only have ${trade.quantity}`,
        };
      }
      
      // 获取当前价格
      const currentPrice = await this.exchange.getPrice(coin);
      console.log(`[SPOT] Current ${coin} price: $${currentPrice}`);
      
      // 执行现货卖出
      const order = await this.exchange.createMarketSellOrder(`${coin}/USDT`, sellQuantity);
      console.log(`[SPOT] Sell order executed:`, order.id);
      
      // 计算盈亏
      const pnl = (currentPrice - trade.entry_price) * sellQuantity;
      const fees = trade.fees + parseFloat(String(order.fee?.cost || '0'));
      const netPnl = pnl - fees;
      
      // 更新数据库
      if (sellQuantity >= trade.quantity) {
        // 全部卖出，关闭仓位
        await this.db.updateTrade(trade.position_id, {
          exit_price: currentPrice,
          exit_time: new Date(),
          net_pnl: netPnl,
          fees,
          status: 'closed',
        });
      } else {
        // 部分卖出，减少数量
        await this.db.updateTrade(trade.position_id, {
          quantity: trade.quantity - sellQuantity,
          fees,
        });
      }
      
      return {
        success: true,
        position_id: trade.position_id,
        entry_price: trade.entry_price,
        quantity: sellQuantity,
        message: `Successfully sold ${sellQuantity} ${coin} at $${currentPrice}. Net P&L: $${netPnl.toFixed(2)}`,
      };
    } catch (error: any) {
      console.error(`[SPOT] Sell error:`, error);
      return {
        success: false,
        message: 'Spot sell failed',
        error: error.message,
      };
    }
  }
}
