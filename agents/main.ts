/**
 * 多 Agent 启动入口
 * 支持同时运行多个 AI Trading Agents
 * 
 * 配置架构：
 * - 全局配置：项目根目录 .env（API Keys、数据库等共享配置）
 * - Agent 配置：profiles/*.env（每个 Agent 的独立配置）
 * - 启用控制：通过 ENABLED_AGENTS 环境变量指定要启动的配置文件
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config as dotenvConfig } from 'dotenv';
import TradingAgent from './agent.js';
import { c } from './utils/colors.js';
import pkg from 'pg';
const { Pool } = pkg;

// ES模块中定义__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 项目根目录
// 使用 tsx 直接运行时: agents/main.ts -> 向上1级到项目根
// 编译后运行时: agents/build/main.js -> 向上2级到项目根
const projectRoot = __dirname.includes('/build/')
  ? path.join(__dirname, '..', '..')
  : path.join(__dirname, '..');

// 数据库连接池（用于读取启动时间）
let dbPool: typeof Pool.prototype | null = null;

/**
 * Agent 配置接口
 */
interface AgentProfile {
  profilePath: string;  // 配置文件完整路径
  modelId: string;      // Agent ID
  modelName: string;    // Agent 显示名称
  provider: string;     // AI 提供商
  model: string;        // AI 模型
  apiKey: string;       // API Key
  apiUrl: string;       // API URL
  config: Record<string, string>; // 完整配置
}

/**
 * AI 提供商到 API Key 和 URL 的映射
 */
const PROVIDER_CONFIG: Record<string, { keyEnv: string; urlEnv: string; defaultUrl: string }> = {
  deepseek: {
    keyEnv: 'DEEPSEEK_API_KEY',
    urlEnv: 'DEEPSEEK_API_URL',
    defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  openai: {
    keyEnv: 'OPENAI_API_KEY',
    urlEnv: 'OPENAI_API_URL',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
  },
  anthropic: {
    keyEnv: 'ANTHROPIC_API_KEY',
    urlEnv: 'ANTHROPIC_API_URL',
    defaultUrl: 'https://api.anthropic.com/v1/messages',
  },
  google: {
    keyEnv: 'GOOGLE_API_KEY',
    urlEnv: 'GOOGLE_API_URL',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
  },
  xai: {
    keyEnv: 'XAI_API_KEY',
    urlEnv: 'XAI_API_URL',
    defaultUrl: 'https://api.x.ai/v1/chat/completions',
  },
  qwen: {
    keyEnv: 'QWEN_API_KEY',
    urlEnv: 'QWEN_API_URL',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  },
  openrouter: {
    keyEnv: 'OPENROUTER_API_KEY',
    urlEnv: 'OPENROUTER_API_URL',
    defaultUrl: 'https://openrouter.ai/api/v1/chat/completions',
  },
};

/**
 * 加载并解析 Agent 配置文件
 */
function loadAgentProfile(profilePath: string): AgentProfile | null {
  const fullPath = path.join(projectRoot, profilePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(c.warn(`[Main] ⚠️  配置文件不存在: ${profilePath}`));
    return null;
  }

  try {
    // 读取配置文件
    const configContent = fs.readFileSync(fullPath, 'utf-8');
    const config: Record<string, string> = {};
    
    // 解析环境变量
    configContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          // 移除引号
          value = value.replace(/^["']|["']$/g, '');
          config[key] = value;
        }
      }
    });

    // 验证必需字段
    if (!config.MODEL_ID) {
      console.log(c.warn(`[Main] ⚠️  ${profilePath} 缺少 MODEL_ID`));
      return null;
    }

    if (!config.MODEL_NAME) {
      console.log(c.warn(`[Main] ⚠️  ${profilePath} 缺少 MODEL_NAME`));
      return null;
    }

    if (!config.AI_PROVIDER) {
      console.log(c.warn(`[Main] ⚠️  ${profilePath} 缺少 AI_PROVIDER`));
      return null;
    }

    if (!config.AI_MODEL) {
      console.log(c.warn(`[Main] ⚠️  ${profilePath} 缺少 AI_MODEL`));
      return null;
    }

    // 获取 AI 提供商配置
    const provider = config.AI_PROVIDER.toLowerCase();
    const providerConfig = PROVIDER_CONFIG[provider];
    
    if (!providerConfig) {
      console.log(c.warn(`[Main] ⚠️  不支持的 AI 提供商: ${config.AI_PROVIDER}`));
      return null;
    }

    // 获取 API Key（优先使用配置文件中的，否则使用全局配置）
    let apiKey = config.AI_API_KEY;
    if (!apiKey || apiKey.startsWith('your-')) {
      apiKey = process.env[providerConfig.keyEnv] || '';
    }

    if (!apiKey || apiKey.startsWith('your-')) {
      console.log(c.warn(`[Main] ⚠️  ${profilePath} 的 API Key 未配置`));
      console.log(c.info(`[Main]     请在配置文件中设置 AI_API_KEY 或在全局 .env 中设置 ${providerConfig.keyEnv}`));
      return null;
    }

    // 获取 API URL（优先使用配置文件中的，否则使用全局配置或默认值）
    let apiUrl = config.AI_API_URL;
    if (!apiUrl) {
      apiUrl = process.env[providerConfig.urlEnv] || providerConfig.defaultUrl;
    }

    console.log(c.success(`[Main] ✓ 加载配置: ${config.MODEL_NAME} (${config.MODEL_ID})`));
    console.log(c.info(`[Main]   提供商: ${config.AI_PROVIDER}, 模型: ${config.AI_MODEL}`));

    return {
      profilePath,
      modelId: config.MODEL_ID,
      modelName: config.MODEL_NAME,
      provider: config.AI_PROVIDER,
      model: config.AI_MODEL,
      apiKey,
      apiUrl,
      config,
    };
  } catch (error) {
    console.error(c.error(`[Main] ✗ 加载配置出错: ${profilePath}`), error);
    return null;
  }
}

/**
 * 启动单个 Agent
 */
async function startAgent(profile: AgentProfile): Promise<void> {
  console.log('');
  console.log(c.divider('=', 80));
  console.log(c.title(`启动 Agent: ${profile.modelName}`));
  console.log(c.divider('=', 80));

  try {
    // 设置环境变量供 Agent 使用
    process.env.MODEL_ID = profile.modelId;
    process.env.MODEL_NAME = profile.modelName;
    process.env.AI_API_ENDPOINT = profile.apiUrl;
    process.env.AI_API_KEY = profile.apiKey;
    process.env.AI_MODEL = profile.model;
    
    // 设置其他配置（只有非空值才覆盖全局配置）
    if (profile.config.INTERVAL_SECONDS) {
      process.env.INTERVAL_SECONDS = profile.config.INTERVAL_SECONDS;
    }
    if (profile.config.MAX_HISTORY_LENGTH) {
      process.env.MAX_HISTORY_LENGTH = profile.config.MAX_HISTORY_LENGTH;
    }
    if (profile.config.BYPASS_RISK_CONTROL) {
      process.env.BYPASS_RISK_CONTROL = profile.config.BYPASS_RISK_CONTROL;
    }
    
    // 交易所配置（只有非空值才覆盖全局配置）
    if (profile.config.EXCHANGE) {
      process.env.EXCHANGE = profile.config.EXCHANGE;
    }
    if (profile.config.TRADING_MODE) {
      process.env.TRADING_MODE = profile.config.TRADING_MODE;
    }
    if (profile.config.OKX_API_KEY) {
      process.env.OKX_API_KEY = profile.config.OKX_API_KEY;
    }
    if (profile.config.OKX_API_SECRET) {
      process.env.OKX_API_SECRET = profile.config.OKX_API_SECRET;
    }
    if (profile.config.OKX_API_PASSWORD) {
      process.env.OKX_API_PASSWORD = profile.config.OKX_API_PASSWORD;
    }
    if (profile.config.OKX_USE_SANDBOX !== undefined && profile.config.OKX_USE_SANDBOX !== '') {
      process.env.OKX_USE_SANDBOX = profile.config.OKX_USE_SANDBOX;
    }

    // 创建 Agent 实例
    const agent = new TradingAgent({
      modelId: profile.modelId,
      // 其他配置从环境变量读取
    });

    console.log(c.info(`[${profile.modelId}] Agent 初始化完成`));

    // 从数据库获取交易会话启动时间
    let sessionStartTimestamp: number;
    try {
      if (!dbPool) {
        throw new Error('Database pool not initialized');
      }
      const client = await dbPool.connect();
      try {
        const result = await client.query(
          'SELECT session_start_time FROM trading_session ORDER BY id LIMIT 1'
        );
        
        if (result.rows.length > 0) {
          sessionStartTimestamp = parseInt(result.rows[0].session_start_time);
          console.log(c.success(`[${profile.modelId}] ✓ 使用数据库中的启动时间: ${new Date(sessionStartTimestamp * 1000).toISOString()}`));
        } else {
          // 数据库中没有记录，使用当前时间并保存
          sessionStartTimestamp = Math.floor(Date.now() / 1000);
          await client.query(
            'INSERT INTO trading_session (session_start_time) VALUES ($1)',
            [sessionStartTimestamp]
          );
          console.log(c.success(`[${profile.modelId}] ✓ 初始化启动时间: ${new Date(sessionStartTimestamp * 1000).toISOString()}`));
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(c.error(`[${profile.modelId}] ✗ 获取启动时间失败，使用默认值:`), error);
      sessionStartTimestamp = Math.floor(new Date('2025-10-28 12:00:00').getTime() / 1000);
    }

    let invocationCount = 0;

    // 定时执行交易决策
    const runTradingCycle = async () => {
      invocationCount++;
      const now = Date.now();
      const elapsedMinutes = Math.floor((now / 1000 - sessionStartTimestamp) / 60);

      try {
        console.log(c.info(`\n[${profile.modelId}] 开始第 ${invocationCount} 次决策...`));
        await agent.makeTradingDecision(elapsedMinutes, invocationCount);
        console.log(c.success(`[${profile.modelId}] ✓ 第 ${invocationCount} 次决策完成`));
      } catch (error) {
        console.error(c.error(`[${profile.modelId}] ✗ 决策失败:`), error);
      }
    };

    // 设置定时器（不立即执行，避免阻塞其他 Agent 启动）
    const intervalMs = agent.getConfig().intervalSeconds! * 1000;
    console.log(c.info(`[${profile.modelId}] 将每 ${agent.getConfig().intervalSeconds} 秒执行一次`));
    
    // 延迟执行第一次决策，让所有 Agents 都能启动
    setTimeout(() => {
      runTradingCycle(); // 立即执行第一次
      setInterval(runTradingCycle, intervalMs); // 然后定时执行
    }, 2000); // 2秒后开始

  } catch (error) {
    console.error(c.error(`[Main] ✗ 启动 ${profile.modelName} 失败:`), error);
  }
}

/**
 * 主函数 - 启动所有 Agents
 */
async function main() {
  console.log('');
  console.log(c.divider('=', 80));
  console.log(c.title('🤖 AI Trading Multi-Agent System'));
  console.log(c.divider('=', 80));
  console.log('');

  // 加载项目根目录的 .env（全局配置）
  const rootEnvPath = path.join(projectRoot, '.env');
  if (fs.existsSync(rootEnvPath)) {
    dotenvConfig({ path: rootEnvPath });
    console.log(c.success('[Main] ✓ 加载全局配置 .env'));
  } else {
    console.log(c.warn('[Main] ⚠️  未找到全局配置文件 .env'));
    console.log(c.info('[Main]     请复制 .env.example 为 .env 并配置'));
  }

  // 初始化数据库连接
  try {
    dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'nof1',
      user: process.env.DB_USER || 'OpenNof1',
      password: process.env.DB_PASSWORD || '',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    console.log(c.success('[Main] ✓ 数据库连接初始化成功'));
  } catch (error) {
    console.error(c.error('[Main] ✗ 数据库连接初始化失败:'), error);
    console.log(c.warn('[Main] ⚠️  将使用默认启动时间'));
  }

  // 获取启用的 Agent 列表
  const enabledAgentsStr = process.env.ENABLED_AGENTS || '';
  if (!enabledAgentsStr) {
    console.log(c.error('[Main] ✗ 未配置 ENABLED_AGENTS'));
    console.log(c.info('[Main]     请在 .env 中设置 ENABLED_AGENTS'));
    console.log(c.info('[Main]     示例: ENABLED_AGENTS=profiles/deepseek-trader.env,profiles/gpt5-trader.env'));
    process.exit(1);
  }

  // 解析 Agent 配置文件列表
  const profilePaths = enabledAgentsStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  console.log(c.info(`[Main] 发现 ${profilePaths.length} 个配置文件:`));
  profilePaths.forEach(p => {
    console.log(c.info(`  - ${p}`));
  });
  console.log('');

  // 加载所有 Agent 配置
  const profiles: AgentProfile[] = [];
  for (const profilePath of profilePaths) {
    const profile = loadAgentProfile(profilePath);
    if (profile) {
      profiles.push(profile);
    }
  }

  if (profiles.length === 0) {
    console.log(c.error('[Main] ✗ 没有有效的 Agent 配置'));
    console.log(c.info('[Main]     请检查配置文件是否存在且配置正确'));
    process.exit(1);
  }

  console.log('');
  console.log(c.success(`[Main] 成功加载 ${profiles.length} 个 Agent 配置`));
  console.log('');

  // 启动所有 Agents（并行启动，不等待）
  console.log(c.info('[Main] 开始启动 Agents...'));

  // 使用 Promise.all 并行启动所有 Agents，但不等待它们的执行
  const startPromises = profiles.map(async (profile, index) => {
    try {
      // 为每个 Agent 添加延迟，避免同时初始化
      await new Promise(resolve => setTimeout(resolve, index * 1000));
      await startAgent(profile);
    } catch (error) {
      console.error(c.error(`[Main] ✗ 启动 ${profile.modelName} 时出错:`), error);
    }
  });

  // 不等待 startAgent 完成，让它们在后台运行
  // 只等待初始化完成
  await Promise.all(startPromises.map(p => 
    Promise.race([
      p,
      new Promise(resolve => setTimeout(resolve, 5000)) // 最多等5秒
    ])
  ));

  console.log('');
  console.log(c.divider('=', 80));
  console.log(c.success(`✓ 所有 Agents 已启动 (${profiles.length} 个)`));
  console.log(c.divider('=', 80));
  console.log('');
  console.log(c.info('提示:'));
  console.log(c.info('  - 按 Ctrl+C 停止所有 Agents'));
  console.log(c.info('  - 查看日志: agents/logs/'));
  console.log(c.info('  - 查看数据库: psql -d ai_trading -c "SELECT * FROM agent_conversations;"'));
  console.log('');
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('');
  console.log(c.warn('[Main] 收到停止信号，正在关闭所有 Agents...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log(c.warn('[Main] 收到终止信号，正在关闭所有 Agents...'));
  process.exit(0);
});

// 启动
main().catch(error => {
  console.error(c.error('[Main] ✗ 启动失败:'), error);
  process.exit(1);
});
