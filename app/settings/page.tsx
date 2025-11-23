'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
    const router = useRouter()
    const [name, setName] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [geminiApiKey, setGeminiApiKey] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setName(data.name)
                setStartDate(new Date(data.startDate).toISOString().slice(0, 16))
                setEndDate(new Date(data.endDate).toISOString().slice(0, 16))
                setGeminiApiKey(data.geminiApiKey || '')
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
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    geminiApiKey,
                }),
            })

            if (res.ok) {
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                        <input
                            type="text"
                            required
                            className="input-field"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date & Time</label>
                            <input
                                type="datetime-local"
                                required
                                className="input-field"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">End Date & Time</label>
                            <input
                                type="datetime-local"
                                required
                                className="input-field"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Google Gemini API Key</label>
                        <input
                            type="password"
                            className="input-field"
                            value={geminiApiKey}
                            onChange={e => setGeminiApiKey(e.target.value)}
                            placeholder="Enter your Gemini API Key"
                        />
                        <p className="mt-1 text-sm text-slate-500">Required for Auto Complete features.</p>
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
            </div>

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
                                if (confirm('WARNING: This will delete ALL Attendees, Rooms, and Meetings. This action cannot be undone. Are you sure?')) {
                                    try {
                                        const res = await fetch('/api/settings/delete-data', { method: 'DELETE' })
                                        if (res.ok) {
                                            alert('Database cleared successfully')
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
        </div>
    )
}
