'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import moment from 'moment'
import MeetingModal, { Meeting } from '@/components/MeetingModal'
import { generateBriefingBook, generateScheduleBriefing, generateMultiMeetingBriefingBook } from '@/lib/briefing-book'
import { generateCalendarViewPDF } from '@/lib/calendar-pdf'
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
    title?: string
    isExternal?: boolean
    bio?: string
    companyDescription?: string
}

interface DashboardMeeting extends Omit<Meeting, 'attendees'> {
    start: Date | null
    end: Date | null
    room?: Room
    location?: string | null
    attendees: Attendee[]
}

function DashboardContent({ eventId }: { eventId: string }) {
    const [meetings, setMeetings] = useState<DashboardMeeting[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [allAttendees, setAllAttendees] = useState<Attendee[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [meetingTypes, setMeetingTypes] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [eventSettings, setEventSettings] = useState<{ startDate?: string, endDate?: string } | null>(null)
    const { user } = useUser()
    const readOnly = !hasWriteAccess(user?.publicMetadata?.role as string)
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const meetingIdParam = searchParams.get('meetingId')

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED'])
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

    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchMeetings()
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Immediate Fetch for other filters
    useEffect(() => {
        fetchMeetings()
    }, [selectedStatuses, selectedTags, selectedAttendees, selectedDate, selectedRoomId, selectedMeetingTypes, filterApproved, filterInviteSent])

    // Initial Load
    useEffect(() => {
        if (!eventId) return
        Promise.all([
            fetch(`/api/rooms?eventId=${eventId}`, { cache: 'no-store' }).then(res => res.json()),
            fetch(`/api/attendees?eventId=${eventId}`, { cache: 'no-store' }).then(res => res.json()),
            fetch(`/api/events/${eventId}`, { cache: 'no-store' }).then(res => res.json())
        ]).then(([roomsData, attendeesData, eventData]) => {
            setRooms(roomsData)
            setAllAttendees(attendeesData)
            if (eventData) {
                if (eventData.tags) setAvailableTags(eventData.tags)
                if (eventData.meetingTypes) setMeetingTypes(eventData.meetingTypes)
                setEventSettings({
                    startDate: eventData.startDate ? eventData.startDate.split('T')[0] : undefined,
                    endDate: eventData.endDate ? eventData.endDate.split('T')[0] : undefined
                })
            }
        })
    }, [eventId])

    // Deep Linking Effect
    useEffect(() => {
        if (!loading && meetingIdParam) {
            const meeting = meetings.find(m => m.id === meetingIdParam)
            if (meeting) {
                // Found in existing list
                if (!isModalOpen && selectedEvent?.id !== meetingIdParam) {
                    handleEventClick(meeting)
                }
            } else {
                // Not found in list - fetch individually
                fetch(`/api/meetings/${meetingIdParam}`)
                    .then(res => {
                        if (res.ok) return res.json()
                        throw new Error('Meeting not found')
                    })
                    .then(data => {
                        // Format the fetched meeting to match DashboardMeeting
                        let start = null
                        let end = null
                        if (data.date && data.startTime && data.endTime) {
                            start = new Date(`${data.date}T${data.startTime}`)
                            end = new Date(`${data.date}T${data.endTime}`)
                        } else if (data.date) {
                            start = new Date(data.date)
                        }

                        const formattedMeeting: DashboardMeeting = {
                            id: data.id,
                            title: data.title,
                            start,
                            end,
                            resourceId: data.roomId || (data.location ? 'external' : null),
                            location: data.location,
                            attendees: data.attendees || [],
                            purpose: data.purpose,
                            status: data.status || 'PIPELINE',
                            tags: data.tags || [],
                            date: data.date,
                            startTime: data.startTime,
                            endTime: data.endTime,
                            meetingType: data.meetingType,
                            isApproved: data.isApproved || false,
                            calendarInviteSent: data.calendarInviteSent || false,
                            requesterEmail: data.requesterEmail,
                            otherDetails: data.otherDetails,
                            createdBy: data.createdBy,
                            room: data.room
                        }

                        // Add to list and open
                        setMeetings(prev => [...prev, formattedMeeting])
                        handleEventClick(formattedMeeting)
                    })
                    .catch(err => {
                        console.error('Failed to fetch deep-linked meeting:', err)
                        // Optional: Show toast or error?
                    })
            }
        }
    }, [loading, meetings, meetingIdParam])

    const fetchMeetings = async () => {
        if (!eventId) return
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.append('eventId', eventId)
            if (selectedDate) params.append('date', selectedDate)
            if (selectedRoomId) params.append('roomId', selectedRoomId)
            if (searchQuery) params.append('search', searchQuery)
            if (selectedStatuses.length > 0) params.append('status', selectedStatuses.join(','))
            if (selectedTags.length > 0) params.append('tags', selectedTags.join(','))
            if (selectedMeetingTypes.length > 0) params.append('meetingType', selectedMeetingTypes.join(','))
            if (selectedAttendees.length > 0) params.append('attendeeIds', selectedAttendees.join(','))
            if (filterApproved) params.append('isApproved', 'true')
            if (filterInviteSent) params.append('calendarInviteSent', 'true')

            const res = await fetch(`/api/meetings?${params.toString()}`, { cache: 'no-store' })
            const meetingsData = await res.json()

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
                    status: m.status || 'PIPELINE',
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
        } catch (error) {
            console.error('Error fetching meetings:', error)
        } finally {
            setLoading(false)
        }
    }

    const conflictedEventIds = useMemo(() => {
        const ids = new Set<string>()
        // Filter out meetings without valid times
        const validMeetings = meetings.filter(m => m.start && m.end)

        for (let i = 0; i < validMeetings.length; i++) {
            for (let j = i + 1; j < validMeetings.length; j++) {
                const eventA = validMeetings[i]
                const eventB = validMeetings[j]

                // Check time overlap (startA < endB && startB < endA)
                // Ensure non-null dates (checked by filter but TS might need help)
                if (eventA.start! < eventB.end! && eventB.start! < eventA.end!) {
                    // Check attendee overlap
                    const attendeesA = new Set(eventA.attendees?.map(a => a.id) || [])
                    // Check intersection
                    if (eventB.attendees?.some(a => attendeesA.has(a.id))) {
                        ids.add(eventA.id)
                        ids.add(eventB.id)
                    }
                }
            }
        }
        return ids
    }, [meetings])

    // Filter Logic - MOVED TO SERVER
    // We still keep the sort logic client-side as requested in the plan
    const filteredMeetings = useMemo(() => {
        return meetings.sort((a, b) => {
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
    }, [meetings])

    // Stats
    const stats = useMemo(() => {
        let counts: Record<string, number> = {
            PIPELINE: 0,
            CONFIRMED: 0,
            OCCURRED: 0,
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
                    status: savedData.status || 'PIPELINE',
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

                if (savedData.warning) {
                    alert(`Warning: ${savedData.warning}`)
                }

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
            'Title', 'Date', 'Start Time', 'End Time', 'Status',
            'Purpose', 'Other Details', 'Internal Attendees', 'External Attendees', 'Room/Location',
            'Tags', 'Meeting Type', 'Approved', 'Invite Sent',
            'Requester Email', 'Created By'
        ]

        const csvContent = [
            headers.join(','),
            ...filteredMeetings.map(m => {
                const roomName = m.resourceId === 'external'
                    ? (m.location || 'External')
                    : (rooms.find(r => r.id === m.resourceId)?.name || 'Unknown Room')

                const internalAttendees = m.attendees
                    .filter(a => !a.isExternal)
                    .map(a => `${a.name}, ${a.title || ''}`)
                    .join('\n')

                const externalAttendees = m.attendees
                    .filter(a => a.isExternal)
                    .map(a => `${a.name}, ${a.title || ''}, ${a.company || ''}`)
                    .join('\n')

                const row = [
                    `"${(m.title || '').replace(/"/g, '""')}"`,
                    m.date || '',
                    m.startTime || '',
                    m.endTime || '',
                    m.status || '',
                    `"${(m.purpose || '').replace(/"/g, '""')}"`,
                    `"${(m.otherDetails || '').replace(/"/g, '""')}"`,
                    `"${(internalAttendees || '').replace(/"/g, '""')}"`,
                    `"${(externalAttendees || '').replace(/"/g, '""')}"`,
                    `"${(roomName || '').replace(/"/g, '""')}"`,
                    `"${(m.tags?.join('; ') || '').replace(/"/g, '""')}"`,
                    m.meetingType || '',
                    m.isApproved ? 'Yes' : 'No',
                    m.calendarInviteSent ? 'Yes' : 'No',
                    `"${(m.requesterEmail || '').replace(/"/g, '""')}"`,
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

    const handleExportPdf = async () => {
        if (filteredMeetings.length === 0) {
            alert('No meetings to export.')
            return
        }

        // Transform data to match generateMultiMeetingBriefingBook expectations
        const meetingsForPdf = filteredMeetings.map(m => {
            const roomName = m.resourceId === 'external'
                ? (m.location || 'External')
                : (rooms.find(r => r.id === m.resourceId)?.name || 'Unknown Room')

            // Construct ISO date string for startTime if possible to ensure Moment parses it correctly
            // The refactored renderMeetingDetails handles both T-separated and separate date/time strings decently,
            // but consistency helps.
            let startDateTime = m.startTime || ''
            if (m.date && m.startTime) {
                startDateTime = `${m.date}T${m.startTime}`
            }
            let endDateTime = m.endTime || ''
            if (m.date && m.endTime) {
                endDateTime = `${m.date}T${m.endTime}`
            }

            return {
                meeting: {
                    ...m,
                    startTime: startDateTime,
                    endTime: endDateTime
                },
                roomName: roomName
            }
        })

        // Import dynamically if needed, or assume it's imported at top.
        // I need to make sure generateMultiMeetingBriefingBook is imported at the top of the file.
        // Re-checking imports... I will update imports in a separate edit if needed, or rely on previous import update if it included all named exports or wildcard.
        // Expecting: import { ..., generateMultiMeetingBriefingBook } from '@/lib/briefing-book'

        await generateMultiMeetingBriefingBook(
            "Meeting Briefing Book",
            "Detailed Report",
            meetingsForPdf
        )
    }

    const handleExportCalendarView = async () => {
        if (filteredMeetings.length === 0) {
            alert('No meetings to export.')
            return
        }

        // Transform for Calendar PDF
        // Remove External meetings
        // Needs proper Date objects for start/end
        const meetingsForCalendar = filteredMeetings
            .filter(m => m.resourceId !== 'external')
            .map(m => {
                let start = m.start
                let end = m.end

                // Ensure Date objects if missing (fallback for safety)
                if (!start && m.date && m.startTime) {
                    start = new Date(`${m.date}T${m.startTime}`)
                }
                if (!end && m.date && m.endTime) {
                    end = new Date(`${m.date}T${m.endTime}`)
                }

                // Map attendees to simpler structure if needed
                const simpleAttendees = m.attendees.map(a => ({
                    id: a.id,
                    name: a.name,
                    company: a.company,
                    isExternal: a.isExternal
                }))

                return {
                    id: m.id,
                    title: m.title,
                    start,
                    end,
                    resourceId: m.resourceId,
                    attendees: simpleAttendees,
                    location: m.location
                }
            })

        await generateCalendarViewPDF(meetingsForCalendar, rooms)
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
                            setSelectedStatuses(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED'])
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
                        onClick={handleExportCalendarView}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export Calendar View
                    </button>
                    <button
                        onClick={handleExportPdf}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export PDF
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export CSV
                    </button>
                    {!readOnly && (
                        <Link href={`/events/${eventId}/new-meeting`} className="btn-primary">
                            New Meeting
                        </Link>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                    <div className="text-sm font-medium text-zinc-500">Total</div>
                    <div className="mt-2 text-3xl font-bold text-zinc-900">{stats.TOTAL}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-blue-100 bg-blue-50/30 shadow-sm">
                    <div className="text-sm font-medium text-blue-600">Pipeline</div>
                    <div className="mt-2 text-3xl font-bold text-blue-700">{stats.PIPELINE}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-indigo-100 bg-indigo-50/30 shadow-sm">
                    <div className="text-sm font-medium text-indigo-600">Confirmed</div>
                    <div className="mt-2 text-3xl font-bold text-indigo-700">{stats.CONFIRMED}</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-green-100 bg-green-50/30 shadow-sm">
                    <div className="text-sm font-medium text-green-600">Occurred</div>
                    <div className="mt-2 text-3xl font-bold text-green-700">{stats.OCCURRED}</div>
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
                                {['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED'].map(status => (
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
                                placeholder="Search requester, creator, text, room, attendees, other details..."
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
                                min={eventSettings?.startDate}
                                max={eventSettings?.endDate}
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
                                    hasConflict={conflictedEventIds.has(meeting.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <MeetingModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false)
                    // Clear the meetingId param when closing so it doesn't reopen if we navigate back or similar
                    if (meetingIdParam) {
                        const params = new URLSearchParams(searchParams.toString())
                        params.delete('meetingId')
                        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
                    }
                }}
                event={selectedEvent}
                onEventChange={setSelectedEvent}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                rooms={rooms}
                allAttendees={allAttendees}
                availableTags={availableTags}
                meetingTypes={meetingTypes}
                isCreating={false}
                conflicts={conflicts}
                suggestions={suggestions}
                error={error}
                readOnly={readOnly}
            />
        </div>
    )
}

export default function DashboardPage() {
    const params = require('next/navigation').useParams()
    const id = params?.id as string

    if (!id) return <div>Loading...</div>

    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading dashboard...</div>}>
            <DashboardContent eventId={id} />
        </Suspense>
    )
}
