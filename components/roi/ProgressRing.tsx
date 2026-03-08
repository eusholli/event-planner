'use client'

import React from 'react'
import Tooltip from './Tooltip'

interface ProgressRingProps {
    value: number
    max: number
    size?: number
    strokeWidth?: number
    label?: string
    formatValue?: (value: number) => string
    formatMax?: (max: number) => string
    tooltip?: React.ReactNode
}

export default function ProgressRing({
    value,
    max,
    size = 120,
    strokeWidth = 8,
    label,
    formatValue,
    formatMax,
    tooltip,
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
    const offset = circumference - (percentage / 100) * circumference

    const getColor = () => {
        if (percentage >= 100) return { stroke: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' } // emerald
        if (percentage >= 50) return { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' } // amber
        return { stroke: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)' } // rose
    }

    const color = getColor()
    const displayValue = formatValue ? formatValue(value) : value.toLocaleString()
    const displayMax = formatMax ? formatMax(max) : max.toLocaleString()

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    {/* Background circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        className="text-zinc-100"
                    />
                    {/* Progress circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={color.stroke}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-zinc-900">{Math.round(percentage)}%</span>
                </div>
            </div>
            {label && (
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider text-center">
                    {tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : label}
                </span>
            )}
            <div className="text-center">
                <span className="text-sm font-semibold text-zinc-900">{displayValue}</span>
                <span className="text-xs text-zinc-400"> / {displayMax}</span>
            </div>
        </div>
    )
}
