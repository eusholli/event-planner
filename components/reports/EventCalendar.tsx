'use client'

import React from 'react'
import { getStatusColor } from '@/lib/status-colors'

interface Event {
    id: string
    name: string
    slug?: string
    startDate: string | null
    endDate: string | null
    region: string | null
    status: string
    address: string | null
}

const REGIONS = ['NA', 'SA', 'EU/UK', 'MEA', 'APAC', 'Japan']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function EventCalendar({ events, onEventClick }: { events: Event[], onEventClick?: (event: Event) => void }) {
    // 1. Group by Region
    const regionGroups: Record<string, Event[]> = {}
    REGIONS.forEach(r => regionGroups[r] = [])
    events.forEach(e => {
        if (e.region && regionGroups[e.region]) {
            regionGroups[e.region].push(e)
        }
    })

    const getPosition = (dateStr: string) => {
        if (!dateStr) return 0
        const date = new Date(dateStr)
        const viewYear = new Date().getFullYear() // Default to current year for position
        // Ideally we should use the event's year, but for a single annual view we assume relative position in *a* year
        // or relative to the start of the earliest event. 
        // Let's stick to 0-100% of a calendar year for now as requested "Annual View"
        const dayOfYear = (Number(date) - Number(new Date(date.getFullYear(), 0, 0))) / 1000 / 60 / 60 / 24
        return (dayOfYear / 366) * 100
    }

    return (
        <div className="bg-white rounded-xl border border-neutral-300 overflow-hidden overflow-x-auto">
            <div className="min-w-[800px]"> {/* Ensure min width for readability */}
                {/* Header Months */}
                <div className="flex border-b-2 border-neutral-200 pr-40"> {/* Added right padding */}
                    <div className="w-24 shrink-0 bg-neutral-50 border-r border-neutral-200 p-3 font-semibold text-xs text-neutral-500">
                        Region
                    </div>
                    <div className="flex-1 flex text-xs font-medium text-neutral-400">
                        {MONTHS.map(m => (
                            <div key={m} className="flex-1 py-3 text-center border-l border-neutral-100 first:border-l-0">
                                {m}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Region Rows */}
                {REGIONS.map(region => {
                    const regionEvents = regionGroups[region] || []

                    // 2. Packing Algorithm
                    // Sort by start date
                    const sortedEvents = [...regionEvents].sort((a, b) => {
                        const da = a.startDate ? new Date(a.startDate).getTime() : 0
                        const db = b.startDate ? new Date(b.startDate).getTime() : 0
                        return da - db
                    })

                    // Lanes track the visual "end %" of the last event in that lane
                    const lanes: number[] = []

                    const eventsWithLayout = sortedEvents.map(event => {
                        if (!event.startDate) return null

                        const startPercent = getPosition(event.startDate)
                        // Visual Width Heuristic:
                        // 1 char approx 0.8% width (assuming ~1000px container and ~8px char width)
                        // Min width 1%
                        // Updated to 1.2% to be conservative and avoid overlap since we removed maxWidth
                        const estimatedTextWidthPercent = (event.name.length * 1.2) + 2 // +2 for padding/icon
                        const visualEndPercent = startPercent + estimatedTextWidthPercent

                        // Find first lane where this fits
                        let laneIndex = -1
                        for (let i = 0; i < lanes.length; i++) {
                            if (lanes[i] < startPercent) {
                                laneIndex = i
                                break
                            }
                        }

                        if (laneIndex === -1) {
                            laneIndex = lanes.length
                            lanes.push(0)
                        }

                        // Update lane end with a small buffer (1%)
                        lanes[laneIndex] = visualEndPercent + 1

                        return { ...event, left: startPercent, lane: laneIndex }
                    }).filter(Boolean) as (Event & { left: number, lane: number })[]

                    // Calculate total height needed: base height + (lanes * event height + gap)
                    // specific row height min 80px (h-20) or dynamic
                    const rowHeight = Math.max(80, (lanes.length * 36) + 20) // 36px per event (32px bar + 4px gap) + 20px padding

                    return (
                        <div key={region} className="flex border-b-2 border-neutral-200 last:border-b-0 relative hover:bg-neutral-50/50 transition-colors pr-40" style={{ height: rowHeight }}>
                            {/* Y-Axis Label */}
                            <div className="w-24 shrink-0 flex items-center justify-center border-r-2 border-neutral-200 font-bold text-sm text-neutral-700 bg-neutral-50/30">
                                {region}
                            </div>

                            {/* Events Track */}
                            <div className="flex-1 relative">
                                {eventsWithLayout.map(event => {
                                    const colors = getStatusColor(event.status)

                                    return (
                                        <div
                                            key={event.id}
                                            onClick={() => onEventClick && onEventClick(event)}
                                            className="absolute h-8 rounded-md shadow-sm border px-2 flex items-center whitespace-nowrap text-xs font-medium transition-all hover:z-10 hover:shadow-md cursor-pointer"
                                            style={{
                                                left: `${event.left}%`,
                                                top: `${10 + (event.lane * 36)}px`, // 10px top padding, 36px stride
                                                width: 'fit-content',
                                                // maxWidth removed to allow full name display
                                                backgroundColor: colors.bg,
                                                borderColor: colors.border,
                                                color: colors.text,
                                                zIndex: 5
                                            }}
                                            title={`${event.name} - ${event.status}`}
                                        >
                                            <div className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: colors.text }}></div>
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
                    )
                })}
            </div>
        </div>
    )
}
