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
  
  console.log('BTC:');
  const btc = await ex.fetchOpenInterest('BTC/USDT:USDT');
  console.log('info.oi:', btc.info.oi);
  console.log('info.oiCcy:', btc.info.oiCcy);
  
  console.log('\nETH:');
  const eth = await ex.fetchOpenInterest('ETH/USDT:USDT');
  console.log('info.oi:', eth.info.oi);
  console.log('info.oiCcy:', eth.info.oiCcy);
  
  console.log('\nSOL:');
  const sol = await ex.fetchOpenInterest('SOL/USDT:USDT');
  console.log('info.oi:', sol.info.oi);
  console.log('info.oiCcy:', sol.info.oiCcy);
}

test().catch(console.error);
