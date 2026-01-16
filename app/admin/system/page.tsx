'use client'

import { useState, useEffect } from 'react'
import { Save, Trash2, Download, Upload, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SystemAdminPage() {
    const [settings, setSettings] = useState<{ geminiApiKey: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    useEffect(() => {
        fetch('/api/admin/system')
            .then(res => {
                if (res.status === 403) throw new Error('Forbidden')
                if (!res.ok) throw new Error('Failed to load')
                return res.json()
            })
            .then(data => {
                setSettings(data)
                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setError(err.message === 'Forbidden' ? 'Access Denied: Root privileges required.' : 'Failed to load system settings')
                setLoading(false)
            })
    }, [])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')

        try {
            const res = await fetch('/api/admin/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            })

            if (!res.ok) throw new Error('Failed to save')
            setMessage('System settings saved')
        } catch (err) {
            setMessage('Error saving settings')
        } finally {
            setSaving(false)
        }
    }

    const handleResetSystem = async () => {
        const confirmText = prompt('This will DELETE ALL DATA (Events, Attendees, Meetings). Type "DELETE SYSTEM" to confirm.')
        if (confirmText !== 'DELETE SYSTEM') return

        try {
            setLoading(true)
            const res = await fetch('/api/admin/system/reset', { method: 'POST' })
            if (res.ok) {
                alert('System has been reset.')
                window.location.reload()
            } else {
                alert('Failed to reset system')
            }
        } catch (err) {
            console.error(err)
            alert('Error resetting system')
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-10 text-center animate-pulse">Loading system...</div>

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg border border-red-200 text-center max-w-md">
                    <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-red-900 mb-2">Access Restricted</h1>
                    <p className="text-red-700 mb-6">{error}</p>
                    <button
                        onClick={() => router.push('/events')}
                        className="bg-neutral-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-neutral-800 transition-colors"
                    >
                        Return to Events
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-neutral-50 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">System Administration</h1>
                        <p className="text-neutral-500 mt-1">Global configuration and data management.</p>
                    </div>
                    {message && (
                        <div className="bg-green-50 text-green-700 px-4 py-2 rounded-md text-sm font-medium animate-in fade-in">
                            {message}
                        </div>
                    )}
                </div>

                <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-6">
                    <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                        Global Settings
                    </h2>

                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-neutral-700">Gemini API Key</label>
                            <input
                                type="password"
                                value={settings?.geminiApiKey || ''}
                                onChange={e => setSettings(prev => ({ ...prev!, geminiApiKey: e.target.value }))}
                                placeholder="Start with AI..."
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                            />
                            <p className="text-xs text-neutral-500 mt-1">Used for AI Autocomplete across all events.</p>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Save Global Settings
                            </button>
                        </div>
                    </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Data Management */}
                    <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-4">
                        <h2 className="text-lg font-semibold text-neutral-900">System Backup</h2>
                        <p className="text-sm text-neutral-500">Export the entire database including all events.</p>

                        <button
                            onClick={() => window.location.href = '/api/admin/system/export'}
                            className="text-sm border border-neutral-300 bg-white px-3 py-2 rounded-md hover:bg-neutral-50 w-full flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" /> Download Full System Backup (JSON)
                        </button>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-4">
                        <h2 className="text-lg font-semibold text-neutral-900">System Restore</h2>
                        <p className="text-sm text-neutral-500">Import a full system backup. This merges data.</p>

                        <label className="text-sm border border-neutral-300 bg-white px-3 py-2 rounded-md hover:bg-neutral-50 w-full flex items-center justify-center gap-2 cursor-pointer">
                            <Upload className="w-4 h-4" /> Import System Backup
                            <input
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0]
                                    if (!file) return

                                    const text = await file.text()
                                    try {
                                        const json = JSON.parse(text)
                                        setLoading(true)
                                        const res = await fetch('/api/admin/system/import', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(json)
                                        })
                                        if (res.ok) {
                                            alert('System import successful')
                                            window.location.reload()
                                        } else {
                                            alert('Import failed')
                                        }
                                    } catch (err) {
                                        alert('Invalid JSON')
                                    } finally {
                                        setLoading(false)
                                    }
                                }}
                            />
                        </label>
                    </div>
                </div>

                <div className="bg-red-50 p-6 rounded-xl border border-red-200 space-y-4">
                    <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Danger Zone
                    </h2>
                    <p className="text-sm text-red-800">
                        These actions are destructive and cannot be undone.
                    </p>

                    <button
                        onClick={handleResetSystem}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 w-full flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        Factory Reset System (Wipe All Data)
                    </button>
                </div>
            </div>
        </div>
    )
}
