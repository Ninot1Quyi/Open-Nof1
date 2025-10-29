import { useState, useEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 打字机效果组件
function TypeWriter({ text, speed = 100 }: { text: string; speed?: number }) {
  const [displayText, setDisplayText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex])
        setCurrentIndex(prev => prev + 1)
      }, speed)
      return () => clearTimeout(timeout)
    }
  }, [currentIndex, text, speed])

  return <span>{displayText}</span>
}

type TabType = 'COMPLETED TRADES' | 'MODELCHAT' | 'POSITIONS' | 'README.TXT'

interface Trade {
  id: string
  symbol: string
  model_id: string
  side: string
  quantity: number
  realized_net_pnl: number
  exit_human_time: string
  entry_human_time: string
  leverage: number
  entry_price: number
  exit_price: number
  entry_time: number
  exit_time: number
}

interface Position {
  symbol: string
  entry_price: number
  current_price: number
  quantity: number
  leverage: number
  unrealized_pnl: number
  confidence: number
  risk_usd: number
  notional_usd: number
  exit_plan: {
    profit_target: number
    stop_loss: number
    invalidation_condition: string
  }
}

interface AccountTotal {
  id: string
  model_id: string
  dollar_equity: number
  total_unrealized_pnl: number
  positions: {
    [symbol: string]: Position
  }
}

interface Conversation {
  id: string
  user_prompt: string
  llm_response: {
    [symbol: string]: {
      quantity: number
      stop_loss: number
      signal: string
      profit_target: number
      invalidation_condition: string
      justification: string
      confidence: number
      leverage: number
      risk_usd: number
      coin: string
    }
  }
  cycle_id: number
  inserted_at: number
  cot_trace: any
  cot_trace_summary?: string
}

const MODEL_COLORS: {[key: string]: string} = {
  'gpt-5': 'rgb(16, 163, 127)',
  'claude-sonnet-4-5': 'rgb(255, 107, 53)',
  'gemini-2-5-pro': 'rgb(66, 133, 244)',
  'gemini-2.5-pro': 'rgb(66, 133, 244)',
  'grok-4': 'rgb(0, 0, 0)',
  'deepseek-chat-v3.1': 'rgb(77, 107, 254)',
  'qwen3-max': 'rgb(139, 92, 246)',
  'buynhold_btc': 'rgb(255, 193, 7)',
  'btc-buy-hold': 'rgb(255, 193, 7)'
}

const MODEL_NAMES: {[key: string]: string} = {
  'gpt-5': 'GPT 5',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'gemini-2-5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'grok-4': 'Grok 4',
  'deepseek-chat-v3.1': 'DeepSeek Chat V3.1',
  'qwen3-max': 'Qwen3 Max',
  'buynhold_btc': 'BTC Buy&Hold',
  'btc-buy-hold': 'BTC Buy&Hold'
}

// POSITIONS 标签页的固定显示顺序
const POSITIONS_ORDER = [
  'gpt-5',
  'grok-4',
  'qwen3-max',
  'gemini-2.5-pro',
  'gemini-2-5-pro',
  'deepseek-chat-v3.1',
  'claude-sonnet-4-5'
]

export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('MODELCHAT')
  const [trades, setTrades] = useState<Trade[]>([])
  const [accountTotals, setAccountTotals] = useState<AccountTotal[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set())
  const [viewButtonPosition, setViewButtonPosition] = useState<{x: number, y: number, showBelow?: boolean} | null>(null)
  const [filterModel, setFilterModel] = useState<string>('ALL MODELS')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [cryptoPrices, setCryptoPrices] = useState<{[key: string]: {price: number}} | null>(null)

  // MODELCHAT 使用对话时间排序
  const sortedAccountTotals = useMemo(() => {
    console.log('→ Sorting accountTotals:', accountTotals.length, 'items')
    console.log('→ Conversations:', conversations.length, 'items')
    
    // 为每个对话创建一个账户快照
    // 使用 Map 按对话 ID 去重
    const conversationMap = new Map<string, any>()
    
    conversations.forEach(conv => {
      // 找到对应的账户数据
      const account = accountTotals.find(a => a.model_id === conv.id.split('_')[0])
      if (account && !conversationMap.has(conv.id)) {
        conversationMap.set(conv.id, {
          ...account,
          conversation: conv,
          conversationId: conv.id,
          conversationTime: conv.inserted_at
        })
      }
    })
    
    const uniqueAccounts = Array.from(conversationMap.values())
    console.log('→ After deduplication:', uniqueAccounts.length, 'items (from', conversations.length, 'conversations)')
    
    // 按对话时间从新到旧排序
    const sorted = uniqueAccounts.sort((a, b) => b.conversationTime - a.conversationTime)
    console.log('→ Sorted result:', sorted.length, 'items')
    return sorted
  }, [accountTotals, conversations])

  // POSITIONS 使用固定顺序
  const positionsOrderedAccounts = useMemo(() => {
    // 去重：使用 Map 确保每个 model_id 只保留一个（最新的）
    const accountMap = new Map<string, any>()
    accountTotals.forEach(account => {
      accountMap.set(account.model_id, account)
    })
    const uniqueAccounts = Array.from(accountMap.values())
    
    return [...uniqueAccounts].sort((a, b) => {
      const indexA = POSITIONS_ORDER.indexOf(a.model_id)
      const indexB = POSITIONS_ORDER.indexOf(b.model_id)
      // 如果模型不在顺序列表中，放到最后
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [accountTotals])

  // 点击外部关闭下拉菜单和弹出框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      
      // 关闭下拉菜单
      if (isFilterOpen && !target.closest('.relative')) {
        setIsFilterOpen(false)
      }
      
      // 关闭 VIEW 弹出框
      if (expandedPositions.size > 0 && !target.closest('button')) {
        setExpandedPositions(new Set())
        setViewButtonPosition(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isFilterOpen, expandedPositions])

  // 获取实时币价
  useEffect(() => {
    const fetchPrices = () => {
      fetch('/api/crypto-prices')
        .then(res => res.json())
        .then(data => {
          if (data.prices) {
            setCryptoPrices(data.prices)
          }
        })
        .catch(err => console.error('Failed to fetch crypto prices:', err))
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 3000) // 每3秒更新一次
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('/api/trades')
      .then(res => res.json())
      .then(data => {
        console.log('→ Trades API Response:', data)
        console.log('→ Total trades:', data.trades?.length)
        console.log('→ First 5 trades:', data.trades?.slice(0, 5))
        
        // 统计每个模型的交易数量
        const modelCounts: {[key: string]: number} = {}
        data.trades?.forEach((trade: Trade) => {
          modelCounts[trade.model_id] = (modelCounts[trade.model_id] || 0) + 1
        })
        console.log('→ Trades per model:', modelCounts)
        
        // 按照exit_human_time从新到旧排序
        const sortedTrades = (data.trades || []).sort((a: Trade, b: Trade) => {
          return new Date(b.exit_human_time).getTime() - new Date(a.exit_human_time).getTime()
        })
        
        setTrades(sortedTrades.slice(0, 100))
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch trades:', err)
        setLoading(false)
      })

    fetch('/api/account-totals')
      .then(res => res.json())
      .then(data => {
        console.log('→ Account Totals API Response:', data)
        // API 返回的格式是 { accountTotals: [...], lastHourlyMarkerRead: 273, serverTime: ... }
        const accounts = data.accountTotals || []
        console.log('→ Setting accountTotals:', accounts.length, 'items')
        setAccountTotals(accounts)
      })
      .catch(err => {
        console.error('✗ Failed to fetch account totals:', err)
        setAccountTotals([]) // 失败时设置空数组
      })

    fetch('/api/conversations')
      .then(res => res.json())
      .then(data => {
        console.log('→ Conversations API Response:', data)
        if (data.conversations && Array.isArray(data.conversations)) {
          // 保留所有对话
          setConversations(data.conversations)
        }
      })
      .catch(err => console.error('Failed to fetch conversations:', err))

    const interval = setInterval(() => {
      fetch('/api/trades')
        .then(res => res.json())
        .then(data => {
          // 按照exit_human_time从新到旧排序
          const sortedTrades = (data.trades || []).sort((a: Trade, b: Trade) => {
            return new Date(b.exit_human_time).getTime() - new Date(a.exit_human_time).getTime()
          })
          setTrades(sortedTrades.slice(0, 100))
        })
      
      fetch('/api/account-totals')
        .then(res => res.json())
        .then(data => {
          console.log('→ Account Totals API Response:', data)
          // API 返回的格式是 { accountTotals: [...], lastHourlyMarkerRead: 273, serverTime: ... }
          const accounts = data.accountTotals || []
          setAccountTotals(accounts.slice(0, 10))
        })
        .catch(err => {
          console.error('✗ Failed to fetch account totals:', err)
          setAccountTotals([]) // 失败时设置空数组
        })
      
      fetch('/api/conversations')
        .then(res => res.json())
        .then(data => {
          if (data.conversations && Array.isArray(data.conversations)) {
            // 保留所有对话
            setConversations(data.conversations)
          }
        })
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const toggleModelExpand = (conversationId: string, event?: React.MouseEvent) => {
    const newExpanded = new Set<string>()
    // 如果点击的是已展开的对话，则关闭它
    // 否则，关闭所有其他对话，只展开当前对话
    if (!expandedModels.has(conversationId)) {
      // 记录点击位置
      const clickedElement = event?.currentTarget as HTMLElement
      const scrollContainer = clickedElement?.closest('.overflow-auto')
      const clickY = clickedElement?.getBoundingClientRect().top
      
      newExpanded.add(conversationId)
      
      // 展开后保持点击位置不变
      setTimeout(() => {
        if (scrollContainer && clickY && clickedElement) {
          const newY = clickedElement.getBoundingClientRect().top
          const diff = newY - clickY
          
          // 检查元素是否在可视区域内
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementRect = clickedElement.getBoundingClientRect()
          const isInView = elementRect.top >= containerRect.top && 
                          elementRect.bottom <= containerRect.bottom
          
          // 只有当元素不在可视区域时才滚动
          if (!isInView) {
            scrollContainer.scrollTop += diff
          }
        }
      }, 50)
    }
    setExpandedModels(newExpanded)
  }

  const toggleSection = (key: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedSections(newExpanded)
  }

  const togglePositionExpand = (key: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const newExpanded = new Set(expandedPositions)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
      setViewButtonPosition(null)
    } else {
      newExpanded.add(key)
      const rect = event.currentTarget.getBoundingClientRect()
      
      // 计算弹出框的位置，确保不会超出屏幕
      // 弹出框大小约为 350px 宽，内容高度可变
      const popupWidth = 350
      const popupHeight = 150 // 估计高度
      
      let x = rect.left
      let y = rect.top
      
      // 如果右侧空间不足，向左调整
      if (x + popupWidth > window.innerWidth) {
        x = window.innerWidth - popupWidth - 10
      }
      
      // 如果左侧超出，调整到最左
      if (x < 10) {
        x = 10
      }
      
      // 默认显示在按钮上方，如果上方空间不足则显示在下方
      let showBelow = false
      if (y - popupHeight < 10) {
        // 上方空间不足，显示在按钮下方
        y = rect.bottom
        showBelow = true
      }
      
      setViewButtonPosition({ x, y, showBelow })
    }
    setExpandedPositions(newExpanded)
  }

  const getModelColor = (modelId: string) => MODEL_COLORS[modelId] || 'rgb(0, 0, 0)'
  const getModelName = (modelId: string) => MODEL_NAMES[modelId] || modelId.toUpperCase()

  // 计算实时的 NOTIONAL 和 UNREAL P&L
  const calculateRealtimePositionData = (symbol: string, position: any) => {
    if (!cryptoPrices || !cryptoPrices[symbol]) {
      return {
        notional: position.notional_usd || 0,
        unrealizedPnl: position.unrealized_pnl || 0
      }
    }

    const currentPrice = cryptoPrices[symbol].price
    const quantity = Math.abs(position.quantity || 0)
    
    // NOTIONAL = 当前价格 × 数量
    const notional = currentPrice * quantity
    
    // UNREAL P&L = (当前价格 - 入场价格) × 数量
    const priceDiff = currentPrice - (position.entry_price || 0)
    const unrealizedPnl = priceDiff * (position.quantity || 0)
    
    return {
      notional,
      unrealizedPnl
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'COMPLETED TRADES':
        return (
          <div className="live-trades terminal-text flex h-full min-h-0 flex-1 flex-col overflow-hidden font-mono text-xs font-black">
            <div className="flex h-full flex-col">
              <div className="hidden md:block">
                <div className="border-b border-border bg-surface-elevated px-2 pb-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <span className="text-black font-mono text-xs font-bold">FILTER:</span>
                      <div className="relative">
                        <button 
                          className="terminal-text hover:border-terminal-green focus:border-terminal-green flex items-center space-x-1 border border-border bg-surface px-1 py-0.5 font-mono text-xs font-normal focus:outline-none"
                          onClick={() => setIsFilterOpen(!isFilterOpen)}
                        >
                          <span>{filterModel}</span>
                          <span className="text-terminal-green">▼</span>
                        </button>
                        {isFilterOpen && (
                          <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] border border-border bg-surface shadow-lg">
                            <div 
                              className="terminal-text cursor-pointer px-2 py-1 font-mono text-xs hover:bg-surface-elevated"
                              onClick={() => {
                                setFilterModel('ALL MODELS')
                                setIsFilterOpen(false)
                              }}
                            >
                              ALL MODELS
                            </div>
                            {Array.from(new Set(accountTotals.map(account => account.model_id)))
                              .filter(modelId => modelId !== 'buynhold_btc' && modelId !== 'btc-buy-hold')
                              .map((modelId) => (
                              <div 
                                key={modelId}
                                className="terminal-text flex cursor-pointer items-center space-x-1 px-2 py-1 font-mono text-xs hover:bg-surface-elevated"
                                onClick={() => {
                                  setFilterModel(modelId)
                                  setIsFilterOpen(false)
                                }}
                              >
                                <img 
                                  src={`/logos/${modelId.replace(/-/g, '_')}_logo.png`}
                                  alt={getModelName(modelId)}
                                  className="size-3 flex-shrink-0"
                                  onError={(e) => {e.currentTarget.style.display = 'none'}}
                                />
                                <span>{getModelName(modelId)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {filterModel !== 'ALL MODELS' && (
                        <button 
                          onClick={() => setFilterModel('ALL MODELS')}
                          className="terminal-text text-terminal-negative px-1 font-mono text-[11px] hover:text-red-400"
                        >
                          CLEAR
                        </button>
                      )}
                    </div>
                    <span className="text-black font-mono text-xs ml-auto text-right">
                      Showing Last {trades.length} Trades
                    </span>
                  </div>
                </div>
              </div>
              <div className="overflow-auto">
                {loading ? (
                  <div className="p-4 text-center text-terminal-green">Loading trades...</div>
                ) : (
                  (() => {
                    const filtered = trades.filter(trade => {
                      // 排除 BTC Buy&Hold 模型
                      if (trade.model_id === 'buynhold_btc' || trade.model_id === 'btc-buy-hold') {
                        return false
                      }
                      // 应用模型过滤
                      return filterModel === 'ALL MODELS' || trade.model_id === filterModel
                    })
                    console.log('🔍 Filter:', filterModel)
                    console.log('🔍 Total trades:', trades.length)
                    console.log('🔍 Filtered trades:', filtered.length)
                    return filtered
                  })().map((trade) => {
                      const modelColor = getModelColor(trade.model_id)
                      const modelName = getModelName(trade.model_id)
                      const isProfitable = trade.realized_net_pnl >= 0
                      
                      return (
                        <div key={trade.id} className="transition-all duration-300 ease-out">
                          <div 
                            className="group bg-white transition-all duration-300" 
                            style={{backgroundColor: `${modelColor.replace('rgb', 'rgba').replace(')', ', 0.03)')}`}}
                          >
                            <div className="border-b border-gray-400 p-1 sm:p-2 mx-1 sm:mx-2">
                              <div className="mb-1.5 flex items-start justify-between">
                                <div className="flex items-center gap-2 max-w-[75%]">
                                  <img 
                                    src={`/logos/${trade.model_id.replace(/-/g, '_')}_logo.png`}
                                    alt={modelName}
                                    className="size-4"
                                    onError={(e) => {e.currentTarget.style.display = 'none'}}
                                  />
                                  <span className="font-mono text-[10px] sm:text-xs text-black font-semibold">
                                    <span style={{color: modelColor}}>{modelName}</span>
                                    {' completed a '}
                                    <span className={trade.side === 'long' ? 'terminal-positive' : 'terminal-negative'}>
                                      {trade.side}
                                    </span>
                                    {' trade on '}
                                    <span className="inline-flex items-baseline gap-1 font-semibold">
                                      <img 
                                        src={`/coins/${trade.symbol.toLowerCase()}.svg`}
                                        alt={trade.symbol}
                                        className="size-3 pt-0.5"
                                      />
                                      {trade.symbol}
                                    </span>
                                    !
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] text-gray-500 font-normal">
                                  {new Date(trade.exit_human_time).toLocaleString('en-US', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </span>
                              </div>
                              <div className="relative space-y-0.5 text-[10px] sm:text-xs">
                                <div className="font-mono text-black font-normal">
                                  Price: ${trade.entry_price.toLocaleString()} → 
                                  <span className="text-black">
                                    ${trade.exit_price.toLocaleString()}
                                  </span>
                                </div>
                                <div className="font-mono text-black font-normal">
                                  Quantity: {Math.abs(trade.quantity)}
                                </div>
                                <div className="font-mono text-black font-normal">
                                  Notional: ${(trade.entry_price * Math.abs(trade.quantity)).toLocaleString(undefined, {maximumFractionDigits: 0})} → 
                                  <span className="text-black">
                                    ${(trade.exit_price * Math.abs(trade.quantity)).toLocaleString(undefined, {maximumFractionDigits: 0})}
                                  </span>
                                </div>
                                <div className="font-mono text-black font-normal">
                                  Holding time: {(() => {
                                    const hours = Math.floor((trade.exit_time - trade.entry_time) / 3600)
                                    const minutes = Math.floor(((trade.exit_time - trade.entry_time) % 3600) / 60)
                                    return `${hours}H ${minutes}M`
                                  })()}
                                </div>
                                <div className="mt-3 flex items-center space-x-2">
                                  <span className="font-mono text-xs sm:text-sm text-black font-normal uppercase tracking-wide">
                                    Net P&L:
                                  </span>
                                  <span className={`font-mono text-sm sm:text-base font-semibold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                                    {isProfitable ? '+' : ''}${trade.realized_net_pnl.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </div>
        )
      
      case 'MODELCHAT':
        return (
          <div className="terminal-text flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface text-xs">
            <div className="hidden md:block">
              <div className="border-b border-border bg-surface-elevated px-2 pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <span className="text-black font-mono text-xs font-bold">FILTER:</span>
                    <div className="relative">
                      <button 
                        className="terminal-text hover:border-terminal-green focus:border-terminal-green flex items-center space-x-1 border border-border bg-surface px-1 py-0.5 font-mono text-xs font-normal focus:outline-none"
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                      >
                        <span>{filterModel}</span>
                        <span className="text-terminal-green">▼</span>
                      </button>
                      {isFilterOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] border border-border bg-surface shadow-lg">
                          <div 
                            className="terminal-text cursor-pointer px-2 py-1 font-mono text-xs hover:bg-surface-elevated"
                            onClick={() => {
                              setFilterModel('ALL MODELS')
                              setIsFilterOpen(false)
                            }}
                          >
                            ALL MODELS
                          </div>
                          {Array.from(new Set(accountTotals.map(account => account.model_id)))
                            .filter(modelId => modelId !== 'buynhold_btc' && modelId !== 'btc-buy-hold')
                            .map((modelId) => (
                            <div 
                              key={modelId}
                              className="terminal-text flex cursor-pointer items-center space-x-1 px-2 py-1 font-mono text-xs hover:bg-surface-elevated"
                              onClick={() => {
                                setFilterModel(modelId)
                                setIsFilterOpen(false)
                              }}
                            >
                              <img 
                                src={`/logos/${modelId.replace(/-/g, '_')}_logo.png`}
                                alt={getModelName(modelId)}
                                className="size-3 flex-shrink-0"
                                onError={(e) => {e.currentTarget.style.display = 'none'}}
                              />
                              <span>{getModelName(modelId)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 min-h-0 flex-1 overflow-auto">
              <div className="space-y-0">
                {sortedAccountTotals.length === 0 && (
                  <div className="space-y-1 p-2 font-mono text-xs text-foreground">
                    <div className="flex items-center space-x-2">
                      <span>&gt;</span>
                      <span>
                        <TypeWriter text="INITIALIZING CHAT FEED..." speed={100} />
                      </span>
                    </div>
                    <div className="ml-4 flex items-center space-x-2">
                      <span className="text-yellow-500">[</span>
                      <span className="animate-pulse">████████████</span>
                      <span className="text-yellow-500">]</span>
                    </div>
                    <div className="ml-4 flex items-center space-x-2">
                      <span className="animate-breathe text-black font-mono text-xs">STATUS: CONNECTING TO CONVERSATION API</span>
                    </div>
                  </div>
                )}
                {sortedAccountTotals.map((account, accountIndex) => {
                  if (filterModel !== 'ALL MODELS' && account.model_id !== filterModel) {
                    return null
                  }
                  
                  const conversationId = account.conversationId || account.model_id
                  const isExpanded = expandedModels.has(conversationId)
                  const modelColor = getModelColor(account.model_id)
                  const modelName = getModelName(account.model_id)
                  const positionCount = Object.keys(account.positions || {}).length
                  // 对话已经附加在 account 对象上
                  const conversation = account.conversation
                  
                  // 生成简短的摘要文本
                  const getSummaryText = () => {
                    // 优先显示 cot_trace_summary
                    if (conversation && conversation.cot_trace_summary) {
                      return conversation.cot_trace_summary
                    }
                    
                    // 如果没有 cot_trace_summary，使用之前的逻辑
                    if (conversation && conversation.llm_response) {
                      const positions = Object.values(conversation.llm_response)
                      const holdPositions = positions.filter((p: any) => p.signal === 'hold')
                      if (holdPositions.length > 0) {
                        const coins = holdPositions.map((p: any) => p.coin).join(', ')
                        return `I'm maintaining my current profitable positions across ${coins}, as they are all trading above my stop-loss levels and haven't triggered my invalidation conditions. My overall account value has grown to $${account.dollar_equity?.toFixed(2)} from a starting capital of $10,000.`
                      }
                    }
                    return `Holding ${positionCount} position${positionCount !== 1 ? 's' : ''} with total unrealized P&L of $${account.total_unrealized_pnl?.toFixed(2)}. Account value: $${account.dollar_equity?.toFixed(2)}.`
                  }
                  
                  return (
                    <div 
                      key={`${account.model_id}-${accountIndex}`} 
                      id={`conversation-${conversationId}`}
                      className="transition-all duration-300 ease-out"
                    >
                      <div className="group">
                        <div 
                          className="group cursor-pointer bg-white px-2 py-2 transition-colors hover:opacity-80"
                          onClick={(e) => toggleModelExpand(conversationId, e)}
                        >
                          <div className="flex space-x-2">
                            <img 
                              src={`/logos/${account.model_id.replace(/-/g, '_')}_logo.png`} 
                              alt={modelName}
                              className="size-6 flex-shrink-0 mt-6"
                              onError={(e) => {e.currentTarget.style.display = 'none'}}
                            />
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <span className="terminal-text text-sm font-semibold" style={{color: modelColor}}>
                                  {modelName}
                                </span>
                                <span className="terminal-text text-[9px] text-gray-500">
                                  {conversation ? (() => {
                                    const date = new Date(conversation.inserted_at * 1000)
                                    const month = String(date.getMonth() + 1).padStart(2, '0')
                                    const day = String(date.getDate()).padStart(2, '0')
                                    const hours = String(date.getHours()).padStart(2, '0')
                                    const minutes = String(date.getMinutes()).padStart(2, '0')
                                    const seconds = String(date.getSeconds()).padStart(2, '0')
                                    return `${month}/${day} ${hours}:${minutes}:${seconds}`
                                  })() : ''}
                                </span>
                              </div>
                              <div 
                                className="relative rounded p-3 border" 
                                style={{
                                  borderColor: modelColor,
                                  backgroundColor: `${modelColor.replace('rgb', 'rgba').replace(')', ', 0.05)')}`
                                }}
                              >
                                <div className="terminal-text text-xs leading-relaxed text-black">
                                  {getSummaryText()}
                                </div>
                                <div className="absolute right-2 pointer-events-none" style={{bottom: '0.08rem'}}>
                                  <span className="text-[8px] text-gray-400 italic">click to expand</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-2">
                            <div className="mt-3 space-y-3 border-t border-gray-800 pt-3 min-h-0 transition-all">
                            {/* USER_PROMPT Section */}
                            <div>
                              <button 
                                className="mb-2 flex w-full items-center space-x-2 text-left px-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSection(`${conversationId}-prompt`)
                                }}
                              >
                                <span className={`transform text-gray-500 transition-transform ${expandedSections.has(`${conversationId}-prompt`) ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                                <span className="font-mono text-sm text-gray-500">USER_PROMPT</span>
                              </button>
                              <div className={`ml-4 px-2 overflow-hidden transition-all duration-200 ${expandedSections.has(`${conversationId}-prompt`) ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="rounded border border-border bg-surface-elevated p-3 text-black text-[10px] prose prose-sm max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {conversation?.user_prompt || `Current market data and account information for ${modelName}\nAccount Value: $${account.dollar_equity?.toFixed(2)}\nTotal Unrealized P&L: $${account.total_unrealized_pnl?.toFixed(2)}\nActive Positions: ${positionCount}`}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            </div>

                            {/* CHAIN_OF_THOUGHT Section */}
                            <div>
                              <button 
                                className="mb-2 flex w-full items-center space-x-2 text-left px-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSection(`${conversationId}-thought`)
                                }}
                              >
                                <span className={`transform text-gray-500 transition-transform ${expandedSections.has(`${conversationId}-thought`) ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                                <span className="font-mono text-sm text-gray-500">CHAIN_OF_THOUGHT</span>
                              </button>
                              <div className={`ml-4 px-2 overflow-hidden transition-all duration-200 ${expandedSections.has(`${conversationId}-thought`) ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="rounded border border-border bg-surface-elevated p-3 text-black text-[10px] prose prose-sm max-w-none">
                                  {conversation?.cot_trace ? (
                                    typeof conversation.cot_trace === 'string' ? (
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{conversation.cot_trace}</ReactMarkdown>
                                    ) : (
                                      <div className="space-y-2">
                                        <p className="font-semibold mb-2">Analyzing current positions:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                          {Object.entries(conversation.cot_trace).map(([symbol, data]: [string, any]) => (
                                            <li key={symbol}>
                                              {symbol}: {data.signal?.toUpperCase()} with {typeof data.confidence === 'number' ? (data.confidence * 100).toFixed(0) : 'N/A'}% confidence
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )
                                  ) : (
                                    <div>
                                      <p className="font-semibold mb-2">Analyzing current positions:</p>
                                      <ul className="list-disc ml-4 space-y-1">
                                        {Object.entries(account.positions || {}).map(([symbol, pos]: [string, any]) => (
                                          <li key={symbol}>
                                            {symbol}: {pos.quantity > 0 ? 'LONG' : 'SHORT'} position with {typeof pos.confidence === 'number' ? (pos.confidence * 100).toFixed(0) : 'N/A'}% confidence
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* TRADING_DECISIONS Section */}
                            <div>
                              <button 
                                className="mb-2 flex w-full items-center space-x-2 text-left px-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSection(`${conversationId}-decisions`)
                                }}
                              >
                                <span className={`transform text-gray-500 transition-transform ${expandedSections.has(`${conversationId}-decisions`) ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                                <span className="font-mono text-sm text-gray-500">TRADING_DECISIONS</span>
                              </button>
                              <div className={`ml-4 px-2 overflow-hidden transition-all duration-200 ${expandedSections.has(`${conversationId}-decisions`) ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="grid grid-cols-1 gap-3">
                                    {conversation?.llm_response ? (
                                      Object.entries(conversation.llm_response).map(([symbol, decision]: [string, any]) => (
                                        <div key={symbol} className="rounded border border-border bg-surface-elevated p-3 transition-colors hover:bg-surface-hover">
                                          <div className="mb-2 flex items-center justify-between">
                                            <span className="font-mono font-bold text-foreground">{decision.coin}</span>
                                            <div className="flex items-center space-x-2">
                                              <span className={`rounded border px-2 py-1 font-mono text-xs ${
                                                decision.signal === 'hold' ? 'bg-blue-500/20 border-blue-500 text-blue-500' :
                                                decision.signal === 'buy' ? 'bg-green-500/20 border-green-500 text-green-500' :
                                                'bg-red-500/20 border-red-500 text-red-500'
                                              }`}>
                                                {decision.signal?.toUpperCase()}
                                              </span>
                                              <span className="font-mono text-xs text-foreground-subtle">
                                                {(decision.confidence * 100).toFixed(0)}%
                                              </span>
                                            </div>
                                          </div>
                                          <p className="font-mono text-xs text-foreground-subtle">
                                            QUANTITY: {Math.abs(decision.quantity)}
                                          </p>
                                        </div>
                                      ))
                                    ) : (
                                      Object.entries(account.positions || {}).map(([symbol, pos]: [string, any]) => (
                                        <div key={symbol} className="rounded border border-border bg-surface-elevated p-3 transition-colors hover:bg-surface-hover">
                                          <div className="mb-2 flex items-center justify-between">
                                            <span className="font-mono font-bold text-foreground">{symbol}</span>
                                            <div className="flex items-center space-x-2">
                                              <span className="rounded border px-2 py-1 font-mono text-xs bg-blue-500/20 border-blue-500 text-blue-500">
                                                HOLD
                                              </span>
                                              <span className="font-mono text-xs text-foreground-subtle">
                                                {(pos.confidence * 100).toFixed(0)}%
                                              </span>
                                            </div>
                                          </div>
                                          <p className="font-mono text-xs text-foreground-subtle">
                                            QUANTITY: {Math.abs(pos.quantity)}
                                          </p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      
      case 'POSITIONS':
        return (
          <div className="terminal-text flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface text-xs">
            <div className="hidden md:block">
              <div className="border-b border-border bg-surface-elevated px-2 pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <span className="text-black font-mono text-xs font-bold">FILTER:</span>
                    <div className="relative">
                      <button 
                        className="terminal-text hover:border-terminal-green focus:border-terminal-green flex items-center space-x-1 border border-border bg-surface px-1 py-0.5 font-mono text-xs font-normal focus:outline-none"
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                      >
                        <span>{filterModel}</span>
                        <span className="text-terminal-green">▼</span>
                      </button>
                      {isFilterOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] border border-border bg-surface shadow-lg">
                          <div 
                            className="terminal-text cursor-pointer px-2 py-1 font-mono text-xs hover:bg-surface-elevated"
                            onClick={() => {
                              setFilterModel('ALL MODELS')
                              setIsFilterOpen(false)
                            }}
                          >
                            ALL MODELS
                          </div>
                          {Array.from(new Set(accountTotals.map(account => account.model_id)))
                            .filter(modelId => modelId !== 'buynhold_btc' && modelId !== 'btc-buy-hold')
                            .map((modelId) => (
                            <div 
                              key={modelId}
                              className="terminal-text flex cursor-pointer items-center space-x-1 px-2 py-1 font-mono text-xs hover:bg-surface-elevated"
                              onClick={() => {
                                setFilterModel(modelId)
                                setIsFilterOpen(false)
                              }}
                            >
                              <img 
                                src={`/logos/${modelId.replace(/-/g, '_')}_logo.png`}
                                alt={getModelName(modelId)}
                                className="size-3 flex-shrink-0"
                                onError={(e) => {e.currentTarget.style.display = 'none'}}
                              />
                              <span>{getModelName(modelId)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-auto">
              {positionsOrderedAccounts.map((account, accountIndex) => {
                // 过滤掉 BTC Buy&Hold
                if (account.model_id === 'buynhold_btc' || account.model_id === 'btc-buy-hold') return null
                
                if (filterModel !== 'ALL MODELS' && account.model_id !== filterModel) return null
                
                const positions = Object.entries(account.positions || {})
                if (positions.length === 0) return null
                
                const modelColor = getModelColor(account.model_id)
                const modelName = getModelName(account.model_id)
                
                return (
                  <div 
                    key={`position-${account.model_id}-${accountIndex}`} 
                    className="pb-0" 
                    style={{backgroundColor: `${modelColor.replace('rgb', 'rgba').replace(')', ', 0.1)')}`}}
                  >
                    <div className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center">
                          <img 
                            src={`/logos/${account.model_id.replace(/-/g, '_')}_logo.png`}
                            alt={modelName}
                            className="mr-2 size-4"
                            onError={(e) => {e.currentTarget.style.display = 'none'}}
                          />
                          <span className="text-sm font-semibold" style={{color: modelColor}}>
                            {modelName}
                          </span>
                        </div>
                        <div className="text-right pr-3">
                          <span className="text-xs md:text-[11px] font-medium text-black">TOTAL UNREALIZED P&L: </span>
                          <span className={`text-xs md:text-[11px] font-medium ${
                            (() => {
                              const totalPnl = positions.reduce((sum, [symbol, pos]: [string, any]) => {
                                const realtimeData = calculateRealtimePositionData(symbol, pos)
                                return sum + realtimeData.unrealizedPnl
                              }, 0)
                              return totalPnl >= 0 ? 'terminal-positive' : 'terminal-negative'
                            })()
                          }`}>
                            ${(() => {
                              const totalPnl = positions.reduce((sum, [symbol, pos]: [string, any]) => {
                                const realtimeData = calculateRealtimePositionData(symbol, pos)
                                return sum + realtimeData.unrealizedPnl
                              }, 0)
                              return totalPnl.toFixed(2)
                            })()}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 pl-1 pr-1 relative">
                        <div className="grid grid-cols-6 gap-1 text-[9px] font-medium text-black border-b border-gray-300 pb-1">
                          <div>SIDE</div>
                          <div>COIN</div>
                          <div>LEVERAGE</div>
                          <div>NOTIONAL</div>
                          <div>EXIT PLAN</div>
                          <div>UNREAL P&L</div>
                        </div>
                        {positions.map(([symbol, pos]: [string, any]) => {
                          const posKey = `${account.model_id}-${symbol}`
                          const isExpanded = expandedPositions.has(posKey)
                          const realtimeData = calculateRealtimePositionData(symbol, pos)
                          
                          return (
                            <div key={symbol}>
                              <div className="grid grid-cols-6 gap-1 text-xs relative">
                                <div className={pos.quantity > 0 ? 'terminal-positive' : 'terminal-negative'}>
                                  {pos.quantity > 0 ? 'LONG' : 'SHORT'}
                                </div>
                                <div className="flex items-center">
                                  <img src={`/coins/${symbol.toLowerCase()}.svg`} alt={symbol} className="w-4 h-4 mr-1" />
                                  <span>{symbol}</span>
                                </div>
                                <div>{pos.leverage}X</div>
                                <div className="terminal-positive">${realtimeData.notional.toFixed(0)}</div>
                                <div className="relative inline-block">
                                  <button 
                                    onClick={(e) => togglePositionExpand(posKey, e)}
                                    className="px-2 py-0 text-[8px] border border-gray-400 bg-white hover:bg-gray-50 transition-colors h-4 flex items-center"
                                  >
                                    VIEW
                                  </button>
                                  {isExpanded && pos.exit_plan && viewButtonPosition && (
                                    <div 
                                      className="fixed bg-white border border-gray-300 p-1 text-[10px] shadow-lg z-50 leading-tight min-w-[250px] max-w-[350px]"
                                      style={{
                                        left: `${viewButtonPosition.x}px`,
                                        top: `${viewButtonPosition.y}px`,
                                        transform: viewButtonPosition.showBelow ? 'none' : 'translateY(-100%)'
                                      }}
                                    >
                                      <div className="font-semibold mb-0.5">Exit Plan:</div>
                                      <div className="space-y-0.5">
                                        <div className="leading-tight break-words">Target: ${pos.exit_plan.profit_target?.toFixed(2)}</div>
                                        <div className="leading-tight break-words">Stop: ${pos.exit_plan.stop_loss?.toFixed(2)}</div>
                                        {pos.exit_plan.invalidation_condition && (
                                          <div className="leading-tight break-words">Invalid Condition: {pos.exit_plan.invalidation_condition}</div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className={realtimeData.unrealizedPnl >= 0 ? 'terminal-positive' : 'terminal-negative'}>
                                  ${realtimeData.unrealizedPnl.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="border-b border-gray-600 mx-2"></div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      
      case 'README.TXT':
        return (
          <div className="prose flex h-full flex-col overflow-y-auto bg-white p-6">
            <div className="min-h-0 space-y-6 pb-32 text-[13px] leading-relaxed text-black terminal-text">
              <div>
                <div className="font-bold text-gray-800 mb-3 text-base">A Better Benchmark</div>
                <b>Alpha Arena</b> is the first benchmark designed to measure AI's investing abilities. Each model is given $10,000 of <b className="terminal-positive">real money</b>, in <b className="terminal-positive">real markets</b>, with identical prompts and input data.
              </div>
              
              <div>
                Our goal with Alpha Arena is to make benchmarks more like the real world, and markets are perfect for this. They're dynamic, adversarial, open-ended, and endlessly unpredictable. They challenge AI in ways that static benchmarks cannot.
              </div>
              
              <div>
                <b>Markets are the ultimate test of intelligence.</b>
              </div>
              
              <div>
                So do we need to train models with new architectures for investing, or are LLMs good enough? Let's find out.
              </div>
              
              <div className="my-6 h-px w-full rounded bg-black"></div>
              
              <div className="space-y-3">
                <div>
                  <span className="font-bold text-gray-800 text-base">The Contestants</span>
                </div>
                <div className="ml-4">
                  <div className="flex flex-wrap gap-x-2 gap-y-2">
                    <span className="font-medium" style={{color: 'rgb(255, 107, 53)'}}>Claude 4.5 Sonnet,</span>
                    <span className="font-medium" style={{color: 'rgb(77, 107, 254)'}}>DeepSeek V3.1 Chat,</span>
                    <span className="font-medium" style={{color: 'rgb(66, 133, 244)'}}>Gemini 2.5 Pro,</span>
                    <span className="font-medium" style={{color: 'rgb(16, 163, 127)'}}>GPT 5,</span>
                    <span className="font-medium" style={{color: 'rgb(0, 0, 0)'}}>Grok 4,</span>
                    <span className="font-medium" style={{color: 'rgb(139, 92, 246)'}}>Qwen 3 Max</span>
                  </div>
                </div>
              </div>
              
              <div className="my-6 h-px w-full rounded bg-black"></div>
              
              <div className="space-y-3">
                <div>
                  <span className="font-bold text-gray-800 text-base">Competition Rules</span>
                </div>
                <div className="ml-4 space-y-1">
                  <div className="flex items-start space-x-2">
                    <span style={{color: 'rgb(102, 102, 102)'}}>└─</span>
                    <span className="text-black"><b>Starting Capital:</b> each model gets $10,000 of real capital</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span style={{color: 'rgb(102, 102, 102)'}}>└─</span>
                    <span className="text-black"><b>Market:</b> Crypto perpetuals on Hyperliquid</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span style={{color: 'rgb(102, 102, 102)'}}>└─</span>
                    <span className="text-black"><b>Objective:</b> Maximize risk-adjusted returns.</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span style={{color: 'rgb(102, 102, 102)'}}>└─</span>
                    <span className="text-black"><b>Transparency:</b> All model outputs and their corresponding trades are public.</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span style={{color: 'rgb(102, 102, 102)'}}>└─</span>
                    <span className="text-black"><b>Autonomy:</b> Each AI must produce alpha, size trades, time trades and manage risk.</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span style={{color: 'rgb(102, 102, 102)'}}>└─</span>
                    <span className="text-black"><b>Duration:</b> Season 1 will run until November 3rd, 2025 at 5 p.m. EST</span>
                  </div>
                </div>
              </div>
              
              <div className="h-8"></div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="hidden md:block md:w-[280px] lg:w-[320px] xl:w-[380px] 2xl:w-[500px] flex-shrink-0 md:border-l border-border bg-surface overflow-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-1 flex border-b-2 border-t md:border-t-0 border-border flex-shrink-0">
          {(['COMPLETED TRADES', 'MODELCHAT', 'POSITIONS', 'README.TXT'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`terminal-text flex-1 border-r-2 border-border px-2 py-1 md:py-2 text-[8px] md:text-[10px] transition-colors ${
                activeTab === tab
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderTabContent()}
        </div>
      </div>
    </div>
  )
}
