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
    company: string
    title?: string
    isExternal?: boolean
    bio?: string
    companyDescription?: string
}

export interface Meeting {
    id: string
    title: string
    date: string | null
    startTime: string | null
    endTime: string | null
    resourceId: string // Room ID
    location?: string | null
    attendees: Attendee[]
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
    readOnly?: boolean
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
    meetingTypes = [],
    readOnly = false
}: MeetingModalProps) {
    const [localError, setLocalError] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)

    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteContent, setInviteContent] = useState<{ subject: string, body: string, ics: string } | null>(null)
    const [inviteLoading, setInviteLoading] = useState(false)

    // Email Sending State
    const [recipientEmail, setRecipientEmail] = useState('')
    const [selectedAttendeeEmails, setSelectedAttendeeEmails] = useState<Set<string>>(new Set())
    const [customEmailBody, setCustomEmailBody] = useState('')
    const [customSubject, setCustomSubject] = useState('')
    const [onsiteName, setOnsiteName] = useState('')
    const [onsitePhone, setOnsitePhone] = useState('')
    const [sendingEmail, setSendingEmail] = useState(false)
    const [emailSuccess, setEmailSuccess] = useState(false)

    const { user } = useUser()

    useEffect(() => {
        setLocalError('')
    }, [event, isOpen])

    useEffect(() => {
        if (error) setLocalError(error)
    }, [error])

    const handleGenerateInvite = async () => {
        if (!event?.id) return
        setInviteLoading(true)
        try {
            const params = new URLSearchParams()
            if (onsiteName) params.append('onsiteName', onsiteName)
            if (onsitePhone) params.append('onsitePhone', onsitePhone)

            const res = await fetch(`/api/meetings/${event.id}/invite?${params.toString()}`)
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to generate invite')
            }
            const data = await res.json()
            setInviteContent(data)
            setCustomEmailBody(data.body)
            setCustomSubject(data.subject)
            setSelectedAttendeeEmails(new Set())
            setShowInviteModal(true)
        } catch (err: any) {
            setLocalError(err.message)
        } finally {
            setInviteLoading(false)
        }
    }

    // Refresh content when onsite details change (debounced effect can be added if needed, for now trigger manually or on blur could also work, but let's stick to calling the generator)
    useEffect(() => {
        if (showInviteModal && event?.id) {
            const timer = setTimeout(() => {
                handleGenerateInvite()
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [onsiteName, onsitePhone, showInviteModal, event])

    if (!isOpen || !event) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Client-side validation for CONFIRMED/OCCURRED status
        if (['CONFIRMED', 'OCCURRED'].includes(event.status || '')) {
            const statusLabel = event.status === 'OCCURRED' ? 'occurred' : 'confirmed'

            if (!event.title || event.title.trim() === '') {
                setLocalError(`Title is required for ${statusLabel} meetings`)
                return
            }
            if (!event.date || !event.startTime || !event.endTime) {
                setLocalError(`Date and time are required for ${statusLabel} meetings`)
                return
            }
            if (!event.resourceId) {
                setLocalError(`Room is required for ${statusLabel} meetings`)
                return
            }
            if (event.resourceId === 'external' && !event.location) {
                setLocalError('Location is required for external meetings')
                return
            }
            if (!event.attendees || event.attendees.length === 0) {
                setLocalError(`At least one attendee is required for ${statusLabel} meetings`)
                return
            }
        }

        await onSave(e)
    }





    const handleSendEmail = async () => {
        if (!event.id) return

        const emailsToSend = Array.from(selectedAttendeeEmails)
        if (recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
            emailsToSend.push(recipientEmail)
        }

        if (emailsToSend.length === 0) return

        setSendingEmail(true)
        setEmailSuccess(false)
        try {
            const res = await fetch(`/api/meetings/${event.id}/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientEmails: emailsToSend,
                    onsiteName,
                    onsitePhone,
                    customBody: customEmailBody,
                    customSubject: customSubject
                })
            })
            if (!res.ok) throw new Error('Failed to send email')
            setEmailSuccess(true)
            setTimeout(() => setEmailSuccess(false), 3000)
        } catch (err: any) {
            alert('Error sending email: ' + err.message)
        } finally {
            setSendingEmail(false)
        }
    }

    const downloadICS = () => {
        if (!inviteContent) return
        const element = document.createElement("a");
        const file = new Blob([inviteContent.ics], { type: 'text/calendar' });
        element.href = URL.createObjectURL(file);
        // Use a safe filename
        const filename = (event.title || 'invite').replace(/[^a-z0-9]/gi, '_').toLowerCase()
        element.download = `${filename}.ics`;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element);
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
    }

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            {showInviteModal && inviteContent ? (
                <div className="bg-white p-8 rounded-3xl w-full md:max-w-2xl my-8 shadow-2xl relative z-[60] max-h-[90vh] overflow-y-auto">
                    <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">Calendar Invite Details</h2>


                    <div className="space-y-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">Onsite Contact Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Jessica Cheng"
                                    value={onsiteName}
                                    onChange={e => setOnsiteName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">Onsite Contact Phone</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. +33 632795165"
                                    value={onsitePhone}
                                    onChange={e => setOnsitePhone(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Subject (Editable)</label>
                            <div className="flex gap-2">
                                <input
                                    value={customSubject}
                                    onChange={(e) => setCustomSubject(e.target.value)}
                                    className="input-field bg-white"
                                />
                                <button
                                    onClick={() => copyToClipboard(customSubject)}
                                    className="p-2 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 rounded-lg"
                                    title="Copy Subject"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Email Body (Editable)</label>
                            <div className="relative">
                                <textarea
                                    value={customEmailBody}
                                    onChange={(e) => setCustomEmailBody(e.target.value)}
                                    className="input-field bg-white h-64 font-mono text-xs"
                                />
                                <button
                                    onClick={() => copyToClipboard(customEmailBody)}
                                    className="absolute top-2 right-2 p-2 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 rounded-lg bg-white shadow-sm border border-zinc-200"
                                    title="Copy Body"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            </div>
                        </div>



                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Send to Attendees</label>
                            <div className="max-h-48 overflow-y-auto border border-zinc-200 rounded-xl p-2 bg-zinc-50/50 space-y-1">
                                {event.attendees && event.attendees.length > 0 ? (
                                    event.attendees.map(attendee => (
                                        <label key={attendee.id} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded-lg cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                                checked={selectedAttendeeEmails.has(attendee.email)}
                                                onChange={(e) => {
                                                    const newSelected = new Set(selectedAttendeeEmails)
                                                    if (e.target.checked) {
                                                        newSelected.add(attendee.email)
                                                    } else {
                                                        newSelected.delete(attendee.email)
                                                    }
                                                    setSelectedAttendeeEmails(newSelected)
                                                }}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-zinc-900">{attendee.name}</span>
                                                <span className="text-xs text-zinc-500">{attendee.email}</span>
                                            </div>
                                        </label>
                                    ))
                                ) : (
                                    <p className="text-sm text-zinc-500 p-2 italic">No attendees added to this meeting.</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Additional Email (Optional)</label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="e.g. colleague@example.com"
                                value={recipientEmail}
                                onChange={e => setRecipientEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-zinc-100">
                        <button
                            onClick={() => setShowInviteModal(false)}
                            className="btn-secondary"
                        >
                            Close
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={downloadICS}
                                className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors font-medium border border-indigo-200"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Download .ics
                            </button>
                            <button
                                onClick={() => {
                                    onEventChange({ ...event, calendarInviteSent: true })
                                    setShowInviteModal(false)
                                }}
                                className="btn-primary"
                            >
                                Mark as Sent
                            </button>
                            <button
                                onClick={handleSendEmail}
                                disabled={(selectedAttendeeEmails.size === 0 && (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))) || sendingEmail}
                                className={`btn-primary flex items-center ${emailSuccess ? 'bg-green-600 hover:bg-green-700' : ''} ${(selectedAttendeeEmails.size === 0 && (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {sendingEmail ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Sending...
                                    </>
                                ) : emailSuccess ? (
                                    <>
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                        Sent!
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        Send Email
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
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
                                disabled={readOnly}
                                className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={event.title || ''}
                                onChange={e => onEventChange({ ...event, title: e.target.value })}
                                data-lpignore="true"
                                placeholder="Meeting Title"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Status</label>
                            <select
                                className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={readOnly}
                                value={event.status || 'PIPELINE'}
                                onChange={e => {
                                    const newStatus = e.target.value
                                    if (newStatus === 'CANCELED') {
                                        onEventChange({ ...event, status: newStatus, resourceId: '', location: '' })
                                    } else {
                                        onEventChange({ ...event, status: newStatus })
                                    }
                                }}
                            >
                                <option value="PIPELINE">Pipeline</option>
                                <option value="CONFIRMED">Confirmed</option>
                                <option value="OCCURRED">Occurred</option>
                                <option value="CANCELED">Canceled</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Requester Email</label>
                            <input
                                type="email"
                                disabled={readOnly}
                                className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={event.requesterEmail || ''}
                                onChange={e => onEventChange({ ...event, requesterEmail: e.target.value })}
                                placeholder="requester@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Meeting Type</label>
                            <select
                                className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={readOnly}
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
                                    Date{['CONFIRMED', 'OCCURRED'].includes(event.status || '') && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="date"
                                    required={['CONFIRMED', 'OCCURRED'].includes(event.status || '')}
                                    disabled={readOnly}
                                    className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    value={event.date || ''}
                                    onChange={e => onEventChange({ ...event, date: e.target.value || null })}
                                    data-lpignore="true"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                    Start Time{['CONFIRMED', 'OCCURRED'].includes(event.status || '') && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="time"
                                    required={['CONFIRMED', 'OCCURRED'].includes(event.status || '')}
                                    disabled={readOnly}
                                    className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
                                    className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    disabled={readOnly}
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
                                Room{['CONFIRMED', 'OCCURRED'].includes(event.status || '') && <span className="text-red-500">*</span>}
                            </label>
                            <select
                                className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={readOnly}
                                required={['CONFIRMED', 'OCCURRED'].includes(event.status || '')}
                                value={event.resourceId || ''}
                                onChange={e => onEventChange({ ...event, resourceId: e.target.value })}
                            >
                                <option value="">Select a Room</option>
                                <option value="external">External</option>
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>{room.name}</option>
                                ))}
                            </select>
                        </div>

                        {event.resourceId === 'external' && (
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                    Location<span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    disabled={readOnly}
                                    className={`input-field ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    value={event.location || ''}
                                    onChange={e => onEventChange({ ...event, location: e.target.value })}
                                    placeholder="e.g. Coffee Shop, Zoom, Client Office"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                Internal Attendees{['CONFIRMED', 'OCCURRED'].includes(event.status || '') && <span className="text-red-500">*</span>}
                            </label>
                            <div className="mb-2">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        className="input-field pl-10 py-1.5 text-sm"
                                        placeholder="Search attendees..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="h-32 overflow-y-auto border border-zinc-200 rounded-2xl p-3 space-y-1 bg-zinc-50/50">
                                {allAttendees.filter(a => !a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).map(attendee => (
                                    <label key={attendee.id} className={`flex items-center space-x-3 p-1 rounded-lg transition-colors ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-100 cursor-pointer'}`}>
                                        <input
                                            type="checkbox"
                                            disabled={readOnly}
                                            className={`w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 ${readOnly ? 'cursor-not-allowed' : ''}`}
                                            checked={event.attendees?.some(a => a.id === attendee.id) || false}
                                            onChange={(e) => {
                                                const currentAttendees = event.attendees || []
                                                if (e.target.checked) {
                                                    onEventChange({
                                                        ...event,
                                                        attendees: [...currentAttendees, attendee]
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
                                {allAttendees.filter(a => !a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
                                    <p className="text-xs text-zinc-400 italic px-2">No internal attendees found.</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                External Attendees
                            </label>
                            <div className="h-32 overflow-y-auto border border-zinc-200 rounded-2xl p-3 space-y-1 bg-zinc-50/50">
                                {allAttendees.filter(a => a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).map(attendee => (
                                    <label key={attendee.id} className={`flex items-center space-x-3 p-1 rounded-lg transition-colors ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-100 cursor-pointer'}`}>
                                        <input
                                            type="checkbox"
                                            disabled={readOnly}
                                            className={`w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 ${readOnly ? 'cursor-not-allowed' : ''}`}
                                            checked={event.attendees?.some(a => a.id === attendee.id) || false}
                                            onChange={(e) => {
                                                const currentAttendees = event.attendees || []
                                                if (e.target.checked) {
                                                    onEventChange({
                                                        ...event,
                                                        attendees: [...currentAttendees, attendee]
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
                                {allAttendees.filter(a => a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
                                    <p className="text-xs text-zinc-400 italic px-2">No external attendees found.</p>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Purpose</label>
                            <textarea
                                className={`input-field h-24 resize-none ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={readOnly}
                                value={event.purpose || ''}
                                onChange={e => onEventChange({ ...event, purpose: e.target.value })}
                                placeholder="Meeting agenda or description..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Other Details</label>
                            <textarea
                                className={`input-field h-24 resize-none ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={readOnly}
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
                                                disabled={readOnly}
                                                checked={event.tags?.includes(tag) || false}
                                                onChange={() => {
                                                    const currentTags = event.tags || []
                                                    const newTags = currentTags.includes(tag)
                                                        ? currentTags.filter(t => t !== tag)
                                                        : [...currentTags, tag]
                                                    onEventChange({ ...event, tags: newTags })
                                                }}
                                                className={`w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
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

                        <div className="flex justify-between items-center">
                            <div className="flex space-x-6">
                                <label className={`flex items-center space-x-3 ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                                    <input
                                        type="checkbox"
                                        disabled={readOnly}
                                        className={`w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        checked={event.isApproved || false}
                                        onChange={e => onEventChange({ ...event, isApproved: e.target.checked })}
                                    />
                                    <span className="text-sm font-medium text-zinc-700">Approved</span>
                                </label>

                                <label className={`flex items-center space-x-3 ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                                    <input
                                        type="checkbox"
                                        disabled={readOnly}
                                        className={`w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        checked={event.calendarInviteSent || false}
                                        onChange={e => onEventChange({ ...event, calendarInviteSent: e.target.checked })}
                                    />
                                    <span className="text-sm font-medium text-zinc-700">Calendar Invite Sent</span>
                                </label>
                            </div>

                            {!isCreating && !readOnly && event.date && event.startTime && event.endTime && (user?.publicMetadata?.role === 'root' || user?.publicMetadata?.role === 'admin') && (
                                <button
                                    type="button"
                                    onClick={handleGenerateInvite}
                                    disabled={inviteLoading}
                                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium rounded-lg transition-colors flex items-center"
                                >
                                    {inviteLoading ? (
                                        <svg className="animate-spin h-4 w-4 mr-2 text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    )}
                                    Generate Invite
                                </button>
                            )}
                        </div>

                        <div className="flex justify-between pt-4 items-center">
                            {!isCreating && !readOnly && (
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
                                    {readOnly ? 'Close' : 'Cancel'}
                                </button>
                                {!readOnly && (
                                    <button type="submit" className="btn-primary">
                                        {isCreating ? 'Create' : 'Save Changes'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            )
            }
        </div >
    )
}
