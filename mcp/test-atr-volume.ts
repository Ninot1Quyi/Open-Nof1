/**
 * Test ATR and Volume calculation
 */

import { ExchangeAdapter } from './src/exchange/ExchangeAdapter.js';
import { MarketDataTool } from './src/tools/MarketDataTool.js';

async function test() {
  console.log('Testing ATR and Volume calculation...\n');
  
  const exchange = new ExchangeAdapter({
    exchange: 'okx',
    apiKey: process.env.OKX_API_KEY || '',
    apiSecret: process.env.OKX_API_SECRET || '',
    password: process.env.OKX_API_PASSWORD || '',
    useSandbox: process.env.OKX_USE_SANDBOX === 'true',
  });

  const marketDataTool = new MarketDataTool(exchange);

  const result = await marketDataTool.execute({
    coins: ['BTC', 'ETH'],
    timeframe: '3m',
    indicators: ['price', 'ema20', 'ema50', 'macd', 'rsi7', 'rsi14'],
    include_funding: true,
    include_open_interest: true,
  });

  console.log('\n=== Market Data Result ===\n');
  
  for (const [coin, data] of Object.entries(result.coins)) {
    console.log(`${coin}:`);
    console.log(`  Price: ${data.current_price}`);
    console.log(`  ATR (3-period): ${data.atr3}`);
    console.log(`  ATR (14-period): ${data.atr14}`);
    console.log(`  Volume (current): ${data.volume_current}`);
    console.log(`  Volume (average): ${data.volume_average}`);
    console.log('');
  }
}

test().catch(console.error);
