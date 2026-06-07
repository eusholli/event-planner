'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { Roles } from '@/lib/constants'

type Theme = { name: string; description: string; priority: string }

const PRIORITIES = ['high', 'medium', 'low']

export default function StrategyEditorPage() {
    const { user, isLoaded } = useUser()
    const [themes, setThemes] = useState<Theme[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [updatedAt, setUpdatedAt] = useState<string | null>(null)
    const [gen, setGen] = useState<Record<number, string>>({})

    const authDisabled = process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true'
    const role = user?.publicMetadata?.role as string | undefined
    const allowed = authDisabled || role === Roles.Root || role === Roles.Marketing

    useEffect(() => {
        if (!allowed) { setLoading(false); return }
        fetch('/api/marketing/strategy')
            .then(r => (r.ok ? r.json() : { themes: [] }))
            .then(d => {
                const t = Array.isArray(d.themes) ? d.themes : []
                setThemes(t.map((x: Record<string, unknown>) => ({
                    name: String(x.name ?? ''),
                    description: String(x.description ?? ''),
                    priority: typeof x.priority === 'string' ? x.priority : (x.priority != null ? String(x.priority) : 'medium'),
                })))
                setUpdatedAt(d.updatedAt ?? null)
            })
            .catch(() => setError('Failed to load strategy'))
            .finally(() => setLoading(false))
    }, [allowed])

    function update(i: number, field: keyof Theme, value: string) {
        setThemes(cur => cur.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
    }
    function addTheme() { setThemes(cur => [...cur, { name: '', description: '', priority: 'medium' }]) }
    function removeTheme(i: number) { setThemes(cur => cur.filter((_, idx) => idx !== i)) }

    function setGenStatus(i: number, status: string) { setGen(cur => ({ ...cur, [i]: status })) }

    // Poll a queued run request until the agent finishes (or time out after ~4 min).
    function pollRequest(i: number, requestId: string, attempt = 0) {
        if (attempt > 48) { setGenStatus(i, 'Still running… check /campaigns'); return }
        setTimeout(async () => {
            try {
                const res = await fetch(`/api/marketing/run-requests/${requestId}`)
                if (!res.ok) { setGenStatus(i, 'Generating… check /campaigns'); return }
                const d = await res.json()
                if (d.status === 'DONE') setGenStatus(i, '✓ Done — see /campaigns')
                else if (d.status === 'FAILED') setGenStatus(i, `Failed: ${d.error || 'unknown error'}`)
                else { setGenStatus(i, d.status === 'RUNNING' ? 'Generating…' : 'Queued…'); pollRequest(i, requestId, attempt + 1) }
            } catch {
                pollRequest(i, requestId, attempt + 1)
            }
        }, 5000)
    }

    async function generateCampaign(i: number) {
        const theme = themes[i].name.trim()
        if (!theme) return
        setGenStatus(i, 'Saving…')
        try {
            // Always save the strategy first so the theme is guaranteed to exist server-side.
            await persistStrategy()
            setGenStatus(i, 'Queuing…')
            const res = await fetch('/api/marketing/generate-campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme }),
            })
            const d = await res.json().catch(() => ({}))
            if (res.status === 409) { setGenStatus(i, 'Already generating…'); if (d.request?.id) pollRequest(i, d.request.id); return }
            if (res.status === 400) { setGenStatus(i, d.error?.includes('not in') ? 'Save the strategy first' : (d.error || 'Failed')); return }
            if (!res.ok || !d.request?.id) { setGenStatus(i, d.error || 'Failed to queue'); return }
            setGenStatus(i, 'Generating…')
            pollRequest(i, d.request.id)
        } catch (e) {
            setGenStatus(i, e instanceof Error ? e.message : 'Network error')
        }
    }

    // PUT the current themes; returns true on success. Shared by Save and Generate
    // (Generate auto-saves first so you can never trigger an unsaved theme).
    async function persistStrategy(): Promise<boolean> {
        const clean = themes.filter(t => t.name.trim())
        const res = await fetch('/api/marketing/strategy', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ themes: clean }),
        })
        if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error(d.error || `Save failed (${res.status})`)
        }
        const d = await res.json()
        setUpdatedAt(d.updatedAt ?? null)
        return true
    }

    async function save() {
        setSaving(true); setMessage(null); setError(null)
        try {
            await persistStrategy()
            setMessage('Strategy saved. The marketing agent will ingest these themes on its next run.')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    if (isLoaded && !allowed) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-16 text-center">
                <h1 className="text-xl font-semibold text-zinc-900">Access restricted</h1>
                <p className="text-sm text-zinc-500 mt-2">Strategy editing is available to root and marketing roles only.</p>
                <Link href="/events" className="text-indigo-600 hover:underline text-sm mt-4 inline-block">Back to events</Link>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-semibold text-zinc-900">Marketing Strategy</h1>
                <Link href="/campaigns" className="text-sm text-indigo-600 hover:underline">← Back to campaigns</Link>
            </div>
            <p className="text-sm text-zinc-500 mb-6">
                The themes Rakuten Symphony wants to own. The marketing agent ingests this single living document to seed research, enrichment, and campaign proposals.
                {updatedAt && <span className="ml-1">Last updated {new Date(updatedAt).toLocaleString()}.</span>}
            </p>

            {message && <div className="bg-green-50 text-green-800 text-sm rounded-2xl px-3 py-2 mb-4">{message}</div>}
            {error && <div className="bg-red-50 text-red-700 text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>}

            {loading ? (
                <div className="text-zinc-400 text-sm">Loading…</div>
            ) : (
                <div className="space-y-3">
                    {themes.length === 0 && (
                        <div className="text-zinc-400 text-sm bg-white border border-zinc-200 rounded-3xl px-4 py-8 text-center">No themes yet. Add the first one below.</div>
                    )}
                    {themes.map((t, i) => (
                        <div key={i} className="bg-white border border-zinc-200 rounded-3xl p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <input
                                    value={t.name}
                                    onChange={e => update(i, 'name', e.target.value)}
                                    placeholder="Theme name (e.g. AI-RAN)"
                                    className="flex-1 px-3 py-2 border border-zinc-300 rounded-2xl text-sm font-medium"
                                />
                                <select
                                    value={t.priority}
                                    onChange={e => update(i, 'priority', e.target.value)}
                                    className="px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                                >
                                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <button onClick={() => removeTheme(i)} className="text-red-500 hover:text-red-700 text-sm px-2">Remove</button>
                            </div>
                            <textarea
                                value={t.description}
                                onChange={e => update(i, 'description', e.target.value)}
                                placeholder="What this theme means and why Rakuten Symphony should own it…"
                                rows={2}
                                className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                            />
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => generateCampaign(i)}
                                    disabled={!t.name.trim() || gen[i] === 'Queuing…' || gen[i] === 'Generating…'}
                                    className="px-3 py-1.5 text-sm rounded-2xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                >Generate Campaign</button>
                                {gen[i] && <span className="text-xs text-zinc-500">{gen[i]}</span>}
                                <span className="text-xs text-zinc-400">Runs the agent on this saved theme; a proposal lands on /campaigns.</span>
                            </div>
                        </div>
                    ))}

                    <div className="flex items-center justify-between pt-2">
                        <button onClick={addTheme} className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50">+ Add theme</button>
                        <button onClick={save} disabled={saving} className="px-5 py-2 text-sm rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save strategy'}</button>
                    </div>
                </div>
            )}
        </div>
    )
}
