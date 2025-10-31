import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { Prompter, getSystemPrompt, savePromptToLog } from './prompter/prompter.js';
import { getMCPClient } from './prompter/mcp-client.js';
import { c, fmt } from './utils/colors.js';
import pkg from 'pg';
const { Pool } = pkg;

// ES模块中定义__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载.env文件（在项目根目录）
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
  console.log('[INFO] Loaded .env from:', envPath);
} else {
  console.warn('[WARN] .env file not found at:', envPath);
}

/**
 * 对话消息接口
 */
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * AI响应接口
 */
interface AIResponse {
  reasoning: string;
  decisions: any;
  cot_trace_summary: string;
  raw_response: string;
  execution_results?: any[]; // 执行结果
}

/**
 * Agent配置
 */
interface AgentConfig {
  modelId: string;            // 模型ID（必需）
  maxHistoryLength: number;  // 保留的对话记录数量
  apiEndpoint?: string;       // AI API端点
  apiKey?: string;            // API密钥
  model?: string;             // 使用的模型
  intervalSeconds?: number;   // 请求间隔（秒），默认20秒
  bypassRiskControl?: boolean; // 是否绕过风险控制，完全交给AI决策
}

/**
 * Trading Agent
 * 负责生成prompt、调用AI、管理对话历史
 */
export class TradingAgent {
  private prompter: Prompter;
  private conversationHistory: Message[] = [];
  private config: AgentConfig;
  private logsDir: string;
  private mcpClient: any; // MCP客户端实例
  private dbPool: any; // 数据库连接池
  private cycleCount: number = 0; // 对话轮次计数

  // 日志辅助方法
  private log(message: string): void {
    console.log(`[${this.config.modelId}] ${message}`);
  }

  private warn(message: string): void {
    console.warn(`[${this.config.modelId}] ${message}`);
  }

  private error(message: string, error?: any): void {
    console.error(`[${this.config.modelId}] ${message}`, error || '');
  }

  constructor(config: Partial<AgentConfig> & { modelId: string }) {
    // 优先从环境变量读取配置
    const modelId = config.modelId || process.env.MODEL_ID;
    if (!modelId) {
      throw new Error('modelId is required in AgentConfig or MODEL_ID environment variable');
    }

    this.prompter = new Prompter(modelId); // 传递 modelId 以使用相同的 MCP 客户端
    this.mcpClient = getMCPClient(modelId); // 获取MCP客户端实例，传递 modelId
    this.config = {
      modelId,
      maxHistoryLength: config.maxHistoryLength || parseInt(process.env.MAX_HISTORY_LENGTH || '10'),
      apiEndpoint: config.apiEndpoint || process.env.AI_API_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions',
      apiKey: config.apiKey || process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
      model: config.model || process.env.AI_MODEL || 'deepseek-chat',
      intervalSeconds: config.intervalSeconds || parseInt(process.env.INTERVAL_SECONDS || '20'),
      bypassRiskControl: config.bypassRiskControl !== undefined 
        ? config.bypassRiskControl 
        : (process.env.BYPASS_RISK_CONTROL === 'true' || true),
    };

    this.log(`Initializing with API: ${this.config.apiEndpoint}`);

    // 初始化数据库连接
    this.dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ai_trading',
      user: process.env.DB_USER || 'OpenNof1',
      password: process.env.DB_PASSWORD || '',
    });

    // 设置logs目录
    const baseDir = __dirname.endsWith('build') 
      ? path.join(__dirname, '..', '..') 
      : path.join(__dirname, '..');
    this.logsDir = path.join(baseDir, 'agents', 'logs');

    // 确保logs目录存在
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // 初始化对话历史，添加system prompt
    const systemPrompt = getSystemPrompt();
    this.conversationHistory.push({
      role: 'system',
      content: systemPrompt,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 添加消息到对话历史
   */
  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // 保持历史记录在限制范围内（保留system prompt + 最近的N条）
    if (this.conversationHistory.length > this.config.maxHistoryLength + 1) {
      // 保留第一条（system prompt）和最后N条
      const systemMsg = this.conversationHistory[0];
      const recentMessages = this.conversationHistory.slice(-(this.config.maxHistoryLength));
      this.conversationHistory = [systemMsg, ...recentMessages];
    }
  }

  /**
   * 生成User Prompt
   */
  private async generateUserPrompt(
    elapsedMinutes: number,
    invocationCount: number
  ): Promise<string> {
    return await this.prompter.generatePrompt(elapsedMinutes, invocationCount);
  }

  /**
   * 调用AI API（使用DeepSeek的OpenAI兼容接口）
   */
  private async callAI(messages: Message[]): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('API key is not configured. Set DEEPSEEK_API_KEY in .env file or pass it in config.');
    }

    this.log(`Calling ${this.config.apiEndpoint} (${this.config.model})...`);

    const response = await fetch(this.config.apiEndpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 8000,  // DeepSeek支持更大的输出
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    
    // 记录token使用情况
    if (data.usage) {
      this.log(`Token usage - Prompt: ${data.usage.prompt_tokens}, Completion: ${data.usage.completion_tokens}, Total: ${data.usage.total_tokens}`);
    }

    return data.choices[0].message.content;
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(rawResponse: string): AIResponse {
    // 尝试提取JSON部分
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    
    let decisions = null;
    let cotTraceSummary = '';
    let reasoning = rawResponse;

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 新格式：{ decisions: {...}, cot_trace_summary: "..." }
        if (parsed.decisions) {
          decisions = parsed.decisions;
          cotTraceSummary = parsed.cot_trace_summary || '';
        } else {
          // 兼容旧格式：直接是币种决策
          decisions = parsed;
          cotTraceSummary = '';
        }
        
        // 提取JSON之前的部分作为推理过程
        const jsonStart = rawResponse.indexOf(jsonMatch[0]);
        reasoning = rawResponse.substring(0, jsonStart).trim();
        
        // 清理 reasoning：
        // 1. 去掉 "Phase 2: Execution Output" 及其后面的内容
        const phase2Index = reasoning.search(/###?\s*Phase 2[:\s]/i);
        if (phase2Index !== -1) {
          reasoning = reasoning.substring(0, phase2Index).trim();
        }
        
        // 2. 去掉开头的 "Phase 1:" 标题
        reasoning = reasoning.replace(/^###?\s*Phase 1[:\s][^\n]*\n*/i, '').trim();
        
      } catch (e) {
        this.warn('Failed to parse JSON from AI response: ' + e);
      }
    }

    return {
      reasoning,
      decisions,
      cot_trace_summary: cotTraceSummary,
      raw_response: rawResponse,
    };
  }

  /**
   * 执行AI决策
   * @returns 是否有失败的操作需要立即重试
   */
  private async executeDecisions(aiResponse: AIResponse): Promise<boolean> {
    if (!aiResponse.decisions) {
      this.warn('No decisions to execute');
      return false;
    }

    console.log(`\n${c.divider('=', 80)}`);
    console.log(c.title('EXECUTING TRADING DECISIONS'));
    console.log(c.divider('=', 80));

    const decisions = aiResponse.decisions;
    const coins = Object.keys(decisions);
    const executionResults: any[] = [];

    for (const coin of coins) {
      const decision = decisions[coin];
      const tradeArgs = decision.trade_signal_args;

      if (!tradeArgs) {
        this.warn(`No trade_signal_args for ${coin}, skipping`);
        executionResults.push({
          coin,
          success: false,
          error: 'No trade_signal_args',
        });
        continue;
      }

      const signal = tradeArgs.signal;
      const signalColor = signal === 'buy_to_enter' || signal === 'buy' || signal === 'open_long' ? c.long(signal) : 
                         signal === 'sell_to_enter' || signal === 'open_short' ? c.short(signal) : 
                         c.info(signal);
      console.log(`\n${c.divider('-', 40)}`);
      console.log(`${c.title('Processing')} ${c.coin(coin)}: ${signalColor}`);
      console.log(c.divider('-', 40));

      try {
        let result;
        switch (signal) {
          case 'buy':
          case 'buy_to_enter':
          case 'open_long':
          case 'sell_to_enter':
          case 'open_short':
            // 执行开仓操作（不在这里重试，让AI重新决策）
            result = await this.executeEntry(coin, tradeArgs, signal);
            
            executionResults.push({
              coin,
              signal,
              success: result?.success || false,
              message: result?.message,
              error: result?.error,
              warning: result?.warning,
            });
            break;

          case 'sell':
          case 'close_position':
            result = await this.executeClose(coin, tradeArgs);
            
            // 如果仓位不存在，视为成功（目标已达成）
            const isPositionNotFound = result?.error?.includes('Invalid position_id') || 
                                       result?.error?.includes('not found');
            const actualSuccess = result?.success || isPositionNotFound;
            
            if (isPositionNotFound) {
              this.warn(`${coin}: Position not found, treating as already closed`);
            }
            
            executionResults.push({
              coin,
              signal,
              success: actualSuccess,
              message: isPositionNotFound ? `Position already closed or not found` : result?.message,
              error: isPositionNotFound ? undefined : result?.error,
            });
            
            // 如果平仓成功，等待3秒让交易所释放保证金
            if (actualSuccess && !isPositionNotFound) {
              this.log(`${coin}: Position closed, waiting 3 seconds for margin to be released...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            break;

          case 'hold':
            // 检查是否真的有仓位，如果没有仓位则跳过
            const hasPosition = await this.checkIfPositionExists(coin);
            if (hasPosition) {
              this.log(`${coin}: Holding position, no action needed`);
              executionResults.push({
                coin,
                signal: 'hold',
                success: true,
                message: 'Position held',
              });
            } else {
              this.log(`${coin}: No position to hold, skipping`);
              // 不添加到 executionResults，因为这个操作没有意义
            }
            break;

          default:
            this.warn(`Unknown signal for ${coin}: ${signal}`);
            executionResults.push({
              coin,
              signal,
              success: false,
              error: `Unknown signal: ${signal}`,
            });
        }
      } catch (error) {
        this.error(`Failed to execute ${signal} for ${coin}:`, error);
        executionResults.push({
          coin,
          signal,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`\n${c.divider('=', 80)}`);
    console.log(c.title('EXECUTION COMPLETED'));
    console.log(c.divider('=', 80));
    
    // 检查是否有失败或警告的操作，如果有则立即反馈给AI
    const failedOperations = executionResults.filter(r => !r.success && r.signal !== 'hold');
    const warningOperations = executionResults.filter(r => r.success && r.warning && r.signal !== 'hold');
    
    if (failedOperations.length > 0 || warningOperations.length > 0) {
      const totalIssues = failedOperations.length + warningOperations.length;
      this.error(`${totalIssues} operation(s) have issues. Will trigger immediate retry...`);
      
      // 构建错误反馈消息
      const errorMessages: string[] = [];
      
      if (failedOperations.length > 0) {
        errorMessages.push('FAILURES:');
        failedOperations.forEach(op => {
          const errorStr = op.error || 'Unknown error';
          let suggestion = '';
          
          // 根据错误类型提供具体建议
          if (errorStr.includes('51202') || errorStr.includes('exceeds the maximum amount')) {
            suggestion = ' → SOLUTION: Reduce position size to less than $100 margin (or $50 for small coins like DOGE)';
          } else if (errorStr.includes('51008') || errorStr.includes('insufficient')) {
            suggestion = ' → SOLUTION: Use smaller position size (max $200 margin) or close other positions first';
          } else if (errorStr.includes('51279') || errorStr.includes('TP trigger price')) {
            suggestion = ' → SOLUTION: Set take profit price ABOVE current market price for longs';
          } else if (errorStr.includes('Invalid position_id') || errorStr.includes('not found')) {
            suggestion = ' → SOLUTION: Skip this operation, position may already be closed';
          }
          
          errorMessages.push(`- ${op.coin} ${op.signal}: ${errorStr.substring(0, 150)}${suggestion}`);
        });
      }
      
      if (warningOperations.length > 0) {
        errorMessages.push('\nWARNINGS (position opened but SL/TP failed):');
        warningOperations.forEach(op => {
          errorMessages.push(`- ${op.coin} ${op.signal}: ${op.warning}`);
        });
      }
      
      const feedbackMessage = `EXECUTION ISSUES - IMMEDIATE ACTION REQUIRED:\n${errorMessages.join('\n')}\n\nIMPORTANT: You MUST adjust your strategy NOW:\n1. For "exceeds maximum" errors: Use MUCH smaller position sizes (max $50-100 margin)\n2. For "insufficient funds": Reduce all position sizes to $100-200 margin maximum\n3. For SL/TP failures: Adjust prices based on CURRENT market price\n4. For "position not found": Skip that operation entirely\n\nDO NOT repeat the same parameters. Make significant changes or skip the operation.`;
      
      // 将错误反馈添加到对话历史
      this.addMessage('user', feedbackMessage);
      this.warn('Issue feedback added, will retry immediately');
      
      // 返回 true 表示需要立即重试
      return true;
    }
    
    // 没有失败或警告操作，返回 false
    return false;
  }

  /**
   * 执行开仓
   */
  private async executeEntry(
    coin: string,
    tradeArgs: any,
    signal: 'buy' | 'buy_to_enter' | 'open_long' | 'sell_to_enter' | 'open_short'
  ): Promise<any> {
    // console.log(`\n${c.divider()}`);
    // console.log(c.title(`[AGENT] Starting executeEntry for ${c.coin(coin)}`));
    // console.log(c.divider());
    
    // 将所有 action 映射到 MCP 支持的格式
    let action: string;
    if (signal === 'buy' || signal === 'buy_to_enter' || signal === 'open_long') {
      action = signal; // 保持原样，MCP 都支持
    } else if (signal === 'sell_to_enter' || signal === 'open_short') {
      action = signal; // 保持原样，MCP 都支持
    } else {
      action = signal;
    }
    
    const actionColor = (signal === 'buy' || signal === 'buy_to_enter' || signal === 'open_long') ? c.long(action) : c.short(action);
    console.log(`${c.info('[AGENT]')} Action: ${actionColor}`);
    
    // 计算保证金金额（基于风险和止损距离）
    const leverage = tradeArgs.leverage || 10;
    const riskUsd = tradeArgs.risk_usd || 100;
    
    console.log(`\n${c.info('[AGENT]')} ${c.title('AI Decision:')}`);
    console.log(`  - Leverage: ${fmt.leverage(leverage)}`);
    console.log(`  - Risk USD: ${fmt.usd(riskUsd)}`);
    console.log(`  - Stop Loss: ${c.price(tradeArgs.stop_loss)}`);
    console.log(`  - Profit Target: ${c.price(tradeArgs.profit_target)}`);
    
    // 获取当前价格和止损价格
    const currentPrice = tradeArgs.quantity ? 
      (tradeArgs.quantity * (tradeArgs.stop_loss + tradeArgs.profit_target) / 2) / tradeArgs.quantity : 
      (tradeArgs.stop_loss + tradeArgs.profit_target) / 2;
    
    const stopLoss = tradeArgs.stop_loss;
    
    // 计算止损距离（百分比）
    const stopDistance = Math.abs(currentPrice - stopLoss) / currentPrice;
    
    // 根据风险金额反推仓位大小
    const positionSize = riskUsd / stopDistance;
    
    // 计算需要的保证金
    const marginAmount = positionSize / leverage;
    
    console.log(`\n${c.info('[AGENT]')} ${c.title('Calculated Position Sizing:')}`);
    console.log(`  - Current Price: ${fmt.usd(currentPrice)}`);
    console.log(`  - Stop Distance: ${fmt.percent(stopDistance)}`);
    console.log(`  - Position Size: ${fmt.usd(positionSize)}`);
    console.log(`  - Required Margin: ${fmt.usd(marginAmount)}`);
    console.log(`  - Leverage: ${fmt.leverage(leverage)}`);
    
    if (this.config.bypassRiskControl) {
      this.warn('Risk control bypassed - AI has full control');
    }

    console.log(`\n${c.info('[AGENT]')} ${c.title('Sending to MCP Client:')}`);
    console.log(`  - action: ${actionColor}`);
    console.log(`  - coin: ${coin}`);
    console.log(`  - leverage: ${leverage}`);
    console.log(`  - margin_amount: ${marginAmount}`);

    const result = await this.mcpClient.executeTrade({
      action,
      coin,
      leverage,
      margin_amount: marginAmount,
      exit_plan: {
        profit_target: tradeArgs.profit_target,
        stop_loss: tradeArgs.stop_loss,
        invalidation: tradeArgs.invalidation_condition,
      },
      confidence: tradeArgs.confidence,
      bypass_risk_check: this.config.bypassRiskControl,  // 传递绕过风险检查的标志
    });

    if (result.success) {
      console.log(c.success(`✓ ${coin}: ${result.message || 'Position opened'}`));
    } else {
      console.log(c.error(`✗ ${coin}: ${result.error || result.message || 'Position failed'}`));
    }
    // console.log(`${c.info('[INFO]')} Result:`, JSON.stringify(result, null, 2));
    
    return result;
  }

  /**
   * 执行平仓
   * MCP 会根据 coin 自动从数据库查找 position_id
   */
  private async executeClose(coin: string, tradeArgs: any): Promise<any> {
    console.log(`${c.info('[INFO]')} ${c.coin(coin)}: Closing position`);
    console.log(`${c.info('[INFO]')}   Quantity: ${c.price(tradeArgs.quantity)}`);

    // 直接发送平仓请求，MCP 会根据 coin 查找 position_id
    const result = await this.mcpClient.executeTrade({
      action: 'close_position',
      coin,
      bypass_risk_check: this.config.bypassRiskControl,
    });

    if (result.success) {
      console.log(c.success(`✓ ${coin}: ${result.message || 'Position closed'}`));
    } else {
      console.log(c.error(`✗ ${coin}: ${result.error || result.message || 'Close failed'}`));
    }
    // console.log(`${c.info('[INFO]')} Result:`, JSON.stringify(result, null, 2));
    
    return result;
  }

  /**
   * 检查是否存在指定币种的仓位
   */
  private async checkIfPositionExists(coin: string): Promise<boolean> {
    try {
      const accountState = await this.mcpClient.getAccountState({
        include_positions: true,
        include_performance: false,
        include_history: false
      });
      
      if (!accountState.active_positions || accountState.active_positions.length === 0) {
        return false;
      }
      
      return accountState.active_positions.some((pos: any) => pos.coin === coin);
    } catch (error) {
      console.error(`[ERROR] Failed to check position for ${coin}:`, error);
      return false; // 出错时假设没有仓位
    }
  }

  /**
   * 保存响应到日志
   */
  private saveResponse(
    userPrompt: string,
    aiResponse: AIResponse,
    elapsedMinutes: number,
    invocationCount: number
  ): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `agent_response_${timestamp}.json`;
    const filepath = path.join(this.logsDir, filename);

    const logData = {
      timestamp: new Date().toISOString(),
      elapsed_minutes: elapsedMinutes,
      invocation_count: invocationCount,
      user_prompt_length: userPrompt.length,
      ai_response: aiResponse,
      conversation_history_length: this.conversationHistory.length,
    };

    fs.writeFileSync(filepath, JSON.stringify(logData, null, 2), 'utf-8');
    console.log(`[INFO] Response saved to: ${filepath}`);

    return filepath;
  }

  /**
   * 保存对话记录到数据库
   */
  private async saveConversationToDatabase(
    userPrompt: string,
    aiResponse: AIResponse,
    cycleId: number
  ): Promise<void> {
    try {
      // 获取当前账户状态，用于填充 hold 操作的实际数量
      let accountState;
      try {
        accountState = await this.mcpClient.getAccountState({
          include_positions: true,
          include_performance: false,
          include_history: false
        });
      } catch (error) {
        console.warn('[DB] Failed to fetch account state for hold quantity update');
      }

      // 深拷贝 decisions，避免修改原始对象
      const decisionsToSave = JSON.parse(JSON.stringify(aiResponse.decisions || {}));
      
      // 更新 hold 操作的 quantity 为实际仓位数量
      if (accountState?.active_positions) {
        for (const coin in decisionsToSave) {
          const decision = decisionsToSave[coin];
          if (decision?.trade_signal_args?.signal === 'hold') {
            const position = accountState.active_positions.find((pos: any) => pos.coin === coin);
            if (position) {
              decision.trade_signal_args.quantity = position.quantity;
              console.log(`[DB] Updated hold quantity for ${coin}: ${position.quantity}`);
            }
          }
        }
      }

      const client = await this.dbPool.connect();
      try {
        const conversationId = `${this.config.modelId}_${cycleId}`;
        const insertedAt = Math.floor(Date.now() / 1000);

        await client.query(
          `INSERT INTO agent_conversations (
            id, model_id, cycle_id, user_prompt, llm_response, cot_trace, cot_trace_summary, inserted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            user_prompt = $4,
            llm_response = $5,
            cot_trace = $6,
            cot_trace_summary = $7,
            inserted_at = $8`,
          [
            conversationId,
            this.config.modelId,
            cycleId,
            userPrompt,
            JSON.stringify(decisionsToSave),
            JSON.stringify(aiResponse.reasoning || ''),  // 将文本包装成 JSON 字符串
            aiResponse.cot_trace_summary,
            insertedAt
          ]
        );

        console.log(`[DB] ✓ Conversation saved: ${conversationId}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[DB] Failed to save conversation:', error);
    }
  }

  /**
   * 执行一次交易决策
   */
  async makeTradingDecision(
    elapsedMinutes: number,
    invocationCount: number
  ): Promise<AIResponse> {
    console.log('');
    console.log('='.repeat(80));
    this.log(`Starting Trading Decision #${invocationCount}`);
    console.log('='.repeat(80));
    this.log(`Elapsed minutes: ${elapsedMinutes}`);

    // 0. 显示当前账户状态
    try {
      const accountState = await this.mcpClient.getAccountState({
        include_positions: true,
        include_performance: false,
        include_history: false
      });
      
      // 调试日志：查看返回的原始数据
      // console.error('[AGENT-DEBUG] accountState BEFORE:', JSON.stringify(accountState, null, 2));
      
      console.log(`\n${c.divider('=', 80)}`);
      console.log(c.title('ACCOUNT STATUS - BEFORE TRADING'));
      console.log(c.divider('=', 80));
      
      const availableCash = accountState.available_cash ?? 0;
      const accountValue = accountState.account_value ?? 0;
      const totalPnl = accountState.total_pnl ?? 0;
      const pnlColor = totalPnl >= 0 ? c.success : c.error;
      
      console.log(`Available Cash:    ${c.success(fmt.usd(availableCash))}`);
      console.log(`Account Value:     ${c.info(fmt.usd(accountValue))}`);
      console.log(`Total PnL:         ${pnlColor(fmt.usd(totalPnl))}`);
      console.log(`Active Positions:  ${c.info(String(accountState.active_positions?.length || 0))}`);
      
      if (accountState.active_positions && accountState.active_positions.length > 0) {
        console.log(`\n${c.title('Current Positions:')}`);
        accountState.active_positions.forEach((pos: any) => {
          const sideColor = pos.side === 'long' ? c.long : c.short;
          const pnlColor = (pos.unrealized_pnl ?? 0) >= 0 ? c.success : c.error;
          const pnlText = pos.unrealized_pnl ? pnlColor(fmt.usd(pos.unrealized_pnl)) : c.gray('N/A');
          
          console.log(`  ${c.coin(pos.coin)}: ${sideColor(pos.side)} ${c.price(pos.quantity)} @ ${fmt.usd(pos.entry_price)}`);
          console.log(`    Margin: ${fmt.usd(pos.margin ?? 0)} | Leverage: ${fmt.leverage(pos.leverage ?? 1)} | PnL: ${pnlText}`);
        });
      }
      
      console.log(c.divider('=', 80));
    } catch (error) {
      console.warn(c.warn('[WARN] Failed to fetch account info:'), error);
    }

    // 1. 生成User Prompt
    console.log(`\n${c.info('[INFO]')} Generating user prompt...`);
    const userPrompt = await this.generateUserPrompt(elapsedMinutes, invocationCount);
    console.log(`${c.info('[INFO]')} User prompt generated: ${userPrompt.length} characters`);

    // 1.5 保存 Prompt 到日志文件
    try {
      const cycleId = Math.floor(invocationCount);
      savePromptToLog(userPrompt, cycleId, this.config.modelId);
    } catch (error) {
      console.warn(c.warn('[WARN] Failed to save prompt to log:'), error);
    }

    // 2. 添加到对话历史
    this.addMessage('user', userPrompt);

    // 3. 调用AI
    console.log(`${c.info('[INFO]')} Calling AI API...`);
    const rawResponse = await this.callAI(this.conversationHistory);
    console.log(`${c.info('[INFO]')} AI response received: ${rawResponse.length} characters`);

    // 4. 添加AI响应到历史
    this.addMessage('assistant', rawResponse);

    // 5. 解析响应
    const parsedResponse = this.parseAIResponse(rawResponse);

    // 6. 账户信息已在开始时显示，这里不再重复

    // 7. 执行AI决策
    const hasFailures = await this.executeDecisions(parsedResponse);

    // 7.5 如果有失败操作，立即触发重试（不等待定时器）
    if (hasFailures) {
      console.log(c.warn('\n[WARN] Detected failures, triggering immediate retry in 2 seconds...'));
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 获取当前账户状态并添加到反馈中
      try {
        const currentState = await this.mcpClient.getAccountState({
          include_positions: true,
          include_performance: false,
          include_history: false
        });
        
        const contextMessage = `CURRENT ACCOUNT STATUS (for retry):\n- Available Cash: $${(currentState.available_cash ?? 0).toFixed(2)}\n- Active Positions: ${currentState.active_positions?.length || 0}\n- Account Value: $${(currentState.account_value ?? 0).toFixed(2)}\n\nREMINDER: Use conservative position sizes. For testing, use $50-100 margin per position.`;
        this.addMessage('user', contextMessage);
        console.log(c.info('[INFO] Added current account context for retry'));
      } catch (error) {
        console.warn(c.warn('[WARN] Failed to fetch account state for retry context'));
      }
      
      // 递归调用自己，立即重新决策
      console.log(c.info('\n[INFO] Starting immediate retry decision...'));
      return await this.makeTradingDecision(elapsedMinutes, invocationCount + 0.5);
    }

    // 8. 交易完成后再次显示账户信息
    try {
      const accountStateAfter = await this.mcpClient.getAccountState({
        include_positions: true,
        include_performance: false,
        include_history: false
      });
      
      // 调试日志：查看返回的原始数据
      // console.error('[AGENT-DEBUG] accountStateAfter:', JSON.stringify(accountStateAfter, null, 2));
      
      console.log(`\n${c.divider('=', 80)}`);
      console.log(c.title('ACCOUNT STATUS - AFTER TRADING'));
      console.log(c.divider('=', 80));
      
      const availableCash = accountStateAfter.available_cash ?? 0;
      const accountValue = accountStateAfter.account_value ?? 0;
      const totalPnl = accountStateAfter.total_pnl ?? 0;
      const pnlColor = totalPnl >= 0 ? c.success : c.error;
      
      console.log(`Available Cash:    ${c.success(fmt.usd(availableCash))}`);
      console.log(`Account Value:     ${c.info(fmt.usd(accountValue))}`);
      console.log(`Total PnL:         ${pnlColor(fmt.usd(totalPnl))}`);
      console.log(`Active Positions:  ${c.info(String(accountStateAfter.active_positions?.length || 0))}`);
      
      if (accountStateAfter.active_positions && accountStateAfter.active_positions.length > 0) {
        accountStateAfter.active_positions.forEach((pos: any) => {
          const sideColor = pos.side === 'long' ? c.long : c.short;
          const pnlColor = (pos.unrealized_pnl ?? 0) >= 0 ? c.success : c.error;
          const pnlText = pos.unrealized_pnl ? pnlColor(fmt.usd(pos.unrealized_pnl)) : c.gray('N/A');
          
          console.log(`  ${c.coin(pos.coin)}: ${sideColor(pos.side)} ${c.price(pos.quantity)} @ ${fmt.usd(pos.entry_price)}, Margin: ${fmt.usd(pos.margin ?? 0)}, PnL: ${pnlText}`);
        });
      }
      console.log(c.divider('=', 80));
    } catch (error) {
      console.warn(c.warn('[WARN] Failed to fetch account info after trading:'), error);
    }

    // 9. 保存到日志
    this.saveResponse(userPrompt, parsedResponse, elapsedMinutes, invocationCount);

    // 10. 保存对话记录到数据库
    this.cycleCount++;
    await this.saveConversationToDatabase(userPrompt, parsedResponse, this.cycleCount);

    console.log(c.info('[INFO] Trading decision completed'));
    return parsedResponse;
  }

  /**
   * 获取对话历史
   */
  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * 清除对话历史（保留system prompt）
   */
  clearHistory(): void {
    const systemMsg = this.conversationHistory[0];
    this.conversationHistory = [systemMsg];
    this.log('Conversation history cleared');
  }

  /**
   * 获取配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}

// 使用示例
async function main() {
  // 创建agent实例（配置从环境变量读取）
  const agent = new TradingAgent({
    modelId: process.env.MODEL_ID || 'deepseek-chat-v3.1',  // 从环境变量读取
    // 其他配置也会从环境变量读取，这里可以不传
  });

  // 计算已交易时长
  const startTime = new Date('2025-10-28 12:00:00');
  let invocationCount = 0;

  // 定时执行交易决策
  const runTradingCycle = async () => {
    invocationCount++;
    const now = new Date();
    const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);

    try {
      // 执行交易决策
      const response = await agent.makeTradingDecision(elapsedMinutes, invocationCount);

      console.log(`\n${c.divider()}`);
      console.log(c.title(`[${new Date().toISOString()}] Trading Decision #${invocationCount}`));
      console.log(c.divider());

      if (response.cot_trace_summary) {
        console.log(`\n${c.title('[Strategy Summary]')}`);
        console.log(c.gray(response.cot_trace_summary));
      }

      if (response.decisions) {
        console.log(`\n${c.title('[Decisions]')}`);
        const coins = Object.keys(response.decisions);
        coins.forEach(coin => {
          const decision = response.decisions[coin];
          const args = decision.trade_signal_args;
          if (!args) return;

          const signalColor = args.signal === 'buy_to_enter' ? c.long(args.signal.toUpperCase()) : 
                             args.signal === 'sell_to_enter' ? c.short(args.signal.toUpperCase()) : 
                             c.info(args.signal.toUpperCase());
          console.log(`\n  ${c.coin(coin)}: ${signalColor}`);
          
          // 显示详细信息
          if (args.signal !== 'hold') {
            console.log(`    Quantity: ${c.price(args.quantity)}`);
            console.log(`    Leverage: ${fmt.leverage(args.leverage)}`);
            console.log(`    Profit Target: ${c.price(args.profit_target)}`);
            console.log(`    Stop Loss: ${c.price(args.stop_loss)}`);
            console.log(`    Confidence: ${c.percent(args.confidence)}`);
            console.log(`    Risk USD: ${fmt.usd(args.risk_usd)}`);
          }
          
          // 显示理由（如果有）
          if (decision.justification) {
            console.log(`    ${c.gray('Reason:')} ${decision.justification}`);
          }
        });
      }

      if (response.execution_results) {
        console.log(`\n${c.title('[Execution Results]')}`);
        response.execution_results.forEach((result: any) => {
          if (result.success) {
            console.log(`  ${c.success('[SUCCESS]')} ${c.coin(result.coin)}: ${result.message || 'Completed'}`);
          } else {
            console.log(`  ${c.error('[FAILED]')} ${c.coin(result.coin)}: ${result.error || result.message || 'Failed'}`);
          }
        });
      }

      console.log(c.divider() + '\n');

    } catch (error) {
      console.error(c.error('[ERROR] Failed to make trading decision:'), error);
    }
  };

  // 立即执行第一次
  await runTradingCycle();

  // 设置定时器
  const intervalMs = agent.getConfig().intervalSeconds! * 1000;
  console.log(c.info(`[INFO] Agent will run every ${agent.getConfig().intervalSeconds} seconds. Press Ctrl+C to stop.\n`));
  
  setInterval(runTradingCycle, intervalMs);
}

// 如果直接运行此文件
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(console.error);
}

// 导出 TradingAgent 类供 main.ts 使用
export default TradingAgent;
