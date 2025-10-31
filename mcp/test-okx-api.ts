import { ExchangeAdapter } from './src/exchange/ExchangeAdapter.js';

async function test() {
  const exchange = new ExchangeAdapter({
    exchange: 'okx',
    apiKey: process.env.OKX_API_KEY || '',
    apiSecret: process.env.OKX_API_SECRET || '',
    password: process.env.OKX_API_PASSWORD || '',
    useSandbox: process.env.OKX_USE_SANDBOX === 'true',
  });

  const ex = (exchange as any).exchange;
  
  console.log('Testing OKX native API:');
  try {
    const response = await ex.publicGetPublicOpenInterest({
      instId: 'ETH-USDT-SWAP'
    });
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

test().catch(console.error);
