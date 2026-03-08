'use client'

import { useState, useEffect } from 'react'

interface FormattedInputProps {
    value: number | null | undefined
    onChange?: (val: number | null) => void
    readOnly?: boolean
    placeholder?: string
    prefix?: string
    suffix?: string
    isFloat?: boolean
    className?: string
    formatValue?: (val: number) => string
    focusRingColor?: string
}

export default function FormattedInput({
    value,
    onChange,
    readOnly = false,
    placeholder = '',
    prefix,
    suffix,
    isFloat = false,
    className = '',
    formatValue,
    focusRingColor = 'indigo',
}: FormattedInputProps) {
    const [focused, setFocused] = useState(false)
    const [localValue, setLocalValue] = useState(value !== null && value !== undefined ? value.toString() : '')

    // Keep local string in sync if changed from outside when not focused
    useEffect(() => {
        if (!focused) {
            setLocalValue(value !== null && value !== undefined ? value.toString() : '')
        }
    }, [value, focused])

    const displayValue = focused
        ? localValue
        : (value !== null && value !== undefined
            ? (formatValue ? formatValue(value) : value.toLocaleString(undefined, isFloat ? { maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }))
            : '')

    const getRingColor = () => {
        const colors: Record<string, string> = {
            indigo: 'focus:border-indigo-500 focus:ring-indigo-500',
            violet: 'focus:border-violet-500 focus:ring-violet-500',
            rose: 'focus:border-rose-500 focus:ring-rose-500',
        }
        return colors[focusRingColor] || colors.indigo
    }

    return (
        <div className="relative w-full">
            {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm z-10 pointer-events-none">{prefix}</span>}
            <input
                type="text"
                readOnly={readOnly}
                placeholder={placeholder}
                value={displayValue}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(e) => {
                    if (readOnly) return
                    const val = e.target.value
                    setLocalValue(val)

                    // Simple numeric validation loop for integers and floats
                    const stripped = val.replace(/[^\d.-]/g, '')
                    if (stripped === '' || stripped === '-' || stripped === '.') {
                        onChange?.(null)
                    } else {
                        const parsed = isFloat ? parseFloat(stripped) : parseInt(stripped, 10)
                        if (!isNaN(parsed)) {
                            onChange?.(parsed)
                        } else {
                            onChange?.(null)
                        }
                    }
                }}
                className={`w-full py-2.5 rounded-xl border text-sm outline-none transition-colors ${readOnly
                        ? 'bg-zinc-50 border-zinc-100 text-zinc-600'
                        : `border-zinc-200 focus:ring-1 bg-white ${getRingColor()}`
                    } ${prefix ? 'pl-7' : 'px-3'} ${suffix ? 'pr-12' : 'pr-3'} ${className}`}
            />
            {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm z-10 pointer-events-none">{suffix}</span>}
        </div>
    )
}
