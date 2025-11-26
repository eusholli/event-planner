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

import MeetingModal, { Meeting } from '@/components/MeetingModal'

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
    const [availableTags, setAvailableTags] = useState<string[]>([])

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
                status: m.status || 'STARTED',
                tags: m.tags || []
            }))
            setEvents(formattedEvents)
            setRooms(roomsData)
            setAllAttendees(attendeesData)

            // Set calendar range based on settings
            if (settingsData) {
                if (settingsData.startDate) {
                    setEventSettings(settingsData)
                    setDate(new Date(settingsData.startDate))
                }
                if (settingsData.tags) {
                    setAvailableTags(settingsData.tags)
                }
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
                    attendeeIds: event.attendees.map((a: any) => a.id),
                    tags: event.tags
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
            status: 'STARTED',
            tags: []
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
            status: selectedEvent.status,
            tags: selectedEvent.tags
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
                    status: savedEvent.status || 'STARTED',
                    tags: savedEvent.tags || []
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
            <MeetingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                event={selectedEvent}
                onEventChange={setSelectedEvent}
                rooms={rooms}
                allAttendees={allAttendees}
                availableTags={availableTags}
                isCreating={isCreating}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                conflicts={conflicts}
                suggestions={suggestions}
                error={error}
            />
        </div>
    )
}

