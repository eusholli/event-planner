'use client'

import { useState } from 'react'
import { getStatusColor, STATUS_DISPLAY_ORDER } from '@/lib/status-colors'

interface Props {
    eventId: string
    status: string
    canManage: boolean
    onSuccess?: (newStatus: string) => void
}

export function EventStatusSelect({ eventId, status, canManage, onSuccess }: Props) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(false)

    if (!canManage) {
        const colors = getStatusColor(status)
        return (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase ${colors.className}`}>
                {status}
            </span>
        )
    }

    const colors = getStatusColor(status)

    const handleChange = async (newStatus: string) => {
        const prev = status
        setSaving(true)
        setError(false)
        onSuccess?.(newStatus) // optimistic
        try {
            const res = await fetch(`/api/events/${eventId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            if (!res.ok) {
                onSuccess?.(prev) // revert
                setError(true)
                setTimeout(() => setError(false), 2500)
            }
        } catch {
            onSuccess?.(prev)
            setError(true)
            setTimeout(() => setError(false), 2500)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="relative inline-block">
            <select
                value={status}
                onChange={e => handleChange(e.target.value)}
                disabled={saving}
                className={`appearance-none text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60 pr-5 ${
                    error ? 'ring-1 ring-red-400' : colors.className
                }`}
            >
                {STATUS_DISPLAY_ORDER.map(s => (
                    <option key={s} value={s}>{s}</option>
                ))}
            </select>
            {/* Chevron indicator */}
            <svg
                className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 opacity-50"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    )
}
