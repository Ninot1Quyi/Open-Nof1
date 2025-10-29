'use client'

import { useState, useEffect, useMemo } from 'react'
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
  'buynhold_btc',
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

  // 统一的实时计算函数 - 基于基础数据计算快照
  const calculateSnapshot = (baseAccounts: AccountData[], baseChart: any[]) => {
    const now = Date.now()
    
    // 计算每个模型的快照equity
    const snapshotAccounts = baseAccounts.map(account => {
      // 简化版本：使用小的随机波动模拟实时变化
      // 实际应用中，这里应该根据持仓和当前币价计算
      const volatility = account.dollar_equity * 0.001 // 0.1%的波动
      const randomChange = (Math.random() - 0.5) * volatility
      
      return {
        ...account,
        dollar_equity: account.dollar_equity + randomChange,
      }
    })
    
    // 生成快照图表数据点
    const snapshotChartPoints = snapshotAccounts.map(account => ({
      timestamp: now,
      value: account.dollar_equity,
      modelId: account.model_id,
    }))
    
    // 合并基础图表数据和快照点
    const updatedChartData = [...baseChart, ...snapshotChartPoints]
    
    return {
      accounts: snapshotAccounts,
      chartData: updatedChartData,
    }
  }

  // 每60秒获取完整的历史数据（真实API数据）
  useEffect(() => {
    const fetchData = () => {
      fetch('/api/account-history')
        .then((res) => res.json())
        .then((data) => {
          const allAccounts = data.accountTotals || []
          
          // 获取每个模型的最新数据
          const latestByModel = new Map<string, AccountData>()
          allAccounts.forEach((account: any) => {
            const existing = latestByModel.get(account.model_id)
            if (!existing || account.timestamp > existing.timestamp) {
              latestByModel.set(account.model_id, {
                model_id: account.model_id,
                dollar_equity: account.dollar_equity,
                total_unrealized_pnl: account.total_unrealized_pnl,
                timestamp: account.timestamp,
              })
            }
          })
          
          const latestAccounts = Array.from(latestByModel.values())
          
          // 转换为图表数据格式
          const chartPoints = allAccounts.map((account: any) => ({
            timestamp: account.timestamp * 1000, // 转换为毫秒
            value: account.dollar_equity,
            modelId: account.model_id,
          }))
          
          console.log('📊 API data loaded (60s):', {
            totalPoints: chartPoints.length,
            models: Array.from(new Set(chartPoints.map((p: any) => p.modelId))),
          })
          
          // 更新基础数据
          setBaseChartData(chartPoints)
          setBaseAccountTotals(latestAccounts)
          
          // 立即同步更新所有显示数据
          setAccountTotals(latestAccounts)
          setChartData(chartPoints)
        })
        .catch((err) => console.error('Failed to fetch account totals:', err))
    }

    fetchData()
    const interval = setInterval(fetchData, 60000) // 每60秒更新真实数据
    return () => clearInterval(interval)
  }, [])

  // 每3秒计算并同步更新所有数据
  useEffect(() => {
    if (baseAccountTotals.length === 0 || baseChartData.length === 0) {
      return // 等待基础数据加载
    }

    const updateAllData = () => {
      // 统一计算快照
      const snapshot = calculateSnapshot(baseAccountTotals, baseChartData)
      
      // 同步更新所有数据
      setAccountTotals(snapshot.accounts)
      setChartData(snapshot.chartData)
      
      console.log('📸 Snapshot updated (3s) - all data synced:', snapshot.accounts.length, 'models')
    }

    const interval = setInterval(updateAllData, 3000) // 每3秒更新快照
    return () => clearInterval(interval)
  }, [baseAccountTotals, baseChartData])


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
              <PerformanceChart
                data={chartData}
                selectedModel={selectedModel}
                timeRange={timeRange}
                displayMode={displayMode}
              />
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
              <div className="flex-1 w-full">
                <div className="flex flex-wrap gap-1 md:gap-2 w-full justify-center">
                  {sortedAccounts.map((account) => {
                    const initialValue = 10000
                    const percentChange =
                      ((account.dollar_equity - initialValue) / initialValue) *
                      100

                    return (
                      <ModelCard
                        key={account.model_id}
                        modelId={account.model_id}
                        modelName={MODEL_NAMES[account.model_id] || account.model_id.toUpperCase()}
                        logoPath={`/logos/${account.model_id.replace(/-/g, '_')}_logo.png`}
                        currentValue={account.dollar_equity}
                        percentChange={percentChange}
                        isSelected={selectedModel === account.model_id}
                        onClick={() =>
                          setSelectedModel(
                            selectedModel === account.model_id
                              ? null
                              : account.model_id
                          )
                        }
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
