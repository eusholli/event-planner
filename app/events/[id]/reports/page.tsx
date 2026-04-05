'use client'

import { useState, useEffect, useMemo } from 'react'
import useFilterParams from '@/hooks/useFilterParams'
import { ChevronDown } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import moment from 'moment'

// Interfaces
interface Meeting {
    id: string
    title: string
    status: 'PIPELINE' | 'CONFIRMED' | 'OCCURRED' | 'CANCELED'
    meetingType?: string
    tags?: string[]
    attendees: { id: string }[]
}

interface Attendee {
    id: string
    name: string
    type?: string
    isExternal: boolean
}

interface EventSettings {
    attendeeTypes: string[]
    meetingTypes: string[]
    tags: string[]
}

interface AttendeeStats {
    attendeeId: string
    attendeeName: string
    pipeline: number
    confirmed: number
    occurred: number
    canceled: number
    total: number
}

const REPORTS_FILTER_DEFAULTS = {
    attendeeTypes: [] as string[],
    meetingTypes: [] as string[],
    tags: [] as string[],
    external: 'all',
    sortCol: 'total',
    sortDir: 'desc',
}

export default function ReportsPage() {
    const params = require('next/navigation').useParams()
    const id = params?.id as string
    if (!id) return <div>Loading...</div>
    return <ReportsContent eventId={id} />
}

function ReportsContent({ eventId }: { eventId: string }) {
    // Data State
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [settings, setSettings] = useState<EventSettings>({
        attendeeTypes: [],
        meetingTypes: [],
        tags: []
    })
    const [loading, setLoading] = useState(true)

    // Filter + Sort State — persisted in URL
    const { filters: reportFilters, setFilter: setReportFilter, setFilters: setReportFilters, resetFilters: resetReportFilters } = useFilterParams('reports', REPORTS_FILTER_DEFAULTS)

    const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)

    // Fetch Data
    // Fetch Initial Data
    useEffect(() => {
        if (!eventId) return
        Promise.all([
            fetch(`/api/attendees?eventId=${eventId}`).then(res => res.json()),
            fetch(`/api/events/${eventId}`).then(res => res.json())
        ]).then(([attendeesData, eventData]) => {
            setAttendees(Array.isArray(attendeesData) ? attendeesData : [])
            setSettings({
                attendeeTypes: eventData.attendeeTypes || [],
                meetingTypes: eventData.meetingTypes || [],
                tags: eventData.tags || []
            })
            // Initial meetings fetch handled by filter effect
        }).catch(err => {
            console.error('Failed to load reports data', err)
            setLoading(false)
        })
    }, [eventId])

    // Fetch Meetings when filters change
    useEffect(() => {
        const fetchMeetings = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams()
                params.append('eventId', eventId)
                if ((reportFilters.meetingTypes as string[]).length > 0) params.append('meetingType', (reportFilters.meetingTypes as string[]).join(','))
                if ((reportFilters.tags as string[]).length > 0) params.append('tags', (reportFilters.tags as string[]).join(','))

                // For reports, we typically want all statuses to calculate stats properly
                // unless we want to filter specific statuses. The code currently calculates
                // started/completed/canceled from the fetched list. So we just need the relevant meetings.

                const res = await fetch(`/api/meetings?${params.toString()}`)
                const meetingsData = await res.json()
                setMeetings(meetingsData)
            } catch (err) {
                console.error('Failed to fetch meetings', err)
            } finally {
                setLoading(false)
            }
        }

        fetchMeetings()
    }, [reportFilters.meetingTypes, reportFilters.tags, eventId])

    // Process Data
    const tableData = useMemo(() => {
        // 1. Filter Attendees
        const filteredAttendees = attendees.filter(a => {
            if ((reportFilters.attendeeTypes as string[]).length > 0 && (!a.type || !(reportFilters.attendeeTypes as string[]).includes(a.type))) {
                return false
            }

            // External Filter
            if ((reportFilters.external as string) === 'internal' && a.isExternal) return false
            if ((reportFilters.external as string) === 'external' && !a.isExternal) return false

            return true
        })

        // 2. Calculate Stats
        const stats: AttendeeStats[] = filteredAttendees.map(attendee => {
            // Filter meetings for this attendee, applying meeting filters
            const attendeeMeetings = meetings.filter(m => {
                const hasAttendee = m.attendees.some(a => a.id === attendee.id)
                if (!hasAttendee) return false

                // Server-side filtering already handled meetingType and tags
                return true
            })

            const pipeline = attendeeMeetings.filter(m => m.status === 'PIPELINE').length
            const confirmed = attendeeMeetings.filter(m => m.status === 'CONFIRMED').length
            const occurred = attendeeMeetings.filter(m => m.status === 'OCCURRED').length
            const canceled = attendeeMeetings.filter(m => m.status === 'CANCELED').length

            return {
                attendeeId: attendee.id,
                attendeeName: attendee.name,
                pipeline,
                confirmed,
                occurred,
                canceled,
                total: pipeline + confirmed + occurred + canceled // Or just attendeeMeetings.length if status is always one of these
            }
        })

        // 3. Sort
        return stats.sort((a, b) => {
            const valA = a[reportFilters.sortCol as keyof AttendeeStats]
            const valB = b[reportFilters.sortCol as keyof AttendeeStats]

            if (typeof valA === 'string' && typeof valB === 'string') {
                return (reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
            }

            if (valA < valB) return (reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? -1 : 1
            if (valA > valB) return (reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? 1 : -1
            return 0
        })

    }, [meetings, attendees, reportFilters.attendeeTypes, reportFilters.meetingTypes, reportFilters.tags, reportFilters.external, reportFilters.sortCol, reportFilters.sortDir])

    const handleSort = (column: keyof AttendeeStats) => {
        if (reportFilters.sortCol === column) {
            setReportFilter('sortDir', reportFilters.sortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setReportFilters({ sortCol: column as string, sortDir: 'desc' })
        }
    }

    const handleExportCSV = () => {
        const headers = ['Attendee Name', 'Pipeline', 'Confirmed', 'Occurred', 'Canceled', 'Total']
        const rows = tableData.map(row => [
            `"${row.attendeeName.replace(/"/g, '""')}"`,
            row.pipeline,
            row.confirmed,
            row.occurred,
            row.canceled,
            row.total
        ])

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `meeting_report_${moment().format('YYYYMMDD-HHmmss')}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleExportPDF = () => {
        const doc = new jsPDF()

        doc.setFontSize(18)
        doc.text('Meeting Participation Report', 14, 22)

        doc.setFontSize(11)
        doc.text(`Generated on ${moment().format('MMMM D, YYYY')}`, 14, 30)

        const tableBody = tableData.map(row => [
            row.attendeeName,
            row.pipeline,
            row.confirmed,
            row.occurred,
            row.canceled,
            row.total
        ])

        autoTable(doc, {
            head: [['Attendee Name', 'Pipeline', 'Confirmed', 'Occurred', 'Canceled', 'Total']],
            body: tableBody,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181] }
        })

        doc.save(`meeting_report_${moment().format('YYYYMMDD-HHmmss')}.pdf`)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Reports</h1>
                    <p className="mt-2 text-zinc-500">Analyze meeting participation statistics.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleExportPDF}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export PDF
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Filters Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-6">
                        <div
                            className="flex items-center justify-between cursor-pointer lg:cursor-default"
                            onClick={() => setIsFiltersExpanded(v => !v)}
                        >
                            <h3 className="font-semibold text-zinc-900">Filters</h3>
                            <ChevronDown className={`lg:hidden h-4 w-4 transition-transform duration-200 ${isFiltersExpanded ? 'rotate-180' : ''}`} />
                        </div>

                        <div className={`space-y-6 ${isFiltersExpanded ? 'block' : 'hidden'} lg:block`}>
                        {/* Attendee Status */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Status</label>
                            <div className="flex bg-zinc-100 p-1 rounded-lg">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'internal', label: 'Internal' },
                                    { id: 'external', label: 'External' }
                                ].map(option => (
                                    <button
                                        key={option.id}
                                        onClick={() => setReportFilter('external', option.id)}
                                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${reportFilters.external === option.id
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-700'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Attendee Types */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Attendee Types</label>
                            <div className="space-y-2">
                                {settings.attendeeTypes.length > 0 ? settings.attendeeTypes.map(type => (
                                    <label key={type} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={(reportFilters.attendeeTypes as string[]).includes(type)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setReportFilter('attendeeTypes', [...(reportFilters.attendeeTypes as string[]), type])
                                                } else {
                                                    setReportFilter('attendeeTypes', (reportFilters.attendeeTypes as string[]).filter(t => t !== type))
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-zinc-600">{type}</span>
                                    </label>
                                )) : <div className="text-sm text-zinc-400 italic">No attendee types defined in settings</div>}
                            </div>
                        </div>

                        {/* Meeting Types */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Meeting Types</label>
                            <div className="flex flex-wrap gap-2">
                                {settings.meetingTypes.length > 0 ? settings.meetingTypes.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                            const cur = reportFilters.meetingTypes as string[]
                                            setReportFilter('meetingTypes', cur.includes(type) ? cur.filter(t => t !== type) : [...cur, type])
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${(reportFilters.meetingTypes as string[]).includes(type)
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                                            }`}
                                    >
                                        {type}
                                    </button>
                                )) : <div className="text-sm text-zinc-400 italic">No meeting types defined</div>}
                            </div>
                        </div>

                        {/* Tags */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Tags</label>
                            <div className="flex flex-wrap gap-2">
                                {settings.tags.length > 0 ? settings.tags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => {
                                            const cur = reportFilters.tags as string[]
                                            setReportFilter('tags', cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag])
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${(reportFilters.tags as string[]).includes(tag)
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                                            }`}
                                    >
                                        {tag}
                                    </button>
                                )) : <div className="text-sm text-zinc-400 italic">No tags defined</div>}
                            </div>
                        </div>

                        <button
                            onClick={resetReportFilters}
                            className="w-full px-4 py-2 mt-4 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                            Clear Filters
                        </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="lg:col-span-3">
                    <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {[
                                        { id: 'attendeeName', label: 'Attendee Name' },
                                        { id: 'pipeline', label: 'Pipeline' },
                                        { id: 'confirmed', label: 'Confirmed' },
                                        { id: 'occurred', label: 'Occurred' },
                                        { id: 'canceled', label: 'Canceled' },
                                        { id: 'total', label: 'Total' }
                                    ].map((column) => (
                                        <th
                                            key={column.id}
                                            scope="col"
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort(column.id as keyof AttendeeStats)}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>{column.label}</span>
                                                {reportFilters.sortCol === column.id && (
                                                    <span className="text-indigo-500">
                                                        {(reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? '↑' : '↓'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {tableData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                                            No data matches your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    tableData.map((row) => (
                                        <tr key={row.attendeeId} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {row.attendeeName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {row.pipeline}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {row.confirmed}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {row.occurred}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {row.canceled}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                {row.total}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
