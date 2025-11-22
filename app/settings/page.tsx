'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
    const router = useRouter()
    const [name, setName] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setName(data.name)
                setStartDate(new Date(data.startDate).toISOString().slice(0, 16))
                setEndDate(new Date(data.endDate).toISOString().slice(0, 16))
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
        </div>
    )
}
