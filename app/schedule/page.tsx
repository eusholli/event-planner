'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Attendee {
    id: string
    name: string
    company: string
}

interface Room {
    id: string
    name: string
    capacity: number
}

export default function SchedulePage() {
    const router = useRouter()
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [formData, setFormData] = useState({
        title: '',
        purpose: '',
        date: '',
        startTime: '',
        duration: '30', // Default 30 minutes
        attendeeIds: [] as string[],
        roomId: ''
    })

    const [eventSettings, setEventSettings] = useState<{ startDate: string, endDate: string } | null>(null)

    useEffect(() => {
        Promise.all([
            fetch('/api/attendees').then(res => res.json()),
            fetch('/api/rooms').then(res => res.json()),
            fetch('/api/settings').then(res => res.json())
        ]).then(([attendeesData, roomsData, settingsData]) => {
            setAttendees(attendeesData)
            setRooms(roomsData)
            setEventSettings(settingsData)
            if (settingsData?.startDate) {
                setFormData(prev => ({
                    ...prev,
                    date: new Date(settingsData.startDate).toISOString().split('T')[0]
                }))
            }
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
        setLoading(true)

        const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
        const durationMinutes = parseInt(formData.duration)
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000)

        // Validate against event settings
        if (eventSettings) {
            const eventStart = new Date(eventSettings.startDate)
            const eventEnd = new Date(eventSettings.endDate)

            // Reset hours for date comparison if needed, but here we compare exact times
            if (startDateTime < eventStart || endDateTime > eventEnd) {
                setError(`Meeting must be within event dates: ${eventStart.toLocaleDateString()} - ${eventEnd.toLocaleDateString()}`)
                setLoading(false)
                return
            }
        }

        try {
            const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.title,
                    purpose: formData.purpose,
                    startTime: startDateTime.toISOString(),
                    endTime: endDateTime.toISOString(),
                    roomId: formData.roomId,
                    attendeeIds: formData.attendeeIds
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Failed to book meeting')
            } else {
                router.push('/') // Redirect to dashboard
            }
        } catch (err) {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Schedule Meeting</h1>
                <p className="mt-2 text-zinc-500">Book a room and invite attendees.</p>
            </div>

            <div className="card">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Meeting Title</label>
                            <input
                                type="text"
                                required
                                className="input-field"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                placeholder="e.g. Project Kickoff"
                                data-lpignore="true"
                            />
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Purpose / Agenda</label>
                            <textarea
                                className="input-field h-24 resize-none"
                                value={formData.purpose}
                                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                                placeholder="Brief description of the meeting..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Date</label>
                            <input
                                type="date"
                                required
                                className="input-field"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                data-lpignore="true"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Start Time</label>
                                <input
                                    type="time"
                                    required
                                    className="input-field"
                                    value={formData.startTime}
                                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                    data-lpignore="true"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Duration</label>
                                <select
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border border-zinc-200 rounded-2xl bg-zinc-50/50">
                                {attendees.map(attendee => (
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
                            </div>
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Select Room</label>
                            <select
                                required
                                className="input-field"
                                value={formData.roomId}
                                onChange={e => setFormData({ ...formData, roomId: e.target.value })}
                            >
                                <option value="">Select a room...</option>
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>
                                        {room.name} (Capacity: {room.capacity})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end pt-6">
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Booking...' : 'Book Meeting'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
