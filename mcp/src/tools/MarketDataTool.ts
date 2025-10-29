/**
 * MCP Tool: get_market_data
 * Fetches real-time market data and technical indicators
 */

import { ExchangeAdapter } from '../exchange/ExchangeAdapter.js';
import { MarketDataParams, MarketDataResponse, CoinMarketData } from '../types.js';
import {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  extractClosePrices,
  getLatest,
  average,
} from '../utils/indicators.js';
import config from '../config.js';

export class MarketDataTool {
  constructor(private exchange: ExchangeAdapter) {}

  async execute(params: MarketDataParams): Promise<MarketDataResponse> {
    const {
      coins,
      timeframe = '3m',
      indicators = ['price', 'ema20', 'ema50', 'macd', 'rsi7', 'rsi14'],
      include_funding = true,
      include_open_interest = true,
    } = params;

    const coinsData: Record<string, CoinMarketData> = {};

    for (const coin of coins) {
      try {
        // Fetch OHLCV data
        const ohlcv = await this.exchange.getOHLCV(coin, timeframe, 100);
        const closePrices = extractClosePrices(ohlcv);

        const coinData: CoinMarketData = {
          current_price: closePrices[closePrices.length - 1],
        };

        // Calculate technical indicators
        if (indicators.includes('ema20')) {
          const ema20 = calculateEMA(closePrices, config.indicators.ema20Period);
          coinData.current_ema20 = getLatest(ema20);
          coinData.ema20_series = ema20.slice(-20); // Last 20 values
        }

        if (indicators.includes('ema50')) {
          const ema50 = calculateEMA(closePrices, config.indicators.ema50Period);
          coinData.current_ema50 = getLatest(ema50);
          coinData.ema50_series = ema50.slice(-20);
        }

        if (indicators.includes('rsi7')) {
          const rsi7 = calculateRSI(closePrices, config.indicators.rsi7Period);
          coinData.rsi7_series = rsi7.slice(-20);
        }

        if (indicators.includes('rsi14') || indicators.includes('rsi')) {
          const rsi14 = calculateRSI(closePrices, config.indicators.rsi14Period);
          coinData.current_rsi = getLatest(rsi14);
          coinData.rsi14_series = rsi14.slice(-20);
        }

        if (indicators.includes('macd')) {
          const macd = calculateMACD(
            closePrices,
            config.indicators.macdFast,
            config.indicators.macdSlow,
            config.indicators.macdSignal
          );
          coinData.current_macd = getLatest(macd.macd);
          coinData.macd_series = macd.macd.slice(-20);
        }

        // Add price series
        coinData.price_series = closePrices.slice(-20);

        // Get funding rate
        if (include_funding) {
          try {
            coinData.funding_rate = await this.exchange.getFundingRate(coin);
          } catch (error) {
            console.warn(`Could not fetch funding rate for ${coin}`);
          }
        }

        // Get open interest
        if (include_open_interest) {
          try {
            const openInterest = await this.exchange.getOpenInterest(coin);
            coinData.open_interest = {
              latest: openInterest,
              average: openInterest, // Simplified - would need historical data
            };
          } catch (error) {
            console.warn(`Could not fetch open interest for ${coin}`);
          }
        }

        // Get 24h volume and change
        try {
          const ticker = await this.exchange.getExchange().fetchTicker(
            `${coin}/USDT:USDT`
          );
          coinData.volume_24h = ticker.quoteVolume;
          coinData.change_24h = ticker.percentage;
        } catch (error) {
          console.warn(`Could not fetch 24h stats for ${coin}`);
        }

        coinsData[coin] = coinData;
      } catch (error) {
        console.error(`Error fetching data for ${coin}:`, error);
        // Continue with other coins
      }
    }

    return {
      timestamp: new Date().toISOString(),
      coins: coinsData,
    };
  }
}
