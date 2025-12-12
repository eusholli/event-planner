'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import moment from 'moment'
import MeetingModal, { Meeting } from '@/components/MeetingModal'
import { generateBriefingBook } from '@/lib/briefing-book'
import MeetingCard from '@/components/MeetingCard'
import { useUser } from '@/components/auth'
import { hasWriteAccess } from '@/lib/role-utils'

interface Room {
    id: string
    name: string
}

interface Attendee {
    id: string
    name: string
    email: string
    company: string
    isExternal?: boolean
    bio?: string
    companyDescription?: string
}

interface DashboardMeeting extends Meeting {
    start: Date | null
    end: Date | null
    room?: Room
    location?: string | null
}

export default function DashboardPage() {
    const [meetings, setMeetings] = useState<DashboardMeeting[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [allAttendees, setAllAttendees] = useState<Attendee[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [meetingTypes, setMeetingTypes] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const { user } = useUser()
    const readOnly = !hasWriteAccess(user?.publicMetadata?.role as string)

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['STARTED', 'COMPLETED', 'CANCELED'])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
    const [selectedDate, setSelectedDate] = useState('')
    const [selectedRoomId, setSelectedRoomId] = useState('')
    const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>([])
    const [filterApproved, setFilterApproved] = useState(false)
    const [filterInviteSent, setFilterInviteSent] = useState(false)

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<Partial<DashboardMeeting> | null>(null)
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
                    resourceId: m.roomId || (m.location ? 'external' : null),
                    location: m.location,
                    attendees: m.attendees,
                    purpose: m.purpose,
                    status: m.status || 'STARTED',
                    tags: m.tags || [],
                    date: m.date,
                    startTime: m.startTime,
                    endTime: m.endTime,
                    meetingType: m.meetingType,
                    isApproved: m.isApproved || false,
                    calendarInviteSent: m.calendarInviteSent || false,
                    requesterEmail: m.requesterEmail,
                    otherDetails: m.otherDetails,
                    createdBy: m.createdBy
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
            // Search (Title, Purpose, Room, Attendees, Other Details)
            const searchLower = searchQuery.toLowerCase()

            // Helper to check string match
            const checkMatch = (text: string | null | undefined) =>
                text && text.toLowerCase().includes(searchLower)

            // Find room name
            const roomName = meeting.resourceId === 'external'
                ? meeting.location
                : rooms.find(r => r.id === meeting.resourceId)?.name

            const matchesSearch =
                checkMatch(meeting.title) ||
                checkMatch(meeting.purpose) ||
                checkMatch(meeting.otherDetails) ||
                checkMatch(roomName) ||
                meeting.attendees.some(a => checkMatch(a.name))

            // Status
            const matchesStatus = selectedStatuses.includes(meeting.status || 'STARTED')

            // Tags (Multiple Selection - OR logic? or AND? Usually OR for tags, or AND. Let's do AND for strict filtering, or OR. User said "user controlled choice of multiple tag selection". I'll assume OR (match any selected tag) is more common for "filtering by tags", but AND is more specific. Let's do "Match ANY selected tag" if tags are selected. If no tags selected, show all.)
            // Actually, usually filters are "Show items that have at least one of these tags" (OR).
            const matchesTags = selectedTags.length === 0 ||
                selectedTags.some(tag => meeting.tags?.includes(tag))

            // Attendees (Multiple Selection - Match ANY)
            const matchesAttendees = selectedAttendees.length === 0 ||
                selectedAttendees.some(attendeeId => meeting.attendees.some(a => a.id === attendeeId))

            // Date
            const matchesDate = !selectedDate ||
                (meeting.date === selectedDate)

            // Room
            const matchesRoom = !selectedRoomId || meeting.resourceId === selectedRoomId

            const matchesMeetingType = selectedMeetingTypes.length === 0 ||
                (meeting.meetingType && selectedMeetingTypes.includes(meeting.meetingType))

            // Approved Filter
            const matchesApproved = !filterApproved || meeting.isApproved

            // Invite Sent Filter
            const matchesInviteSent = !filterInviteSent || meeting.calendarInviteSent

            return matchesSearch && matchesTags && matchesAttendees && matchesDate && matchesRoom && matchesMeetingType && matchesApproved && matchesInviteSent && matchesStatus
        }).sort((a, b) => {
            // Sort by date/time
            if (!a.date && !b.date) return 0
            if (!a.date) return 1
            if (!b.date) return -1

            // Compare dates
            const dateCompare = a.date!.localeCompare(b.date!)
            if (dateCompare !== 0) return dateCompare

            // Compare times if dates are equal
            if (!a.startTime && !b.startTime) return 0
            if (!a.startTime) return 1
            if (!b.startTime) return -1
            return a.startTime!.localeCompare(b.startTime!)
        })
    }, [meetings, searchQuery, selectedStatuses, selectedTags, selectedAttendees, selectedDate, selectedRoomId, selectedMeetingTypes, filterApproved, filterInviteSent])

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
        const editingMeeting = {
            ...selectedEvent,
            // Ensure location/room logic is consistent for optimistic update
            resourceId: selectedEvent.resourceId,
            location: selectedEvent.resourceId === 'external' ? selectedEvent.location : null
        } as DashboardMeeting

        setMeetings(prev => prev.map(m => {
            if (m.id === editingMeeting.id) {
                return {
                    ...m,
                    ...editingMeeting,
                    // Ensure we have the full objects for display if needed, though we mostly use strings now
                    room: rooms.find(r => r.id === editingMeeting.resourceId) || m.room,
                    attendees: editingMeeting.attendees || m.attendees
                } as DashboardMeeting
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
                    // Send null for roomId if external or empty
                    roomId: (editingMeeting.resourceId === 'external' ? null : editingMeeting.resourceId) || null,
                    attendeeIds: editingMeeting.attendees?.map(a => a.id),
                    status: editingMeeting.status,
                    tags: editingMeeting.tags,
                    meetingType: editingMeeting.meetingType,
                    isApproved: editingMeeting.isApproved,
                    calendarInviteSent: editingMeeting.calendarInviteSent,
                    requesterEmail: editingMeeting.requesterEmail,
                    otherDetails: editingMeeting.otherDetails,
                    location: editingMeeting.resourceId === 'external' ? editingMeeting.location : null
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
                    meetingType: savedData.meetingType,
                    isApproved: savedData.isApproved,
                    calendarInviteSent: savedData.calendarInviteSent,
                    requesterEmail: savedData.requesterEmail,
                    otherDetails: savedData.otherDetails,
                    createdBy: savedData.createdBy,
                    location: savedData.location
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




    const handleExport = () => {
        if (filteredMeetings.length === 0) {
            alert('No meetings to export.')
            return
        }

        const headers = [
            'ID', 'Title', 'Date', 'Start Time', 'End Time', 'Status',
            'Room/Location', 'Attendees', 'Purpose', 'Tags',
            'Meeting Type', 'Approved', 'Invite Sent',
            'Requester Email', 'Other Details', 'Created By'
        ]

        const csvContent = [
            headers.join(','),
            ...filteredMeetings.map(m => {
                const roomName = m.resourceId === 'external'
                    ? (m.location || 'External')
                    : (rooms.find(r => r.id === m.resourceId)?.name || 'Unknown Room')

                const attendeeNames = m.attendees.map(a => a.name).join('; ')

                const row = [
                    m.id,
                    `"${(m.title || '').replace(/"/g, '""')}"`,
                    m.date || '',
                    m.startTime || '',
                    m.endTime || '',
                    m.status || '',
                    `"${(roomName || '').replace(/"/g, '""')}"`,
                    `"${(attendeeNames || '').replace(/"/g, '""')}"`,
                    `"${(m.purpose || '').replace(/"/g, '""')}"`,
                    `"${(m.tags?.join('; ') || '').replace(/"/g, '""')}"`,
                    m.meetingType || '',
                    m.isApproved ? 'Yes' : 'No',
                    m.calendarInviteSent ? 'Yes' : 'No',
                    `"${(m.requesterEmail || '').replace(/"/g, '""')}"`,
                    `"${(m.otherDetails || '').replace(/"/g, '""')}"`,
                    m.createdBy || ''
                ]
                return row.join(',')
            })
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `meetings-export-${moment().format('YYYYMMDD-HHmmss')}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Meeting Tracker</h1>
                    <p className="mt-2 text-zinc-500">Overview of your scheduled events.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setSearchQuery('')
                            setSelectedStatuses(['STARTED', 'COMPLETED', 'CANCELED'])
                            setSelectedTags([])
                            setSelectedAttendees([])
                            setSelectedDate('')
                            setSelectedRoomId('')
                            setSelectedMeetingTypes([])
                            setFilterApproved(false)
                            setFilterInviteSent(false)
                        }}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Clear Filters
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export CSV
                    </button>
                    {!readOnly && (
                        <Link href="/new-meeting" className="btn-primary">
                            New Meeting
                        </Link>
                    )}
                </div>
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

                        {/* Status (First Filter) */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Status</label>
                            <div className="space-y-2">
                                {['STARTED', 'COMPLETED', 'CANCELED'].map(status => (
                                    <label key={status} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedStatuses.includes(status)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedStatuses(prev => [...prev, status])
                                                } else {
                                                    setSelectedStatuses(prev => prev.filter(s => s !== status))
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-zinc-600 capitalize">{status.toLowerCase()}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Search */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Search</label>
                            <input
                                type="text"
                                placeholder="Search text, room, attendees, other details..."
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

                        {/* Status Flags */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Status</label>
                            <div className="space-y-2">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={filterApproved}
                                        onChange={(e) => setFilterApproved(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-zinc-600">Approved</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={filterInviteSent}
                                        onChange={(e) => setFilterInviteSent(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-zinc-600">Invite Sent</span>
                                </label>
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
                                <MeetingCard
                                    key={meeting.id}
                                    meeting={meeting}
                                    rooms={rooms}
                                    onDoubleClick={() => handleEventClick(meeting)}
                                />
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
                readOnly={readOnly}
            />
        </div>
    )
}
