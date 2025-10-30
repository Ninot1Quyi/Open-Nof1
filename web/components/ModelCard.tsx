'use client'

import NumberFlow from '@number-flow/react'

interface ModelCardProps {
  modelId: string
  modelName: string
  logoPath: string
  currentValue: number
  percentChange: number
  isSelected?: boolean
  onClick?: () => void
}

export default function ModelCard({
  modelId,
  modelName,
  logoPath,
  currentValue,
  percentChange,
  isSelected = false,
  onClick,
}: ModelCardProps) {
  return (
    <div
      className={`
        terminal-text relative cursor-pointer border border-border 
        px-1.5 py-0.5 md:p-2 transition-all duration-200
        ${isSelected ? 'bg-surface-hover ring-2 ring-blue-500' : 'bg-surface hover:bg-surface-hover'}
      `}
      style={{
        borderColor: 'var(--border)',
        flex: '0 0 calc(14.2857% - 0.428571rem)',
      }}
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-0.5 md:gap-1 w-full">
        {/* Logo 和名称 */}
        <div className="flex items-center justify-center gap-1 md:gap-2 w-full">
          <div className="relative flex-shrink-0">
            <img
              alt={modelName}
              loading="lazy"
              width={12}
              height={12}
              className="w-3 h-3 rounded object-cover"
              src={logoPath}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          <h3 className="text-xs font-medium text-foreground leading-tight text-center hidden md:block">
            {modelName}
          </h3>
        </div>

        {/* 价值显示 */}
        <div className="terminal-data whitespace-nowrap text-[7px] md:text-xs font-bold w-full flex justify-center items-baseline text-black">
          <span>$</span>
          <NumberFlow
            value={currentValue}
            format={{
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }}
            style={{
              fontVariantNumeric: 'tabular-nums',
              display: 'inline-block',
            }}
            animated
            trend={percentChange >= 0 ? 1 : -1}
          />
        </div>
      </div>
    </div>
  )
}
