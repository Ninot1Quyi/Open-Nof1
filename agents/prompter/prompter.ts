import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getMCPClient } from './mcp-client.js';

/**
 * Prompter - 动态生成AI交易User Prompt
 * 使用MCP工具获取实时数据并填充模板
 */

// ES模块中定义__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MarketData {
  price: number;
  ema20: number;
  macd: number;
  rsi7: number;
  oi_latest: number;
  oi_average: number;
  funding_rate: number;
  price_array: number[];
  ema20_array: number[];
  macd_array: number[];
  rsi7_array: number[];
  rsi14_array: number[];
  ema20_4h: number;
  ema50_4h: number;
  atr3: number;
  atr14: number;
  volume_current: number;
  volume_average: number;
  macd_4h_array: number[];
  rsi14_4h_array: number[];
}

interface Position {
  symbol: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  liquidation_price: number;
  unrealized_pnl: number;
  leverage: number;
  exit_plan: {
    profit_target: number;
    stop_loss: number;
    invalidation_condition: string;
  };
  confidence: number;
  risk_usd: number;
  sl_oid: number;
  tp_oid: number;
  wait_for_fill: boolean;
  entry_oid: number;
  notional_usd: number;
}

interface AccountInfo {
  total_return_pct: number;
  available_cash: number;
  account_value: number;
  positions: Position[];
  sharpe_ratio: number;
}

class Prompter {
  private mainTemplate: string;
  private coinTemplate: string;
  private systemTemplate: string;
  // 允许交易的币种白名单（OKX 沙盒环境限制）
  // 只包含主流币种，避免借币额度不足的问题
  private coins = ['BTC', 'ETH', 'SOL','BNB'];
  private mcpClient = getMCPClient();

  constructor() {
    // 读取模板文件
    // 如果在build目录，需要向上一级找模板
    const templateDir = __dirname.endsWith('build') 
      ? path.join(__dirname, '..') 
      : __dirname;
    
    this.mainTemplate = fs.readFileSync(
      path.join(templateDir, 'prompts/main-template.md'),
      'utf-8'
    );
    this.coinTemplate = fs.readFileSync(
      path.join(templateDir, 'prompts/coin-template.md'),
      'utf-8'
    );
    this.systemTemplate = fs.readFileSync(
      path.join(templateDir, 'prompts/system-template.md'),
      'utf-8'
    );
  }

  /**
   * 使用MCP工具获取市场数据
   */
  private async getMarketData(): Promise<Record<string, MarketData>> {
    const response = await this.mcpClient.getMarketData({
      coins: this.coins,
      timeframe: '3m',
      indicators: ['price', 'ema20', 'ema50', 'macd', 'rsi7', 'rsi14'],
      include_funding: true,
      include_open_interest: true,
    });

    return this.parseMarketDataResponse(response);
  }

  /**
   * 使用MCP工具获取账户信息
   */
  private async getAccountInfo(): Promise<AccountInfo> {
    const response = await this.mcpClient.getAccountState({
      include_positions: true,
      include_history: false,
      include_performance: true,
    });

    return this.parseAccountInfoResponse(response);
  }

  /**
   * 解析市场数据响应
   */
  private parseMarketDataResponse(response: any): Record<string, MarketData> {
    const marketData: Record<string, MarketData> = {};
    
    // MCP返回的数据结构是 {timestamp, coins: {...}}
    const coinsData = response.coins || response;
    
    for (const coin of this.coins) {
      const coinData = coinsData[coin];
      if (!coinData) {
        console.warn(`No data for ${coin}`);
        continue;
      }
      
      marketData[coin] = {
        price: coinData.current_price || 0,
        ema20: coinData.current_ema20 || 0,
        macd: coinData.current_macd || 0,
        rsi7: coinData.rsi7_series?.[coinData.rsi7_series.length - 1] || 0,
        oi_latest: coinData.open_interest?.latest || 0,
        oi_average: coinData.open_interest?.average || 0,
        funding_rate: coinData.funding_rate || 0,
        price_array: coinData.price_series?.slice(-10) || [],
        ema20_array: coinData.ema20_series?.slice(-10) || [],
        macd_array: coinData.macd_series?.slice(-10) || [],
        rsi7_array: coinData.rsi7_series?.slice(-10) || [],
        rsi14_array: coinData.rsi14_series?.slice(-10) || [],
        ema20_4h: coinData.current_ema20 || 0,
        ema50_4h: coinData.current_ema50 || 0,
        atr3: 0, // TODO: 需要添加ATR计算
        atr14: 0,
        volume_current: 0, // TODO: 需要添加成交量数据
        volume_average: 0,
        macd_4h_array: coinData.macd_series?.slice(-10) || [],
        rsi14_4h_array: coinData.rsi14_series?.slice(-10) || [],
      };
    }
    
    return marketData;
  }

  /**
   * 解析账户信息响应
   */
  private parseAccountInfoResponse(response: any): AccountInfo {
    // 计算总收益率
    const totalReturnPct = response.account_value > 0 
      ? ((response.account_value - 10000) / 10000) * 100 
      : 0;
    
    return {
      total_return_pct: totalReturnPct,
      available_cash: response.available_cash || 0,
      account_value: response.account_value || 0,
      positions: (response.active_positions || []).map((pos: any) => ({
        symbol: pos.coin,
        quantity: pos.quantity,
        entry_price: pos.entry_price,
        current_price: pos.current_price,
        liquidation_price: pos.liquidation_price,
        unrealized_pnl: pos.unrealized_pnl,
        leverage: pos.leverage,
        exit_plan: pos.exit_plan || {},
        confidence: 0.7, // 默认值
        risk_usd: 0, // 默认值
        sl_oid: -1,
        tp_oid: -1,
        wait_for_fill: false,
        entry_oid: -1,
        notional_usd: pos.quantity * pos.current_price * pos.leverage,
      })),
      sharpe_ratio: response.sharpe_ratio || 0,
    };
  }

  /**
   * 填充币种数据模板
   */
  private fillCoinTemplate(coin: string, data: MarketData): string {
    let filled = this.coinTemplate;

    // 替换币种名称
    filled = filled.replace(/{COIN}/g, coin);

    // 替换当前快照数据
    filled = filled.replace(/{price}/g, data.price.toString());
    filled = filled.replace(/{ema20}/g, data.ema20.toString());
    filled = filled.replace(/{macd}/g, data.macd.toString());
    filled = filled.replace(/{rsi7}/g, data.rsi7.toString());

    // 替换持仓量和资金费率
    filled = filled.replace(/{oi_latest}/g, data.oi_latest.toString());
    filled = filled.replace(/{oi_average}/g, data.oi_average.toString());
    filled = filled.replace(/{funding_rate}/g, data.funding_rate.toExponential());

    // 替换3分钟时间序列
    filled = filled.replace(/{price_array}/g, this.formatArray(data.price_array));
    filled = filled.replace(/{ema20_array}/g, this.formatArray(data.ema20_array));
    filled = filled.replace(/{macd_array}/g, this.formatArray(data.macd_array));
    filled = filled.replace(/{rsi7_array}/g, this.formatArray(data.rsi7_array));
    filled = filled.replace(/{rsi14_array}/g, this.formatArray(data.rsi14_array));

    // 替换4小时数据
    filled = filled.replace(/{ema20_4h}/g, data.ema20_4h.toString());
    filled = filled.replace(/{ema50_4h}/g, data.ema50_4h.toString());
    filled = filled.replace(/{atr3}/g, data.atr3.toString());
    filled = filled.replace(/{atr14}/g, data.atr14.toString());
    filled = filled.replace(/{volume_current}/g, data.volume_current.toString());
    filled = filled.replace(/{volume_average}/g, data.volume_average.toString());
    filled = filled.replace(/{macd_4h_array}/g, this.formatArray(data.macd_4h_array));
    filled = filled.replace(/{rsi14_4h_array}/g, this.formatArray(data.rsi14_4h_array));

    return filled;
  }

  /**
   * 格式化数组为字符串
   */
  private formatArray(arr: number[]): string {
    return arr.map(n => n.toString()).join(', ');
  }

  /**
   * 格式化持仓信息
   */
  private formatPositions(positions: Position[]): string {
    return positions.map(pos => {
      return `{'symbol': '${pos.symbol}', 'quantity': ${pos.quantity}, 'entry_price': ${pos.entry_price}, 'current_price': ${pos.current_price}, 'liquidation_price': ${pos.liquidation_price}, 'unrealized_pnl': ${pos.unrealized_pnl}, 'leverage': ${pos.leverage}, 'exit_plan': {'profit_target': ${pos.exit_plan.profit_target}, 'stop_loss': ${pos.exit_plan.stop_loss}, 'invalidation_condition': '${pos.exit_plan.invalidation_condition}'}, 'confidence': ${pos.confidence}, 'risk_usd': ${pos.risk_usd}, 'sl_oid': ${pos.sl_oid}, 'tp_oid': ${pos.tp_oid}, 'wait_for_fill': ${pos.wait_for_fill}, 'entry_oid': ${pos.entry_oid}, 'notional_usd': ${pos.notional_usd}}`;
    }).join('\n');
  }

  /**
   * 生成User Prompt（市场数据和账户信息）
   * System Prompt通过getSystemPrompt()函数单独获取
   */
  async generatePrompt(
    elapsedMinutes: number,
    invocationCount: number
  ): Promise<string> {
    // 1. 先连接MCP服务器（只连接一次）
    await this.mcpClient.connect();
    
    // 2. 并行获取市场数据和账户信息
    console.log('[INFO] Fetching market data and account info in parallel...');
    const [marketData, accountInfo] = await Promise.all([
      this.getMarketData(),
      this.getAccountInfo()
    ]);
    console.log('[INFO] Data fetched successfully');

    // 2. 生成所有币种的数据部分
    let coinDataSection = '';
    for (const coin of this.coins) {
      if (marketData[coin]) {
        coinDataSection += this.fillCoinTemplate(coin, marketData[coin]);
      }
    }

    // 3. 填充主模板（User Prompt）
    let userPrompt = this.mainTemplate;

    // 时间和上下文
    userPrompt = userPrompt.replace(/{elapsed_minutes}/g, elapsedMinutes.toString());
    userPrompt = userPrompt.replace(/{current_timestamp}/g, new Date().toISOString());
    userPrompt = userPrompt.replace(/{invocation_count}/g, invocationCount.toString());

    // 币种数据部分
    userPrompt = userPrompt.replace(/{COIN_DATA_SECTION}/g, coinDataSection);

    // 账户信息
    userPrompt = userPrompt.replace(/{total_return_pct}/g, accountInfo.total_return_pct.toString());
    userPrompt = userPrompt.replace(/{available_cash}/g, accountInfo.available_cash.toString());
    userPrompt = userPrompt.replace(/{account_value}/g, accountInfo.account_value.toString());
    userPrompt = userPrompt.replace(/{position_details}/g, this.formatPositions(accountInfo.positions));
    userPrompt = userPrompt.replace(/{sharpe_ratio}/g, accountInfo.sharpe_ratio.toString());

    // 4. 返回User Prompt（System Prompt通过getSystemPrompt()单独获取）
    return userPrompt;
  }

  /**
   * 模拟市场数据（用于测试）
   */
  private getMockMarketData(): Record<string, MarketData> {
    const mockData: Record<string, MarketData> = {};
    
    for (const coin of this.coins) {
      mockData[coin] = {
        price: 100000 + Math.random() * 10000,
        ema20: 100000 + Math.random() * 10000,
        macd: -100 + Math.random() * 200,
        rsi7: 30 + Math.random() * 40,
        oi_latest: 29000 + Math.random() * 1000,
        oi_average: 29000 + Math.random() * 1000,
        funding_rate: 0.00001 + Math.random() * 0.00002,
        price_array: Array(10).fill(0).map(() => 100000 + Math.random() * 10000),
        ema20_array: Array(10).fill(0).map(() => 100000 + Math.random() * 10000),
        macd_array: Array(10).fill(0).map(() => -100 + Math.random() * 200),
        rsi7_array: Array(10).fill(0).map(() => 30 + Math.random() * 40),
        rsi14_array: Array(10).fill(0).map(() => 30 + Math.random() * 40),
        ema20_4h: 100000 + Math.random() * 10000,
        ema50_4h: 100000 + Math.random() * 10000,
        atr3: 400 + Math.random() * 200,
        atr14: 500 + Math.random() * 200,
        volume_current: 100 + Math.random() * 100,
        volume_average: 4000 + Math.random() * 1000,
        macd_4h_array: Array(10).fill(0).map(() => 500 + Math.random() * 1000),
        rsi14_4h_array: Array(10).fill(0).map(() => 50 + Math.random() * 30),
      };
    }

    return mockData;
  }

  /**
   * 模拟账户信息（用于测试）
   */
  private getMockAccountInfo(): AccountInfo {
    return {
      total_return_pct: 3.04,
      available_cash: 3262.84,
      account_value: 10304.31,
      positions: [
        {
          symbol: 'BTC',
          quantity: 0.17,
          entry_price: 109940.0,
          current_price: 113957.5,
          liquidation_price: 105963.2,
          unrealized_pnl: 682.98,
          leverage: 20,
          exit_plan: {
            profit_target: 116716.25,
            stop_loss: 107105.6,
            invalidation_condition: 'If 4-hour MACD crosses below 0',
          },
          confidence: 0.75,
          risk_usd: 453.89,
          sl_oid: 210686258576,
          tp_oid: 210686250437,
          wait_for_fill: false,
          entry_oid: 210686242021,
          notional_usd: 19372.78,
        },
      ],
      sharpe_ratio: 0.049,
    };
  }
}

/**
 * 获取System Prompt
 * 这是AI交易系统的核心指令和规则
 * 根据交易模式（futures/spot）加载不同的prompt
 */
function getSystemPrompt(): string {
  const templateDir = __dirname.endsWith('build') 
    ? path.join(__dirname, '..') 
    : __dirname;
  
  // 根据环境变量选择交易模式
  const tradingMode = process.env.TRADING_MODE || 'futures';
  const templateFile = tradingMode === 'spot' 
    ? 'prompts/system-template-spot.md' 
    : 'prompts/system-template.md';
  
  console.log(`[PROMPTER] Loading ${tradingMode} mode prompt: ${templateFile}`);
  
  return fs.readFileSync(
    path.join(templateDir, templateFile),
    'utf-8'
  );
}

/**
 * 获取完整的Prompt（System + User）
 * 如果需要组合的版本，可以使用这个函数
 */
async function getFullPrompt(
  elapsedMinutes: number,
  invocationCount: number
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const prompter = new Prompter();
  const systemPrompt = getSystemPrompt();
  const userPrompt = await prompter.generatePrompt(elapsedMinutes, invocationCount);
  
  return { systemPrompt, userPrompt };
}

// 导出
export { Prompter, MarketData, AccountInfo, Position, getSystemPrompt, getFullPrompt };

// 使用示例
async function main() {
  const prompter = new Prompter();
  
  // 计算已交易时长（示例：从某个开始时间到现在）
  const startTime = new Date('2025-10-28 12:00:00'); // 示例开始时间
  const now = new Date();
  const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
  
  // 模拟调用次数（实际应该从数据库读取）
  const invocationCount = 3302;
  
  console.log('[INFO] Generating prompt...');
  console.log(`[INFO] Elapsed minutes: ${elapsedMinutes}`);
  console.log(`[INFO] Invocation count: ${invocationCount}`);
  
  const prompt = await prompter.generatePrompt(elapsedMinutes, invocationCount);
  
  // 创建logs目录
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('[INFO] Created logs directory');
  }
  
  // 生成文件名（带时间戳）
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `prompt_${timestamp}.txt`;
  const filepath = path.join(logsDir, filename);
  
  // 保存到文件
  fs.writeFileSync(filepath, prompt, 'utf-8');
  console.log(`[INFO] Prompt saved to: ${filepath}`);
  console.log(`[INFO] File size: ${prompt.length} characters`);
  
  // 同时输出到控制台（可选）
  console.log('\n' + '='.repeat(80));
  console.log('GENERATED USER PROMPT:');
  console.log('='.repeat(80) + '\n');
  console.log(prompt.substring(0, 1000) + '\n...\n(truncated for display)');
  
  // 显示System Prompt信息
  const sysPrompt = getSystemPrompt();
  console.log('\n' + '='.repeat(80));
  console.log('SYSTEM PROMPT INFO:');
  console.log('='.repeat(80));
  console.log(`Length: ${sysPrompt.length} characters`);
  console.log('Available via getSystemPrompt() function');
}

// 如果直接运行此文件
// ES模块检测方式
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(console.error);
}
