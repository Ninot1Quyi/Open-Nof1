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
  
  // 获取市场信息
  await ex.loadMarkets();
  
  const btcSwap = ex.market('BTC/USDT:USDT');
  const ethSwap = ex.market('ETH/USDT:USDT');
  
  console.log('BTC-USDT-SWAP:');
  console.log('  contractSize:', btcSwap.contractSize);
  console.log('  info.ctVal:', btcSwap.info.ctVal);
  
  console.log('\nETH-USDT-SWAP:');
  console.log('  contractSize:', ethSwap.contractSize);
  console.log('  info.ctVal:', ethSwap.info.ctVal);
}

test().catch(console.error);
