import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES模块中定义__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * MCP客户端 - 连接到NOF1 Trading Server
 */
export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;
  private agentName: string;

  constructor(agentName: string = 'default') {
    this.agentName = agentName;
    this.client = new Client(
      {
        name: 'prompter-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  /**
   * 连接到MCP服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // 启动MCP服务器进程
    // 优先使用环境变量中的路径
    let serverPath = process.env.MCP_SERVER_PATH;
    let useTs = false;
    
    // 获取项目根目录
    const baseDir = __dirname.includes('/build/') 
      ? path.join(__dirname, '..', '..', '..') 
      : path.join(__dirname, '..', '..');
    
    if (!serverPath) {
      // 如果没有环境变量，根据当前目录推断
      // 优先使用 TypeScript 源文件（通过 tsx 运行）
      const tsPath = path.join(baseDir, 'mcp/src/index.ts');
      const jsPath = path.join(baseDir, 'mcp/dist/index.js');
      
      if (fs.existsSync(tsPath)) {
        serverPath = tsPath;
        useTs = true;
        console.log(`[MCP] 使用 TypeScript 源文件: ${serverPath}`);
      } else if (fs.existsSync(jsPath)) {
        serverPath = jsPath;
        console.log(`[MCP] 使用编译后的 JS 文件: ${serverPath}`);
      } else {
        throw new Error(`MCP 服务器文件不存在: ${tsPath} 或 ${jsPath}`);
      }
    } else {
      // 如果是相对路径，转换为绝对路径（基于项目根目录）
      if (!path.isAbsolute(serverPath)) {
        serverPath = path.resolve(baseDir, serverPath);
      }
      
      console.log(`[MCP] 使用环境变量路径: ${serverPath}`);
      useTs = serverPath.endsWith('.ts');
      
      // 验证文件是否存在
      if (!fs.existsSync(serverPath)) {
        throw new Error(`MCP 服务器文件不存在: ${serverPath}`);
      }
    }

    // 创建stdio传输（会自动启动服务器进程）
    // 将 agent 名称作为参数传递给 MCP 服务器
    this.transport = new StdioClientTransport({
      command: useTs ? 'tsx' : 'node',
      args: [serverPath, this.agentName],
    });
    
    console.log(`[MCP] Starting MCP server for agent: ${this.agentName}`);

    // 连接客户端
    await this.client.connect(this.transport);
    this.isConnected = true;

    console.log('[INFO] Connected to MCP Trading Server');
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      this.isConnected = false;
      console.log('[INFO] Disconnected from MCP Trading Server');
    }
  }

  /**
   * 调用MCP工具
   */
  async callTool(toolName: string, params: any): Promise<any> {
    // 确保已连接（但不会重复连接，因为connect方法有检查）
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: params,
      });

      // 解析返回的内容
      const content = result.content as any[];
      // console.error(`[MCP-CLIENT-DEBUG] Tool ${toolName} returned content:`, content?.length, 'items');
      
      if (content && content.length > 0) {
        const firstContent = content[0];
        // console.error(`[MCP-CLIENT-DEBUG] First content type:`, firstContent.type);
        // console.error(`[MCP-CLIENT-DEBUG] Text type:`, typeof firstContent.text);
        
        if (firstContent.type === 'text') {
          // 尝试解析JSON，如果已经是对象则直接返回
          try {
            const result = typeof firstContent.text === 'string' 
              ? JSON.parse(firstContent.text) 
              : firstContent.text;
            // console.error(`[MCP-CLIENT-DEBUG] Successfully parsed, result type:`, typeof result);
            return result;
          } catch (parseError: any) {
            // 如果解析失败，可能text已经是对象了
            console.error(`[MCP-CLIENT-ERROR] JSON parse failed:`, parseError.message);
            console.error(`[MCP-CLIENT-ERROR] Text value:`, String(firstContent.text).substring(0, 100));
            return firstContent.text;
          }
        }
      }

      throw new Error('Invalid response from MCP server');
    } catch (error) {
      console.error(`[ERROR] Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * 获取市场数据
   */
  async getMarketData(params: {
    coins: string[];
    timeframe?: string;
    indicators?: string[];
    include_funding?: boolean;
    include_open_interest?: boolean;
  }): Promise<any> {
    return this.callTool('get_market_data', params);
  }

  /**
   * 获取账户状态
   */
  async getAccountState(params: {
    include_positions?: boolean;
    include_history?: boolean;
    include_performance?: boolean;
  }): Promise<any> {
    const result = await this.callTool('get_account_state', params);
    console.log('[MCP-CLIENT] getAccountState result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * 执行交易
   */
  async executeTrade(params: {
    action: 'open_long' | 'open_short' | 'close_position';
    coin: string;
    leverage?: number;
    margin_amount?: number;
    position_id?: string;
    exit_plan?: {
      profit_target: number;
      stop_loss: number;
      invalidation?: string;
    };
    confidence?: number;
  }): Promise<any> {
    // console.log(`\n[MCP-CLIENT] Received executeTrade request:`);
    // console.log(`  - action: ${params.action}`);
    // console.log(`  - coin: ${params.coin}`);
    // console.log(`  - leverage: ${params.leverage}`);
    // console.log(`  - margin_amount: ${params.margin_amount}`);
    // console.log(`  - exit_plan:`, params.exit_plan);
    
    const result = await this.callTool('execute_trade', params);
    
    // console.log(`[MCP-CLIENT] executeTrade result:`, JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * 更新退出计划
   */
  async updateExitPlan(params: {
    position_id: string;
    new_profit_target?: number;
    new_stop_loss?: number;
    new_invalidation?: string;
  }): Promise<any> {
    return this.callTool('update_exit_plan', params);
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(): Promise<any> {
    return this.callTool('get_performance_metrics', {});
  }
}

// 多实例模式，每个 Agent 有独立的 MCP 客户端
const mcpClientInstances: Map<string, MCPClient> = new Map();

export function getMCPClient(agentName: string = 'default'): MCPClient {
  if (!mcpClientInstances.has(agentName)) {
    mcpClientInstances.set(agentName, new MCPClient(agentName));
  }
  return mcpClientInstances.get(agentName)!;
}
