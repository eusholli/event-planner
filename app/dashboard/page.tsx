'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import moment from 'moment'
import MeetingModal from '@/components/MeetingModal'

interface Meeting {
    id: string
    title: string
    date: string | null
    startTime: string | null
    endTime: string | null
    resourceId: string
    attendees: { id: string, name: string }[]
    purpose: string
    status: string
    room?: { name: string }
    tags: string[]
    start?: Date | null
    end?: Date | null
    meetingType?: string
}

interface Room {
    id: string
    name: string
}

interface Attendee {
    id: string
    name: string
    email: string
}

export default function DashboardPage() {
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [allAttendees, setAllAttendees] = useState<Attendee[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [meetingTypes, setMeetingTypes] = useState<string[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
    const [selectedDate, setSelectedDate] = useState('')
    const [selectedRoomId, setSelectedRoomId] = useState('')
    const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>([])

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<Partial<Meeting> | null>(null)
    const [conflicts, setConflicts] = useState<string[]>([])
    const [suggestions, setSuggestions] = useState<{ type: 'room' | 'time', label: string, value: any }[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([
            fetch('/api/meetings', { cache: 'no-store' }).then(res => res.json()),
            fetch('/api/rooms', { cache: 'no-store' }).then(res => res.json()),
            fetch('/api/attendees', { cache: 'no-store' }).then(res => res.json()),
            fetch('/api/settings', { cache: 'no-store' }).then(res => res.json())
        ]).then(([meetingsData, roomsData, attendeesData, settingsData]) => {
            if (!Array.isArray(meetingsData)) {
                console.error('Failed to fetch meetings:', meetingsData)
                setMeetings([])
                setLoading(false)
                return
            }

            const formattedEvents = meetingsData.map((m: any) => {
                let start = null
                let end = null

                if (m.date && m.startTime && m.endTime) {
                    start = new Date(`${m.date}T${m.startTime}`)
                    end = new Date(`${m.date}T${m.endTime}`)
                } else if (m.date) {
                    start = new Date(m.date)
                }

                return {
                    id: m.id,
                    title: m.title,
                    start,
                    end,
                    resourceId: m.roomId,
                    attendees: m.attendees,
                    purpose: m.purpose,
                    status: m.status || 'STARTED',
                    tags: m.tags || [],
                    date: m.date,
                    startTime: m.startTime,
                    endTime: m.endTime,
                    meetingType: m.meetingType
                }
            })
            setMeetings(formattedEvents)
            setRooms(roomsData)
            setAllAttendees(attendeesData)
            if (settingsData && settingsData.tags) {
                setAvailableTags(settingsData.tags)
            }
            if (settingsData && settingsData.meetingTypes) {
                setMeetingTypes(settingsData.meetingTypes)
            }
            setLoading(false)
        })
    }, [])

    // Filter Logic
    const filteredMeetings = useMemo(() => {
        return meetings.filter(meeting => {
            // Search (Title & Purpose)
            const searchLower = searchQuery.toLowerCase()
            const matchesSearch =
                meeting.title.toLowerCase().includes(searchLower) ||
                (meeting.purpose && meeting.purpose.toLowerCase().includes(searchLower))

            // Tags (Multiple Selection - OR logic? or AND? Usually OR for tags, or AND. Let's do AND for strict filtering, or OR. User said "user controlled choice of multiple tag selection". I'll assume OR (match any selected tag) is more common for "filtering by tags", but AND is more specific. Let's do "Match ANY selected tag" if tags are selected. If no tags selected, show all.)
            // Actually, usually filters are "Show items that have at least one of these tags" (OR).
            const matchesTags = selectedTags.length === 0 ||
                selectedTags.some(tag => meeting.tags?.includes(tag))

            // Attendees (Multiple Selection - Match ANY)
            const matchesAttendees = selectedAttendees.length === 0 ||
                selectedAttendees.some(attendeeId => meeting.attendees.some(a => a.id === attendeeId))

            // Date
            const matchesDate = !selectedDate ||
                (meeting.start && moment(meeting.start).format('YYYY-MM-DD') === selectedDate)

            // Room
            const matchesRoom = !selectedRoomId || meeting.resourceId === selectedRoomId

            // Meeting Type
            const matchesMeetingType = selectedMeetingTypes.length === 0 ||
                (meeting.meetingType && selectedMeetingTypes.includes(meeting.meetingType))

            return matchesSearch && matchesTags && matchesAttendees && matchesDate && matchesRoom && matchesMeetingType
        }).sort((a, b) => {
            if (!a.start && !b.start) return 0
            if (!a.start) return 1
            if (!b.start) return -1
            return a.start.getTime() - b.start.getTime()
        })
    }, [meetings, searchQuery, selectedTags, selectedAttendees, selectedDate, selectedRoomId, selectedMeetingTypes])

    // Stats
    const stats = useMemo(() => {
        const counts = {
            STARTED: 0,
            COMPLETED: 0,
            CANCELED: 0,
            TOTAL: filteredMeetings.length
        }
        filteredMeetings.forEach(m => {
            if (counts[m.status as keyof typeof counts] !== undefined) {
                counts[m.status as keyof typeof counts]++
            }
        })
        return counts
    }, [filteredMeetings])

    // Modal Handlers
    const handleEventClick = (event: Meeting) => {
        setSelectedEvent(event)
        setConflicts([])
        setSuggestions([])
        setError('')
        setIsModalOpen(true)
    }

    const handleSaveEvent = async (e: React.FormEvent) => {
        if (!selectedEvent) return

        // Optimistic Update
        const editingMeeting = { ...selectedEvent } as Meeting
        setMeetings(prev => prev.map(m => {
            if (m.id === editingMeeting.id) {
                return {
                    ...m,
                    ...editingMeeting,
                    // Ensure we have the full objects for display if needed, though we mostly use strings now
                    room: rooms.find(r => r.id === editingMeeting.resourceId) || m.room,
                    attendees: editingMeeting.attendees || m.attendees
                } as any
            }
            return m
        }))

        // We need to actually save to API
        try {
            const res = await fetch(`/api/meetings/${editingMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editingMeeting.title,
                    purpose: editingMeeting.purpose,
                    date: editingMeeting.date,
                    startTime: editingMeeting.startTime,
                    endTime: editingMeeting.endTime,
                    roomId: editingMeeting.resourceId,
                    attendeeIds: editingMeeting.attendees?.map(a => a.id),
                    status: editingMeeting.status,
                    tags: editingMeeting.tags,
                    meetingType: editingMeeting.meetingType
                })
            })

            if (res.ok) {
                const savedData = await res.json()
                const formattedSaved = {
                    id: savedData.id,
                    title: savedData.title,
                    start: savedData.date && savedData.startTime ? new Date(`${savedData.date}T${savedData.startTime}`) : (savedData.date ? new Date(savedData.date) : null),
                    end: savedData.date && savedData.endTime ? new Date(`${savedData.date}T${savedData.endTime}`) : null,
                    resourceId: savedData.roomId,
                    attendees: savedData.attendees,
                    purpose: savedData.purpose,
                    status: savedData.status || 'STARTED',
                    tags: savedData.tags || [],
                    date: savedData.date,
                    startTime: savedData.startTime,
                    endTime: savedData.endTime,
                    meetingType: savedData.meetingType
                }
                setMeetings(prev => prev.map(m => m.id === formattedSaved.id ? formattedSaved : m))
                setIsModalOpen(false)
                setSelectedEvent(null)
            } else {
                const data = await res.json()
                setError(data.error || 'Failed to update meeting')
            }
        } catch (err) {
            console.error(err)
            setError('Failed to update meeting')
        }
    }

    const handleDeleteEvent = async () => {
        if (!selectedEvent) return
        if (!confirm('Are you sure you want to delete this meeting?')) return

        try {
            const res = await fetch(`/api/meetings/${selectedEvent.id}`, {
                method: 'DELETE'
            })

            if (res.ok) {
                setMeetings(prev => prev.filter(m => m.id !== selectedEvent.id))
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

    // Check conflicts when modal event changes (if needed, similar to CalendarPage)
    // For now, we'll skip real-time conflict checking in Dashboard unless requested, 
    // but the modal supports displaying them if we pass them. 
    // The user asked for "identical double click, edit/delete modal". 
    // The CalendarPage has conflict checking. I should probably implement it here too for parity.
    useEffect(() => {
        if (!isModalOpen || !selectedEvent) return

        const checkConflicts = async () => {
            if (!selectedEvent.start || !selectedEvent.end) return
            try {
                const res = await fetch('/api/meetings/check-availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: moment(selectedEvent.start).format('YYYY-MM-DD'),
                        startTime: moment(selectedEvent.start).format('HH:mm'),
                        endTime: moment(selectedEvent.end).format('HH:mm'),
                        roomId: selectedEvent.resourceId,
                        attendeeIds: selectedEvent.attendees?.map(a => a.id) || [],
                        excludeMeetingId: selectedEvent.id
                    })
                })
                const data = await res.json()
                setConflicts(data.conflicts || [])
                setSuggestions(data.suggestions || [])
            } catch (err) {
                console.error('Failed to check conflicts', err)
            }
        }

        const timer = setTimeout(checkConflicts, 500)
        return () => clearTimeout(timer)
    }, [selectedEvent, isModalOpen])


    const getStatusBadge = (status: string) => {
        const statusConfig: Record<string, { label: string; className: string }> = {
            STARTED: { label: 'Started', className: 'bg-blue-50 text-blue-700 border-blue-200' },
            COMPLETED: { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
            CANCELED: { label: 'Canceled', className: 'bg-gray-50 text-gray-700 border-gray-200' },
        }
        const config = statusConfig[status] || statusConfig.STARTED
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                {config.label}
            </span>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Meeting Tracker</h1>
                    <p className="mt-2 text-zinc-500">Overview of your scheduled events.</p>
                </div>
                <Link href="/new-meeting" className="btn-primary">
                    New Meeting
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                    <div className="text-sm font-medium text-zinc-500">Total</div>
                    <div className="mt-2 text-3xl font-bold text-zinc-900">{stats.TOTAL}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-blue-100 bg-blue-50/30 shadow-sm">
                    <div className="text-sm font-medium text-blue-600">Started</div>
                    <div className="mt-2 text-3xl font-bold text-blue-700">{stats.STARTED}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-green-100 bg-green-50/30 shadow-sm">
                    <div className="text-sm font-medium text-green-600">Completed</div>
                    <div className="mt-2 text-3xl font-bold text-green-700">{stats.COMPLETED}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 bg-gray-50/30 shadow-sm">
                    <div className="text-sm font-medium text-gray-600">Canceled</div>
                    <div className="mt-2 text-3xl font-bold text-gray-700">{stats.CANCELED}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Filters Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-6">
                        <h3 className="font-semibold text-zinc-900">Filters</h3>

                        {/* Search */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Search</label>
                            <input
                                type="text"
                                placeholder="Search title or purpose..."
                                className="input-field text-sm"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Date */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Date</label>
                            <input
                                type="date"
                                className="input-field text-sm"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                            />
                        </div>

                        {/* Room */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Room</label>
                            <select
                                className="input-field text-sm"
                                value={selectedRoomId}
                                onChange={e => setSelectedRoomId(e.target.value)}
                            >
                                <option value="">All Rooms</option>
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>{room.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Meeting Type */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Meeting Type</label>
                            <div className="flex flex-wrap gap-2">
                                {meetingTypes.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                            setSelectedMeetingTypes(prev =>
                                                prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                                            )
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedMeetingTypes.includes(type)
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                                            }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tags */}
                        {availableTags.length > 0 && (
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Tags</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableTags.map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => {
                                                setSelectedTags(prev =>
                                                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                                )
                                            }}
                                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedTags.includes(tag)
                                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Attendees */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Attendees</label>
                            <div className="max-h-48 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                                {allAttendees.map(attendee => (
                                    <label key={attendee.id} className="flex items-center space-x-2.5 p-1.5 hover:bg-zinc-50 rounded-lg cursor-pointer transition-colors">
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                            checked={selectedAttendees.includes(attendee.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedAttendees(prev => [...prev, attendee.id])
                                                } else {
                                                    setSelectedAttendees(prev => prev.filter(id => id !== attendee.id))
                                                }
                                            }}
                                        />
                                        <span className="text-sm text-zinc-600 truncate">{attendee.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Clear Filters */}
                        <button
                            onClick={() => {
                                setSearchQuery('')
                                setSelectedTags([])
                                setSelectedAttendees([])
                                setSelectedDate('')
                                setSelectedRoomId('')
                                setSelectedMeetingTypes([])
                            }}
                            className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>

                {/* Meeting List */}
                <div className="lg:col-span-3">
                    {loading ? (
                        <div className="text-center py-12 text-zinc-400">Loading schedule...</div>
                    ) : filteredMeetings.length === 0 ? (
                        <div className="text-center py-16 text-zinc-500 bg-white rounded-3xl border border-dashed border-zinc-200">
                            No meetings match your filters.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredMeetings.map((meeting) => (
                                <div
                                    key={meeting.id}
                                    className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-zinc-200 transition-all cursor-pointer group"
                                    onDoubleClick={() => handleEventClick(meeting)}
                                >
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center flex-wrap gap-2 text-xs text-zinc-500 mb-2">
                                                <span className="font-medium text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md">
                                                    {meeting.start ? moment(meeting.start).format('ddd, MMM D') : 'No Date'}
                                                </span>
                                                <span className="text-zinc-300">•</span>
                                                <span>
                                                    {meeting.start && meeting.end
                                                        ? `${moment(meeting.start).format('h:mm A')} - ${moment(meeting.end).format('h:mm A')}`
                                                        : 'No Time'}
                                                </span>
                                                <span className="text-zinc-300">•</span>
                                                <span className="flex items-center text-zinc-600">
                                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                    </svg>
                                                    {rooms.find(r => r.id === meeting.resourceId)?.name || 'No Room'}
                                                </span>
                                                {meeting.meetingType && (
                                                    <>
                                                        <span className="text-zinc-300">•</span>
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                            {meeting.meetingType}
                                                        </span>
                                                    </>
                                                )}
                                                <span className="text-zinc-300">•</span>
                                                {getStatusBadge(meeting.status)}
                                            </div>

                                            <h3 className="text-lg font-bold text-zinc-900 tracking-tight group-hover:text-indigo-600 transition-colors truncate">
                                                {meeting.title}
                                            </h3>

                                            {meeting.purpose && (
                                                <p className="mt-1 text-sm text-zinc-500 line-clamp-1">{meeting.purpose}</p>
                                            )}

                                            <div className="mt-3 flex flex-wrap gap-2 items-center">
                                                {meeting.attendees.length > 0 && (
                                                    <div className="text-sm text-zinc-600 mr-2">
                                                        {meeting.attendees.slice(0, 3).map(a => a.name).join(', ')}
                                                        {meeting.attendees.length > 3 && <span className="text-zinc-400 ml-1">+{meeting.attendees.length - 3} more</span>}
                                                    </div>
                                                )}
                                                {meeting.tags && meeting.tags.map(tag => (
                                                    <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-50 text-zinc-600 border border-zinc-100">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <MeetingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                event={selectedEvent}
                onEventChange={setSelectedEvent}
                rooms={rooms}
                allAttendees={allAttendees}
                availableTags={availableTags}
                meetingTypes={meetingTypes}
                isCreating={false}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                conflicts={conflicts}
                suggestions={suggestions}
                error={error}
            />
        </div>
    )
}
