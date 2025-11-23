'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Meeting {
    id: string
    title: string
    startTime: string
    endTime: string
    room: { name: string }
    attendees: { name: string; company: string }[]
}

export default function DashboardPage() {
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/meetings')
            .then(res => res.json())
            .then(data => {
                setMeetings(data)
                setLoading(false)
            })
    }, [])

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        })
    }

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    return (
        <div className="space-y-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
                    <p className="mt-2 text-zinc-500">Overview of your scheduled events.</p>
                </div>
                <Link href="/schedule" className="btn-primary">
                    Schedule Meeting
                </Link>
            </div>

            <div className="space-y-6">
                <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">Upcoming Meetings</h2>

                {loading ? (
                    <div className="text-center py-12 text-zinc-400">Loading schedule...</div>
                ) : meetings.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500 bg-white rounded-3xl border border-dashed border-zinc-200">
                        No meetings scheduled.
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {meetings.map((meeting) => (
                            <div key={meeting.id} className="card hover:border-zinc-200 group">
                                <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                                    <div>
                                        <div className="flex items-center space-x-3 text-sm text-zinc-500 mb-2">
                                            <span className="font-medium text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md">{formatDate(meeting.startTime)}</span>
                                            <span className="text-zinc-300">•</span>
                                            <span>{formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}</span>
                                            <span className="text-zinc-300">•</span>
                                            <span className="flex items-center text-zinc-600">
                                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                                {meeting.room?.name || 'No Room'}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-bold text-zinc-900 tracking-tight group-hover:text-indigo-600 transition-colors">{meeting.title}</h3>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {meeting.attendees.map((attendee, idx) => (
                                                <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-100">
                                                    {attendee.name}
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
    )
}
