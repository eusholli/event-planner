'use client'

import React, { useState, useEffect } from 'react'
import { Plus, LayoutGrid, Calendar as CalendarIcon, Map as MapIcon, ChevronDown, DollarSign } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EventMap } from '@/components/reports/EventMap'
import { EventCalendar } from '@/components/reports/EventCalendar'
import { useUser } from '@/components/auth'
import { canManageEvents, hasWriteAccess } from '@/lib/role-utils'
import { getStatusColor, STATUS_DISPLAY_ORDER } from '@/lib/status-colors'
import useFilterParams from '@/hooks/useFilterParams'
import SparkleMarketingPlanButton from '@/components/roi/SparkleMarketingPlanButton'
interface Event {
    id: string
    name: string
    slug?: string
    startDate: string | null
    endDate: string | null
    region: string | null
    status: string
    location?: string
    address: string | null
    description?: string | null
    latitude?: number | null
    longitude?: number | null
    budget?: number | null
    actualCost?: number | null
}

const effectiveBudget = (e: Event) =>
    (e.actualCost != null && e.actualCost > 0) ? e.actualCost : e.budget

function BudgetPivotTable({ events }: { events: Event[] }) {
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
    const toggleRegion = (region: string) =>
        setExpandedRegions(prev => {
            const next = new Set(prev)
            if (next.has(region)) next.delete(region)
            else next.add(region)
            return next
        })

    const fmtCurrency = (v: number) =>
        v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

    const activeStatuses = STATUS_DISPLAY_ORDER.filter(s => events.some(e => e.status === s))
    const regions = Array.from(new Set(events.map(e => e.region ?? '(No Region)'))).sort()

    if (events.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm text-center text-neutral-500 py-20">
                No events match the current filters.
            </div>
        )
    }

    const allExpanded = regions.length > 0 && regions.every(r => expandedRegions.has(r))
    const toggleAllRegions = () =>
        setExpandedRegions(allExpanded ? new Set() : new Set(regions))

    const cellTotal = (region: string, status: string) =>
        events
            .filter(e => (e.region ?? '(No Region)') === region && e.status === status)
            .reduce((sum, e) => sum + (effectiveBudget(e) ?? 0), 0)

    const rowTotal = (region: string) =>
        events
            .filter(e => (e.region ?? '(No Region)') === region)
            .reduce((sum, e) => sum + (effectiveBudget(e) ?? 0), 0)

    const colTotal = (status: string) =>
        events.filter(e => e.status === status).reduce((sum, e) => sum + (effectiveBudget(e) ?? 0), 0)

    const grandTotal = events.reduce((sum, e) => sum + (effectiveBudget(e) ?? 0), 0)

    const hasEventsInCell = (region: string, status: string) =>
        events.some(e => (e.region ?? '(No Region)') === region && e.status === status)

    const handleExportCsv = () => {
        const now = new Date().toISOString().slice(0, 19)
        const dateStr = now.slice(0, 10).replace(/-/g, '') + '-' + now.slice(11).replace(/:/g, '')
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`

        const headers = ['Region', ...activeStatuses, 'Sub-total', 'Total']
        const rows: string[][] = []

        for (const region of regions) {
            const regionEventsInOrder = events
                .filter(e => (e.region ?? '(No Region)') === region)
                .sort((a, b) => a.name.localeCompare(b.name))

            // Region subtotal row: Sub-total blank, Total = region total
            rows.push([
                region,
                ...activeStatuses.map(s => String(cellTotal(region, s))),
                '',
                String(rowTotal(region)),
            ])

            if (expandedRegions.has(region)) {
                for (const event of regionEventsInOrder) {
                    const budget = effectiveBudget(event) ?? 0
                    // Event row: status value in matching column, Sub-total = event budget, Total blank
                    rows.push([
                        `  ${event.name}`,
                        ...activeStatuses.map(s => event.status === s ? String(budget) : ''),
                        String(budget),
                        '',
                    ])
                }
            }
        }

        // Grand total row: Sub-total blank, Total = grand total
        rows.push([
            'Total',
            ...activeStatuses.map(s => String(colTotal(s))),
            '',
            String(grandTotal),
        ])

        const csvContent = [
            headers.map(escape).join(','),
            ...rows.map(row => row.map((cell, i) => i === 0 ? escape(cell) : cell).join(',')),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `budget-export-${dateStr}.csv`
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleExportPdf = () => {
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })

        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.text('Budget by Region & Status', 14, 18)

        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100)
        doc.text(`Exported ${dateStr} · ${events.length} event${events.length !== 1 ? 's' : ''} visible`, 14, 25)
        doc.setTextColor(0)

        const head = [['Region', ...activeStatuses, 'Total']]
        const body: any[] = []

        for (const region of regions) {
            const regionEventsInOrder = events
                .filter(e => (e.region ?? '(No Region)') === region)
                .sort((a, b) => a.name.localeCompare(b.name))

            body.push({
                region,
                cells: [
                    region,
                    ...activeStatuses.map(s => fmtCurrency(cellTotal(region, s))),
                    fmtCurrency(rowTotal(region)),
                ],
                isRegion: true,
            })

            if (expandedRegions.has(region)) {
                for (const event of regionEventsInOrder) {
                    const budget = effectiveBudget(event) ?? 0
                    body.push({
                        cells: [
                            `  ${event.name}`,
                            ...activeStatuses.map(s => event.status === s && budget > 0 ? fmtCurrency(budget) : '—'),
                            budget > 0 ? fmtCurrency(budget) : '—',
                        ],
                        isRegion: false,
                    })
                }
            }
        }

        const totalRow = [
            'Total',
            ...activeStatuses.map(s => fmtCurrency(colTotal(s))),
            fmtCurrency(grandTotal),
        ]

        autoTable(doc, {
            startY: 30,
            head,
            body: body.map(r => r.cells),
            foot: [totalRow],
            theme: 'grid',
            headStyles: {
                fillColor: [55, 65, 81],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 3,
            },
            footStyles: {
                fillColor: [229, 231, 235],
                textColor: [17, 24, 39],
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 3,
            },
            bodyStyles: {
                fontSize: 8.5,
                cellPadding: 2.5,
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            styles: { overflow: 'linebreak', lineColor: [209, 213, 219], lineWidth: 0.3 },
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const row = body[data.row.index]
                    if (row?.isRegion) {
                        data.cell.styles.fontStyle = 'bold'
                        data.cell.styles.textColor = [17, 24, 39]
                    } else {
                        data.cell.styles.textColor = [75, 85, 99]
                    }
                }
            },
        })

        const now2 = new Date().toISOString().slice(0, 19)
        const dateStr2 = now2.slice(0, 10).replace(/-/g, '') + '-' + now2.slice(11).replace(/:/g, '')
        doc.save(`budget-export-${dateStr2}.pdf`)
    }

    return (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <div className="p-6 border-b border-neutral-100 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-neutral-900">Budget by Region &amp; Status</h2>
                    <p className="text-sm text-neutral-500 mt-1">Totals reflect currently filtered events only.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={toggleAllRegions}
                        className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm"
                    >
                        {allExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                    <button
                        onClick={handleExportCsv}
                        className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={handleExportPdf}
                        className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm"
                    >
                        Export PDF
                    </button>
                </div>
            </div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                        <th className="text-left px-6 py-3 font-semibold text-neutral-600 w-40">Region</th>
                        {activeStatuses.map(s => (
                            <th key={s} className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[11px] tracking-wider uppercase ${getStatusColor(s).className}`}>
                                    {s}
                                </span>
                            </th>
                        ))}
                        <th className="px-6 py-3 font-semibold text-right text-neutral-700">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {regions.map((region, i) => (
                        <React.Fragment key={region}>
                        <tr className={`border-b border-neutral-100 ${i % 2 === 0 ? '' : 'bg-neutral-50/50'}`}>
                            <td
                                className="px-6 py-3 font-medium text-neutral-700 whitespace-nowrap cursor-pointer select-none"
                                onClick={() => toggleRegion(region)}
                            >
                                <span className="flex items-center gap-1.5">
                                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${expandedRegions.has(region) ? '' : '-rotate-90'}`} />
                                    {region}
                                </span>
                            </td>
                            {activeStatuses.map(s => {
                                const val = cellTotal(region, s)
                                return (
                                    <td key={s} className="px-4 py-3 text-right text-neutral-600 tabular-nums">
                                        {hasEventsInCell(region, s) ? fmtCurrency(val) : <span className="text-neutral-300">—</span>}
                                    </td>
                                )
                            })}
                            <td className="px-6 py-3 text-right font-semibold text-neutral-800 tabular-nums bg-neutral-50">
                                {fmtCurrency(rowTotal(region))}
                            </td>
                        </tr>
                        {expandedRegions.has(region) &&
                            events
                                .filter(e => (e.region ?? '(No Region)') === region)
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(event => (
                                    <tr key={event.id} className="border-b border-neutral-100 bg-blue-50/30">
                                        <td className="pl-10 pr-4 py-2 text-neutral-600 whitespace-nowrap">
                                            <Link
                                                href={`/events/${event.slug || event.id}/dashboard`}
                                                className="text-sm hover:text-blue-600 hover:underline transition-colors"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {event.name}
                                            </Link>
                                        </td>
                                        {activeStatuses.map(s => (
                                            <td key={s} className="px-4 py-2 text-right text-sm text-neutral-500 tabular-nums">
                                                {event.status === s && effectiveBudget(event) != null && (effectiveBudget(event) ?? 0) > 0
                                                    ? fmtCurrency(effectiveBudget(event)!)
                                                    : <span className="text-neutral-300">—</span>
                                                }
                                            </td>
                                        ))}
                                        <td className="px-6 py-2 text-right text-sm text-neutral-600 tabular-nums bg-neutral-50">
                                            {(effectiveBudget(event) ?? 0) > 0 ? fmtCurrency(effectiveBudget(event)!) : <span className="text-neutral-300">—</span>}
                                        </td>
                                    </tr>
                                ))
                        }
                        </React.Fragment>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-neutral-100 border-t-2 border-neutral-200">
                        <td className="px-6 py-3 font-bold text-neutral-800">Total</td>
                        {activeStatuses.map(s => (
                            <td key={s} className="px-4 py-3 text-right font-semibold text-neutral-800 tabular-nums">
                                {fmtCurrency(colTotal(s))}
                            </td>
                        ))}
                        <td className="px-6 py-3 text-right font-bold text-neutral-900 tabular-nums bg-neutral-200">
                            {fmtCurrency(grandTotal)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    )
}


const EVENTS_FILTER_DEFAULTS = {
    search: '',
    statuses: [...STATUS_DISPLAY_ORDER] as string[],
    regions: [] as string[],
    years: [] as string[],
    view: 'list',
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([])
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const { user } = useUser()
    const canManage = canManageEvents(user?.publicMetadata?.role as string)
    const canWrite = hasWriteAccess(user?.publicMetadata?.role as string)

    // Filter + View State — persisted in URL
    const { filters: eventFilters, setFilter, isFiltered, resetFilters } = useFilterParams('events', EVENTS_FILTER_DEFAULTS)

    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
    const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)

    const fetchEvents = () => {
        setLoading(true)
        fetch('/api/events')
            .then(res => res.json())
            .then(data => {
                setEvents(Array.isArray(data) ? data : [])
                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setLoading(false)
            })
    }

    useEffect(() => {
        fetchEvents()
    }, [])

    const handleDelete = async (id: string, slug?: string) => {
        if (!confirm('Are you sure you want to delete this event? This will also export a backup.')) return

        try {
            // Auto-export before delete
            const exportRes = await fetch(`/api/events/${id}/export`)
            if (exportRes.ok) {
                const blob = await exportRes.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.style.display = 'none'
                a.href = url
                a.download = `event-${id}-export.json`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)
            } else {
                console.error('Failed to auto-export event before deletion')
                if (!confirm('Auto-export failed. Do you want to proceed with deletion anyway?')) return
            }

            const res = await fetch(`/api/events/${id}`, {
                method: 'DELETE',
            })
            if (res.ok) {
                fetchEvents()
            } else {
                alert('Failed to delete event')
            }
        } catch (error) {
            console.error('Error deleting event:', error)
            alert('An unexpected error occurred')
        }
    }

    const handleCreate = async () => {
        try {
            const res = await fetch('/api/events', {
                method: 'POST',
                body: JSON.stringify({ name: '' }),
                headers: { 'Content-Type': 'application/json' }
            })

            if (res.ok) {
                const newEvent = await res.json()
                // Use slug (likely temp) or id to navigate to settings
                const urlId = newEvent.slug || newEvent.id
                router.push(`/events/${urlId}/settings`)
            } else {
                alert('Failed to create new event')
            }
        } catch (e) {
            console.error(e)
            alert('Error creating event')
        }
    }

    // Unified Navigation Logic
    const handleEventClick = (event: Event) => {
        setSelectedEvent(event)
    }

    // Modal Action
    const handleViewDashboard = (event: Event) => {
        router.push(`/events/${event.slug || event.id}/roi`)
    }

    // Derived Filter Data
    const availableRegions = Array.from(new Set(events.map(e => e.region).filter(Boolean))) as string[]
    const availableYears = Array.from(new Set(events.map(e => {
        return e.startDate ? new Date(e.startDate).getFullYear().toString() : null
    }).filter(Boolean))) as string[]

    const filteredEvents = events.filter(event => {
        // Search Filter
        if (eventFilters.search) {
            const query = (eventFilters.search as string).toLowerCase()
            const matchName = event.name.toLowerCase().includes(query)
            const matchLocation = event.location?.toLowerCase().includes(query) || false
            const matchAddress = event.address?.toLowerCase().includes(query) || false
            const matchDescription = event.description?.toLowerCase().includes(query) || false
            if (!matchName && !matchLocation && !matchAddress && !matchDescription) return false
        }

        // Status Filter
        if (!(eventFilters.statuses as string[]).includes(event.status)) {
            return false
        }

        // Region Filter
        if ((eventFilters.regions as string[]).length > 0) {
            if (!event.region || !(eventFilters.regions as string[]).includes(event.region)) return false
        }

        // Year Filter
        if ((eventFilters.years as string[]).length > 0) {
            if (!event.startDate) return false
            const year = new Date(event.startDate).getFullYear().toString()
            if (!(eventFilters.years as string[]).includes(year)) return false
        }

        return true
    })

    const displayEvents = filteredEvents.map(e => ({
        ...e,
        budget: effectiveBudget(e) ?? undefined
    }))

    if (loading) return <div className="p-10 flex justify-center text-neutral-500 animate-pulse">Loading portfolio...</div>

    return (
        <div className="min-h-screen bg-neutral-50 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Event Portfolio</h1>
                        <p className="text-neutral-500 mt-1">Manage global strategy, timelines, and regional coverage.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Clear Filters Button (Mobile/Desktop) */}
                        {isFiltered && (
                            <button
                                onClick={resetFilters}
                                className="bg-white border border-neutral-200 text-neutral-600 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors shadow-sm"
                            >
                                Clear Filters
                            </button>
                        )}

                        <div className="bg-white border border-neutral-200 rounded-lg p-1 flex items-center">
                            <button
                                onClick={() => setFilter('view', 'list')}
                                className={`p-2 rounded-md transition-all ${eventFilters.view === 'list' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="List View"
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setFilter('view', 'calendar')}
                                className={`p-2 rounded-md transition-all ${eventFilters.view === 'calendar' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Calendar View"
                            >
                                <CalendarIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setFilter('view', 'map')}
                                className={`p-2 rounded-md transition-all ${eventFilters.view === 'map' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Map View"
                            >
                                <MapIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setFilter('view', 'budget')}
                                className={`p-2 rounded-md transition-all ${eventFilters.view === 'budget' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Budget View"
                            >
                                <DollarSign className="w-5 h-5" />
                            </button>
                        </div>
                        {canManage && (
                            <button
                                onClick={handleCreate}
                                aria-label="New Event"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">New Event</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Filters Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
                            <div
                                className="flex items-center justify-between cursor-pointer lg:cursor-default"
                                onClick={() => setIsFiltersExpanded(v => !v)}
                            >
                                <h3 className="font-semibold text-neutral-900">Filters</h3>
                                <ChevronDown className={`lg:hidden h-4 w-4 transition-transform duration-200 ${isFiltersExpanded ? 'rotate-180' : ''}`} />
                            </div>

                            <div className={`space-y-6 ${isFiltersExpanded ? 'block' : 'hidden'} lg:block`}>
                            {/* Search */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wider">Search</label>
                                <input
                                    type="text"
                                    placeholder="Search events..."
                                    className="input-field text-sm"
                                    value={eventFilters.search as string}
                                    onChange={e => setFilter('search', e.target.value)}
                                />
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Status</label>
                                <div className="space-y-2">
                                    {STATUS_DISPLAY_ORDER.map(status => (
                                        <label key={status} className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={(eventFilters.statuses as string[]).includes(status)}
                                                onChange={(e) => {
                                                    const current = eventFilters.statuses as string[]
                                                    setFilter('statuses', e.target.checked
                                                        ? [...current, status]
                                                        : current.filter(s => s !== status)
                                                    )
                                                }}
                                                className="w-4 h-4 text-blue-600 border-neutral-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-neutral-600 capitalize">{status.toLowerCase()}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Region */}
                            {availableRegions.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Region</label>
                                    <div className="space-y-2">
                                        {availableRegions.map(region => (
                                            <label key={region} className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={(eventFilters.regions as string[]).includes(region)}
                                                    onChange={(e) => {
                                                        const current = eventFilters.regions as string[]
                                                        setFilter('regions', e.target.checked
                                                            ? [...current, region]
                                                            : current.filter(r => r !== region)
                                                        )
                                                    }}
                                                    className="w-4 h-4 text-blue-600 border-neutral-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-neutral-600">{region}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Year */}
                            {availableYears.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Year</label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableYears.sort().reverse().map(year => (
                                            <button
                                                key={year}
                                                onClick={() => {
                                                    const current = eventFilters.years as string[]
                                                    setFilter('years', current.includes(year)
                                                        ? current.filter(y => y !== year)
                                                        : [...current, year]
                                                    )
                                                }}
                                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${(eventFilters.years as string[]).includes(year)
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                                                    }`}
                                            >
                                                {year}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            </div>
                        </div>
                    </div>

                    {/* Content Views */}
                    <div className="lg:col-span-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {eventFilters.view === 'list' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {displayEvents.map((event) => (
                                    <div
                                        key={event.id}
                                        onClick={() => handleEventClick(event)}
                                        className={`group block bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden cursor-pointer`}
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: getStatusColor(event.status).bg }} />

                                        <div className="flex justify-between items-start mb-4 pl-3">
                                            <div className="space-y-1">
                                                {event.region && (
                                                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{event.region}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${getStatusColor(event.status).className}`}
                                                >
                                                    {event.status}
                                                </span>
                                                <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                                                        <SparkleMarketingPlanButton
                                                            eventId={event.id}
                                                            onHasPlan={() => router.push(`/events/${event.slug || event.id}/roi?planWarning=1`)}
                                                            onGenerated={() => router.push(`/events/${event.slug || event.id}/roi`)}
                                                            onError={() => router.push(`/events/${event.slug || event.id}/roi?planError=1`)}
                                                        />
                                                        {canManage && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        router.push(`/events/${event.slug || event.id}/settings`)
                                                                    }}
                                                                    className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                                                                    title="Edit"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleDelete(event.id, event.slug)
                                                                    }}
                                                                    className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Delete"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                            </div>
                                        </div>

                                        <div className="pl-3">
                                            <h3 className="text-xl font-bold text-neutral-900 group-hover:text-blue-600 transition-colors mb-2 line-clamp-1">
                                                {event.name}
                                            </h3>

                                            <div className="space-y-1 text-sm text-neutral-500">
                                                <div className="flex items-center gap-2">
                                                    <CalendarIcon className="w-3.5 h-3.5" />
                                                    <span>
                                                        {event.startDate && event.endDate
                                                            ? `${new Date(event.startDate).toLocaleDateString()} - ${new Date(event.endDate).toLocaleDateString()}`
                                                            : 'Dates TBD'}
                                                    </span>
                                                </div>
                                                {event.address && (
                                                    <div className="flex items-center gap-2">
                                                        <MapIcon className="w-3.5 h-3.5" />
                                                        <span className="line-clamp-1">{event.address}</span>
                                                    </div>
                                                )}
                                                {event.budget != null && event.budget > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <DollarSign className="w-3.5 h-3.5" />
                                                        <span>{event.budget.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {displayEvents.length === 0 && (
                                    <div className="col-span-full py-20 text-center border-2 border-dashed border-neutral-200 rounded-xl bg-white/50">
                                        <div className="mx-auto w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
                                            <CalendarIcon className="w-6 h-6 text-neutral-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-neutral-900">No events found</h3>
                                        <p className="text-neutral-500 mt-1">Try adjusting your filters or create a new event.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {eventFilters.view === 'calendar' && (
                            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                                <h2 className="text-lg font-semibold mb-4">Annual Regional Schedule</h2>
                                <EventCalendar events={displayEvents} onEventClick={handleEventClick} />
                            </div>
                        )}

                        {eventFilters.view === 'map' && (
                            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                                <h2 className="text-lg font-semibold mb-4">Global Event Footprint</h2>
                                <EventMap events={displayEvents} onEventClick={handleEventClick} />
                            </div>
                        )}

                        {eventFilters.view === 'budget' && (
                            <BudgetPivotTable events={displayEvents} />
                        )}
                    </div>
                </div>
            </div>

            {/* Event Details Modal */}
            {selectedEvent && (
                <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-neutral-100 relative">
                            <button
                                onClick={() => setSelectedEvent(null)}
                                className="absolute top-4 right-4 p-2 bg-neutral-100 text-neutral-500 rounded-full hover:bg-neutral-200 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <h3 className="text-2xl font-bold text-neutral-900 pr-10">{selectedEvent.name}</h3>
                            <div className="mt-2 flex items-center gap-2">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase border ${getStatusColor(selectedEvent.status).className}`}>
                                    {selectedEvent.status}
                                </span>
                                {selectedEvent.region && (
                                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest border border-neutral-200 px-2 py-1 rounded-full">
                                        {selectedEvent.region}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Dates */}
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <CalendarIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Date</label>
                                    <p className="text-neutral-900 font-medium">
                                        {selectedEvent.startDate && selectedEvent.endDate
                                            ? `${new Date(selectedEvent.startDate).toLocaleDateString()} - ${new Date(selectedEvent.endDate).toLocaleDateString()}`
                                            : 'Dates To Be Determined'}
                                    </p>
                                </div>
                            </div>

                            {/* Location */}
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                    <MapIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Location</label>
                                    <p className="text-neutral-900 font-medium">
                                        {selectedEvent.address || 'Location To Be Determined'}
                                    </p>
                                </div>
                            </div>

                            {/* Budget */}
                            {selectedEvent.budget != null && selectedEvent.budget > 0 && (
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                                        <DollarSign className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Budget</label>
                                        <p className="text-neutral-900 font-medium">
                                            {selectedEvent.budget.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Description */}
                            {selectedEvent.description && (
                                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Description</label>
                                    <p className="text-sm text-neutral-600 leading-relaxed">
                                        {selectedEvent.description}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedEvent(null)}
                                className="px-4 py-2 text-neutral-600 font-medium hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                            >
                                Close
                            </button>
                            <button
                                    onClick={() => handleViewDashboard(selectedEvent)}
                                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center gap-2"
                                >
                                    View Event
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                    </svg>
                                </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}

