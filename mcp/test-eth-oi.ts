import { ExchangeAdapter } from './src/exchange/ExchangeAdapter.js';

async function test() {
  const exchange = new ExchangeAdapter({
    exchange: 'okx',
    apiKey: process.env.OKX_API_KEY || '',
    apiSecret: process.env.OKX_API_SECRET || '',
    password: process.env.OKX_API_PASSWORD || '',
    useSandbox: process.env.OKX_USE_SANDBOX === 'true',
  });

  const oi = await (exchange as any).exchange.fetchOpenInterest('ETH/USDT:USDT');
  console.log('ETH Open Interest:', JSON.stringify(oi, null, 2));
}

test().catch(console.error);
