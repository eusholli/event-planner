'use client'

import { useState, useEffect } from 'react'
import { Plus, LayoutGrid, Calendar as CalendarIcon, Map as MapIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EventMap } from '@/components/reports/EventMap'
import { EventCalendar } from '@/components/reports/EventCalendar'

interface Event {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
    region: string | null
    status: string
    location?: string
    address: string | null
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'list' | 'calendar' | 'map'>('list')
    const router = useRouter()

    const fetchEvents = () => {
        setLoading(true)
        fetch('/api/events')
            .then(res => res.json())
            .then(data => {
                setEvents(data)
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

    const handleDelete = async (id: string) => {
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
        const res = await fetch('/api/events', {
            method: 'POST',
            body: JSON.stringify({ name: '' }),
            headers: { 'Content-Type': 'application/json' }
        })
        if (res.ok) {
            const newEvent = await res.json()
            router.push(`/events/${newEvent.id}/settings`) // Go to settings to config
        }
    }

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
                        <div className="bg-white border border-neutral-200 rounded-lg p-1 flex items-center">
                            <button
                                onClick={() => setView('list')}
                                className={`p-2 rounded-md transition-all ${view === 'list' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="List View"
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setView('calendar')}
                                className={`p-2 rounded-md transition-all ${view === 'calendar' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Calendar View"
                            >
                                <CalendarIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setView('map')}
                                className={`p-2 rounded-md transition-all ${view === 'map' ? 'bg-neutral-100 text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Map View"
                            >
                                <MapIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <button
                            onClick={handleCreate}
                            aria-label="New Event"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">New Event</span>
                        </button>
                    </div>
                </div>

                {/* Content Views */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {view === 'list' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {events.map((event) => (
                                <div
                                    key={event.id}
                                    onClick={() => router.push(`/events/${event.id}/dashboard`)}
                                    className="group block bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden cursor-pointer"
                                >
                                    <div className={`absolute top-0 left-0 w-1 h-full ${event.status === 'COMMITTED' ? 'bg-green-500' :
                                        event.status === 'CANCELED' ? 'bg-red-500' : 'bg-amber-500'
                                        }`} />

                                    <div className="flex justify-between items-start mb-4 pl-3">
                                        <div className="space-y-1">
                                            {event.region && (
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{event.region}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase 
                                                ${event.status === 'COMMITTED' ? 'bg-green-50 text-green-700 border border-green-100' :
                                                    event.status === 'CANCELED' ? 'bg-red-50 text-red-700 border border-red-100' :
                                                        'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                                                {event.status}
                                            </span>
                                            <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        router.push(`/events/${event.id}/settings`)
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
                                                        handleDelete(event.id)
                                                    }}
                                                    className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
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
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <div className="col-span-full py-20 text-center border-2 border-dashed border-neutral-200 rounded-xl bg-white/50">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
                                        <CalendarIcon className="w-6 h-6 text-neutral-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-neutral-900">No events found</h3>
                                    <p className="text-neutral-500 mt-1">Get started by creating your first event to build your portfolio.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {view === 'calendar' && (
                        <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                            <h2 className="text-lg font-semibold mb-4">Annual Regional Schedule</h2>
                            <EventCalendar events={events} />
                        </div>
                    )}

                    {view === 'map' && (
                        <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                            <h2 className="text-lg font-semibold mb-4">Global Event Footprint</h2>
                            <EventMap events={events} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
