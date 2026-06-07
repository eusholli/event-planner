'use client'

import { useEffect, useRef, useState } from 'react'
import UserCombobox from './UserCombobox'
import EventCombobox from './EventCombobox'
import TagCheckboxGrid from './TagCheckboxGrid'

export type ContentTaskInput = {
    id?: string
    title: string
    description?: string | null
    notes?: string | null
    contentType?: string | null
    status: 'DRAFT' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'
    dueDate?: string | null
    tags: string[]
    assigneeId?: string | null
    collaboratorIds: string[]
    eventId?: string | null
    attachments?: Attachment[]
}

type Attachment = {
    id: string
    title: string
    fileUrl: string
    originalName: string
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

const STATUSES: ContentTaskInput['status'][] = ['DRAFT', 'TODO', 'IN_PROGRESS', 'DONE', 'CANCELED']

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
        notes: '',
        contentType: '',
        status: 'TODO',
        dueDate: '',
        tags: [],
        assigneeId: null,
        collaboratorIds: [],
        eventId: null,
    })
    const [collaboratorNames, setCollaboratorNames] = useState<Record<string, string>>({})
    const [addingCollaborator, setAddingCollaborator] = useState(false)
    const [attachments, setAttachments] = useState<Attachment[]>([])
    const [attachTitle, setAttachTitle] = useState('')
    const [attachFile, setAttachFile] = useState<File | null>(null)
    const [attachUploading, setAttachUploading] = useState(false)
    const [attachError, setAttachError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [nudgeStatus, setNudgeStatus] = useState<{ ok: boolean; msg: string } | null>(null)

    useEffect(() => {
        if (!open) return
        const base: ContentTaskInput = {
            title: initial?.title ?? '',
            description: initial?.description ?? '',
            notes: initial?.notes ?? '',
            contentType: initial?.contentType ?? '',
            status: (initial?.status as any) ?? 'TODO',
            dueDate: toDateInput(initial?.dueDate ?? undefined),
            tags: initial?.tags ?? [],
            assigneeId: initial?.assigneeId ?? null,
            collaboratorIds: initial?.collaboratorIds ?? [],
            eventId: initial?.eventId ?? null,
            id: initial?.id,
        }
        setForm(base)
        setAttachments(initial?.attachments ?? [])
        setError(null)
        setNudgeStatus(null)
        setAttachTitle('')
        setAttachFile(null)
        setAttachError(null)

        // If editing, fetch full task to get collaborator names + fresh attachments
        if (initial?.id) {
            fetch(`/api/content-tasks/${initial.id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data) return
                    const nameMap: Record<string, string> = {}
                    const ids: string[] = data.collaboratorIds ?? []
                    const names: string[] = data.collaboratorNames ?? []
                    ids.forEach((id: string, i: number) => { nameMap[id] = names[i] || id })
                    setCollaboratorNames(nameMap)
                    setForm(prev => ({
                        ...prev,
                        collaboratorIds: ids,
                        notes: data.notes ?? '',
                    }))
                    setAttachments(data.attachments ?? [])
                })
                .catch(() => {})
        } else {
            setCollaboratorNames({})
        }
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
                notes: form.notes || null,
                contentType: form.contentType || null,
                status: form.status,
                dueDate: form.dueDate || null,
                tags: form.tags,
                assigneeId: form.assigneeId || null,
                collaboratorIds: form.collaboratorIds,
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

    async function handleNudge() {
        if (!form.id) return
        setNudgeStatus(null)
        try {
            const res = await fetch(`/api/content-tasks/${form.id}/nudge`, { method: 'POST' })
            const data = await res.json().catch(() => ({}))
            if (res.ok) {
                setNudgeStatus({ ok: true, msg: `Nudge sent to ${data.sent} recipient${data.sent === 1 ? '' : 's'}` })
            } else {
                setNudgeStatus({ ok: false, msg: data.error || 'Failed to send nudge' })
            }
        } catch {
            setNudgeStatus({ ok: false, msg: 'Failed to send nudge' })
        }
    }

    function addCollaborator(userId: string, user: any) {
        if (!userId || form.collaboratorIds.includes(userId)) return
        const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
            || user?.emailAddresses?.[0]?.emailAddress || userId
        setCollaboratorNames(prev => ({ ...prev, [userId]: name }))
        setForm(prev => ({ ...prev, collaboratorIds: [...prev.collaboratorIds, userId] }))
        setAddingCollaborator(false)
    }

    function removeCollaborator(userId: string) {
        setForm(prev => ({ ...prev, collaboratorIds: prev.collaboratorIds.filter(id => id !== userId) }))
        setCollaboratorNames(prev => { const n = { ...prev }; delete n[userId]; return n })
    }

    async function handleAttachUpload() {
        if (!form.id || !attachFile) return
        if (!attachTitle.trim()) { setAttachError('Title is required'); return }
        setAttachUploading(true); setAttachError(null)
        try {
            const fd = new FormData()
            fd.append('file', attachFile)
            fd.append('title', attachTitle.trim())
            const res = await fetch(`/api/content-tasks/${form.id}/attachments`, { method: 'POST', body: fd })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Upload failed') }
            const attachment = await res.json()
            setAttachments(prev => [...prev, attachment])
            setAttachTitle('')
            setAttachFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
        } catch (e: any) {
            setAttachError(e.message || 'Upload failed')
        } finally {
            setAttachUploading(false)
        }
    }

    async function handleAttachDelete(attachmentId: string) {
        if (!form.id) return
        if (!confirm('Delete this attachment?')) return
        try {
            const res = await fetch(`/api/content-tasks/${form.id}/attachments/${attachmentId}`, { method: 'DELETE' })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Delete failed') }
            setAttachments(prev => prev.filter(a => a.id !== attachmentId))
        } catch (e: any) {
            setAttachError(e.message || 'Failed to delete attachment')
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{isEdit ? 'Edit Content Task' : 'New Content Task'}</h2>
                    <div className="flex items-center gap-2">
                        {isEdit && (
                            <button
                                type="button"
                                onClick={handleNudge}
                                className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 hover:bg-zinc-50 text-zinc-700"
                            >Send nudge</button>
                        )}
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
                    </div>
                </div>

                {nudgeStatus && (
                    <div className={`mx-6 mt-3 text-sm px-3 py-2 rounded-xl border ${nudgeStatus.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                        {nudgeStatus.msg}
                    </div>
                )}

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
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Collaborators</label>
                        <div className="space-y-1.5">
                            {form.collaboratorIds.map(cid => (
                                <div key={cid} className="flex items-center justify-between px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm">
                                    <span className="text-zinc-700">{collaboratorNames[cid] || cid}</span>
                                    <button type="button" onClick={() => removeCollaborator(cid)} className="text-zinc-400 hover:text-zinc-700 ml-2">✕</button>
                                </div>
                            ))}
                            {addingCollaborator ? (
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <UserCombobox
                                            value={null}
                                            onChange={(id, user) => { if (id) addCollaborator(id, user); else setAddingCollaborator(false) }}
                                            placeholder="Search user…"
                                        />
                                    </div>
                                    <button type="button" onClick={() => setAddingCollaborator(false)} className="text-zinc-400 hover:text-zinc-700 text-sm">Cancel</button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setAddingCollaborator(true)}
                                    className="text-sm text-indigo-600 hover:text-indigo-700"
                                >+ Add collaborator</button>
                            )}
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

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Notes</label>
                        <textarea
                            value={form.notes ?? ''}
                            onChange={e => setForm({ ...form, notes: e.target.value })}
                            rows={3}
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

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Attachments</label>
                        {isEdit ? (
                            <div className="space-y-2">
                                {attachments.length > 0 && (
                                    <div className="space-y-1">
                                        {attachments.map(a => (
                                            <div key={a.id} className="flex items-center justify-between px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm">
                                                <a
                                                    href={a.fileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-indigo-600 hover:underline truncate mr-2"
                                                    title={a.originalName}
                                                >{a.title}</a>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAttachDelete(a.id)}
                                                    className="text-xs text-red-500 hover:text-red-700 shrink-0"
                                                >Delete</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="border border-zinc-200 rounded-2xl p-3 space-y-2 bg-zinc-50">
                                    <p className="text-xs font-medium text-zinc-500">Add attachment</p>
                                    <input
                                        type="text"
                                        placeholder="Title"
                                        value={attachTitle}
                                        onChange={e => setAttachTitle(e.target.value)}
                                        className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-sm bg-white"
                                    />
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
                                        className="text-sm text-zinc-600"
                                    />
                                    {attachError && <p className="text-xs text-red-600">{attachError}</p>}
                                    <button
                                        type="button"
                                        onClick={handleAttachUpload}
                                        disabled={attachUploading || !attachFile}
                                        className="px-3 py-1.5 text-xs rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                    >{attachUploading ? 'Uploading…' : 'Upload'}</button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-400">Save the task first to add attachments.</p>
                        )}
                    </div>
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
