'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import PerformanceChart from './PerformanceChart'
import ModelCard from './ModelCard'

const MODEL_NAMES: { [key: string]: string } = {
  'gpt-5': 'GPT 5',
  'claude-sonnet-4-5': 'CLAUDE SONNET 4.5',
  'gemini-2-5-pro': 'GEMINI 2.5 PRO',
  'gemini-2.5-pro': 'GEMINI 2.5 PRO',
  'grok-4': 'GROK 4',
  'deepseek-chat-v3.1': 'DEEPSEEK CHAT V3.1',
  'qwen3-max': 'QWEN3 MAX',
  'buynhold_btc': 'BTC BUY&HOLD',
  'btc-buy-hold': 'BTC BUY&HOLD',
}

// 模型显示顺序
const MODEL_ORDER = [
  'gpt-5',
  'claude-sonnet-4-5',
  'gemini-2.5-pro',
  'grok-4',
  'deepseek-chat-v3.1',
  'qwen3-max',
  'btc-buy-hold',  // BTC Buy&Hold 基准策略
]

interface AccountData {
  model_id: string
  dollar_equity: number
  total_unrealized_pnl: number
  timestamp?: number
}

export default function MainChart() {
  const [accountTotals, setAccountTotals] = useState<AccountData[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [timeRange, setTimeRange] = useState<'ALL' | '72H'>('ALL')
  const [displayMode, setDisplayMode] = useState<'$' | '%'>('$')
  const [baseChartData, setBaseChartData] = useState<any[]>([]) // 存储API获取的基础数据
  const [baseAccountTotals, setBaseAccountTotals] = useState<AccountData[]>([]) // 存储API获取的基础账户数据
  const [cryptoPrices, setCryptoPrices] = useState<{[key: string]: {price: number}} | null>(null) // 实时币价
  const [lastApiTimestamp, setLastApiTimestamp] = useState<number>(0) // 最后一次API获取的时间戳
  const [initialBalance, setInitialBalance] = useState<number>(100) // 初始余额，默认100
  
  // 使用 ref 保存最新的状态，避免闭包问题
  const baseChartDataRef = useRef<any[]>([])
  const baseAccountTotalsRef = useRef<AccountData[]>([])
  const lastApiTimestampRef = useRef<number>(0)
  const cryptoPricesRef = useRef<{[key: string]: {price: number}} | null>(null)

  // 获取实时币价
  useEffect(() => {
    const fetchPrices = () => {
      fetch('/api/crypto-prices')
        .then(res => res.json())
        .then(data => {
          if (data.prices) {
            setCryptoPrices(data.prices)
            cryptoPricesRef.current = data.prices  // 同步更新 ref
          }
        })
        .catch(err => console.error('Failed to fetch crypto prices:', err))
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 3000) // 每3秒更新一次
    return () => clearInterval(interval)
  }, [])

  // 根据实时币价计算账户价值
  const calculateRealtimeAccountValue = (account: any) => {
    if (!account || !account.positions || !cryptoPrices) {
      return account?.dollar_equity || 0
    }

    // 计算实时未实现盈亏
    let realtimeUnrealizedPnl = 0
    
    Object.entries(account.positions).forEach(([symbol, position]: [string, any]) => {
      const priceData = cryptoPrices[symbol]
      const currentPrice = priceData?.price || 0
      
      if (currentPrice && position?.entry_price && position?.quantity) {
        const priceDiff = currentPrice - position.entry_price
        // quantity 的正负号表示多空：正数=多头，负数=空头
        // 盈亏 = (当前价 - 入场价) × quantity（带符号）
        const pnl = priceDiff * position.quantity
        realtimeUnrealizedPnl += pnl
      }
    })

    // 实时账户价值 = dollar_equity - total_unrealized_pnl + 实时未实现盈亏
    const dollarEquity = account.dollar_equity || 0
    const oldUnrealizedPnl = account.total_unrealized_pnl || 0
    
    return dollarEquity - oldUnrealizedPnl + realtimeUnrealizedPnl
  }

  // 每3秒获取完整的历史数据（真实API数据）
  useEffect(() => {
    const fetchData = () => {
      fetch('/api/account-history')
        .then((res) => res.json())
        .then((data) => {
          // 获取初始余额
          if (data.initialBalance) {
            console.log('[MainChart] Setting initialBalance from API:', data.initialBalance)
            setInitialBalance(data.initialBalance)
          } else {
            console.warn('[MainChart] No initialBalance in API response:', data)
          }
          const allAccounts = data.accountTotals || []
          
          // 获取每个模型的最新数据（保留完整的 account 对象，包含 positions）
          const latestByModel = new Map<string, any>()
          allAccounts.forEach((account: any) => {
            const existing = latestByModel.get(account.model_id)
            if (!existing || account.timestamp > existing.timestamp) {
              latestByModel.set(account.model_id, account)
            }
          })
          
          const latestAccounts = Array.from(latestByModel.values())
          
          // 转换为图表数据格式
          const chartPoints = allAccounts.map((account: any) => ({
            timestamp: account.timestamp * 1000, // 转换为毫秒
            value: account.dollar_equity,
            modelId: account.model_id,
          }))
          
          const now = Date.now()
          
          console.log('📊 API data loaded (3s):', {
            totalPoints: chartPoints.length,
            models: Array.from(new Set(chartPoints.map((p: any) => p.modelId))),
            latestValues: latestAccounts.map(a => ({ model: a.model_id, value: a.dollar_equity }))
          })
          
          // 更新基础数据和时间戳
          setBaseChartData(chartPoints)
          setBaseAccountTotals(latestAccounts)
          setLastApiTimestamp(now)
          
          // 同时更新 ref
          baseChartDataRef.current = chartPoints
          baseAccountTotalsRef.current = latestAccounts
          lastApiTimestampRef.current = now
          
          // 立即同步更新账户数据
          setAccountTotals(latestAccounts)
          
          // 如果有币价数据，立即计算并添加实时数据点
          const currentCryptoPrices = cryptoPricesRef.current
          if (currentCryptoPrices) {
            const realtimeNow = Date.now()
            const realtimePoints = latestAccounts.map(account => ({
              timestamp: realtimeNow,
              value: calculateRealtimeAccountValue(account),
              modelId: account.model_id,
            }))
            const updatedChartData = [...chartPoints, ...realtimePoints]
            setChartData(updatedChartData)
          } else {
            // 没有币价数据时，使用原始数据
            setChartData(chartPoints)
          }
        })
        .catch((err) => console.error('Failed to fetch account totals:', err))
    }

    fetchData()
    const interval = setInterval(fetchData, 15000) // 每15秒更新历史数据
    return () => clearInterval(interval)
  }, [])

  // 每3秒更新一次实时数据点（与币价更新同步）
  useEffect(() => {
    if (!cryptoPrices) {
      return
    }

    const updateRealtimeData = () => {
      // 使用 ref 获取最新的状态
      const currentBaseAccountTotals = baseAccountTotalsRef.current
      const currentBaseChartData = baseChartDataRef.current
      
      if (currentBaseAccountTotals.length === 0 || currentBaseChartData.length === 0) {
        return
      }

      // 为每个账户计算实时价值
      const now = Date.now()
      const realtimePoints = currentBaseAccountTotals.map(account => ({
        timestamp: now,
        value: calculateRealtimeAccountValue(account),
        modelId: account.model_id,
      }))

      // 直接使用 baseChartData（纯历史数据）+ 实时数据点
      const updatedChartData = [...currentBaseChartData, ...realtimePoints]
      setChartData(updatedChartData)

      console.log('📈 Realtime chart data updated:', realtimePoints.map(p => ({ 
        model: p.modelId, 
        value: p.value 
      })))
    }

    // 立即更新一次
    updateRealtimeData()

    // 每3秒更新一次
    const interval = setInterval(updateRealtimeData, 3000)
    return () => clearInterval(interval)
  }, [cryptoPrices])


  // 按顺序排序的账户
  const sortedAccounts = useMemo(() => {
    const accountMap = new Map<string, AccountData>()
    accountTotals.forEach((account) => {
      accountMap.set(account.model_id, account)
    })

    return MODEL_ORDER.map((modelId) => accountMap.get(modelId)).filter(
      Boolean
    ) as AccountData[]
  }, [accountTotals])

  return (
    <div className="flex flex-col h-[480px] md:min-h-0 md:h-auto md:flex-1 border-b md:border-b-0 md:border-r border-border flex-shrink-0">
      {/* 图表容器 */}
      <div className="relative flex-1 overflow-hidden" data-chart-container="true">
        <div className="relative flex h-full w-full flex-col">
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 justify-center overflow-hidden transition-opacity duration-200 px-0.5 md:px-1 opacity-100 pt-8">
              {/* 图表区域 */}
              {(() => {
                console.log('[MainChart] Rendering PerformanceChart with initialBalance:', initialBalance)
                return (
                  <PerformanceChart
                    data={chartData}
                    selectedModel={selectedModel}
                    timeRange={timeRange}
                    displayMode={displayMode}
                    initialBalance={initialBalance}
                    key={`chart-${initialBalance}`}
                  />
                )
              })()}
            </div>

            {/* 按钮在图表外层 */}
            <div className="absolute right-1 top-1 md:right-2 md:top-2 z-10 hidden md:block">
              <div className="flex border-collapse border border-black bg-white text-[6px] md:text-sm w-fit">
                <button 
                  className={`terminal-button-small border-collapse border-r border-black whitespace-nowrap flex-shrink-0 ${timeRange === 'ALL' ? 'active' : ''}`}
                  onClick={() => setTimeRange('ALL')}
                >
                  ALL
                </button>
                <button 
                  className={`terminal-button-small border-collapse border-r border-black whitespace-nowrap flex-shrink-0 ${timeRange === '72H' ? 'active' : ''}`}
                  onClick={() => setTimeRange('72H')}
                >
                  72H
                </button>
              </div>
            </div>

            <div className="absolute left-1 top-1 md:left-2 md:top-2 z-10 hidden md:block">
              <div className="flex border border-black bg-white text-[6px] md:text-sm w-fit">
                <button 
                  className={`terminal-button-small border-r border-black px-1 py-0.5 whitespace-nowrap flex-shrink-0 ${displayMode === '$' ? 'active' : ''}`}
                  onClick={() => setDisplayMode('$')}
                >
                  $
                </button>
                <button 
                  className={`terminal-button-small px-1 py-0.5 whitespace-nowrap flex-shrink-0 ${displayMode === '%' ? 'active' : ''}`}
                  onClick={() => setDisplayMode('%')}
                >
                  %
                </button>
              </div>
            </div>

            <div className="absolute left-1/2 top-1 md:top-2 z-10 -translate-x-1/2 transform">
              <div className="flex flex-row items-center gap-2">
                {selectedModel && (
                  <button
                    onClick={() => setSelectedModel(null)}
                    className="cursor-pointer border border-green-800 bg-green-600 px-1.5 py-0.5 md:px-3 md:py-1 font-mono text-[8px] md:text-xs font-medium text-white transition-none hover:bg-green-700"
                  >
                    BACK TO ALL
                  </button>
                )}
                <h2 className="terminal-text text-xs md:text-sm font-bold text-black">TOTAL ACCOUNT VALUE</h2>
              </div>
            </div>

            <div className="absolute left-1/2 bottom-1 -translate-x-1/2 transform md:hidden z-10">
              <div className="flex border-collapse border border-black bg-white text-[6px] md:text-sm w-fit">
                <button 
                  className={`terminal-button-small border-collapse border-r border-black whitespace-nowrap flex-shrink-0 ${timeRange === 'ALL' ? 'active' : ''}`}
                  onClick={() => setTimeRange('ALL')}
                >
                  ALL
                </button>
                <button 
                  className={`terminal-button-small border-collapse border-r border-black whitespace-nowrap flex-shrink-0 ${timeRange === '72H' ? 'active' : ''}`}
                  onClick={() => setTimeRange('72H')}
                >
                  72H
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 模型卡片列表 */}
      <div className="flex-shrink-0 bg-white hidden md:block">
          <div className="relative bg-surface p-1 md:p-3 md:border-t-2 md:border-border">
            <div className="flex w-full flex-col items-start gap-3 sm:flex-row">
              {selectedModel && (
                <button
                  onClick={() => setSelectedModel(null)}
                  className="flex items-center gap-2 cursor-pointer border-2 border-gray-600 bg-white px-4 py-2 font-mono text-sm font-medium text-gray-700 transition-all hover:bg-gray-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  BACK
                </button>
              )}
              <div className="flex-1 w-full">
                <div className="flex flex-wrap gap-1 md:gap-2 w-full justify-center">
                  {sortedAccounts.map((account) => {
                    // 使用实时币价计算账户价值
                    const realtimeValue = calculateRealtimeAccountValue(account)
                    const percentChange =
                      ((realtimeValue - initialBalance) / initialBalance) * 100 // 修改为使用 initialBalance

                    return (
                      <ModelCard
                        key={account.model_id}
                        modelId={account.model_id}
                        modelName={MODEL_NAMES[account.model_id] || account.model_id.toUpperCase()}
                        logoPath={`/logos/${account.model_id.replace(/-/g, '_')}_logo.png`}
                        currentValue={realtimeValue}
                        percentChange={percentChange}
                        isSelected={selectedModel === account.model_id}
                        onClick={() => {
                          const newSelection = selectedModel === account.model_id ? null : account.model_id
                          console.log('[MainChart] ModelCard clicked:', account.model_id, 'new selection:', newSelection)
                          setSelectedModel(newSelection)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  )
}
