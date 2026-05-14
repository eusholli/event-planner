'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Megaphone, Plus, Users, Trash2, Copy, Pencil, ArrowUp, ArrowDown, Search, Library } from 'lucide-react'
import Pagination from '@/components/Pagination'

interface PitchRow {
    id: string
    title: string
    pitchText: string
    tags: string[]
    createdAt: string
    modified: string
    targetsCount: number
    meetingsCount: number
    pipelineCount: number
    committedCount: number
    occurredCount: number
}

interface LibraryRow {
    id: string
    title: string
    pitchText: string
    tags: string[]
    createdAt: string
    modified: string
    sourceEvent: { id: string; name: string; slug: string } | null
}

type SortBy = 'title' | 'modified' | 'createdAt' | 'targetsCount' | 'pipelineCount' | 'committedCount' | 'occurredCount'
type NewPitchTab = 'blank' | 'library'

const LIMIT = 20
const LIBRARY_LIMIT = 10

export default function CommsPage() {
    const params = useParams()
    const router = useRouter()
    const eventId = params?.id as string

    const [forbidden, setForbidden] = useState(false)

    const [items, setItems] = useState<PitchRow[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [sortBy, setSortBy] = useState<SortBy>('modified')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [loading, setLoading] = useState(true)

    const [creating, setCreating] = useState(false)
    const [newTab, setNewTab] = useState<NewPitchTab>('blank')
    const [newTitle, setNewTitle] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const [libItems, setLibItems] = useState<LibraryRow[]>([])
    const [libTotal, setLibTotal] = useState(0)
    const [libPage, setLibPage] = useState(1)
    const [libSearch, setLibSearch] = useState('')
    const [libDebounced, setLibDebounced] = useState('')
    const [libLoading, setLibLoading] = useState(false)
    const [adding, setAdding] = useState<string | null>(null)

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 400)
        return () => clearTimeout(t)
    }, [search])

    useEffect(() => { setPage(1) }, [debouncedSearch, sortBy, sortDir])

    useEffect(() => {
        const t = setTimeout(() => setLibDebounced(libSearch.trim()), 400)
        return () => clearTimeout(t)
    }, [libSearch])

    useEffect(() => { setLibPage(1) }, [libDebounced])

    const fetchPage = useCallback(async () => {
        if (!eventId) return
        setLoading(true)
        const qs = new URLSearchParams({
            search: debouncedSearch,
            sortBy,
            sortDir,
            page: String(page),
            limit: String(LIMIT),
        })
        const res = await fetch(`/api/events/${eventId}/pitches?${qs.toString()}`)
        if (res.status === 403) {
            setForbidden(true)
            setLoading(false)
            return
        }
        const data = await res.json()
        setItems(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
        setLoading(false)
    }, [eventId, debouncedSearch, sortBy, sortDir, page])

    useEffect(() => { if (!creating) fetchPage() }, [fetchPage, creating])

    const fetchLibrary = useCallback(async () => {
        if (!eventId) return
        setLibLoading(true)
        const qs = new URLSearchParams({
            search: libDebounced,
            sortBy: 'modified',
            sortDir: 'desc',
            page: String(libPage),
            limit: String(LIBRARY_LIMIT),
        })
        const res = await fetch(`/api/events/${eventId}/pitches/library?${qs.toString()}`)
        if (res.status === 403) {
            setForbidden(true)
            setLibLoading(false)
            return
        }
        if (!res.ok) { setLibLoading(false); return }
        const data = await res.json()
        setLibItems(Array.isArray(data.items) ? data.items : [])
        setLibTotal(typeof data.total === 'number' ? data.total : 0)
        setLibLoading(false)
    }, [eventId, libDebounced, libPage])

    useEffect(() => {
        if (creating && newTab === 'library') fetchLibrary()
    }, [creating, newTab, fetchLibrary])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim()) return
        setSubmitting(true)
        setError('')
        try {
            const res = await fetch(`/api/events/${eventId}/pitches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim() }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.error || 'Failed to create pitch')
                return
            }
            const pitch = await res.json()
            router.push(`/events/${eventId}/comms/${pitch.id}`)
        } catch {
            setError('Failed to create pitch')
        } finally {
            setSubmitting(false)
        }
    }

    const duplicateFromLibrary = async (row: LibraryRow) => {
        setAdding(row.id)
        try {
            const res = await fetch(`/api/events/${eventId}/pitches/library/${row.id}/copy`, {
                method: 'POST',
            })
            if (!res.ok) {
                alert('Failed to duplicate pitch')
                return
            }
            const pitch = await res.json()
            router.push(`/events/${eventId}/comms/${pitch.id}`)
        } finally {
            setAdding(null)
        }
    }

    const duplicate = async (row: PitchRow) => {
        const res = await fetch(`/api/pitches/${row.id}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId }),
        })
        if (!res.ok) {
            alert('Failed to duplicate')
            return
        }
        fetchPage()
    }

    const handleDelete = async (row: PitchRow) => {
        if (!confirm(`Delete pitch "${row.title}"? Briefings will be kept but unlinked.`)) return
        const res = await fetch(`/api/pitches/${row.id}`, { method: 'DELETE' })
        if (res.ok) {
            fetchPage()
        } else {
            alert('Failed to delete pitch')
        }
    }

    const toggleSort = (col: SortBy) => {
        if (sortBy === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(col)
            setSortDir(col === 'title' ? 'asc' : 'desc')
        }
    }

    const sortIcon = (col: SortBy) => {
        if (sortBy !== col) return null
        return sortDir === 'asc' ? <ArrowUp className="inline w-3.5 h-3.5" /> : <ArrowDown className="inline w-3.5 h-3.5" />
    }

    if (forbidden) {
        return (
            <div className="p-10 max-w-3xl mx-auto">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6">
                    You don&apos;t have access to Comms tracking. This feature is restricted to root and marketing roles.
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                        <Megaphone className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-zinc-900">Pitches</h1>
                        <p className="text-sm text-zinc-500">Media and analyst pitches for this event.</p>
                    </div>
                </div>
                {!creating && (
                    <button
                        onClick={() => { setCreating(true); setNewTab('blank') }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> New Pitch
                    </button>
                )}
            </div>

            {creating && (
                <div className="mb-8 bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
                    <div className="flex items-center border-b border-zinc-200">
                        <button
                            type="button"
                            onClick={() => setNewTab('blank')}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${newTab === 'blank' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}
                        >
                            <Plus className="w-4 h-4" /> Create blank
                        </button>
                        <button
                            type="button"
                            onClick={() => setNewTab('library')}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${newTab === 'library' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}
                        >
                            <Library className="w-4 h-4" /> Pick from library
                        </button>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={() => { setCreating(false); setNewTitle(''); setError('') }}
                            className="px-4 py-2 mr-2 rounded-xl text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>

                    {newTab === 'blank' ? (
                        <form onSubmit={handleCreate} className="p-6">
                            <label htmlFor="newPitchTitle" className="block text-sm font-medium text-zinc-700 mb-2">Pitch title</label>
                            <input
                                id="newPitchTitle"
                                autoFocus
                                type="text"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="e.g. AI Trends 2026 Analyst Briefing"
                                className="input-field"
                            />
                            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                            <div className="mt-4 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={submitting || !newTitle.trim()}
                                    className="px-4 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    {submitting ? 'Creating…' : 'Create & open'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="p-6">
                            <div className="mb-4 relative max-w-md">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-zinc-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search library by title…"
                                    value={libSearch}
                                    onChange={e => setLibSearch(e.target.value)}
                                    className="input-field pl-9"
                                />
                            </div>
                            <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                                <table className="min-w-full divide-y divide-zinc-200">
                                    <thead className="bg-zinc-50">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Title</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Event</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Tags</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Modified</th>
                                            <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-zinc-100">
                                        {libLoading ? (
                                            <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-400">Loading…</td></tr>
                                        ) : libItems.length === 0 ? (
                                            <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                                                {libDebounced ? 'No matches in the library.' : 'No pitches in the library yet.'}
                                            </td></tr>
                                        ) : libItems.map(row => (
                                            <tr key={row.id} className="hover:bg-zinc-50">
                                                <td className="px-4 py-2.5 text-sm font-medium text-zinc-900">{row.title}</td>
                                                <td className="px-4 py-2.5 text-sm text-zinc-600">{row.sourceEvent?.name ?? '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex flex-wrap gap-1">
                                                        {row.tags.map(t => (
                                                            <span key={t} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium">{t}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-zinc-500">{new Date(row.modified).toLocaleDateString()}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <button
                                                        onClick={() => duplicateFromLibrary(row)}
                                                        disabled={adding === row.id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                        {adding === row.id ? 'Duplicating…' : 'Duplicate'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination page={libPage} limit={LIBRARY_LIMIT} totalCount={libTotal} onPageChange={setLibPage} />
                        </div>
                    )}
                </div>
            )}

            {!creating && (
                <>
                    <div className="mb-4 relative max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-zinc-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search this event's pitches…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="input-field pl-9"
                        />
                    </div>

                    <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-zinc-200">
                                <thead className="bg-zinc-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('title')}>
                                            Title {sortIcon('title')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Tags</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('targetsCount')}>
                                            Targets {sortIcon('targetsCount')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('pipelineCount')}>
                                            Pipeline {sortIcon('pipelineCount')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('committedCount')}>
                                            Committed {sortIcon('committedCount')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('occurredCount')}>
                                            Occurred {sortIcon('occurredCount')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('modified')}>
                                            Modified {sortIcon('modified')}
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-zinc-100">
                                    {loading ? (
                                        <tr><td colSpan={8} className="px-4 py-16 text-center text-zinc-400">Loading…</td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={8} className="px-4 py-16 text-center text-zinc-500">
                                            {debouncedSearch ? 'No pitches match your search.' : 'No pitches for this event yet. Click New Pitch to start.'}
                                        </td></tr>
                                    ) : items.map(row => (
                                        <tr
                                            key={row.id}
                                            onClick={() => router.push(`/events/${eventId}/comms/${row.id}`)}
                                            className="hover:bg-zinc-50 cursor-pointer"
                                        >
                                            <td className="px-4 py-3 font-medium text-zinc-900">
                                                {row.title}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {row.tags.map(t => (
                                                        <span key={t} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium">{t}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-zinc-600">
                                                <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{row.targetsCount}</span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-zinc-600">{row.pipelineCount}</td>
                                            <td className="px-4 py-3 text-sm text-zinc-600">{row.committedCount}</td>
                                            <td className="px-4 py-3 text-sm text-zinc-600">{row.occurredCount}</td>
                                            <td className="px-4 py-3 text-sm text-zinc-500">
                                                {new Date(row.modified).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); router.push(`/events/${eventId}/comms/${row.id}`) }}
                                                        title="Edit"
                                                        className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); duplicate(row) }}
                                                        title="Duplicate"
                                                        className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(row) }}
                                                        title="Delete"
                                                        className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Pagination page={page} limit={LIMIT} totalCount={total} onPageChange={setPage} />
                </>
            )}
        </div>
    )
}
