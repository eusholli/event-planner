'use client'

import { useState, useEffect } from 'react'
import { Save, Trash2, Download, Upload, AlertTriangle, ShieldAlert, Wrench } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SystemAdminPage() {
    const [settings, setSettings] = useState<{
        geminiApiKey: string
        defaultTags: string[]
        defaultMeetingTypes: string[]
        defaultAttendeeTypes: string[]
        defaultRegionTypes: string[]
        defaultContentTypes: string[]
        contentTypeColors: Record<string, string>
        maintenanceMode: boolean
        brandVoice: string
    } | null>(null)

    // Local state for list inputs
    const [defaultTagsInput, setDefaultTagsInput] = useState('')
    const [defaultMeetingTypesInput, setDefaultMeetingTypesInput] = useState('')
    const [defaultAttendeeTypesInput, setDefaultAttendeeTypesInput] = useState('')
    const [defaultRegionTypesInput, setDefaultRegionTypesInput] = useState('')
    const [contentTypeRows, setContentTypeRows] = useState<{ name: string; color: string }[]>([])

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [restoreFile, setRestoreFile] = useState<File | null>(null)
    const [restoreStatus, setRestoreStatus] = useState<'idle' | 'backing-up' | 'restoring'>('idle')
    const router = useRouter()

    useEffect(() => {
        fetch('/api/admin/system')
            .then(res => {
                if (res.status === 403) throw new Error('Forbidden')
                if (!res.ok) throw new Error('Failed to load')
                return res.json()
            })
            .then(data => {
                const loadedSettings = {
                    ...data,
                    defaultTags: data.defaultTags || [],
                    defaultMeetingTypes: data.defaultMeetingTypes || [],
                    defaultAttendeeTypes: data.defaultAttendeeTypes || [],
                    defaultRegionTypes: data.defaultRegionTypes || [],
                    defaultContentTypes: data.defaultContentTypes || [],
                    contentTypeColors: data.contentTypeColors || {},
                    maintenanceMode: data.maintenanceMode ?? false,
                    brandVoice: data.brandVoice || ''
                }
                setSettings(loadedSettings)

                // Init local inputs
                setDefaultTagsInput(loadedSettings.defaultTags.join(', '))
                setDefaultMeetingTypesInput(loadedSettings.defaultMeetingTypes.join(', '))
                setDefaultAttendeeTypesInput(loadedSettings.defaultAttendeeTypes.join(', '))
                setDefaultRegionTypesInput(loadedSettings.defaultRegionTypes.join(', '))
                setContentTypeRows(loadedSettings.defaultContentTypes.map((name: string) => ({
                    name,
                    color: loadedSettings.contentTypeColors[name] || '#6366f1'
                })))

                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setError(err.message === 'Forbidden' ? 'Access Denied: Root privileges required.' : 'Failed to load system settings')
                setLoading(false)
            })
    }, [])

    const handleMaintenanceToggle = async (enabled: boolean) => {
        setSettings(prev => ({ ...prev!, maintenanceMode: enabled }))
        try {
            await fetch('/api/admin/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...settings!,
                    maintenanceMode: enabled,
                    defaultTags: defaultTagsInput.split(',').map(s => s.trim()).filter(Boolean),
                    defaultMeetingTypes: defaultMeetingTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                    defaultAttendeeTypes: defaultAttendeeTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                    defaultRegionTypes: defaultRegionTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                    defaultContentTypes: contentTypeRows.map(r => r.name.trim()).filter(Boolean),
                    contentTypeColors: contentTypeRows.reduce<Record<string, string>>((acc, r) => {
                        const n = r.name.trim()
                        if (n) acc[n] = r.color
                        return acc
                    }, {})
                })
            })
        } catch (err) {
            console.error('Failed to toggle maintenance mode', err)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')

        try {
            // Parse local inputs
            const updatedSettings = {
                ...settings!,
                defaultTags: defaultTagsInput.split(',').map(s => s.trim()).filter(Boolean),
                defaultMeetingTypes: defaultMeetingTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                defaultAttendeeTypes: defaultAttendeeTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                defaultRegionTypes: defaultRegionTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                defaultContentTypes: contentTypeRows.map(r => r.name.trim()).filter(Boolean),
                contentTypeColors: contentTypeRows.reduce<Record<string, string>>((acc, r) => {
                    const n = r.name.trim()
                    if (n) acc[n] = r.color
                    return acc
                }, {})
            }

            const res = await fetch('/api/admin/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSettings)
            })

            if (!res.ok) throw new Error('Failed to save')
            setMessage('System settings saved')
        } catch (err) {
            setMessage('Error saving settings')
        } finally {
            setSaving(false)
        }
    }

    const performSystemExport = async () => {
        const exportRes = await fetch('/api/admin/system/export')
        if (!exportRes.ok) throw new Error('Backup failed')

        const blob = await exportRes.blob()
        const disposition = exportRes.headers.get('Content-Disposition')
        const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'backup.sql.gz'

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
    }

    const handleSystemRestore = async () => {
        if (!restoreFile) return

        const confirmed = confirm(
            `This will:\n1. Download a backup of the current database\n2. Replace ALL current data with the contents of "${restoreFile.name}"\n\nThis cannot be undone. Continue?`
        )
        if (!confirmed) return

        try {
            setRestoreStatus('backing-up')
            await performSystemExport()

            setRestoreStatus('restoring')
            const formData = new FormData()
            formData.append('file', restoreFile)

            const res = await fetch('/api/admin/system/import', {
                method: 'POST',
                body: formData,
            })

            if (res.ok) {
                alert('Database restore successful')
                window.location.reload()
            } else {
                const data = await res.json().catch(() => ({}))
                alert(`Restore failed: ${data.details || data.error || 'Unknown error'}`)
            }
        } catch (err) {
            console.error(err)
            alert('Error during restore')
        } finally {
            setRestoreStatus('idle')
            setRestoreFile(null)
        }
    }

    const handleSystemExport = async () => {
        try {
            setLoading(true)
            await performSystemExport()
        } catch (err) {
            console.error(err)
            alert('Failed to download system backup')
        } finally {
            setLoading(false)
        }
    }

    const handleResetSystem = async () => {
        const confirmText = prompt('This will DELETE ALL DATA (Events, Attendees, Meetings). Type "DELETE SYSTEM" to confirm.')
        if (confirmText !== 'DELETE SYSTEM') return

        try {
            setLoading(true)

            // 1. Auto-Backup
            try {
                await performSystemExport()
            } catch (backupErr) {
                console.error('Backup failed', backupErr)
                const proceed = confirm('Automatic backup failed. Do you want to proceed with reset anyway? Data will be lost permanently.')
                if (!proceed) {
                    setLoading(false)
                    return
                }
            }

            // 2. Perform Reset
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

                        <hr className="border-neutral-200" />

                        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <Wrench className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings?.maintenanceMode ?? false}
                                        onChange={e => handleMaintenanceToggle(e.target.checked)}
                                        className="w-4 h-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <span className="text-sm font-medium text-amber-900">Enable Maintenance Mode</span>
                                </label>
                                <p className="text-xs text-amber-700 mt-1 ml-7">
                                    When enabled, all logged-in non-root users will see a maintenance splash screen instead of the normal UI.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700">Default Meeting Tags</label>
                                <input
                                    type="text"
                                    value={defaultTagsInput}
                                    onChange={e => setDefaultTagsInput(e.target.value)}
                                    placeholder="e.g. Urgent, Follow-up, Strategy"
                                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                />
                                <p className="text-xs text-neutral-500 mt-1">Comma-separated list of tags automatically added to new events.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700">Default Meeting Types</label>
                                <input
                                    type="text"
                                    value={defaultMeetingTypesInput}
                                    onChange={e => setDefaultMeetingTypesInput(e.target.value)}
                                    placeholder="e.g. Intro, Demo, Negotiation"
                                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                />
                                <p className="text-xs text-neutral-500 mt-1">Comma-separated list of meeting types automatically added to new events.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700">Default Attendee Types</label>
                                <input
                                    type="text"
                                    value={defaultAttendeeTypesInput}
                                    onChange={e => setDefaultAttendeeTypesInput(e.target.value)}
                                    placeholder="e.g. VIP, Speaker, Staff"
                                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                />
                                <p className="text-xs text-neutral-500 mt-1">Comma-separated list of attendee types automatically added to new events.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700">Default Region Types</label>
                                <input
                                    type="text"
                                    value={defaultRegionTypesInput}
                                    onChange={e => setDefaultRegionTypesInput(e.target.value)}
                                    placeholder="e.g. APAC, EMEA, AMER"
                                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                />
                                <p className="text-xs text-neutral-500 mt-1">Comma-separated list of region types used to tag companies and users.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700">Default Content Types</label>
                                <p className="text-xs text-neutral-500 mt-1 mb-2">Used by the editorial content calendar. Each type has a color that drives its calendar event fill.</p>
                                <div className="space-y-2">
                                    {contentTypeRows.map((row, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={row.color}
                                                onChange={e => setContentTypeRows(rows => rows.map((r, j) => j === i ? { ...r, color: e.target.value } : r))}
                                                className="h-9 w-12 rounded border border-neutral-300 cursor-pointer"
                                                aria-label="Color"
                                            />
                                            <input
                                                type="text"
                                                value={row.name}
                                                onChange={e => setContentTypeRows(rows => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                                                placeholder="e.g. Newsletter"
                                                className="flex-1 rounded-md border border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setContentTypeRows(rows => rows.filter((_, j) => j !== i))}
                                                className="px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
                                                aria-label="Remove"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setContentTypeRows(rows => [...rows, { name: '', color: '#6366f1' }])}
                                        className="text-sm text-blue-600 hover:text-blue-800"
                                    >+ Add content type</button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700">Brand Voice</label>
                                <p className="text-xs text-neutral-500 mt-1 mb-2">Rakuten Symphony voice, tone, and style. Injected into every AI-generated campaign content draft. Leave blank to use the built-in default.</p>
                                <textarea
                                    value={settings?.brandVoice ?? ''}
                                    onChange={e => setSettings(prev => ({ ...prev!, brandVoice: e.target.value }))}
                                    rows={12}
                                    placeholder="# Rakuten Symphony Brand Voice…"
                                    className="w-full rounded-md border border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 font-mono"
                                />
                            </div>
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
                        <p className="text-sm text-neutral-500">Download a full pg_dump of the database as a compressed SQL file.</p>

                        <button
                            onClick={handleSystemExport}
                            className="text-sm border border-neutral-300 bg-white px-3 py-2 rounded-md hover:bg-neutral-50 w-full flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" /> Download SQL Backup (.sql.gz)
                        </button>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-4">
                        <h2 className="text-lg font-semibold text-neutral-900">System Restore</h2>
                        <p className="text-sm text-neutral-500">Restore from a .sql.gz backup. The current database will be backed up first, then replaced.</p>

                        <label className="text-sm border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 rounded-md hover:bg-neutral-100 w-full flex items-center justify-center gap-2 cursor-pointer">
                            <Upload className="w-4 h-4" />
                            {restoreFile ? restoreFile.name : 'Choose .sql.gz file'}
                            <input
                                type="file"
                                accept=".sql.gz"
                                className="hidden"
                                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                            />
                        </label>

                        <button
                            onClick={handleSystemRestore}
                            disabled={!restoreFile || restoreStatus !== 'idle'}
                            className="text-sm border border-orange-300 bg-orange-50 text-orange-800 px-3 py-2 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed w-full flex items-center justify-center gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            {restoreStatus === 'backing-up' ? 'Downloading current backup...' :
                             restoreStatus === 'restoring' ? 'Restoring database...' :
                             'Restore Database'}
                        </button>
                    </div>
                </div>

                <div className="bg-red-50 p-6 rounded-xl border border-red-200 space-y-4">
                    <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Danger Zone
                    </h2>
                    <p className="text-sm text-red-800">
                        These actions are destructive and cannot be undone. A SQL backup (.sql.gz) will be downloaded automatically before the reset.
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
