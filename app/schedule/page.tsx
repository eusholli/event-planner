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
        endTime: '',
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
        const endDateTime = new Date(`${formData.date}T${formData.endTime}`)

        if (startDateTime >= endDateTime) {
            setError('End time must be after start time')
            setLoading(false)
            return
        }

        // Validate against event settings
        if (eventSettings) {
            const eventStart = new Date(eventSettings.startDate)
            const eventEnd = new Date(eventSettings.endDate)

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
            <h1 className="text-3xl font-bold text-slate-900">Schedule Meeting</h1>

            <div className="card">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Title</label>
                            <input
                                type="text"
                                required
                                className="input-field"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                            />
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose / Agenda</label>
                            <textarea
                                className="input-field h-24 resize-none"
                                value={formData.purpose}
                                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                            <input
                                type="date"
                                required
                                className="input-field"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                                <input
                                    type="time"
                                    required
                                    className="input-field"
                                    value={formData.startTime}
                                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                                <input
                                    type="time"
                                    required
                                    className="input-field"
                                    value={formData.endTime}
                                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Select Attendees</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-lg">
                                {attendees.map(attendee => (
                                    <label key={attendee.id} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.attendeeIds.includes(attendee.id)}
                                            onChange={() => toggleAttendee(attendee.id)}
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">{attendee.name} <span className="text-slate-400">({attendee.company})</span></span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Select Room</label>
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

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full md:w-auto"
                        >
                            {loading ? 'Booking...' : 'Book Meeting'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
