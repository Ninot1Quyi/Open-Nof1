import { ExchangeAdapter } from './src/exchange/ExchangeAdapter.js';

async function test() {
  const exchange = new ExchangeAdapter({
    exchange: 'okx',
    apiKey: process.env.OKX_API_KEY || '',
    apiSecret: process.env.OKX_API_SECRET || '',
    password: process.env.OKX_API_PASSWORD || '',
    useSandbox: process.env.OKX_USE_SANDBOX === 'true',
  });

  console.log('Testing getOpenInterest:');
  const ethOi = await exchange.getOpenInterest('ETH');
  console.log('ETH OI returned:', ethOi);
}

test().catch(console.error);
