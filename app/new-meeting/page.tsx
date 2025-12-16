'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/components/auth'
import AddAttendeeForm from '@/components/AddAttendeeForm'

interface Attendee {
    id: string
    name: string
    company: string
    isExternal?: boolean
}

interface Room {
    id: string
    name: string
    capacity: number
}

export default function SchedulePage() {
    const router = useRouter()
    const { user } = useUser()
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    const [formData, setFormData] = useState({
        title: '',
        purpose: '',
        date: '',
        startTime: '',
        duration: '30', // Default 30 minutes
        attendeeIds: [] as string[],
        roomId: '',
        location: '',
        status: 'PIPELINE', // Default status
        tags: [] as string[],
        requesterEmail: '',
        meetingType: '',
        otherDetails: '',
        isApproved: false,
        calendarInviteSent: false
    })

    const [eventSettings, setEventSettings] = useState<{ startDate: string, endDate: string } | null>(null)
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [meetingTypes, setMeetingTypes] = useState<string[]>([])
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        Promise.all([
            fetch('/api/attendees').then(res => res.json()),
            fetch('/api/rooms').then(res => res.json()),
            fetch('/api/settings').then(res => res.json())
        ]).then(([attendeesData, roomsData, settingsData]) => {
            setAttendees(attendeesData)
            setRooms(roomsData)
            setEventSettings(settingsData)
            if (settingsData?.tags) {
                setAvailableTags(settingsData.tags)
            }
            if (settingsData?.meetingTypes) {
                setMeetingTypes(settingsData.meetingTypes)
            }

            // Set defaults if not already set
            setFormData(prev => ({
                ...prev,
                date: prev.date || settingsData.startDate || '',
                startTime: prev.startTime || '09:00'
            }))
        })
    }, [])

    const toggleAttendee = (id: string) => {
        setFormData(prev => ({
            ...prev,
            attendeeIds: prev.attendeeIds.includes(id)
                ? prev.attendeeIds.filter(aid => aid !== id)
                : [...prev.attendeeIds, id]
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSuccessMessage('')
        setLoading(true)

        // Prepare request body
        const requestBody: any = {
            title: formData.title,
            purpose: formData.purpose || '',
            roomId: formData.roomId === 'external' ? null : (formData.roomId || null),
            location: formData.roomId === 'external' ? formData.location : null,
            attendeeIds: formData.attendeeIds || [],
            status: formData.status,
            tags: formData.tags || [],
            requesterEmail: formData.requesterEmail || '',
            meetingType: formData.meetingType || '',
            otherDetails: formData.otherDetails || '',
            isApproved: formData.isApproved || false,
            calendarInviteSent: formData.calendarInviteSent || false
        }

        // Validation based on status
        if (formData.status === 'COMPLETED') {
            if (!formData.date || !formData.startTime) {
                setError('Date and Start Time are required for completed meetings')
                setLoading(false)
                return
            }
            if (!formData.roomId) {
                setError('Room is required for completed meetings')
                setLoading(false)
                return
            }
            if (formData.roomId === 'external' && !formData.location) {
                setError('Location is required for external meetings')
                setLoading(false)
                return
            }
            if (formData.attendeeIds.length === 0) {
                setError('At least one attendee is required for completed meetings')
                setLoading(false)
                return
            }
            if (!formData.duration) {
                setError('Duration is required for completed meetings')
                setLoading(false)
                return
            }
        }

        // Only add times if date and startTime are provided
        if (formData.date && formData.startTime) {
            // Validate against event settings
            if (eventSettings) {
                // Parse meeting date (YYYY-MM-DD)
                const meetingDate = new Date(formData.date + 'T00:00:00.000Z')

                // Parse event dates (already in YYYY-MM-DD format from API)
                const eventStart = new Date(eventSettings.startDate + 'T00:00:00.000Z')
                const eventEnd = new Date(eventSettings.endDate + 'T00:00:00.000Z')

                // Check if meeting date is within event date range (inclusive)
                if (meetingDate < eventStart || meetingDate > eventEnd) {
                    setError(`Meeting must be within event dates: ${eventSettings.startDate} - ${eventSettings.endDate}`)
                    setLoading(false)
                    return
                }
            }

            requestBody.date = formData.date
            requestBody.startTime = formData.startTime

            // Calculate end time
            const start = new Date(`${formData.date}T${formData.startTime}`)
            const durationMinutes = parseInt(formData.duration)
            const end = new Date(start.getTime() + durationMinutes * 60000)
            requestBody.endTime = end.toTimeString().slice(0, 5)
        } else if (formData.date) {
            // Date only
            requestBody.date = formData.date
        }

        try {
            const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Failed to book meeting')
            } else {
                setSuccessMessage('Meeting started')
                setFormData({
                    title: '',
                    purpose: '',
                    date: eventSettings?.startDate || '',
                    startTime: '09:00',
                    duration: '30',
                    attendeeIds: [],
                    roomId: '',
                    location: '',
                    status: 'STARTED',
                    tags: [],
                    requesterEmail: '',
                    meetingType: '',
                    otherDetails: '',
                    isApproved: false,
                    calendarInviteSent: false
                })
                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' })
            }
        } catch (err) {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    const handleNewAttendee = (newAttendee: Attendee) => {
        setAttendees(prev => [...prev, newAttendee].sort((a, b) => a.name.localeCompare(b.name)))
    }

    const toggleTag = (tag: string) => {
        setFormData(prev => {
            const newTags = prev.tags.includes(tag)
                ? prev.tags.filter(t => t !== tag)
                : [...prev.tags, tag]
            return { ...prev, tags: newTags }
        })
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-4xl font-bold tracking-tight text-zinc-900">New Meeting</h1>
                <p className="mt-2 text-zinc-500">Book a room and invite attendees.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <AddAttendeeForm onSuccess={handleNewAttendee} />
                </div>

                <div className="lg:col-span-2">
                    <div className="card">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {successMessage && (
                                <div className="p-4 bg-green-50 text-green-700 rounded-2xl border border-green-200 text-sm font-medium">
                                    {successMessage}
                                </div>
                            )}
                            {error && (
                                <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm font-medium">
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-full">
                                    <label htmlFor="meeting-title" className="block text-sm font-medium text-zinc-700 mb-1.5">Meeting Title</label>
                                    <input
                                        type="text"
                                        id="meeting-title"
                                        required
                                        className="input-field"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g. Project Kickoff"
                                        data-lpignore="true"
                                    />
                                </div>

                                <div className="col-span-full">
                                    <label htmlFor="status" className="block text-sm font-medium text-zinc-700 mb-1.5">Status</label>
                                    <select
                                        id="status"
                                        className="input-field"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="PIPELINE">Pipeline</option>
                                        <option value="COMMITTED">Committed</option>
                                        <option value="COMPLETED">Completed</option>
                                        <option value="CANCELED">Canceled</option>
                                    </select>
                                </div>

                                <div className="col-span-full">
                                    <label htmlFor="requesterEmail" className="block text-sm font-medium text-zinc-700 mb-1.5">Requester Email</label>
                                    <input
                                        type="email"
                                        id="requesterEmail"
                                        className="input-field"
                                        value={formData.requesterEmail}
                                        onChange={e => setFormData({ ...formData, requesterEmail: e.target.value })}
                                        placeholder="requester@example.com"
                                    />
                                </div>

                                <div className="col-span-full">
                                    <label htmlFor="meetingType" className="block text-sm font-medium text-zinc-700 mb-1.5">Meeting Type</label>
                                    <select
                                        id="meetingType"
                                        className="input-field"
                                        value={formData.meetingType}
                                        onChange={e => setFormData({ ...formData, meetingType: e.target.value })}
                                    >
                                        <option value="">Select Type...</option>
                                        {meetingTypes.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-span-full">
                                    <label htmlFor="purpose" className="block text-sm font-medium text-zinc-700 mb-1.5">Purpose / Agenda</label>
                                    <textarea
                                        id="purpose"
                                        className="input-field h-24 resize-none"
                                        value={formData.purpose}
                                        onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                                        placeholder="Brief description of the meeting..."
                                    />
                                </div>

                                <div className="col-span-full">
                                    <label htmlFor="otherDetails" className="block text-sm font-medium text-zinc-700 mb-1.5">Other Details</label>
                                    <textarea
                                        id="otherDetails"
                                        className="input-field h-24 resize-none"
                                        value={formData.otherDetails}
                                        onChange={e => setFormData({ ...formData, otherDetails: e.target.value })}
                                        placeholder="Any other details..."
                                    />
                                </div>

                                {availableTags.length > 0 && (
                                    <div className="col-span-full">
                                        <label className="block text-sm font-medium text-zinc-700 mb-2">Tags</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-3 border border-zinc-200 rounded-2xl bg-zinc-50/50">
                                            {availableTags.map(tag => (
                                                <label key={tag} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.tags.includes(tag)}
                                                        onChange={() => toggleTag(tag)}
                                                        className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm text-zinc-700">{tag}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="date" className="block text-sm font-medium text-zinc-700 mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        id="date"
                                        className="input-field"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        data-lpignore="true"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="startTime" className="block text-sm font-medium text-zinc-700 mb-1.5">Start Time</label>
                                        <input
                                            type="time"
                                            id="startTime"
                                            className="input-field"
                                            value={formData.startTime}
                                            onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                            data-lpignore="true"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="duration" className="block text-sm font-medium text-zinc-700 mb-1.5">Duration</label>
                                        <select
                                            id="duration"
                                            className="input-field"
                                            value={formData.duration}
                                            onChange={e => setFormData({ ...formData, duration: e.target.value })}
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

                                <div className="col-span-full">
                                    <label className="block text-sm font-medium text-zinc-700 mb-2">Select Attendees</label>
                                    <div className="mb-3">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <svg className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                </svg>
                                            </div>
                                            <input
                                                type="text"
                                                className="input-field pl-10"
                                                placeholder="Search attendees..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-full">
                                    <label className="block text-sm font-medium text-zinc-700 mb-2">Internal Attendees</label>
                                    <div className="max-h-48 overflow-y-auto p-3 border border-zinc-200 rounded-2xl bg-zinc-50/50">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {attendees.filter(a => !a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).map(attendee => (
                                                <label key={attendee.id} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.attendeeIds.includes(attendee.id)}
                                                        onChange={() => toggleAttendee(attendee.id)}
                                                        className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm text-zinc-700">{attendee.name} <span className="text-zinc-400 text-xs">({attendee.company})</span></span>
                                                </label>
                                            ))}
                                            {attendees.filter(a => !a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
                                                <p className="text-xs text-zinc-400 italic col-span-full px-2">No internal attendees found.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-full">
                                    <label className="block text-sm font-medium text-zinc-700 mb-2">External Attendees</label>
                                    <div className="max-h-48 overflow-y-auto p-3 border border-zinc-200 rounded-2xl bg-zinc-50/50">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {attendees.filter(a => a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).map(attendee => (
                                                <label key={attendee.id} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.attendeeIds.includes(attendee.id)}
                                                        onChange={() => toggleAttendee(attendee.id)}
                                                        className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm text-zinc-700">{attendee.name} <span className="text-zinc-400 text-xs">({attendee.company})</span></span>
                                                </label>
                                            ))}
                                            {attendees.filter(a => a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
                                                <p className="text-xs text-zinc-400 italic col-span-full px-2">No external attendees found.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-full">
                                    <label htmlFor="roomId" className="block text-sm font-medium text-zinc-700 mb-1.5">Select Room</label>
                                    <select
                                        id="roomId"
                                        className="input-field"
                                        value={formData.roomId}
                                        onChange={e => setFormData({ ...formData, roomId: e.target.value })}
                                    >
                                        <option value="">Select a room...</option>
                                        <option value="external">External</option>
                                        {rooms.map(room => (
                                            <option key={room.id} value={room.id}>
                                                {room.name} (Capacity: {room.capacity})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formData.roomId === 'external' && (
                                    <div className="col-span-full">
                                        <label htmlFor="location" className="block text-sm font-medium text-zinc-700 mb-1.5">
                                            Location<span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="location"
                                            required
                                            className="input-field"
                                            value={formData.location}
                                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            placeholder="e.g. Coffee Shop, Zoom, Client Office"
                                        />
                                    </div>
                                )}



                                <div className="col-span-full">
                                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Created By</label>
                                    <input
                                        type="text"
                                        readOnly
                                        className="input-field bg-zinc-100 text-zinc-500"
                                        value={user?.primaryEmailAddress?.emailAddress || ''}
                                    />
                                </div>

                                <div className="col-span-full flex space-x-6">
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            id="isApproved"
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                            checked={formData.isApproved}
                                            onChange={e => setFormData({ ...formData, isApproved: e.target.checked })}
                                        />
                                        <span className="text-sm font-medium text-zinc-700">Approved</span>
                                    </label>

                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            id="calendarInviteSent"
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                            checked={formData.calendarInviteSent}
                                            onChange={e => setFormData({ ...formData, calendarInviteSent: e.target.checked })}
                                        />
                                        <span className="text-sm font-medium text-zinc-700">Calendar Invite Sent</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end pt-6">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn-primary w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Booking...' : 'Start Meeting'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
