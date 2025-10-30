'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import NumberFlow from '@number-flow/react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'
import { Group } from '@visx/group'
import { scaleTime, scaleLinear } from '@visx/scale'
import { LinePath, AreaClosed } from '@visx/shape'
import { curveLinear } from '@visx/curve'
import { ParentSize } from '@visx/responsive'
import { localPoint } from '@visx/event'
import { bisector } from 'd3-array'
import { timeFormat } from 'd3-time-format'

// 模型颜色配置（与原版一致）
const MODEL_COLORS: { [key: string]: string } = {
  'gpt-5': 'rgb(16, 163, 127)',
  'claude-sonnet-4-5': 'rgb(255, 107, 53)',
  'gemini-2-5-pro': 'rgb(66, 133, 244)',
  'gemini-2.5-pro': 'rgb(66, 133, 244)',
  'grok-4': 'rgb(0, 0, 0)',
  'deepseek-chat-v3.1': 'rgb(77, 107, 254)',
  'qwen3-max': 'rgb(139, 92, 246)',
  'buynhold_btc': 'rgb(156, 163, 175)',
  'btc-buy-hold': 'rgb(156, 163, 175)',
}

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

interface DataPoint {
  timestamp: number
  value: number
  modelId: string
  originalValue?: number  // 保留原始美元值用于工具提示
}

interface PerformanceChartProps {
  data: DataPoint[]
  selectedModel?: string | null
  timeRange?: 'ALL' | '72H'
  displayMode?: '$' | '%'
  initialBalance?: number
}

interface ChartProps extends PerformanceChartProps {
  width: number
  height: number
}

// 图表边距（响应式，与原版一致）
const getMargin = (width: number) => {
  if (width < 640) {
    return { top: 40, bottom: 40, left: 40, right: 20 }
  } else if (width < 768) {
    return { top: 50, bottom: 35, left: 80, right: 100 }
  } else if (width < 1024) {
    return { top: 55, bottom: 40, left: 80, right: 120 }
  } else {
    return { top: 60, bottom: 45, left: 80, right: 200 }
  }
}

const bisectDate = bisector<DataPoint, number>((d) => d.timestamp).left

function Chart({
  data,
  width,
  height,
  selectedModel = null,
  timeRange = 'ALL',
  displayMode = '$',
  initialBalance,
}: ChartProps) {
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null)
  const [pulseKey, setPulseKey] = useState(0)
  
  // 每3秒触发一次涟漪动画
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseKey(prev => prev + 1)
    }, 3000)
    return () => clearInterval(interval)
  }, [])
  
  // 响应式边距
  const margin = useMemo(() => getMargin(width), [width])
  
  // 计算内部尺寸
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // 过滤时间范围数据
  const filteredData = useMemo(() => {
    if (timeRange === 'ALL') {
      return data
    }
    
    // 72H = 72 hours in milliseconds
    const now = Date.now()
    const hours72 = 72 * 60 * 60 * 1000
    return data.filter((point) => now - point.timestamp <= hours72)
  }, [data, timeRange])

  // 计算每个模型的初始值（用于百分比计算）
  const initialValues = useMemo(() => {
    const initials: { [key: string]: number } = {}
    const grouped: { [key: string]: DataPoint[] } = {}
    
    filteredData.forEach((point) => {
      if (!grouped[point.modelId]) {
        grouped[point.modelId] = []
      }
      grouped[point.modelId].push(point)
    })
    
    Object.keys(grouped).forEach((modelId) => {
      const sorted = grouped[modelId].sort((a, b) => a.timestamp - b.timestamp)
      if (sorted.length > 0) {
        initials[modelId] = sorted[0].value
      }
    })
    
    return initials
  }, [filteredData])

  // 转换数据（$ 或 %）
  const transformedData = useMemo(() => {
    if (displayMode === '$') {
      return filteredData
    }
    
    // 转换为百分比变化
    return filteredData.map((point) => {
      const initial = initialValues[point.modelId] || point.value
      const percentChange = ((point.value - initial) / initial) * 100
      return {
        ...point,
        value: percentChange,
        originalValue: point.value,  // 保留原始美元值
      }
    })
  }, [filteredData, displayMode, initialValues])

  // 按模型分组数据
  const dataByModel = useMemo(() => {
    const grouped: { [key: string]: DataPoint[] } = {}
    transformedData.forEach((point) => {
      if (!grouped[point.modelId]) {
        grouped[point.modelId] = []
      }
      grouped[point.modelId].push(point)
    })
    // 按时间排序
    Object.keys(grouped).forEach((modelId) => {
      grouped[modelId].sort((a, b) => a.timestamp - b.timestamp)
    })
    
    console.log('📈 Chart rendering:', {
      displayMode,
      timeRange,
      totalDataPoints: transformedData.length,
      modelsCount: Object.keys(grouped).length,
      models: Object.keys(grouped),
      pointsPerModel: Object.entries(grouped).map(([id, points]) => ({
        model: id,
        points: points.length
      }))
    })
    
    return grouped
  }, [transformedData, displayMode, timeRange])

  // 计算比例尺
  const { xScale, yScale, xTickValues } = useMemo(() => {
    if (transformedData.length === 0) {
      return {
        xScale: scaleTime({ domain: [0, 1], range: [0, innerWidth] }),
        yScale: scaleLinear({ domain: [0, 1], range: [innerHeight, 0] }),
        xTickValues: [],
      }
    }

    const timestamps = transformedData.map((d) => d.timestamp)
    const values = transformedData.map((d) => d.value)

    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)

    const xScale = scaleTime({
      domain: [minTime, maxTime],
      range: [0, innerWidth],
    })

    const yScale = scaleLinear({
      domain: [Math.min(...values) * 0.95, Math.max(...values) * 1.05],
      range: [innerHeight, 0],
      nice: true,
    })

    // 根据宽度动态生成刻度值（与官方逻辑一致）
    const numTicks = width < 300 ? 1 : width < 400 ? 2 : width < 500 ? 3 : width < 600 ? 4 : width < 800 ? 5 : 8
    const [minDate, maxDate] = xScale.domain()
    const timeSpan = maxDate.getTime() - minDate.getTime()
    const tickInterval = timeSpan / (numTicks - 1)
    
    const tickValues: Date[] = Array.from({ length: numTicks }, (_, i) => 
      new Date(minDate.getTime() + i * tickInterval)
    )

    return { xScale, yScale, xTickValues: tickValues }
  }, [transformedData, innerWidth, innerHeight, width])

  // 过滤要显示的模型，并按照最新账户金额排序
  // 金额低的先渲染（z-index 低），金额高的后渲染（z-index 高，显示在前面）
  const modelsToShow = useMemo(() => {
    if (selectedModel) {
      return [selectedModel]
    }
    
    const modelIds = Object.keys(dataByModel)
    
    // 按照最新的账户金额排序
    return modelIds.sort((a, b) => {
      const dataA = dataByModel[a]
      const dataB = dataByModel[b]
      
      if (!dataA || dataA.length === 0) return -1
      if (!dataB || dataB.length === 0) return 1
      
      // 获取最新的数据点（最后一个点）
      const lastValueA = dataA[dataA.length - 1].value
      const lastValueB = dataB[dataB.length - 1].value
      
      // 金额低的排前面（先渲染），金额高的排后面（后渲染，z-index 高）
      return lastValueA - lastValueB
    })
  }, [selectedModel, dataByModel])

  if (data.length === 0) {
    console.log('⚠️ No chart data available')
    return (
      <div className="relative flex-1 bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-2">Loading chart data...</p>
          <p className="text-gray-400 text-xs">Fetching historical data from API</p>
        </div>
      </div>
    )
  }


  return (
    <svg 
        width={width} 
        height={height} 
        style={{ display: 'block' }}
      >
        <defs>
          {/* 扫描线效果 */}
          <pattern
            id="scanlines"
            x="0"
            y="0"
            width="100%"
            height="2"
            patternUnits="userSpaceOnUse"
          >
            <rect width="100%" height="1" fill="rgba(0, 255, 0, 0.02)" />
            <rect width="100%" height="1" y="1" fill="transparent" />
          </pattern>

          {/* 终端边框效果 */}
          <pattern
            id="terminalBorder"
            x="0"
            y="0"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="8" height="8" fill="transparent" />
            <rect width="1" height="8" fill="rgba(0, 255, 0, 0.1)" />
            <rect width="8" height="1" fill="rgba(0, 255, 0, 0.1)" />
          </pattern>

          {/* 模型图标定义 */}
          <clipPath id="circle-clip">
            <circle cx="0" cy="0" r="22.5" />
          </clipPath>

          {/* 每个模型的图标 - 彩色背景 + 白色logo */}
          <g id="circle-with-icon-gpt-5">
            <circle cx="0" cy="0" r="15.75" fill="#10a37f" stroke="none" />
            <image href="/logos_white/GPT_logo.png" x="-12.75" y="-12.75" width="25.5" height="25.5" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-claude-sonnet-4-5">
            <circle cx="0" cy="0" r="15.75" fill="#ff6b35" stroke="none" />
            <image href="/logos_white/Claude_logo.png" x="-12.75" y="-12.75" width="25.5" height="25.5" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-gemini-2.5-pro">
            <circle cx="0" cy="0" r="15.75" fill="#4285F4" stroke="none" />
            <image href="/logos_white/Gemini_logo.webp" x="-12.75" y="-12.75" width="25.5" height="25.5" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-grok-4">
            <circle cx="0" cy="0" r="15.75" fill="#000000" stroke="none" />
            <image href="/logos_white/Grok_logo.webp" x="-12.75" y="-12.75" width="25.5" height="25.5" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-deepseek-chat-v3.1">
            <circle cx="0" cy="0" r="15.75" fill="#4d6bfe" stroke="none" />
            <image href="/logos_white/deepseek_logo.png" x="-12.75" y="-12.75" width="25.5" height="25.5" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-qwen3-max">
            <circle cx="0" cy="0" r="15.75" fill="#8b5cf6" stroke="none" />
            <image href="/logos_white/qwen_logo.png" x="-12.75" y="-12.75" width="25.5" height="25.5" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-buynhold_btc">
            <circle cx="-2" cy="0" r="12.6" fill="rgba(128, 128, 128, 0.6)" stroke="#5a5a5a" strokeWidth="1.5" strokeDasharray="2,2" />
            <image href="/logos_white/btc_white.png" x="-12.2" y="-10.2" width="20.4" height="20.4" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          <g id="circle-with-icon-btc-buy-hold">
            <circle cx="-2" cy="0" r="12.6" fill="rgba(128, 128, 128, 0.6)" stroke="#5a5a5a" strokeWidth="1.5" strokeDasharray="2,2" />
            <image href="/logos_white/btc_white.png" x="-12.2" y="-10.2" width="20.4" height="20.4" clipPath="url(#circle-clip)" className="chart-icon grok-white" />
          </g>

          {/* Threshold colors for profit/loss */}
          <linearGradient id="area-gradient-profit" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="area-gradient-loss" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <Group transform={`translate(${margin.left}, ${margin.top})`}>
          {/* 细网格线 - 虚线 */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            height={innerHeight}
            stroke="rgba(0, 0, 0, 0.1)"
            strokeDasharray="1,3"
            strokeWidth={0.5}
            numTicks={4}
          />
          <GridColumns
            scale={xScale}
            height={innerHeight}
            stroke="rgba(0, 0, 0, 0.1)"
            strokeDasharray="1,3"
            strokeWidth={0.5}
            numTicks={4}
          />
          
          {/* 粗网格线 - 实线 */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            height={innerHeight}
            stroke="rgba(0, 0, 0, 0.15)"
            strokeDasharray="none"
            strokeWidth={1}
            numTicks={2}
          />
          <GridColumns
            scale={xScale}
            height={innerHeight}
            stroke="rgba(0, 0, 0, 0.15)"
            strokeDasharray="none"
            strokeWidth={1}
            numTicks={2}
          />

          {/* 数据线 */}
          {modelsToShow.map((modelId) => {
            const modelData = dataByModel[modelId]
            if (!modelData || modelData.length === 0) return null

            const lastPoint = modelData[modelData.length - 1]
            const lastX = xScale(lastPoint.timestamp)
            const lastY = yScale(lastPoint.value)
            
            // 圆球半径（与 defs 中定义的一致）
            const circleRadius = modelId.includes('buynhold') ? 12.6 : 15.75

            const modelColor = MODEL_COLORS[modelId] || 'rgb(0, 0, 0)'
            const isHovered = hoveredModelId === modelId
            const shouldDim = hoveredModelId !== null && hoveredModelId !== modelId
            
            console.log('[PerformanceChart] Rendering model:', modelId, {
              selectedModel,
              isSelected: selectedModel === modelId,
              dataLength: modelData.length,
              displayMode,
              initialBalance
            })
            
            return (
              <g key={modelId}>
                {/* Area fill - only show when model is selected */}
                {selectedModel === modelId && modelData.length > 0 && (
                  <>
                    {/* Initial balance threshold line (invisible, for reference) */}
                    {displayMode === '$' && initialBalance && (() => {
                      const initBalance = initialBalance;
                      console.log('[PerformanceChart] Drawing shadow with initialBalance:', initBalance)
                      const thresholdY = yScale(initBalance);
                      
                      // Create data with initial point
                      const minTimestamp = Math.min(...modelData.map(d => d.timestamp));
                      const dataWithInitial = [
                        { timestamp: minTimestamp, value: initBalance, modelId },
                        ...modelData
                      ];
                      
                      return (
                        <>
                          {/* Profit area (above threshold) - Green */}
                          <defs>
                            <clipPath id={`threshold-clip-above-${modelId}`}>
                              <rect x="0" y="0" width={innerWidth} height={thresholdY} />
                            </clipPath>
                            <clipPath id={`threshold-clip-below-${modelId}`}>
                              <rect x="0" y={thresholdY} width={innerWidth} height={innerHeight - thresholdY} />
                            </clipPath>
                          </defs>
                          
                          {/* Green area for profit */}
                          <AreaClosed
                            data={dataWithInitial}
                            x={(d) => xScale(d.timestamp) ?? 0}
                            y={(d) => yScale(d.value) ?? 0}
                            y0={thresholdY}
                            yScale={yScale}
                            fill="url(#area-gradient-profit)"
                            curve={curveLinear}
                            clipPath={`url(#threshold-clip-above-${modelId})`}
                          />
                          
                          {/* Red area for loss */}
                          <AreaClosed
                            data={dataWithInitial}
                            x={(d) => xScale(d.timestamp) ?? 0}
                            y={(d) => yScale(d.value) ?? 0}
                            y0={thresholdY}
                            yScale={yScale}
                            fill="url(#area-gradient-loss)"
                            curve={curveLinear}
                            clipPath={`url(#threshold-clip-below-${modelId})`}
                          />
                          
                          {/* Threshold line at initial balance */}
                          <line
                            x1="0"
                            y1={thresholdY}
                            x2={innerWidth}
                            y2={thresholdY}
                            stroke="#666666"
                            strokeWidth="1"
                            strokeDasharray="2,2"
                            opacity="0.5"
                          />
                        </>
                      );
                    })()}
                  </>
                )}
                
                <LinePath
                  data={(() => {
                    // 如果选中且显示美元，添加初始点
                    if (selectedModel === modelId && displayMode === '$' && initialBalance && modelData.length > 0) {
                      const initBalance = initialBalance;
                      const minTimestamp = Math.min(...modelData.map(d => d.timestamp));
                      return [
                        { timestamp: minTimestamp, value: initBalance, modelId },
                        ...modelData
                      ];
                    }
                    return modelData;
                  })()}
                  x={(d) => xScale(d.timestamp) ?? 0}
                  y={(d) => yScale(d.value) ?? 0}
                  stroke={modelColor}
                  strokeWidth={width < 640 ? 1 : (isHovered ? 3 : 2)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  curve={curveLinear}
                  opacity={shouldDim ? 0.3 : 1}
                  style={{ 
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    filter: isHovered ? `drop-shadow(0 0 8px ${modelColor}40)` : 'none',
                    strokeDasharray: modelId.includes('buynhold') ? '5,5' : 'none'
                  }}
                  onMouseEnter={() => setHoveredModelId(modelId)}
                  onMouseLeave={() => setHoveredModelId(null)}
                />
                
                {/* 涟漪效果 - 每3秒触发一次 */}
                <g 
                  key={`${modelId}-pulse-${pulseKey}`}
                  transform={`translate(${lastX + circleRadius}, ${lastY})`}
                >
                  <circle
                    cx="0"
                    cy="0"
                    r={circleRadius + 8}
                    fill={modelColor}
                    opacity="0.4"
                    style={{
                      animation: 'pulse-out 1s ease-out forwards',
                      animationFillMode: 'forwards'
                    }}
                  />
                </g>
                
                {/* 线条末端的模型图标 - 向右偏移半径，使折线连接到左边缘 */}
                <g transform={`translate(${lastX + circleRadius}, ${lastY})`}>
                  <use
                    href={`#circle-with-icon-${modelId}`}
                    opacity={shouldDim ? 0.3 : 1}
                  />
                </g>
                
                {/* 数值标签 - 紧贴图标右侧，使用动态数字 */}
                {!modelId.includes('buynhold') && (
                  <g transform={`translate(${lastX + circleRadius + 20}, ${lastY - 9})`}>
                    <rect
                      x="0"
                      y="0"
                      width="65"
                      height="18"
                      rx="2"
                      fill={modelColor}
                      fillOpacity={shouldDim ? 0.3 : 0.94}
                      style={{ transition: 'fill-opacity 0.2s ease-in-out' }}
                    />
                    <foreignObject x="0" y="0" width="65" height="18">
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'white',
                        fontFamily: 'IBM Plex Mono, monospace',
                        opacity: shouldDim ? 0.3 : 1,
                        transition: 'opacity 0.2s ease-in-out'
                      }}>
                        {displayMode === '$' && <span>$</span>}
                        <NumberFlow
                          value={lastPoint.value}
                          format={{
                            style: 'decimal',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          }}
                          trend={1}
                          animated
                        />
                        {displayMode === '%' && <span>%</span>}
                      </div>
                    </foreignObject>
                  </g>
                )}
              </g>
            )
          })}

          {/* X 轴 */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            tickValues={xTickValues}
            stroke="rgba(0, 0, 0, 0.4)"
            strokeWidth={1.5}
            tickStroke="rgba(0, 0, 0, 0.6)"
            tickLength={8}
            hideAxisLine={false}
            hideTicks={false}
            hideZero={false}
            tickLabelProps={() => ({
              fill: 'rgba(0, 0, 0, 0.8)',
              fontSize: width < 640 ? 10 : 12,
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 600,
              textAnchor: 'middle',
            })}
            tickFormat={(date) => {
              const d = date instanceof Date ? date : new Date(Number(date))
              const hours = d.getHours()
              const minutes = d.getMinutes()
              // 如果是整点，显示日期和时间；否则只显示时间
              if (hours === 0 && minutes === 0) {
                return timeFormat('%b %d %H:%M')(d)
              } else {
                return timeFormat('%b %d %H:%M')(d)
              }
            }}
          />

          {/* Y 轴 */}
          <AxisLeft
            scale={yScale}
            stroke="rgba(0, 0, 0, 0.4)"
            strokeWidth={1.5}
            tickStroke="rgba(0, 0, 0, 0.6)"
            tickLength={8}
            hideAxisLine={false}
            hideTicks={false}
            hideZero={false}
            numTicks={width < 640 ? 3 : 6}
            tickLabelProps={() => ({
              fill: 'rgba(0, 0, 0, 0.8)',
              fontSize: width < 640 ? 10 : 12,
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: 600,
              textAnchor: 'end',
              dx: -8,
              dy: 4,
            })}
            tickFormat={(value) => {
              const numValue = Number(value)
              if (displayMode === '%') {
                return `${numValue.toFixed(width < 640 ? 0 : 1)}%`
              } else {
                const absValue = Math.abs(numValue)
                const sign = numValue < 0 ? '-' : ''
                if (width < 640) {
                  // 移动端：使用 K/M 缩写
                  if (absValue >= 1000000) {
                    return `${sign}$${(absValue / 1000000).toFixed(1)}M`
                  } else if (absValue >= 1000) {
                    return `${sign}$${(absValue / 1000).toFixed(0)}K`
                  } else {
                    return `${sign}$${absValue.toFixed(0)}`
                  }
                } else {
                  // 桌面端：完整数字
                  return `${sign}$${absValue.toLocaleString()}`
                }
              }
            }}
          />

        </Group>

      </svg>
  )
}

export default function PerformanceChart({
  data,
  selectedModel = null,
  timeRange = 'ALL',
  displayMode = '$',
  initialBalance,
}: PerformanceChartProps) {
  return (
    <div className="relative flex-1 bg-white">
      <ParentSize>
        {({ width, height }) => (
          <Chart
            data={data}
            width={width}
            height={height}
            selectedModel={selectedModel}
            timeRange={timeRange}
            displayMode={displayMode}
            initialBalance={initialBalance}
          />
        )}
      </ParentSize>
    </div>
  )
}
