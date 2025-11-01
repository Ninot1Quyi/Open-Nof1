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
  const [initialBalance, setInitialBalance] = useState<number>(100) // 初始余额，默认100

  // 获取账户总览数据（10秒更新）- 用于 ModelCard 和图表最新点
  useEffect(() => {
    const fetchAccountTotals = async () => {
      try {
        const response = await fetch('/api/account-totals')
        const data = await response.json()
        console.log('[MainChart] Fetched account-totals:', data)
        
        if (data.initialBalance) {
          console.log('[MainChart] Setting initialBalance from account-totals:', data.initialBalance)
          setInitialBalance(data.initialBalance)
        }
        
        if (data.accountTotals && data.accountTotals.length > 0) {
          // 获取每个模型的最新数据
          const latestByModel = new Map<string, any>()
          data.accountTotals.forEach((account: any) => {
            const existing = latestByModel.get(account.model_id)
            if (!existing || account.timestamp > existing.timestamp) {
              latestByModel.set(account.model_id, account)
            }
          })
          
          const latestAccounts = Array.from(latestByModel.values())
          setAccountTotals(latestAccounts)
          console.log('[MainChart] Updated accountTotals:', latestAccounts.map(a => ({
            model: a.model_id,
            value: a.dollar_equity
          })))
          
          // 同时更新图表数据：添加最新的数据点
          setChartData(prevChartData => {
            // 找出历史数据的最大时间戳（排除实时预测点）
            const historicalPoints = prevChartData.filter(point => {
              return !point.isRealtime
            })
            
            // 为每个模型找出其自己的历史数据最大时间戳
            const maxTimestampByModel = new Map<string, number>()
            historicalPoints.forEach(point => {
              const currentMax = maxTimestampByModel.get(point.modelId) || 0
              if (point.timestamp > currentMax) {
                maxTimestampByModel.set(point.modelId, point.timestamp)
              }
            })
            
            // 为每个模型创建实时预测点（使用该模型自己的历史数据最后时间 + 10秒）
            const realtimePoints = latestAccounts.map(account => {
              const modelMaxTimestamp = maxTimestampByModel.get(account.model_id) || Date.now()
              const realtimeTimestamp = modelMaxTimestamp + 10000
              
              return {
                timestamp: realtimeTimestamp,
                value: account.dollar_equity,
                modelId: account.model_id,
                isRealtime: true,  // 标记为实时预测点
              }
            })
            
            console.log('📊 Updated chart with realtime points:', {
              historicalCount: historicalPoints.length,
              realtimeCount: realtimePoints.length,
              realtimePoints: realtimePoints.map(p => ({ 
                model: p.modelId, 
                value: p.value,
                time: new Date(p.timestamp).toISOString()
              }))
            })
            
            return [...historicalPoints, ...realtimePoints]
          })
        }
      } catch (error) {
        console.error('[MainChart] Failed to fetch account totals:', error)
      }
    }

    fetchAccountTotals()
    const interval = setInterval(fetchAccountTotals, 10000) // 每10秒更新一次
    return () => clearInterval(interval)
  }, [])

  // 直接使用 API 返回的账户价值（不再实时计算）
  const getAccountValue = (account: any) => {
    return account?.dollar_equity || 0
  }

  // 每15秒获取完整的历史数据（用于图表显示）
  useEffect(() => {
    const fetchData = () => {
      fetch('/api/account-history')
        .then((res) => res.json())
        .then((data) => {
          const allAccounts = data.accountTotals || []
          
          // 转换为图表数据格式（只保留历史数据）
          const chartPoints = allAccounts.map((account: any) => ({
            timestamp: account.timestamp * 1000, // 转换为毫秒
            value: account.dollar_equity,
            modelId: account.model_id,
          }))
          
          console.log('📊 Chart history data loaded (15s):', {
            totalPoints: chartPoints.length,
            models: Array.from(new Set(chartPoints.map((p: any) => p.modelId)))
          })
          
          // 只更新历史数据部分，保留实时预测点（由 account-totals 更新）
          setChartData(prevChartData => {
            // 保留所有实时预测点
            const realtimePoints = prevChartData.filter(point => point.isRealtime)
            
            console.log('📊 Merging history with realtime points:', {
              historyCount: chartPoints.length,
              realtimeCount: realtimePoints.length,
              realtimeTimes: realtimePoints.map(p => new Date(p.timestamp).toISOString())
            })
            
            return [...chartPoints, ...realtimePoints]
          })
        })
        .catch((err) => console.error('Failed to fetch account history:', err))
    }

    fetchData()
    const interval = setInterval(fetchData, 15000) // 每15秒更新历史数据
    return () => clearInterval(interval)
  }, [])

  // 移除实时数据点更新逻辑，改为使用 10 秒更新的 account-totals


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
                    // 使用 API 返回的账户价值（10秒更新）
                    const accountValue = getAccountValue(account)
                    const percentChange =
                      ((accountValue - initialBalance) / initialBalance) * 100

                    return (
                      <ModelCard
                        key={account.model_id}
                        modelId={account.model_id}
                        modelName={MODEL_NAMES[account.model_id] || account.model_id.toUpperCase()}
                        logoPath={`/logos/${account.model_id.replace(/-/g, '_')}_logo.png`}
                        currentValue={accountValue}
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
