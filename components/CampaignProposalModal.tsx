'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { downloadMarkdownAsPdf } from '@/lib/markdown-to-pdf'

export type CampaignProposal = {
    id: string
    runId: string
    theme: string
    title: string
    rationale: string
    proposalContent: string
    status: 'PENDING_REVIEW' | 'APPROVED' | 'ACTIVATED' | 'REJECTED'
    eventId?: string | null
    event?: { id: string; name: string; slug: string } | null
    createdBy?: string | null
    reviewedBy?: string | null
    rejectedReason?: string | null
    activatedBy?: string | null
    activatedAt?: string | null
    reusedAssets?: unknown
    suggestedContentTasks?: unknown
    suggestedLinkedInArticles?: unknown
    generatedContentTaskIds: string[]
    generatedLinkedInDraftIds: string[]
}

type EditableTask = { title: string; description: string; contentType: string; tags: string[] }
type DraftState = 'pending' | 'drafting' | 'done' | 'error'

const STATUS_COLORS: Record<string, string> = {
    PENDING_REVIEW: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    ACTIVATED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-600',
}

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

function toEditable(v: unknown): EditableTask[] {
    return asArray(v).map((t) => ({
        title: typeof t.title === 'string' ? t.title : '',
        description: typeof t.description === 'string' ? t.description : '',
        contentType: typeof t.contentType === 'string' ? t.contentType : '',
        tags: Array.isArray(t.tags) ? (t.tags as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    }))
}

export default function CampaignProposalModal({
    open,
    initial,
    onClose,
    onChanged,
}: {
    open: boolean
    initial?: CampaignProposal
    onClose: () => void
    onChanged: () => void
}) {
    const [title, setTitle] = useState('')
    const [rationale, setRationale] = useState('')
    const [proposalContent, setProposalContent] = useState('')
    const [tasks, setTasks] = useState<EditableTask[]>([])
    const [options, setOptions] = useState<{ contentTypes: string[]; tags: string[] }>({ contentTypes: [], tags: [] })
    const [busy, setBusy] = useState(false)
    const [regening, setRegening] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [rejecting, setRejecting] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    // Drafting phase (after Approve & Generate)
    const [generating, setGenerating] = useState(false)
    const [createdTaskIds, setCreatedTaskIds] = useState<string[]>([])
    const [draftStates, setDraftStates] = useState<Record<number, DraftState>>({})

    useEffect(() => {
        if (open && initial) {
            setTitle(initial.title)
            setRationale(initial.rationale)
            setProposalContent(initial.proposalContent)
            setTasks(toEditable(initial.suggestedContentTasks))
            setError(null)
            setRejecting(false)
            setRejectReason('')
            setGenerating(false)
            setCreatedTaskIds([])
            setDraftStates({})
        }
    }, [open, initial])

    useEffect(() => {
        if (!open) return
        fetch('/api/content-tasks/options')
            .then((r) => (r.ok ? r.json() : { contentTypes: [], tags: [] }))
            .then((d) => setOptions({
                contentTypes: (d.contentTypes || []).map((c: { name?: string } | string) => (typeof c === 'string' ? c : c.name || '')).filter(Boolean),
                tags: d.tags || [],
            }))
            .catch(() => {})
    }, [open])

    if (!open || !initial) return null

    const locked = initial.status === 'ACTIVATED'

    async function call(path: string, method: string, body?: unknown): Promise<Response | null> {
        const res = await fetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        })
        if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error(d.error || `Request failed (${res.status})`)
        }
        return res
    }

    function updateTask(i: number, patch: Partial<EditableTask>) {
        setTasks((cur) => cur.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
    }
    function toggleTaskTag(i: number, tag: string) {
        setTasks((cur) => cur.map((t, idx) => (idx === i ? { ...t, tags: t.tags.includes(tag) ? t.tags.filter((x) => x !== tag) : [...t.tags, tag] } : t)))
    }
    function addTask() { setTasks((cur) => [...cur, { title: '', description: '', contentType: '', tags: [] }]) }
    function removeTask(i: number) { setTasks((cur) => cur.filter((_, idx) => idx !== i)) }

    const reused = asArray(initial.reusedAssets)
    const suggestedArticles = asArray(initial.suggestedLinkedInArticles)
    const cleanTasks = () => tasks.filter((t) => t.title.trim())

    async function saveFields(): Promise<void> {
        await call(`/api/campaigns/${initial!.id}`, 'PUT', { title, rationale, proposalContent, suggestedContentTasks: cleanTasks() })
    }

    async function save() {
        setBusy(true); setError(null)
        try { await saveFields(); onChanged() }
        catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
        finally { setBusy(false) }
    }

    function downloadPdf() {
        const lines: string[] = [`# ${title}`, '']
        lines.push(`**Theme:** ${initial!.theme}  ·  **Status:** ${initial!.status.replace('_', ' ')}`, '')
        if (rationale) lines.push('## Rationale', '', rationale, '')
        lines.push('## Brief', '', proposalContent || '_No brief._', '')
        if (tasks.length) {
            lines.push('## Content items', '')
            for (const t of tasks) {
                const type = t.contentType ? ` _(${t.contentType})_` : ''
                const tg = t.tags.length ? ` — tags: ${t.tags.join(', ')}` : ''
                lines.push(`- **${t.title}**${type}${tg}`)
                if (t.description) lines.push(`  ${t.description}`)
            }
        }
        const slug = (title || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign'
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        downloadMarkdownAsPdf(lines.join('\n'), `campaign-${slug}-${date}.pdf`, 'Rakuten Symphony — Campaign')
    }

    async function regenerate() {
        setRegening(true); setError(null)
        try {
            // Persist any edits to proposalContent first so regeneration uses the latest brief.
            await saveFields()
            const res = await call(`/api/campaigns/${initial!.id}/regenerate-suggestions`, 'POST')
            const d = await res!.json()
            setTasks(toEditable(d.suggestedContentTasks))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Regeneration failed')
        } finally {
            setRegening(false)
        }
    }

    async function reject() {
        setBusy(true); setError(null)
        try { await call(`/api/campaigns/${initial!.id}/reject`, 'POST', { reason: rejectReason }); onChanged(); onClose() }
        catch (e) { setError(e instanceof Error ? e.message : 'Reject failed') }
        finally { setBusy(false) }
    }

    async function generateOne(taskId: string, idx: number) {
        setDraftStates((s) => ({ ...s, [idx]: 'drafting' }))
        try {
            await call(`/api/content-tasks/${taskId}/generate-draft`, 'POST', { proposalId: initial!.id })
            setDraftStates((s) => ({ ...s, [idx]: 'done' }))
        } catch {
            setDraftStates((s) => ({ ...s, [idx]: 'error' }))
        }
    }

    // One-step: save edits → approve → activate (spawns ContentTasks) → draft each in parallel.
    async function approveAndGenerate() {
        setBusy(true); setError(null); setGenerating(true)
        try {
            await saveFields()
            await call(`/api/campaigns/${initial!.id}/approve`, 'POST')
            const res = await call(`/api/campaigns/${initial!.id}/activate`, 'POST')
            const d = await res!.json()
            const ids: string[] = d.createdTaskIds || []
            setCreatedTaskIds(ids)
            setDraftStates(Object.fromEntries(ids.map((_, i) => [i, 'pending' as DraftState])))
            onChanged() // proposal is now ACTIVATED; refresh the list behind the modal
            await Promise.all(ids.map((id, i) => generateOne(id, i)))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Approve & generate failed')
        } finally {
            setBusy(false)
        }
    }

    const draftDoneCount = Object.values(draftStates).filter((s) => s === 'done').length
    const draftErrCount = Object.values(draftStates).filter((s) => s === 'error').length

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-3xl border border-zinc-200 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-zinc-100">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[initial.status]}`}>
                                {initial.status.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-zinc-400">Theme: <span className="text-zinc-600">{initial.theme}</span></span>
                        </div>
                        <h2 className="text-lg font-semibold text-zinc-900">Campaign Proposal</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={downloadPdf} title="Download PDF" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-indigo-600">
                            <FileDown className="w-4 h-4" /> PDF
                        </button>
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {error && <div className="bg-red-50 text-red-700 text-sm rounded-2xl px-3 py-2">{error}</div>}

                    <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={locked}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm disabled:bg-zinc-50 disabled:text-zinc-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Rationale</label>
                        <textarea
                            value={rationale}
                            onChange={(e) => setRationale(e.target.value)}
                            disabled={locked}
                            rows={3}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm disabled:bg-zinc-50 disabled:text-zinc-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Proposal content</label>
                        <textarea
                            value={proposalContent}
                            onChange={(e) => setProposalContent(e.target.value)}
                            disabled={locked}
                            rows={10}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm font-mono disabled:bg-zinc-50 disabled:text-zinc-500"
                        />
                    </div>

                    {/* Editable content-item suggestions */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-medium text-zinc-500">
                                Content items {locked ? '' : '(created + drafted on Approve)'}
                            </label>
                            {!locked && (
                                <button onClick={regenerate} disabled={regening || busy} className="text-xs px-2 py-1 rounded-full border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50">
                                    {regening ? 'Regenerating…' : '↻ Regenerate from brief'}
                                </button>
                            )}
                        </div>

                        {tasks.length === 0 && <p className="text-xs text-zinc-400">No content items. Add one or regenerate from the brief.</p>}

                        <div className="space-y-2">
                            {tasks.map((t, i) => (
                                <div key={i} className="border border-zinc-200 rounded-2xl p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={t.title}
                                            onChange={(e) => updateTask(i, { title: e.target.value })}
                                            disabled={locked}
                                            placeholder="Content item title"
                                            className="flex-1 px-2 py-1.5 border border-zinc-300 rounded-xl text-sm disabled:bg-zinc-50"
                                        />
                                        <select
                                            value={t.contentType}
                                            onChange={(e) => updateTask(i, { contentType: e.target.value })}
                                            disabled={locked}
                                            className="px-2 py-1.5 border border-zinc-300 rounded-xl text-sm disabled:bg-zinc-50"
                                        >
                                            <option value="">— type —</option>
                                            {options.contentTypes.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        {!locked && (
                                            <button onClick={() => removeTask(i)} className="text-red-500 hover:text-red-700 text-xs px-1">✕</button>
                                        )}
                                        {createdTaskIds[i] && (
                                            <span className="text-xs">
                                                {draftStates[i] === 'drafting' && <span className="text-amber-600">drafting…</span>}
                                                {draftStates[i] === 'done' && <span className="text-green-600">✓ drafted</span>}
                                                {draftStates[i] === 'error' && (
                                                    <button onClick={() => generateOne(createdTaskIds[i], i)} className="text-red-600 underline">retry</button>
                                                )}
                                                {draftStates[i] === 'pending' && <span className="text-zinc-400">queued</span>}
                                            </span>
                                        )}
                                    </div>
                                    {!locked && (
                                        <input
                                            value={t.description}
                                            onChange={(e) => updateTask(i, { description: e.target.value })}
                                            placeholder="One-line brief (optional)"
                                            className="w-full px-2 py-1.5 border border-zinc-200 rounded-xl text-xs"
                                        />
                                    )}
                                    {options.tags.length > 0 && !locked && (
                                        <div className="flex flex-wrap gap-1">
                                            {options.tags.map((tag) => (
                                                <button
                                                    key={tag}
                                                    onClick={() => toggleTaskTag(i, tag)}
                                                    className={`px-2 py-0.5 rounded-full text-xs border ${t.tags.includes(tag) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
                                                >{tag}</button>
                                            ))}
                                        </div>
                                    )}
                                    {locked && t.tags.length > 0 && (
                                        <div className="text-xs text-zinc-500">Tags: {t.tags.join(', ')}</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {!locked && (
                            <button onClick={addTask} className="mt-2 text-xs text-indigo-600 hover:underline">+ Add content item</button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
                        {initial.event && (
                            <span>Event: <Link href={`/events/${initial.event.slug}/dashboard`} className="text-indigo-600 hover:underline">{initial.event.name}</Link></span>
                        )}
                        {!initial.event && <span>Event: <span className="text-zinc-600">Cross-event</span></span>}
                        {initial.createdBy && <span>Created by: {initial.createdBy}</span>}
                        {initial.reviewedBy && <span>Reviewed by: {initial.reviewedBy}</span>}
                    </div>

                    {initial.rejectedReason && initial.status === 'REJECTED' && (
                        <div className="bg-red-50 text-red-700 text-sm rounded-2xl px-3 py-2">
                            <span className="font-medium">Rejection reason:</span> {initial.rejectedReason}
                        </div>
                    )}

                    {reused.length > 0 && (
                        <Section title={`Reused content (${reused.length})`}>
                            {reused.map((a, i) => (
                                <li key={i} className="text-zinc-600">
                                    {String(a.kind ?? 'asset')}: {String(a.title ?? a.url ?? a.id ?? '')}
                                    {a.url ? <> — <a href={String(a.url)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">link</a></> : null}
                                </li>
                            ))}
                        </Section>
                    )}

                    {suggestedArticles.length > 0 && (
                        <Section title={`LinkedIn article(s): ${suggestedArticles.length}${!initial.eventId ? ' (skipped on activate — needs an event)' : ''}`}>
                            {suggestedArticles.map((a, i) => (
                                <li key={i} className="text-zinc-600">{String(a.title ?? '(untitled article)')}</li>
                            ))}
                        </Section>
                    )}

                    {(generating || initial.status === 'ACTIVATED') && (() => {
                        const total = createdTaskIds.length
                        const allSettled = total > 0 && draftDoneCount + draftErrCount >= total
                        if (generating && allSettled) {
                            const complete = draftErrCount === 0
                            return (
                                <div className={`text-sm rounded-2xl px-3 py-2 font-medium border ${complete ? 'bg-green-100 text-green-900 border-green-300' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                    {complete
                                        ? `✓ Complete — ${draftDoneCount} content item${draftDoneCount !== 1 ? 's' : ''} drafted and ready.`
                                        : `${draftDoneCount} ready, ${draftErrCount} failed — retry above.`}
                                    {' '}<Link href="/content" className="underline">View content</Link>
                                </div>
                            )
                        }
                        return (
                            <div className="bg-green-50 text-green-800 text-sm rounded-2xl px-3 py-2">
                                {generating
                                    ? `Drafting ${draftDoneCount}/${total} content items…`
                                    : `Activated — created ${initial.generatedContentTaskIds.length} content task(s) and ${initial.generatedLinkedInDraftIds.length} LinkedIn draft(s).`}
                                {' '}<Link href="/content" className="text-indigo-600 hover:underline">View content</Link>
                            </div>
                        )
                    })()}

                    {rejecting && (
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Rejection reason (optional)</label>
                            <input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                                placeholder="Why is this being rejected?"
                            />
                        </div>
                    )}
                </div>

                {!locked && !generating && (
                    <div className="flex items-center justify-between gap-2 p-5 border-t border-zinc-100">
                        <button onClick={save} disabled={busy} className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50">Save edits</button>
                        <div className="flex items-center gap-2">
                            {rejecting ? (
                                <>
                                    <button onClick={() => setRejecting(false)} disabled={busy} className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50">Cancel</button>
                                    <button onClick={reject} disabled={busy} className="px-4 py-2 text-sm rounded-2xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Confirm reject</button>
                                </>
                            ) : (
                                <button onClick={() => setRejecting(true)} disabled={busy} className="px-4 py-2 text-sm rounded-2xl border border-red-300 text-red-600 hover:bg-red-50">Reject</button>
                            )}
                            <button onClick={approveAndGenerate} disabled={busy || rejecting} className="px-4 py-2 text-sm rounded-2xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                                Approve &amp; Generate
                            </button>
                        </div>
                    </div>
                )}

                {generating && (
                    <div className="flex items-center justify-end gap-2 p-5 border-t border-zinc-100">
                        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
                            {busy ? 'Working…' : 'Close'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-zinc-50 rounded-2xl px-3 py-2">
            <p className="text-xs font-medium text-zinc-500 mb-1">{title}</p>
            <ul className="text-sm space-y-0.5 list-disc list-inside">{children}</ul>
        </div>
    )
}
