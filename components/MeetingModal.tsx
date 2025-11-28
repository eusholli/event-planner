'use client'

import { useState, useEffect } from 'react'
import moment from 'moment'
import { useUser } from '@/components/auth'

interface Room {
    id: string
    name: string
}

interface Attendee {
    id: string
    name: string
    email: string
}

export interface Meeting {
    id: string
    title: string
    date: string | null
    startTime: string | null
    endTime: string | null
    resourceId: string // Room ID
    attendees: { id: string, name: string }[]
    purpose: string
    status: string
    tags: string[]
    createdBy?: string
    requesterEmail?: string
    meetingType?: string
    otherDetails?: string
    isApproved?: boolean
    calendarInviteSent?: boolean
}

interface MeetingModalProps {
    isOpen: boolean
    onClose: () => void
    event: Partial<Meeting> | null
    onEventChange: (event: Partial<Meeting>) => void
    rooms: Room[]
    allAttendees: Attendee[]
    availableTags: string[]
    isCreating: boolean
    onSave: (e: React.FormEvent) => Promise<void>
    onDelete: () => Promise<void>
    conflicts?: string[]
    suggestions?: { type: 'room' | 'time', label: string, value: any }[]
    error?: string
    meetingTypes?: string[]
}

export default function MeetingModal({
    isOpen,
    onClose,
    event,
    onEventChange,
    rooms,
    allAttendees,
    availableTags,
    isCreating,
    onSave,
    onDelete,
    conflicts = [],
    suggestions = [],
    error,
    meetingTypes = []
}: MeetingModalProps) {
    const [localError, setLocalError] = useState('')
    const { user } = useUser()

    useEffect(() => {
        setLocalError('')
    }, [event, isOpen])

    useEffect(() => {
        if (error) setLocalError(error)
    }, [error])

    if (!isOpen || !event) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Client-side validation for COMPLETED status
        if (event.status === 'COMPLETED') {
            if (!event.title || event.title.trim() === '') {
                setLocalError('Title is required for completed meetings')
                return
            }
            if (!event.date || !event.startTime || !event.endTime) {
                setLocalError('Date and time are required for completed meetings')
                return
            }
            if (!event.resourceId) {
                setLocalError('Room is required for completed meetings')
                return
            }
            if (!event.attendees || event.attendees.length === 0) {
                setLocalError('At least one attendee is required for completed meetings')
                return
            }
        }

        await onSave(e)
    }

    return (
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
                                                    onEventChange({ ...event, resourceId: s.value })
                                                } else if (s.type === 'time') {
                                                    onEventChange({
                                                        ...event,
                                                        startTime: s.value.startTime,
                                                        endTime: s.value.endTime
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

                {localError && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 font-medium">
                        {localError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                            Title<span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            className="input-field"
                            value={event.title || ''}
                            onChange={e => onEventChange({ ...event, title: e.target.value })}
                            data-lpignore="true"
                            placeholder="Meeting Title"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Status</label>
                        <select
                            className="input-field"
                            value={event.status || 'STARTED'}
                            onChange={e => onEventChange({ ...event, status: e.target.value })}
                        >
                            <option value="STARTED">Started</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CANCELED">Canceled</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Requester Email</label>
                        <input
                            type="email"
                            className="input-field"
                            value={event.requesterEmail || ''}
                            onChange={e => onEventChange({ ...event, requesterEmail: e.target.value })}
                            placeholder="requester@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Meeting Type</label>
                        <select
                            className="input-field"
                            value={event.meetingType || ''}
                            onChange={e => onEventChange({ ...event, meetingType: e.target.value })}
                        >
                            <option value="">Select Type...</option>
                            {meetingTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                Date{event.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                            </label>
                            <input
                                type="date"
                                required={event.status === 'COMPLETED'}
                                className="input-field"
                                value={event.date || ''}
                                onChange={e => onEventChange({ ...event, date: e.target.value || null })}
                                data-lpignore="true"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                Start Time{event.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                            </label>
                            <input
                                type="time"
                                required={event.status === 'COMPLETED'}
                                className="input-field"
                                value={event.startTime || ''}
                                onChange={e => {
                                    const newStartTime = e.target.value
                                    let newEndTime = event.endTime

                                    // If we have a start time and an end time, try to preserve duration
                                    // Or if we just set start time, default to 30 mins later
                                    if (newStartTime) {
                                        const [hours, minutes] = newStartTime.split(':').map(Number)
                                        const startDate = new Date()
                                        startDate.setHours(hours, minutes, 0, 0)

                                        // Default 30 mins if no end time, or preserve duration if end time exists
                                        let duration = 30 * 60 * 1000
                                        if (event.startTime && event.endTime) {
                                            const [endH, endM] = event.endTime.split(':').map(Number)
                                            const [startH, startM] = event.startTime.split(':').map(Number)
                                            const prevStart = new Date(); prevStart.setHours(startH, startM, 0, 0)
                                            const prevEnd = new Date(); prevEnd.setHours(endH, endM, 0, 0)
                                            duration = prevEnd.getTime() - prevStart.getTime()
                                        }

                                        const endDate = new Date(startDate.getTime() + duration)
                                        newEndTime = endDate.toTimeString().slice(0, 5)
                                    }

                                    onEventChange({ ...event, startTime: newStartTime || null, endTime: newEndTime || null })
                                }}
                                data-lpignore="true"
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Duration</label>
                            <select
                                className="input-field"
                                value={(() => {
                                    if (event.startTime && event.endTime) {
                                        const [startH, startM] = event.startTime.split(':').map(Number)
                                        const [endH, endM] = event.endTime.split(':').map(Number)
                                        const start = new Date(); start.setHours(startH, startM, 0, 0)
                                        const end = new Date(); end.setHours(endH, endM, 0, 0)
                                        return (end.getTime() - start.getTime()) / (60 * 1000)
                                    }
                                    return 30
                                })()}
                                onChange={e => {
                                    const durationMinutes = parseInt(e.target.value)
                                    if (event.startTime) {
                                        const [startH, startM] = event.startTime.split(':').map(Number)
                                        const start = new Date(); start.setHours(startH, startM, 0, 0)
                                        const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
                                        const newEndTime = end.toTimeString().slice(0, 5)
                                        onEventChange({ ...event, endTime: newEndTime })
                                    }
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
                            Room{event.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                        </label>
                        <select
                            className="input-field"
                            required={event.status === 'COMPLETED'}
                            value={event.resourceId || ''}
                            onChange={e => onEventChange({ ...event, resourceId: e.target.value })}
                        >
                            <option value="">Select a Room</option>
                            {rooms.map(room => (
                                <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                            Attendees{event.status === 'COMPLETED' && <span className="text-red-500">*</span>}
                        </label>
                        <div className="h-32 overflow-y-auto border border-zinc-200 rounded-2xl p-3 space-y-2 bg-zinc-50/50">
                            {allAttendees.map(attendee => (
                                <label key={attendee.id} className="flex items-center space-x-3 p-1 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        checked={event.attendees?.some(a => a.id === attendee.id) || false}
                                        onChange={(e) => {
                                            const currentAttendees = event.attendees || []
                                            if (e.target.checked) {
                                                onEventChange({
                                                    ...event,
                                                    attendees: [...currentAttendees, { id: attendee.id, name: attendee.name }]
                                                })
                                            } else {
                                                onEventChange({
                                                    ...event,
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
                            value={event.purpose || ''}
                            onChange={e => onEventChange({ ...event, purpose: e.target.value })}
                            placeholder="Meeting agenda or description..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Other Details</label>
                        <textarea
                            className="input-field h-24 resize-none"
                            value={event.otherDetails || ''}
                            onChange={e => onEventChange({ ...event, otherDetails: e.target.value })}
                            placeholder="Any other details..."
                        />
                    </div>
                    {availableTags.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-2">Tags</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-3 border border-zinc-200 rounded-2xl bg-zinc-50/50">
                                {availableTags.map(tag => (
                                    <label key={tag} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={event.tags?.includes(tag) || false}
                                            onChange={() => {
                                                const currentTags = event.tags || []
                                                const newTags = currentTags.includes(tag)
                                                    ? currentTags.filter(t => t !== tag)
                                                    : [...currentTags, tag]
                                                onEventChange({ ...event, tags: newTags })
                                            }}
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-zinc-700">{tag}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}


                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Created By</label>
                        <input
                            type="text"
                            readOnly
                            className="input-field bg-zinc-100 text-zinc-500"
                            value={event.createdBy || user?.primaryEmailAddress?.emailAddress || ''}
                        />
                    </div>

                    <div className="flex space-x-6">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                checked={event.isApproved || false}
                                onChange={e => onEventChange({ ...event, isApproved: e.target.checked })}
                            />
                            <span className="text-sm font-medium text-zinc-700">Approved</span>
                        </label>

                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                checked={event.calendarInviteSent || false}
                                onChange={e => onEventChange({ ...event, calendarInviteSent: e.target.checked })}
                            />
                            <span className="text-sm font-medium text-zinc-700">Calendar Invite Sent</span>
                        </label>
                    </div>
                    <div className="flex justify-between pt-4 items-center">
                        {!isCreating && (
                            <button
                                type="button"
                                onClick={onDelete}
                                className="text-red-600 hover:text-red-700 text-sm font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                            >
                                Delete Meeting
                            </button>
                        )}
                        <div className="flex space-x-3 ml-auto">
                            <button
                                type="button"
                                onClick={onClose}
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
    )
}
