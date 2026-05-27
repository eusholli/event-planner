'use client'

import { useEffect, useState } from 'react'
import UserCombobox from './UserCombobox'
import EventCombobox from './EventCombobox'
import TagCheckboxGrid from './TagCheckboxGrid'

export type ContentTaskInput = {
    id?: string
    title: string
    description?: string | null
    contentType?: string | null
    status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'
    dueDate?: string | null
    tags: string[]
    assigneeId?: string | null
    eventId?: string | null
}

interface Props {
    open: boolean
    initial?: Partial<ContentTaskInput>
    contentTypes: { name: string; color: string | null }[] | string[]
    availableTags: string[]
    onClose: () => void
    onSaved: (task: any) => void
    onDeleted?: (id: string) => void
}

const STATUSES: ContentTaskInput['status'][] = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELED']

function toDateInput(v?: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
}

export default function ContentTaskModal({ open, initial, contentTypes, availableTags, onClose, onSaved, onDeleted }: Props) {
    const [form, setForm] = useState<ContentTaskInput>({
        title: '',
        description: '',
        contentType: '',
        status: 'TODO',
        dueDate: '',
        tags: [],
        assigneeId: null,
        eventId: null,
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setForm({
            title: initial?.title ?? '',
            description: initial?.description ?? '',
            contentType: initial?.contentType ?? '',
            status: (initial?.status as any) ?? 'TODO',
            dueDate: toDateInput(initial?.dueDate ?? undefined),
            tags: initial?.tags ?? [],
            assigneeId: initial?.assigneeId ?? null,
            eventId: initial?.eventId ?? null,
            id: initial?.id,
        })
        setError(null)
    }, [open, initial])

    if (!open) return null

    const isEdit = !!initial?.id

    async function handleSave() {
        if (!form.title.trim()) { setError('Title is required'); return }
        setSaving(true); setError(null)
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description || null,
                contentType: form.contentType || null,
                status: form.status,
                dueDate: form.dueDate || null,
                tags: form.tags,
                assigneeId: form.assigneeId || null,
                eventId: form.eventId || null,
            }
            const url = isEdit ? `/api/content-tasks/${form.id}` : '/api/content-tasks'
            const method = isEdit ? 'PUT' : 'POST'
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Save failed') }
            const saved = await res.json()
            onSaved(saved)
            onClose()
        } catch (e: any) {
            setError(e.message || 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!isEdit || !form.id) return
        if (!confirm('Delete this content task?')) return
        setSaving(true); setError(null)
        try {
            const res = await fetch(`/api/content-tasks/${form.id}`, { method: 'DELETE' })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Delete failed') }
            onDeleted?.(form.id)
            onClose()
        } catch (e: any) {
            setError(e.message || 'Delete failed')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{isEdit ? 'Edit Content Task' : 'New Content Task'}</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                            placeholder="e.g. ZT Newsletter — May 23"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Content Type</label>
                            <select
                                value={form.contentType ?? ''}
                                onChange={e => setForm({ ...form, contentType: e.target.value })}
                                className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm bg-white"
                            >
                                <option value="">—</option>
                                {(contentTypes as any[]).map((t: any) => {
                                    const name = typeof t === 'string' ? t : t.name
                                    return <option key={name} value={name}>{name}</option>
                                })}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                            <select
                                value={form.status}
                                onChange={e => setForm({ ...form, status: e.target.value as any })}
                                className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm bg-white"
                            >
                                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Due Date</label>
                            <input
                                type="date"
                                value={form.dueDate ?? ''}
                                onChange={e => setForm({ ...form, dueDate: e.target.value })}
                                className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Assignee</label>
                            <UserCombobox value={form.assigneeId ?? null} onChange={(id) => setForm({ ...form, assigneeId: id })} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Linked Event (optional)</label>
                        <EventCombobox value={form.eventId ?? null} onChange={(id) => setForm({ ...form, eventId: id })} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
                        <textarea
                            value={form.description ?? ''}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={4}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                        />
                    </div>

                    <TagCheckboxGrid
                        availableTags={availableTags}
                        selectedTags={form.tags}
                        onToggle={(t) => {
                            setForm({
                                ...form,
                                tags: form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t],
                            })
                        }}
                    />
                </div>
                <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between">
                    <div>
                        {isEdit && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={saving}
                                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                            >Delete</button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50">Cancel</button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 text-sm rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >{saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
