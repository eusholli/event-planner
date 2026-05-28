'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContentTaskModal from './ContentTaskModal'

type ContentTask = {
    id: string
    title: string
    contentType?: string | null
    status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'
    dueDate?: string | null
    tags: string[]
    assigneeId?: string | null
    eventId?: string | null
    description?: string | null
}

const STATUS_COLORS: Record<string, string> = {
    TODO: 'bg-zinc-100 text-zinc-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    DONE: 'bg-green-100 text-green-700',
    CANCELED: 'bg-red-100 text-red-600',
}

function formatDate(v?: string | null): string {
    if (!v) return '—'
    const parts = v.split('-').map(Number)
    if (parts.length !== 3 || parts.some(isNaN)) return '—'
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Props {
    eventId: string
    canWrite: boolean
}

export default function LinkedContentPanel({ eventId, canWrite }: Props) {
    const [tasks, setTasks] = useState<ContentTask[]>([])
    const [loading, setLoading] = useState(true)
    const [contentTypes, setContentTypes] = useState<{ name: string; color: string | null }[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<ContentTask | null>(null)

    async function reload() {
        setLoading(true)
        const res = await fetch(`/api/content-tasks?eventId=${encodeURIComponent(eventId)}`)
        const data = res.ok ? await res.json() : []
        setTasks(Array.isArray(data) ? data : [])
        setLoading(false)
    }

    useEffect(() => {
        reload()
        fetch('/api/content-tasks/options')
            .then(r => r.ok ? r.json() : { contentTypes: [], tags: [] })
            .then(d => {
                const ct = (d.contentTypes || []).map((c: any) => typeof c === 'string' ? { name: c, color: null } : c)
                setContentTypes(ct)
                setAvailableTags(d.tags || [])
            })
    }, [eventId])

    return (
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="font-semibold text-zinc-900">Linked Content</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Editorial tasks linked to this event</p>
                </div>
                {canWrite && (
                    <button
                        onClick={() => { setEditing(null); setModalOpen(true) }}
                        className="text-sm px-3 py-1.5 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700"
                    >+ Add content</button>
                )}
            </div>

            {loading && <div className="text-sm text-zinc-400">Loading…</div>}
            {!loading && tasks.length === 0 && (
                <div className="text-sm text-zinc-400">No linked content yet.</div>
            )}
            {!loading && tasks.length > 0 && (
                <ul className="divide-y divide-zinc-100">
                    {tasks.map(t => (
                        <li
                            key={t.id}
                            onClick={() => { setEditing(t); setModalOpen(true) }}
                            className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-zinc-50 px-2 -mx-2 rounded-lg"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-zinc-900 truncate">{t.title}</div>
                                <div className="text-xs text-zinc-500 mt-0.5">
                                    {t.contentType || 'Content'} · Due {formatDate(t.dueDate)}
                                </div>
                            </div>
                            <span className={`ml-3 inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[t.status]}`}>
                                {t.status.replace('_', ' ')}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-3 text-right">
                <Link href="/content" className="text-xs text-indigo-600 hover:underline">All content →</Link>
            </div>

            <ContentTaskModal
                open={modalOpen}
                initial={editing ?? { eventId }}
                contentTypes={contentTypes}
                availableTags={availableTags}
                onClose={() => setModalOpen(false)}
                onSaved={() => reload()}
                onDeleted={() => reload()}
            />
        </div>
    )
}
