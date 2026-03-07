'use client'

interface ProgressBarProps {
    value: number
    max: number
    label: string
    showValues?: boolean
    formatValue?: (v: number) => string
}

export default function ProgressBar({
    value,
    max,
    label,
    showValues = true,
    formatValue,
}: ProgressBarProps) {
    const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0

    const getBarColor = () => {
        if (percentage >= 100) return 'bg-emerald-500'
        if (percentage >= 50) return 'bg-amber-500'
        return 'bg-rose-500'
    }

    const display = (v: number) => formatValue ? formatValue(v) : v.toLocaleString()

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-700">{label}</span>
                {showValues && (
                    <span className="text-xs text-zinc-500">
                        {display(value)} / {display(max)}
                    </span>
                )}
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${getBarColor()}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    )
}
