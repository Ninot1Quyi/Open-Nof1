/**
 * 交易所客户端
 * 直接连接交易所获取账户和仓位数据
 */

import ccxt from 'ccxt';

export interface ExchangeConfig {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  password?: string;
  useSandbox: boolean;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  contracts: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  unrealizedPnl: number;
  margin: number;
}

export class ExchangeClient {
  private exchange: any;

  constructor(config: ExchangeConfig) {
    // 创建交易所实例
    const ExchangeClass = ccxt[config.exchange as keyof typeof ccxt] as any;
    
    this.exchange = new ExchangeClass({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      password: config.password,
      enableRateLimit: true,
      options: {
        defaultType: 'swap', // 永续合约
      },
    });

    // 设置沙盒模式
    if (config.useSandbox) {
      this.exchange.setSandboxMode(true);
    }
  }

  /**
   * 获取账户余额
   */
  async getBalance(): Promise<number> {
    try {
      const balance = await this.exchange.fetchBalance();
      return balance.USDT?.total || 0;
    } catch (error) {
      console.error('[ExchangeClient] Error fetching balance:', error);
      throw error;
    }
  }

  /**
   * 获取所有持仓
   */
  async getPositions(): Promise<Position[]> {
    try {
      const positions = await this.exchange.fetchPositions();
      
      return positions
        .filter((pos: any) => {
          const contracts = parseFloat(String(pos.contracts || '0'));
          return contracts > 0;
        })
        .map((pos: any) => {
          const symbol = pos.symbol?.split('/')[0] || '';
          const contracts = parseFloat(String(pos.contracts || '0'));
          const entryPrice = parseFloat(String(pos.entryPrice || '0'));
          const currentPrice = parseFloat(String(pos.markPrice || pos.entryPrice || '0'));
          const leverage = parseFloat(String(pos.leverage || '1'));
          const unrealizedPnl = parseFloat(String(pos.unrealizedPnl || '0'));
          const initialMargin = parseFloat(String(pos.initialMargin || '0'));
          
          // 计算保证金（USDT）
          const margin = initialMargin < 1 && currentPrice > 100
            ? initialMargin * currentPrice
            : initialMargin;

          return {
            symbol,
            side: pos.side === 'long' ? 'long' : 'short',
            contracts,
            entryPrice,
            currentPrice,
            leverage,
            unrealizedPnl,
            margin,
          };
        });
    } catch (error) {
      console.error('[ExchangeClient] Error fetching positions:', error);
      throw error;
    }
  }

  /**
   * 获取账户状态（余额 + 仓位）
   */
  async getAccountState(): Promise<{
    balance: number;
    positions: Position[];
    accountValue: number;
    totalUnrealizedPnl: number;
  }> {
    const balance = await this.getBalance();
    const positions = await this.getPositions();
    
    const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    const accountValue = balance + totalUnrealizedPnl;

    return {
      balance,
      positions,
      accountValue,
      totalUnrealizedPnl,
    };
  }
}
