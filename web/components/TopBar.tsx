'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// 动态导入 NumberFlow，禁用 SSR
const NumberFlow = dynamic(() => import('@number-flow/react'), {
  ssr: false,
  loading: () => <span>0</span>
})

interface CoinPrice {
  symbol: string
  price: number
  timestamp: number
}

interface CryptoPricesResponse {
  prices: {
    [key: string]: CoinPrice
  }
  serverTime: number
}

interface TopBarProps {
  accountTotals: any[]
  initialBalance: number
}

const MODEL_NAMES: { [key: string]: string } = {
  'gpt-5': 'GPT 5',
  'claude-sonnet-4-5': 'Claude 4.5 Sonnet',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'grok-4': 'Grok 4',
  'qwen3-max': 'Qwen 3 Max',
  'deepseek-chat-v3.1': 'DeepSeek Chat V3.1',
  'btc-buy-hold': 'BTC Buy & Hold',
}

export default function TopBar({ accountTotals, initialBalance }: TopBarProps) {
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPricesResponse | null>(null)

  // 获取实时币种价格
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/crypto-prices')
        if (!response.ok) {
          console.error('Failed to fetch crypto prices: HTTP', response.status)
          return
        }
        const data = await response.json()
        // 确保数据格式正确
        if (data && data.prices && typeof data.prices === 'object') {
          setCryptoPrices(data)
        } else {
          console.error('Invalid crypto prices data format:', data)
        }
      } catch (error) {
        console.error('Failed to fetch crypto prices:', error)
      }
    }

    fetchPrices()
    // 每10秒刷新一次
    const interval = setInterval(fetchPrices, 10000)
    return () => clearInterval(interval)
  }, [])

  // 根据实时币价计算账户总价值
  const calculateAccountValue = (account: any) => {
    // 直接使用后端返回的 dollar_equity
    // 后端已经从交易所 API 获取了最新的总权益（包含未实现盈亏）
    return account?.dollar_equity || 0
  }

  // 计算最高和最低表现的模型
  const getTopAndBottomModels = () => {
    if (!accountTotals || accountTotals.length === 0 || !cryptoPrices) {
      return { highest: null, lowest: null }
    }

    // 计算每个账户的实时价值
    const accountsWithValue = accountTotals.map((account: any) => ({
      ...account,
      currentValue: calculateAccountValue(account)
    }))

    // 过滤掉无效账户
    const validAccounts = accountsWithValue.filter((a: any) => 
      a && typeof a.currentValue === 'number' && !isNaN(a.currentValue)
    )

    if (validAccounts.length === 0) {
      return { highest: null, lowest: null }
    }

    const sorted = [...validAccounts].sort((a: any, b: any) => 
      b.currentValue - a.currentValue
    )
    const highest = sorted[0]
    const lowest = sorted[sorted.length - 1]

    const calculateReturnPct = (account: any) => {
      if (!account || typeof account.currentValue !== 'number') {
        return 0
      }
      console.log('[TopBar] Calculating return with initialBalance:', initialBalance, 'currentValue:', account.currentValue)
      return ((account.currentValue - initialBalance) / initialBalance) * 100
    }

    return {
      highest: highest ? {
        ...highest,
        dollar_equity: highest.currentValue,
        returnPct: calculateReturnPct(highest)
      } : null,
      lowest: lowest ? {
        ...lowest,
        dollar_equity: lowest.currentValue,
        returnPct: calculateReturnPct(lowest)
      } : null
    }
  }

  const { highest, lowest } = getTopAndBottomModels()

  const formatPrice = (price: number | undefined, decimals: number = 2) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '0.00'
    }
    return price.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  const formatCoinPrice = (symbol: string, price: number | undefined) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '0.00'
    }
    // DOGE 显示4位小数，其他显示2位
    const decimals = symbol === 'DOGE' ? 4 : 2
    return formatPrice(price, decimals)
  }

  if (!cryptoPrices || !cryptoPrices.prices) {
    return null // 数据未加载
  }

  const coins = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP']

  return (
    <div className="hidden border-b-2 border-border bg-surface-elevated px-4 py-1 md:block">
      <div className="terminal-text flex items-center justify-between text-xs">
        {/* 左侧：币种价格 */}
        <div className="flex items-center">
          <div className="flex items-center">
            {coins.map((symbol, index) => {
              const coinData = cryptoPrices.prices[symbol]
              if (!coinData) return null

              return (
                <div key={symbol} className="flex items-center">
                  <div className="flex flex-col items-center px-6 py-0.5 text-xs">
                    <div className="flex items-center space-x-1 mb-0.5">
                      <img 
                        src={`/coins/${symbol.toLowerCase()}.svg`} 
                        alt={symbol} 
                        className="size-3"
                      />
                      <span className="text-gray-700 font-medium">{symbol}</span>
                    </div>
                    <div className="font-mono text-gray-800 text-sm font-semibold flex items-baseline">
                      <span>$</span>
                      <NumberFlow 
                        value={coinData.price} 
                        format={{ 
                          minimumFractionDigits: symbol === 'DOGE' ? 4 : 2,
                          maximumFractionDigits: symbol === 'DOGE' ? 4 : 2
                        }}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      />
                    </div>
                  </div>
                  {index < coins.length - 1 && (
                    <div className="w-px h-8 bg-gray-300"></div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧：最高/最低表现模型 */}
        <div className="flex items-center space-x-4">
          {highest && (
            <>
              <span className="text-foreground-subtle">
                HIGHEST:{' '}
                <img 
                  src={`/logos/${highest.model_id.replace(/-/g, '_')}_logo.png`}
                  alt={MODEL_NAMES[highest.model_id] || highest.model_id}
                  className="mr-2 inline size-4"
                  onError={(e) => {e.currentTarget.style.display = 'none'}}
                />
                <span className="text-foreground">
                  {(MODEL_NAMES[highest.model_id] || highest.model_id).toUpperCase()}
                </span>
              </span>
              <span className="text-black font-bold inline-flex items-baseline">
                <span>$</span>
                <NumberFlow 
                  value={highest.dollar_equity} 
                  format={{ 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </span>
              <span className="terminal-positive">
                {highest.returnPct >= 0 ? '+' : ''}
                <NumberFlow 
                  value={highest.returnPct} 
                  format={{ 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />%
              </span>
            </>
          )}

          {highest && lowest && (
            <span className="text-xl font-thin text-foreground-subtle">|</span>
          )}

          {lowest && (
            <>
              <span className="text-foreground-subtle">
                LOWEST:{' '}
                <img 
                  src={`/logos/${lowest.model_id.replace(/-/g, '_')}_logo.png`}
                  alt={MODEL_NAMES[lowest.model_id] || lowest.model_id}
                  className="mr-2 inline size-4"
                  onError={(e) => {e.currentTarget.style.display = 'none'}}
                />
                <span className="text-foreground">
                  {(MODEL_NAMES[lowest.model_id] || lowest.model_id).toUpperCase()}
                </span>
              </span>
              <span className="text-black font-bold inline-flex items-baseline">
                <span>$</span>
                <NumberFlow 
                  value={lowest.dollar_equity} 
                  format={{ 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </span>
              <span className="terminal-negative">
                {lowest.returnPct >= 0 ? '+' : ''}
                <NumberFlow 
                  value={lowest.returnPct} 
                  format={{ 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
