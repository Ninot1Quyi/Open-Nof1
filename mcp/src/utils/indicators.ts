/**
 * Technical Indicators Calculator
 */

import ccxt from 'ccxt';

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for first value
  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(sma);

  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const value = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(value);
  }

  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) {
    return [];
  }

  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // Calculate average gains and losses
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // First RSI value
  const rs = avgGain / (avgLoss || 1);
  rsi.push(100 - (100 / (1 + rs)));

  // Calculate remaining RSI values
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgGain / (avgLoss || 1);
    rsi.push(100 - (100 / (1 + rs)));
  }

  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);

  if (emaFast.length === 0 || emaSlow.length === 0) {
    return { macd: [], signal: [], histogram: [] };
  }

  // Calculate MACD line
  const macdLine: number[] = [];
  const offset = slowPeriod - fastPeriod;
  
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }

  // Calculate signal line (EMA of MACD)
  const signalLine = calculateEMA(macdLine, signalPeriod);

  // Calculate histogram
  const histogram: number[] = [];
  const signalOffset = macdLine.length - signalLine.length;
  
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + signalOffset] - signalLine[i]);
  }

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram,
  };
}

/**
 * Extract close prices from OHLCV data
 */
import { OHLCV } from 'ccxt';

export function extractClosePrices(ohlcv: OHLCV[]): number[] {
  return ohlcv.map(candle => Number(candle[4])); // Close price is at index 4
}

/**
 * Get latest value from array
 */
export function getLatest(arr: number[]): number | undefined {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

/**
 * Calculate average of array
 */
export function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate ATR (Average True Range)
 * @param ohlcv - OHLCV data array
 * @param period - ATR period (default 14)
 * @returns ATR value
 */
export function calculateATR(ohlcv: OHLCV[], period: number = 14): number {
  if (ohlcv.length < period) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < ohlcv.length; i++) {
    const high = Number(ohlcv[i][2]);
    const low = Number(ohlcv[i][3]);
    const prevClose = Number(ohlcv[i - 1][4]);
    
    // True Range = max(high - low, |high - prevClose|, |low - prevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trueRanges.push(tr);
  }
  
  // Calculate ATR as simple moving average of true ranges
  const recentTR = trueRanges.slice(-period);
  return average(recentTR);
}

/**
 * Extract volume from OHLCV data
 * @param ohlcv - OHLCV data array
 * @returns Array of volume values
 */
export function extractVolume(ohlcv: OHLCV[]): number[] {
  return ohlcv.map(candle => Number(candle[5])); // Volume is at index 5
}
