'use client'

import React from 'react'

interface Event {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
    region: string | null
    status: string
}

const REGIONS = ['NA', 'SA', 'EU/UK', 'MEA', 'APAC', 'Japan']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function EventCalendar({ events }: { events: Event[] }) {
    // Group events by Region
    // Also need to calculate position on X-axis (Year is assumed current year or we scale?)
    // Requirement says "Annual Calendar".
    // Let's assume a Jan-Dec view for the current year (or the year of the events).

    // We'll simplisticly map 1-365 days to 0-100% width.

    const getPosition = (dateStr: string) => {
        const date = new Date(dateStr)
        const startOfYear = new Date(new Date().getFullYear(), 0, 1) // Fixed to current year for demo consistency?
        // Or better, use the event's year. But to stack them they need a common axis.
        // Let's assume we view One Year at a time, e.g. 2026.
        const viewYear = 2026

        const dayOfYear = (Number(date) - Number(new Date(viewYear, 0, 0))) / 1000 / 60 / 60 / 24
        return (dayOfYear / 366) * 100
    }

    const getWidth = (start: string, end: string) => {
        const p1 = getPosition(start)
        const p2 = getPosition(end)
        return Math.max(p2 - p1, 1) // Min 1% width
    }

    return (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            {/* Header Months */}
            <div className="flex border-b border-neutral-100">
                <div className="w-24 shrink-0 bg-neutral-50 border-r border-neutral-100 p-3 font-semibold text-xs text-neutral-500">
                    Region
                </div>
                <div className="flex-1 flex text-xs font-medium text-neutral-400">
                    {MONTHS.map(m => (
                        <div key={m} className="flex-1 py-3 text-center border-l border-neutral-50 first:border-l-0">
                            {m}
                        </div>
                    ))}
                </div>
            </div>

            {/* Region Rows */}
            {REGIONS.map(region => (
                <div key={region} className="flex border-b border-neutral-100 last:border-b-0 h-20 relative hover:bg-neutral-50/50 transition-colors">
                    {/* Y-Axis Label */}
                    <div className="w-24 shrink-0 flex items-center justify-center border-r border-neutral-100 font-medium text-sm text-neutral-600">
                        {region}
                    </div>

                    {/* Events Track */}
                    <div className="flex-1 relative">
                        {events
                            .filter(e => e.region === region && e.startDate && e.endDate)
                            .map(event => {
                                // We filtered above, so casting is safe or just let TS infer
                                const start = event.startDate!
                                const end = event.endDate!
                                const left = Math.max(0, Math.min(100, getPosition(start)))
                                const width = Math.min(100 - left, getWidth(start, end))

                                return (
                                    <div
                                        key={event.id}
                                        className="absolute top-1/2 -translate-y-1/2 h-8 rounded-md shadow-sm border border-white/20 px-2 flex items-center whitespace-nowrap overflow-hidden text-xs font-medium text-white transition-all hover:z-10 hover:shadow-md cursor-pointer"
                                        style={{
                                            left: `${left}%`,
                                            width: `${width}%`,
                                            backgroundColor: event.status === 'COMMITTED' ? '#10b981' : event.status === 'PIPELINE' ? '#f59e0b' : '#ef4444'
                                        }}
                                        title={`${event.name} (${new Date(start).toLocaleDateString()})`}
                                    >
                                        {event.name}
                                    </div>
                                )
                            })}

                        {/* Grid lines for months */}
                        <div className="absolute inset-0 flex pointer-events-none">
                            {MONTHS.map((_, i) => (
                                <div key={i} className="flex-1 border-l border-neutral-100 h-full first:border-l-0" />
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
