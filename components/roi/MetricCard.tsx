'use client'

import ProgressBar from './ProgressBar'
import ProgressRing from './ProgressRing'
import Tooltip from './Tooltip'
import React from 'react'

interface MetricCardProps {
    label: string
    target: number
    actual: number
    variant?: 'bar' | 'ring'
    formatValue?: (v: number) => string
    size?: 'sm' | 'lg'
    tooltip?: React.ReactNode
}

export default function MetricCard({
    label,
    target,
    actual,
    variant = 'bar',
    formatValue,
    size = 'sm',
    tooltip,
}: MetricCardProps) {
    const fmt = formatValue || ((v: number) => v.toLocaleString())

    return (
        <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            {variant === 'ring' ? (
                <ProgressRing
                    value={actual}
                    max={target}
                    size={size === 'lg' ? 140 : 100}
                    label={label}
                    formatValue={formatValue}
                    formatMax={formatValue}
                    tooltip={tooltip}
                />
            ) : (
                <>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                        {tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : label}
                    </h4>
                    <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-2xl font-bold text-zinc-900">{fmt(actual)}</span>
                        <span className="text-sm text-zinc-400">/ {fmt(target)}</span>
                    </div>
                    <ProgressBar value={actual} max={target} label="" showValues={false} />
                </>
            )}
        </div>
    )
}
