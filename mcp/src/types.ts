/**
 * MCP Trading Server Type Definitions
 * Based on NOF1 Alpha Arena design
 */

// ============= Market Data Types =============

export interface MarketDataParams {
  coins: string[];
  timeframe?: string;
  indicators?: string[];
  include_orderbook?: boolean;
  include_funding?: boolean;
  include_open_interest?: boolean;
}

export interface CoinMarketData {
  current_price: number;
  current_ema20?: number;
  current_ema50?: number;
  current_macd?: number;
  current_rsi?: number;
  open_interest?: {
    latest: number;
    average: number;
  };
  funding_rate?: number;
  price_series?: number[];
  ema20_series?: number[];
  ema50_series?: number[];
  macd_series?: number[];
  rsi7_series?: number[];
  rsi14_series?: number[];
  volume_24h?: number;
  change_24h?: number;
  atr3?: number;
  atr14?: number;
  volume_current?: number;
  volume_average?: number;
}

export interface MarketDataResponse {
  timestamp: string;
  coins: Record<string, CoinMarketData>;
}

// ============= Account State Types =============

export interface AccountStateParams {
  include_positions?: boolean;
  include_history?: boolean;
  include_performance?: boolean;
}

export interface ExitPlan {
  profit_target?: number;
  stop_loss?: number;
  invalidation?: string;
}

export interface Position {
  coin: string;
  side: 'long' | 'short';
  entry_price: number;
  entry_time: string;
  quantity: number;
  leverage: number;
  liquidation_price: number;
  margin: number;
  unrealized_pnl: number;
  current_price: number;
  exit_plan?: ExitPlan;
  position_id?: string;
}

export interface AccountStateResponse {
  account_value: number;
  available_cash: number;
  total_pnl: number;
  total_fees: number;
  net_realized: number;
  sharpe_ratio?: number;
  win_rate?: number;
  trade_count: number;
  active_positions: Position[];
}

// ============= Trade Execution Types =============

export interface TradeParams {
  action: 'buy' | 'sell' | 'hold' | 'buy_to_enter' | 'sell_to_enter' | 'open_long' | 'open_short' | 'close_position' | 'reduce_position';
  coin: string;
  leverage?: number;
  margin_amount?: number;
  quantity?: number;  // For reduce_position/sell: amount to reduce/sell
  position_id?: string;  // For closing positions
  exit_plan?: ExitPlan;
  confidence?: number;
  bypass_risk_check?: boolean;  // 是否绕过风险检查
  trading_mode?: 'futures' | 'spot';  // 交易模式
}

export interface TradeResponse {
  success: boolean;
  position_id?: string;
  entry_price?: number;
  quantity?: number;
  notional_value?: number;
  liquidation_price?: number;
  message: string;
  error?: string;
  warning?: string;  // 警告信息（如止损/止盈设置失败）
}

// ============= Exit Plan Update Types =============

export interface UpdateExitPlanParams {
  coin: string;
  side: 'long' | 'short';
  new_profit_target?: number;
  new_stop_loss?: number;
  new_invalidation?: string;
  confidence?: number;
}

export interface UpdateExitPlanResponse {
  success: boolean;
  updated_exit_plan: ExitPlan;
  message: string;
}

// ============= Performance Metrics Types =============

export interface PerformanceMetricsResponse {
  sharpe_ratio: number;
  win_rate: number;
  average_leverage: number;
  average_confidence: number;
  biggest_win: number;
  biggest_loss: number;
  total_trades: number;
  profitable_trades: number;
  losing_trades: number;
  hold_times: {
    long: number;
    short: number;
    flat: number;
  };
  total_fees: number;
  net_pnl: number;
}

// ============= Exchange Configuration =============

export interface ExchangeConfig {
  exchange: 'okx' | 'binance';
  apiKey: string;
  apiSecret: string;
  password?: string;
  useSandbox: boolean;
}

// ============= Database Types =============

export interface TradeRecord {
  id?: number;
  position_id: string;
  coin: string;
  side: 'long' | 'short';
  entry_price: number;
  exit_price?: number;
  quantity: number;
  leverage: number;
  entry_time: Date | number;  // Date object or Unix timestamp (seconds)
  exit_time?: Date | number;  // Date object or Unix timestamp (seconds)
  margin: number;
  fees: number;
  net_pnl?: number;
  exit_plan?: ExitPlan;
  confidence?: number;
  status: 'open' | 'closed';
  sl_oid?: string;  // Stop Loss Order ID
  tp_oid?: string;  // Take Profit Order ID
}

export interface PerformanceSnapshot {
  timestamp: Date;
  account_value: number;
  total_pnl: number;
  sharpe_ratio?: number;
  win_rate?: number;
  total_trades?: number;
}
