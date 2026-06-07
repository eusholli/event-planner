'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Trash2, FileDown } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import CampaignProposalModal, { type CampaignProposal } from '@/components/CampaignProposalModal'
import { downloadMarkdownAsPdf } from '@/lib/markdown-to-pdf'
import { Roles } from '@/lib/constants'

const STATUS_COLORS: Record<string, string> = {
    PENDING_REVIEW: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    ACTIVATED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-600',
}

const STATUS_ORDER = ['PENDING_REVIEW', 'APPROVED', 'ACTIVATED', 'REJECTED']

function formatDate(v?: string | null): string {
    if (!v) return '—'
    return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Compose a markdown brief of the campaign for the PDF export.
function buildCampaignMarkdown(p: CampaignProposal & { createdAt?: string }): string {
    const lines: string[] = []
    lines.push(`# ${p.title}`, '')
    lines.push(`**Theme:** ${p.theme}  ·  **Status:** ${p.status.replace('_', ' ')}  ·  **Created:** ${formatDate(p.createdAt)}`)
    if (p.event?.name) lines.push(`**Event:** ${p.event.name}`)
    lines.push('')
    if (p.rationale) lines.push('## Rationale', '', p.rationale, '')
    lines.push('## Brief', '', p.proposalContent || '_No brief._', '')
    const tasks = Array.isArray(p.suggestedContentTasks) ? (p.suggestedContentTasks as Record<string, unknown>[]) : []
    if (tasks.length) {
        lines.push('## Content items', '')
        for (const t of tasks) {
            const type = t.contentType ? ` _(${String(t.contentType)})_` : ''
            const tags = Array.isArray(t.tags) && t.tags.length ? ` — tags: ${(t.tags as string[]).join(', ')}` : ''
            lines.push(`- **${String(t.title ?? '(untitled)')}**${type}${tags}`)
            if (t.description) lines.push(`  ${String(t.description)}`)
        }
        lines.push('')
    }
    return lines.join('\n')
}

function CampaignsPage() {
    const { user, isLoaded } = useUser()
    const [proposals, setProposals] = useState<CampaignProposal[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string[]>([])
    const [modalOpen, setModalOpen] = useState(false)
    const [selected, setSelected] = useState<CampaignProposal | null>(null)
    const [activeRuns, setActiveRuns] = useState<{ id: string; theme: string; status: string }[]>([])
    const router = useRouter()
    const searchParams = useSearchParams()

    const authDisabled = process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true'
    const role = user?.publicMetadata?.role as string | undefined
    const allowed = authDisabled || role === Roles.Root || role === Roles.Marketing

    async function reload() {
        setLoading(true)
        const res = await fetch('/api/campaigns')
        const data = res.ok ? await res.json() : []
        setProposals(Array.isArray(data) ? data : [])
        setLoading(false)
    }

    useEffect(() => {
        if (allowed) reload()
    }, [allowed])

    // Poll in-flight campaign generations; auto-refresh the list when one completes.
    useEffect(() => {
        if (!allowed) return
        let prevActive = 0
        async function poll() {
            try {
                const res = await fetch('/api/marketing/run-requests?active=1')
                if (!res.ok) return
                const d = await res.json()
                const runs = d.requests || []
                setActiveRuns(runs)
                if (runs.length < prevActive) reload() // a run finished → new proposal landed
                prevActive = runs.length
            } catch { /* ignore poll errors */ }
        }
        poll()
        const t = setInterval(poll, 12000)
        return () => clearInterval(t)
    }, [allowed])

    async function handleDelete(e: React.MouseEvent, p: CampaignProposal) {
        e.stopPropagation()
        if (!window.confirm(`Delete campaign "${p.title}"? This removes the proposal only — any content tasks it already created remain in /content. This cannot be undone.`)) return
        const res = await fetch(`/api/campaigns/${p.id}`, { method: 'DELETE' })
        if (res.ok) setProposals(cur => cur.filter(x => x.id !== p.id))
        else alert('Failed to delete campaign')
    }

    async function handleDownloadPdf(e: React.MouseEvent, p: CampaignProposal) {
        e.stopPropagation()
        const res = await fetch(`/api/campaigns/${p.id}`)
        if (!res.ok) { alert('Failed to load campaign'); return }
        const full = await res.json()
        const slug = (full.title || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign'
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        downloadMarkdownAsPdf(buildCampaignMarkdown(full), `campaign-${slug}-${date}.pdf`, 'Rakuten Symphony — Campaign')
    }

    // Deep-link: ?proposal=<id> opens the modal
    useEffect(() => {
        const pid = searchParams.get('proposal')
        if (!pid || !allowed) return
        fetch(`/api/campaigns/${pid}`)
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (!data) return
                setSelected(data)
                setModalOpen(true)
                router.replace('/campaigns')
            })
            .catch(() => {})
    }, [searchParams, allowed])

    const filtered = useMemo(() => {
        const list = proposals.filter(p => {
            if (search) {
                const q = search.toLowerCase()
                if (!p.title.toLowerCase().includes(q) && !p.theme.toLowerCase().includes(q) && !p.rationale.toLowerCase().includes(q)) return false
            }
            if (statusFilter.length && !statusFilter.includes(p.status)) return false
            return true
        })
        return [...list].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    }, [proposals, search, statusFilter])

    function openProposal(p: CampaignProposal) { setSelected(p); setModalOpen(true) }
    function toggleStatus(s: string) {
        setStatusFilter(cur => (cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]))
    }

    if (isLoaded && !allowed) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-16 text-center">
                <h1 className="text-xl font-semibold text-zinc-900">Access restricted</h1>
                <p className="text-sm text-zinc-500 mt-2">Campaigns are available to root and marketing roles only.</p>
                <Link href="/events" className="text-indigo-600 hover:underline text-sm mt-4 inline-block">Back to events</Link>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-zinc-900">Campaigns</h1>
                    <p className="text-sm text-zinc-500 mt-1">Agent-generated campaign proposals — review, edit, approve, and activate</p>
                </div>
                <Link href="/campaigns/strategy" className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50">Edit strategy themes</Link>
            </div>

            {activeRuns.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 mb-4 text-sm flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>
                        <span className="font-medium">Generating {activeRuns.length} campaign{activeRuns.length > 1 ? 's' : ''}…</span>{' '}
                        {activeRuns.map(r => r.theme).join(', ')}. This page updates automatically when ready (~1–2 min).
                    </span>
                </div>
            )}

            <div className="bg-white rounded-3xl border border-zinc-200 p-4 mb-4 space-y-3">
                <input
                    type="text"
                    placeholder="Search title, theme, or rationale…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                />
                <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-zinc-500 font-medium">Status:</span>
                    {STATUS_ORDER.map(s => (
                        <button
                            key={s}
                            onClick={() => toggleStatus(s)}
                            className={`px-2 py-1 rounded-full border ${statusFilter.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'}`}
                        >{s.replace('_', ' ')}</button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                        <tr>
                            <th className="text-left px-4 py-3">Title</th>
                            <th className="text-left px-4 py-3">Theme</th>
                            <th className="text-left px-4 py-3">Status</th>
                            <th className="text-left px-4 py-3">Event</th>
                            <th className="text-left px-4 py-3">Created</th>
                            <th className="px-4 py-3 w-20" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading…</td></tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">No campaign proposals yet. The marketing agent creates these.</td></tr>
                        )}
                        {!loading && filtered.map(p => (
                            <tr key={p.id} onClick={() => openProposal(p)} className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                                <td className="px-4 py-3 font-medium text-zinc-900">{p.title}</td>
                                <td className="px-4 py-3 text-zinc-600">{p.theme}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[p.status]}`}>
                                        {p.status.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-zinc-600">
                                    {p.event ? (
                                        <Link href={`/events/${p.event.slug}/dashboard`} onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline">{p.event.name}</Link>
                                    ) : <span className="text-zinc-400">Cross-event</span>}
                                </td>
                                <td className="px-4 py-3 text-zinc-500">{formatDate((p as { createdAt?: string }).createdAt)}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={e => handleDownloadPdf(e, p)} title="Download PDF" className="text-zinc-400 hover:text-indigo-600 p-1 rounded-md hover:bg-indigo-50">
                                            <FileDown className="w-4 h-4" />
                                        </button>
                                        <button onClick={e => handleDelete(e, p)} title="Delete campaign" className="text-zinc-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <CampaignProposalModal
                open={modalOpen}
                initial={selected ?? undefined}
                onClose={() => setModalOpen(false)}
                onChanged={() => reload()}
            />
        </div>
    )
}

export default function CampaignsPageWrapper() {
    return (
        <Suspense fallback={null}>
            <CampaignsPage />
        </Suspense>
    )
}
