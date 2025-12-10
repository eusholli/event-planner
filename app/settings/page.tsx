'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
    const router = useRouter()
    const [name, setName] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [geminiApiKey, setGeminiApiKey] = useState('')
    const [tags, setTags] = useState('')
    const [meetingTypes, setMeetingTypes] = useState('')
    const [attendeeTypes, setAttendeeTypes] = useState('')
    const [timezone, setTimezone] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setName(data.name)
                setStartDate(data.startDate) // Already in YYYY-MM-DD format
                setEndDate(data.endDate) // Already in YYYY-MM-DD format
                setGeminiApiKey(data.geminiApiKey || '')
                setTags(data.tags ? data.tags.join(', ') : '')
                setMeetingTypes(data.meetingTypes ? data.meetingTypes.join(', ') : '')
                setAttendeeTypes(data.attendeeTypes ? data.attendeeTypes.join(', ') : '')
                setTimezone(data.timezone || '')
                setLoading(false)
            })
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    startDate, // Send as YYYY-MM-DD string
                    endDate, // Send as YYYY-MM-DD string
                    geminiApiKey,
                    tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
                    meetingTypes: meetingTypes.split(',').map(t => t.trim()).filter(t => t !== ''),
                    attendeeTypes: attendeeTypes.split(',').map(t => t.trim()).filter(t => t !== ''),
                    timezone,
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setName(data.name)
                setStartDate(data.startDate) // Already in YYYY-MM-DD format
                setEndDate(data.endDate) // Already in YYYY-MM-DD format
                setGeminiApiKey(data.geminiApiKey || '')
                setTags(data.tags ? data.tags.join(', ') : '')
                setAttendeeTypes(data.attendeeTypes ? data.attendeeTypes.join(', ') : '')
                setTimezone(data.timezone || '')

                alert('Settings saved successfully!')
                router.refresh()
            } else {
                alert('Failed to save settings')
            }
        } catch (error) {
            console.error(error)
            alert('An error occurred')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8">Loading settings...</div>

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-900 mb-8">Event Configuration</h1>

            <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="eventName" className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                        <input
                            type="text"
                            id="eventName"
                            required
                            className="input-field"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                            <input
                                type="date"
                                id="startDate"
                                required
                                className="input-field"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                            <input
                                type="date"
                                id="endDate"
                                required
                                className="input-field"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>


                    <div>
                        <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                        <select
                            id="timezone"
                            className="input-field"
                            value={timezone}
                            onChange={e => setTimezone(e.target.value)}
                        >
                            <option value="">Select a timezone...</option>
                            {Intl.supportedValuesOf('timeZone').map(tz => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </select>
                        <p className="mt-1 text-sm text-slate-500">The timezone for the event.</p>
                    </div>

                    <div>
                        <label htmlFor="geminiApiKey" className="block text-sm font-medium text-slate-700 mb-1">Google Gemini API Key</label>
                        <input
                            type="password"
                            id="geminiApiKey"
                            className="input-field"
                            value={geminiApiKey}
                            onChange={e => setGeminiApiKey(e.target.value)}
                            placeholder="Enter your Gemini API Key"
                        />
                        <p className="mt-1 text-sm text-slate-500">Required for Auto Complete features.</p>
                    </div>

                    <div>
                        <label htmlFor="tags" className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
                        <input
                            type="text"
                            id="tags"
                            className="input-field"
                            value={tags}
                            onChange={e => setTags(e.target.value)}
                            placeholder="e.g. Urgent, Work, Personal"
                        />
                        <p className="mt-1 text-sm text-slate-500">Define tags that can be assigned to meetings.</p>
                    </div>

                    <div>
                        <label htmlFor="meetingTypes" className="block text-sm font-medium text-slate-700 mb-1">Meeting Types (comma separated)</label>
                        <input
                            type="text"
                            id="meetingTypes"
                            className="input-field"
                            value={meetingTypes}
                            onChange={e => setMeetingTypes(e.target.value)}
                            placeholder="e.g. Sales, Internal, Vendor"
                        />
                        <p className="mt-1 text-sm text-slate-500">Define meeting types available for selection.</p>
                    </div>

                    <div>
                        <label htmlFor="attendeeTypes" className="block text-sm font-medium text-slate-700 mb-1">Attendee Types (comma separated)</label>
                        <input
                            type="text"
                            id="attendeeTypes"
                            className="input-field"
                            value={attendeeTypes}
                            onChange={e => setAttendeeTypes(e.target.value)}
                            placeholder="e.g. VIP, Speaker, Guest"
                        />
                        <p className="mt-1 text-sm text-slate-500">Define possible attendee types available for selection.</p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-primary"
                        >
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </form>
            </div >

            <div className="mt-8 bg-white shadow-sm rounded-xl border border-slate-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Data Management</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Import */}
                    <div className="flex flex-col h-full space-y-2">
                        <h3 className="font-medium text-slate-900">Import / Update</h3>
                        <p className="text-sm text-slate-500">Upload a config file to add or update data.</p>
                        <input
                            type="file"
                            accept=".json"
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mt-auto"
                            onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return

                                if (!confirm('This will import data from the selected file. Continue?')) {
                                    e.target.value = ''
                                    return
                                }

                                const formData = new FormData()
                                formData.append('file', file)

                                try {
                                    const res = await fetch('/api/settings/import', {
                                        method: 'POST',
                                        body: formData
                                    })
                                    if (res.ok) {
                                        alert('Data imported successfully!')
                                        router.refresh()
                                    } else {
                                        alert('Failed to import data')
                                    }
                                } catch (error) {
                                    console.error(error)
                                    alert('Import failed')
                                }
                                e.target.value = ''
                            }}
                        />
                    </div>

                    {/* Export */}
                    <div className="flex flex-col h-full space-y-2">
                        <h3 className="font-medium text-slate-900">Export Database</h3>
                        <p className="text-sm text-slate-500">Download current data as JSON.</p>
                        <button
                            onClick={() => window.open('/api/settings/export', '_blank')}
                            className="w-full py-2 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mt-auto"
                        >
                            Export Data
                        </button>
                    </div>

                    {/* Delete */}
                    <div className="flex flex-col h-full space-y-2">
                        <h3 className="font-medium text-red-600">Danger Zone</h3>
                        <p className="text-sm text-slate-500">Permanently delete all data.</p>
                        <button
                            onClick={async () => {
                                if (confirm('WARNING: This will delete ALL Attendees, Rooms, Meetings, and Event Settings. This action cannot be undone. Are you sure?')) {
                                    try {
                                        // 1. Export
                                        const exportRes = await fetch('/api/settings/export')
                                        if (!exportRes.ok) throw new Error('Export failed')

                                        const blob = await exportRes.blob()
                                        const url = window.URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = url

                                        // Get filename from header or default
                                        const contentDisposition = exportRes.headers.get('Content-Disposition')
                                        let filename = 'event-config-backup.json'
                                        if (contentDisposition) {
                                            const match = contentDisposition.match(/filename="?([^"]+)"?/)
                                            if (match && match[1]) filename = match[1]
                                        }
                                        a.download = filename
                                        document.body.appendChild(a)
                                        a.click()
                                        window.URL.revokeObjectURL(url)
                                        document.body.removeChild(a)

                                        // 2. Delete
                                        const res = await fetch('/api/settings/delete-data', { method: 'DELETE' })
                                        if (res.ok) {
                                            alert('Database exported and cleared successfully')
                                            router.refresh()
                                        } else {
                                            alert('Failed to clear database')
                                        }
                                    } catch (error) {
                                        console.error(error)
                                        alert('Delete failed')
                                    }
                                }
                            }}
                            className="w-full py-2 px-4 border border-red-300 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 mt-auto"
                        >
                            Delete Database
                        </button>
                    </div>
                </div>
            </div>
        </div >
    )
}
