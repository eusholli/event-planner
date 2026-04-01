'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Linkedin, Trash2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

interface LinkedInDraft {
    id: string
    companyNames: string[]
    angle: string
    tone: string
    status: string
    content: string
    createdAt: string
    datePosted: string | null
    postUrl: string | null
    impressions: number | null
    uniqueViews: number | null
    clicks: number | null
    reactions: number | null
    comments: number | null
    reposts: number | null
    engagementRate: number | null
    followsGained: number | null
    profileVisits: number | null
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
    POSTED: 'bg-teal-50 text-teal-700 border-teal-200',
    ARCHIVED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

const METRIC_FIELDS: Array<{ key: keyof LinkedInDraft; label: string; hint: string; isFloat?: boolean; isDate?: boolean; isUrl?: boolean }> = [
    { key: 'datePosted', label: 'Date Posted', hint: 'When you published the post', isDate: true },
    { key: 'postUrl', label: 'Post URL', hint: 'URL of the LinkedIn post (optional)', isUrl: true },
    { key: 'impressions', label: 'Impressions', hint: 'Post Analytics → Impressions' },
    { key: 'uniqueViews', label: 'Unique Views', hint: 'Post Analytics → Unique views' },
    { key: 'clicks', label: 'Clicks', hint: 'Post Analytics → Clicks (link clicks)' },
    { key: 'reactions', label: 'Reactions', hint: 'Post Analytics → Reactions' },
    { key: 'comments', label: 'Comments', hint: 'Post Analytics → Comments' },
    { key: 'reposts', label: 'Reposts', hint: 'Post Analytics → Reposts' },
    { key: 'engagementRate', label: 'Engagement Rate (%)', hint: 'Post Analytics → Engagement rate', isFloat: true },
    { key: 'followsGained', label: 'Follows Gained', hint: 'Post Analytics → Follows' },
    { key: 'profileVisits', label: 'Profile Visits', hint: 'Post Analytics → Profile visits' },
]

export default function LinkedInCampaignsPage() {
    const params = useParams()
    const eventId = params?.id as string

    const [drafts, setDrafts] = useState<LinkedInDraft[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set())
    const [expandedContent, setExpandedContent] = useState<Set<string>>(new Set())
    const [editingContent, setEditingContent] = useState<Record<string, string>>({})
    const [metricDrafts, setMetricDrafts] = useState<Record<string, Record<string, string>>>({})
    const [saving, setSaving] = useState<string | null>(null)
    const [message, setMessage] = useState('')

    useEffect(() => {
        if (!eventId) return
        fetch(`/api/social/drafts?eventId=${eventId}`)
            .then(res => res.json())
            .then(data => {
                setDrafts(Array.isArray(data) ? data : [])
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [eventId])

    const toggleMetrics = (id: string) => {
        setExpandedMetrics(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                next.add(id)
                // Pre-populate metric draft values from existing data
                const draft = drafts.find(d => d.id === id)
                if (draft) {
                    const existing: Record<string, string> = {}
                    METRIC_FIELDS.forEach(f => {
                        const val = draft[f.key]
                        if (val !== null && val !== undefined) {
                            existing[f.key] = f.isDate
                                ? new Date(val as string).toISOString().split('T')[0]
                                : String(val)
                        }
                    })
                    setMetricDrafts(prev2 => ({ ...prev2, [id]: existing }))
                }
            }
            return next
        })
    }

    const toggleContent = (id: string) => {
        setExpandedContent(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                const draft = drafts.find(d => d.id === id)
                if (draft) setEditingContent(prev2 => ({ ...prev2, [id]: draft.content }))
                next.add(id)
            }
            return next
        })
    }

    const saveContent = async (id: string) => {
        setSaving(id)
        try {
            const res = await fetch(`/api/social/drafts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editingContent[id] }),
            })
            if (res.ok) {
                const updated = await res.json()
                setDrafts(prev => prev.map(d => d.id === id ? { ...d, content: updated.content } : d))
                setExpandedContent(prev => { const next = new Set(prev); next.delete(id); return next })
                setMessage('Draft updated.')
                setTimeout(() => setMessage(''), 3000)
            }
        } finally {
            setSaving(null)
        }
    }

    const saveMetrics = async (id: string) => {
        setSaving(id)
        const raw = metricDrafts[id] || {}
        const payload: Record<string, unknown> = { status: 'POSTED' }

        METRIC_FIELDS.forEach(f => {
            const val = raw[f.key]
            if (val === undefined || val === '') return
            if (f.isDate) payload[f.key] = new Date(val).toISOString()
            else if (f.isUrl) payload[f.key] = val
            else if (f.isFloat) payload[f.key] = parseFloat(val)
            else payload[f.key] = parseInt(val, 10)
        })

        try {
            const res = await fetch(`/api/social/drafts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            if (res.ok) {
                const updated = await res.json()
                setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...updated } : d))
                setExpandedMetrics(prev => { const next = new Set(prev); next.delete(id); return next })
                setMessage('Metrics saved.')
                setTimeout(() => setMessage(''), 3000)
            }
        } finally {
            setSaving(null)
        }
    }

    const deleteDraft = async (id: string) => {
        if (!confirm('Delete this draft?')) return
        const res = await fetch(`/api/social/drafts/${id}`, { method: 'DELETE' })
        if (res.ok) {
            setDrafts(prev => prev.filter(d => d.id !== id))
        }
    }

    const hasMetrics = (draft: LinkedInDraft) =>
        draft.impressions !== null || draft.clicks !== null || draft.engagementRate !== null

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <svg className="w-6 h-6 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Linkedin className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-zinc-900">LinkedIn Campaigns</h2>
            </div>

            {message && (
                <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-700">
                    {message}
                </div>
            )}

            {drafts.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200/60 bg-white/70 p-12 text-center">
                    <Linkedin className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500">No LinkedIn drafts yet.</p>
                    <p className="text-sm text-zinc-400 mt-1">
                        Select companies on the ROI page and click &quot;Draft LinkedIn Posts&quot; to get started.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {drafts.map(draft => (
                        <div key={draft.id} className="rounded-2xl border border-zinc-200/60 bg-white/70 backdrop-blur-sm shadow-sm overflow-hidden">
                            {/* Row header */}
                            <div className="px-6 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-zinc-900">
                                                {draft.companyNames.join(', ')}
                                            </span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[draft.status] ?? STATUS_COLORS.DRAFT}`}>
                                                {draft.status}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                                            <span>{draft.angle}</span>
                                            <span>·</span>
                                            <span>{draft.tone}</span>
                                            <span>·</span>
                                            <span>{new Date(draft.createdAt).toLocaleDateString()}</span>
                                            {draft.datePosted && (
                                                <>
                                                    <span>·</span>
                                                    <span className="text-teal-600">Posted {new Date(draft.datePosted).toLocaleDateString()}</span>
                                                </>
                                            )}
                                        </div>
                                        {hasMetrics(draft) && (
                                            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-600">
                                                {draft.impressions !== null && <span>{draft.impressions.toLocaleString()} impressions</span>}
                                                {draft.clicks !== null && <span>{draft.clicks.toLocaleString()} clicks</span>}
                                                {draft.engagementRate !== null && <span className="font-medium text-blue-600">{draft.engagementRate}% engagement</span>}
                                                {draft.postUrl && (
                                                    <a href={draft.postUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                                                        View post <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => toggleContent(draft.id)}
                                            className="px-3 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors"
                                        >
                                            {expandedContent.has(draft.id) ? 'Hide' : 'Edit Draft'}
                                        </button>
                                        <button
                                            onClick={() => toggleMetrics(draft.id)}
                                            className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1"
                                        >
                                            {hasMetrics(draft) ? 'Update Metrics' : 'Add Metrics'}
                                            {expandedMetrics.has(draft.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        </button>
                                        <button
                                            onClick={() => deleteDraft(draft.id)}
                                            className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors"
                                            title="Delete draft"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Draft content editor */}
                            {expandedContent.has(draft.id) && (
                                <div className="px-6 pb-4 border-t border-zinc-100 pt-4 space-y-3">
                                    <textarea
                                        value={editingContent[draft.id] ?? draft.content}
                                        onChange={e => setEditingContent(prev => ({ ...prev, [draft.id]: e.target.value }))}
                                        rows={10}
                                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(editingContent[draft.id] ?? draft.content)
                                            }}
                                            className="px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors"
                                        >
                                            Copy
                                        </button>
                                        <button
                                            onClick={() => saveContent(draft.id)}
                                            disabled={saving === draft.id}
                                            className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                                        >
                                            {saving === draft.id ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Metrics form */}
                            {expandedMetrics.has(draft.id) && (
                                <div className="px-6 pb-6 border-t border-zinc-100 pt-4">
                                    <p className="text-xs text-zinc-500 mb-4">
                                        Find these metrics in LinkedIn by clicking &quot;Analytics&quot; on your published post.
                                        Copy and paste each value below.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {METRIC_FIELDS.map(field => (
                                            <div key={field.key}>
                                                <label className="block text-xs font-medium text-zinc-700 mb-1">
                                                    {field.label}
                                                    <span className="ml-1 font-normal text-zinc-400">{field.hint}</span>
                                                </label>
                                                <input
                                                    type={field.isDate ? 'date' : field.isUrl ? 'url' : 'number'}
                                                    step={field.isFloat ? '0.01' : '1'}
                                                    value={metricDrafts[draft.id]?.[field.key] ?? ''}
                                                    onChange={e => setMetricDrafts(prev => ({
                                                        ...prev,
                                                        [draft.id]: { ...(prev[draft.id] ?? {}), [field.key]: e.target.value }
                                                    }))}
                                                    placeholder={field.isUrl ? 'https://linkedin.com/posts/…' : '0'}
                                                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 flex justify-end gap-3">
                                        <button
                                            onClick={() => toggleMetrics(draft.id)}
                                            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => saveMetrics(draft.id)}
                                            disabled={saving === draft.id}
                                            className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                        >
                                            {saving === draft.id ? 'Saving…' : 'Save Metrics'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
