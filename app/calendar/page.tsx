'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, momentLocalizer, Views, View } from 'react-big-calendar'
import moment from 'moment'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop(Calendar)

interface Room {
    id: string
    name: string
}

interface Attendee {
    id: string
    name: string
    email: string
}

interface Meeting {
    id: string
    title: string
    start: Date
    end: Date
    resourceId: string // Room ID
    attendees: { id: string, name: string }[]
    purpose: string
    status: string
}

export default function CalendarPage() {
    const [events, setEvents] = useState<Meeting[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [allAttendees, setAllAttendees] = useState<Attendee[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedEvent, setSelectedEvent] = useState<Partial<Meeting> | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [conflicts, setConflicts] = useState<string[]>([])
    const [suggestions, setSuggestions] = useState<{ type: 'room' | 'time', label: string, value: any }[]>([])
    const [error, setError] = useState('')

    const [date, setDate] = useState(new Date())
    const [view, setView] = useState<View>(Views.DAY)
    const [eventSettings, setEventSettings] = useState<{ startDate: string, endDate: string } | null>(null)

    useEffect(() => {
        Promise.all([
            fetch('/api/meetings').then(res => res.json()),
            fetch('/api/rooms').then(res => res.json()),
            fetch('/api/attendees').then(res => res.json()),
            fetch('/api/settings').then(res => res.json())
        ]).then(([meetingsData, roomsData, attendeesData, settingsData]) => {
            const formattedEvents = meetingsData.map((m: any) => ({
                id: m.id,
                title: m.title,
                start: new Date(m.startTime),
                end: new Date(m.endTime),
                resourceId: m.roomId,
                attendees: m.attendees,
                purpose: m.purpose,
                status: m.status || 'STARTED'
            }))
            setEvents(formattedEvents)
            setRooms(roomsData)
            setAllAttendees(attendeesData)

            // Set calendar range based on settings
            if (settingsData && settingsData.startDate) {
                setEventSettings(settingsData)
                setDate(new Date(settingsData.startDate))
            }
            setLoading(false)
        })
    }, [])

    const onNavigate = useCallback((newDate: Date) => {
        if (eventSettings) {
            const eventStart = new Date(eventSettings.startDate)
            const eventEnd = new Date(eventSettings.endDate)

            // Reset hours to compare dates only
            const target = new Date(newDate)
            target.setHours(0, 0, 0, 0)
            const start = new Date(eventStart)
            start.setHours(0, 0, 0, 0)
            const end = new Date(eventEnd)
            end.setHours(0, 0, 0, 0)

            if (target < start) {
                setDate(eventStart)
                return
            }
            if (target > end) {
                setDate(eventEnd)
                return
            }
        }
        setDate(newDate)
    }, [eventSettings])

    const handleEventDrop = useCallback(async ({ event, start, end, resourceId }: any) => {
        const updatedEvent = { ...event, start, end, resourceId }

        // Optimistic UI update
        setEvents(prev => prev.map(ev => ev.id === event.id ? updatedEvent : ev))
        setError('')

        try {
            const res = await fetch(`/api/meetings/${event.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: event.title,
                    purpose: event.purpose,
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    roomId: resourceId,
                    attendeeIds: event.attendees.map((a: any) => a.id)
                })
            })

            if (!res.ok) {
                const data = await res.json()
                setError(data.error || 'Failed to move meeting')
                // Revert UI
                setEvents(prev => prev.map(ev => ev.id === event.id ? event : ev))
            }
        } catch (err) {
            setError('Failed to update meeting')
            setEvents(prev => prev.map(ev => ev.id === event.id ? event : ev))
        }
    }, [])

    const handleSelectSlot = useCallback(({ start, end, resourceId }: any) => {
        // Default to 30 minutes for new slots if the selection is less than that
        let endDate = end
        if (end.getTime() - start.getTime() < 30 * 60 * 1000) {
            endDate = new Date(start.getTime() + 30 * 60 * 1000)
        }

        setSelectedEvent({
            title: '',
            purpose: '',
            start,
            end: endDate,
            resourceId: resourceId || rooms[0]?.id,
            attendees: [],
            status: 'STARTED'
        })
        setIsCreating(true)
        setIsModalOpen(true)
    }, [rooms])

    const handleDoubleClickEvent = (event: Meeting) => {
        setSelectedEvent(event)
        setIsCreating(false)
        setConflicts([])
        setSuggestions([])
        setIsModalOpen(true)
    }

    const checkConflicts = useCallback(async (eventData: Partial<Meeting>) => {
        if (!eventData.start || !eventData.end) return

        try {
            const res = await fetch('/api/meetings/check-availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startTime: eventData.start.toISOString(),
                    endTime: eventData.end.toISOString(),
                    roomId: eventData.resourceId,
                    attendeeIds: eventData.attendees?.map(a => a.id) || [],
                    excludeMeetingId: isCreating ? undefined : eventData.id
                })
            })
            const data = await res.json()
            setConflicts(data.conflicts || [])
            setSuggestions(data.suggestions || [])
        } catch (err) {
            console.error('Failed to check conflicts', err)
        }
    }, [isCreating])

    // Debounce conflict check
    useEffect(() => {
        if (!isModalOpen || !selectedEvent) return
        const timer = setTimeout(() => {
            checkConflicts(selectedEvent)
        }, 500)
        return () => clearTimeout(timer)
    }, [selectedEvent, isModalOpen, checkConflicts])

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedEvent) return

        // Client-side validation for COMPLETED status
        if (selectedEvent.status === 'COMPLETED') {
            if (!selectedEvent.title || selectedEvent.title.trim() === '') {
                setError('Title is required for completed meetings')
                return
            }
            if (!selectedEvent.start || !selectedEvent.end) {
                setError('Date and time are required for completed meetings')
                return
            }
            if (!selectedEvent.resourceId) {
                setError('Room is required for completed meetings')
                return
            }
            if (!selectedEvent.attendees || selectedEvent.attendees.length === 0) {
                setError('At least one attendee is required for completed meetings')
                return
            }
        }

        // Clear any previous errors
        setError('')

        const method = isCreating ? 'POST' : 'PUT'
        const url = isCreating ? '/api/meetings' : `/api/meetings/${selectedEvent.id}`

        // Prepare request body
        const requestBody: any = {
            title: selectedEvent.title,
            purpose: selectedEvent.purpose,
            status: selectedEvent.status
        }

        // Only add times if they exist and are valid
        if (selectedEvent.start && !isNaN(selectedEvent.start.getTime())) {
            requestBody.startTime = selectedEvent.start.toISOString()
        } else if (selectedEvent.start === null) {
            requestBody.startTime = null
        }

        if (selectedEvent.end && !isNaN(selectedEvent.end.getTime())) {
            requestBody.endTime = selectedEvent.end.toISOString()
        } else if (selectedEvent.end === null) {
            requestBody.endTime = null
        }

        // Always include roomId - send null if empty to clear the room
        requestBody.roomId = selectedEvent.resourceId || null

        // Always include attendeeIds (can be empty array)
        requestBody.attendeeIds = selectedEvent.attendees?.map(a => a.id) || []

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            })

            if (res.ok) {
                const savedEvent = await res.json()
                const formattedEvent = {
                    id: savedEvent.id,
                    title: savedEvent.title,
                    start: new Date(savedEvent.startTime),
                    end: new Date(savedEvent.endTime),
                    resourceId: savedEvent.roomId,
                    attendees: savedEvent.attendees,
                    purpose: savedEvent.purpose,
                    status: savedEvent.status || 'STARTED'
                }

                if (isCreating) {
                    setEvents(prev => [...prev, formattedEvent])
                } else {
                    setEvents(prev => prev.map(ev => ev.id === formattedEvent.id ? formattedEvent : ev))
                }
                setIsModalOpen(false)
                setSelectedEvent(null)
                setError('')
            } else {
                const data = await res.json()
                setError(data.error)
            }
        } catch (err) {
            console.error(err)
            setError('Failed to save meeting')
        }
    }

    const handleDeleteEvent = async () => {
        if (!selectedEvent || isCreating) return
        if (!confirm('Are you sure you want to delete this meeting?')) return

        try {
            const res = await fetch(`/api/meetings/${selectedEvent.id}`, {
                method: 'DELETE'
            })

            if (res.ok) {
                setEvents(prev => prev.filter(ev => ev.id !== selectedEvent.id))
                setIsModalOpen(false)
                setSelectedEvent(null)
            } else {
                alert('Failed to delete meeting')
            }
        } catch (err) {
            console.error(err)
            alert('Failed to delete meeting')
        }
    }

    if (loading) return <div className="p-8 text-center text-zinc-500">Loading calendar...</div>

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Room Calendar</h1>
                    <p className="mt-2 text-zinc-500">Schedule and manage room bookings.</p>
                </div>
                {error && <div className="text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-200 text-sm font-medium">{error}</div>}
            </div>

            <div className="flex-1 bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100/50">
                <DnDCalendar
                    localizer={localizer}
                    events={events}
                    date={date}
                    onNavigate={onNavigate}
                    view={view}
                    onView={setView}
                    views={[Views.DAY, Views.WEEK]}
                    step={15}
                    timeslots={4}
                    resources={rooms.map(r => ({ id: r.id, title: r.name }))}
                    resourceIdAccessor={(resource: any) => resource.id}
                    resourceTitleAccessor={(resource: any) => resource.title}
                    onSelectSlot={handleSelectSlot}
                    selectable
                    onEventDrop={handleEventDrop}
                    onDoubleClickEvent={(event: any) => handleDoubleClickEvent(event)}
                    resizable={false}
                    className="h-full font-sans text-zinc-600"
                    components={{
                        event: ({ event }: any) => (
                            <div className="text-xs h-full flex flex-col p-1">
                                <div className="font-bold leading-tight mb-0.5">{event.title}</div>
                                {event.purpose && <div className="opacity-80 truncate text-[10px]">{event.purpose}</div>}
                            </div>
                        )
                    }}
                    formats={{
                        eventTimeRangeFormat: () => ''
                    }}
                />
            </div>

            {/* Edit Modal */}
            {isModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white p-8 rounded-3xl w-full md:max-w-lg my-8 shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto">
                        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">{isCreating ? 'Add Meeting' : 'Edit Meeting'}</h2>

                        {conflicts.length > 0 && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
                                <p className="font-bold mb-2 flex items-center">
                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Scheduling Conflicts
                                </p>
                                <ul className="list-disc list-inside mb-3 space-y-1 ml-1">
                                    {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>

                                {suggestions.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-red-200/60">
                                        <p className="font-semibold mb-2 text-zinc-700">Suggestions:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {suggestions.map((s, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => {
                                                        if (s.type === 'room') {
                                                            setSelectedEvent({ ...selectedEvent, resourceId: s.value })
                                                        } else if (s.type === 'time') {
                                                            setSelectedEvent({
                                                                ...selectedEvent,
                                                                start: new Date(s.value.start),
                                                                end: new Date(s.value.end)
                                                            })
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-white border border-zinc-200 rounded-full text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-sm"
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 font-medium">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSaveEvent} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                    Title<span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="input-field"
                                    value={selectedEvent.title || ''}
                                    onChange={e => setSelectedEvent({ ...selectedEvent, title: e.target.value })}
                                    data-lpignore="true"
                                    placeholder="Meeting Title"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                        Date{selectedEvent.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="date"
                                        required={selectedEvent.status === 'COMPLETED'}
                                        className="input-field"
                                        value={selectedEvent.start ? moment(selectedEvent.start).format('YYYY-MM-DD') : ''}
                                        onChange={e => {
                                            if (!e.target.value) {
                                                // If cleared, set to null if allowed (status != COMPLETED)
                                                if (selectedEvent.status !== 'COMPLETED') {
                                                    setSelectedEvent({ ...selectedEvent, start: null as any, end: null as any })
                                                }
                                                return
                                            }
                                            const newDate = new Date(e.target.value)
                                            if (isNaN(newDate.getTime())) return // Invalid date

                                            const currentStart = selectedEvent.start || new Date()
                                            const currentEnd = selectedEvent.end || new Date()

                                            // Update Start Date
                                            const newStart = new Date(currentStart)
                                            newStart.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate())

                                            // Update End Date (preserve duration)
                                            const duration = currentEnd.getTime() - currentStart.getTime()
                                            const newEnd = new Date(newStart.getTime() + duration)

                                            setSelectedEvent({ ...selectedEvent, start: newStart, end: newEnd })
                                        }}
                                        data-lpignore="true"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                        Start Time{selectedEvent.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="time"
                                        required={selectedEvent.status === 'COMPLETED'}
                                        className="input-field"
                                        value={selectedEvent.start ? moment(selectedEvent.start).format('HH:mm') : ''}
                                        onChange={e => {
                                            if (!e.target.value) {
                                                if (selectedEvent.status !== 'COMPLETED') {
                                                    setSelectedEvent({ ...selectedEvent, start: null as any, end: null as any })
                                                }
                                                return
                                            }
                                            const [hours, minutes] = e.target.value.split(':').map(Number)
                                            const currentStart = selectedEvent.start || new Date()
                                            const currentEnd = selectedEvent.end || new Date()

                                            // Update Start Time
                                            const newStart = new Date(currentStart)
                                            newStart.setHours(hours, minutes)

                                            // Update End Time (preserve duration)
                                            const duration = currentEnd.getTime() - currentStart.getTime()
                                            const newEnd = new Date(newStart.getTime() + duration)

                                            setSelectedEvent({ ...selectedEvent, start: newStart, end: newEnd })
                                        }}
                                        data-lpignore="true"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Duration</label>
                                    <select
                                        className="input-field"
                                        value={selectedEvent.start && selectedEvent.end ? (selectedEvent.end.getTime() - selectedEvent.start.getTime()) / (60 * 1000) : 30}
                                        onChange={e => {
                                            const durationMinutes = parseInt(e.target.value)
                                            const currentStart = selectedEvent.start || new Date()
                                            const newEnd = new Date(currentStart.getTime() + durationMinutes * 60 * 1000)
                                            setSelectedEvent({ ...selectedEvent, end: newEnd })
                                        }}
                                        data-lpignore="true"
                                    >
                                        <option value="15">15m</option>
                                        <option value="30">30m</option>
                                        <option value="45">45m</option>
                                        <option value="60">1h</option>
                                        <option value="90">1.5h</option>
                                        <option value="120">2h</option>
                                        <option value="180">3h</option>
                                        <option value="240">4h</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                    Room{selectedEvent.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                                </label>
                                <select
                                    className="input-field"
                                    required={selectedEvent.status === 'COMPLETED'}
                                    value={selectedEvent.resourceId || ''}
                                    onChange={e => setSelectedEvent({ ...selectedEvent, resourceId: e.target.value })}
                                >
                                    <option value="">Select a Room</option>
                                    {rooms.map(room => (
                                        <option key={room.id} value={room.id}>{room.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                    Attendees{selectedEvent.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                                </label>
                                <div className="h-32 overflow-y-auto border border-zinc-200 rounded-2xl p-3 space-y-2 bg-zinc-50/50">
                                    {allAttendees.map(attendee => (
                                        <label key={attendee.id} className="flex items-center space-x-3 p-1 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                                checked={selectedEvent.attendees?.some(a => a.id === attendee.id) || false}
                                                onChange={(e) => {
                                                    const currentAttendees = selectedEvent.attendees || []
                                                    if (e.target.checked) {
                                                        setSelectedEvent({
                                                            ...selectedEvent,
                                                            attendees: [...currentAttendees, { id: attendee.id, name: attendee.name }]
                                                        })
                                                    } else {
                                                        setSelectedEvent({
                                                            ...selectedEvent,
                                                            attendees: currentAttendees.filter(a => a.id !== attendee.id)
                                                        })
                                                    }
                                                }}
                                            />
                                            <span className="text-sm text-zinc-700">{attendee.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Purpose</label>
                                <textarea
                                    className="input-field h-24 resize-none"
                                    value={selectedEvent.purpose || ''}
                                    onChange={e => setSelectedEvent({ ...selectedEvent, purpose: e.target.value })}
                                    placeholder="Meeting agenda or description..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Status</label>
                                <select
                                    className="input-field"
                                    value={selectedEvent.status || 'STARTED'}
                                    onChange={e => setSelectedEvent({ ...selectedEvent, status: e.target.value })}
                                >
                                    <option value="STARTED">Started</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="CANCELED">Canceled</option>
                                </select>
                            </div>
                            <div className="flex justify-between pt-4 items-center">
                                {!isCreating && (
                                    <button
                                        type="button"
                                        onClick={handleDeleteEvent}
                                        className="text-red-600 hover:text-red-700 text-sm font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        Delete Meeting
                                    </button>
                                )}
                                <div className="flex space-x-3 ml-auto">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary">
                                        {isCreating ? 'Create' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
