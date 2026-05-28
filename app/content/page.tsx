'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ContentTaskModal from '@/components/ContentTaskModal'
import useFilterParams from '@/hooks/useFilterParams'

type ContentTask = {
    id: string
    title: string
    description?: string | null
    notes?: string | null
    contentType?: string | null
    status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'
    dueDate?: string | null
    tags: string[]
    assigneeId?: string | null
    assigneeName?: string | null
    collaboratorIds: string[]
    collaboratorNames?: string[]
    eventId?: string | null
    event?: { id: string; name: string; slug: string } | null
    createdBy?: string | null
    attachments?: { id: string; title: string; fileUrl: string; originalName: string }[]
}

const STATUS_COLORS: Record<string, string> = {
    TODO: 'bg-zinc-100 text-zinc-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    DONE: 'bg-green-100 text-green-700',
    CANCELED: 'bg-red-100 text-red-600',
}

function formatDate(v?: string | null): string {
    if (!v) return '—'
    const d = new Date(v)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const FILTER_DEFAULTS = {
    search: '',
    status: [] as string[],
    contentType: [] as string[],
    tags: [] as string[],
    sortCol: 'dueDate',
    sortDir: 'asc',
}

const COLUMNS: { id: string; label: string; sortable: boolean }[] = [
    { id: 'title',       label: 'Title',    sortable: true },
    { id: 'contentType', label: 'Type',     sortable: true },
    { id: 'status',      label: 'Status',   sortable: true },
    { id: 'dueDate',     label: 'Due',      sortable: true },
    { id: 'assigneeName',label: 'Assignee', sortable: true },
    { id: 'event',       label: 'Event',    sortable: true },
    { id: 'tags',        label: 'Tags',     sortable: false },
]

function ContentListPage() {
    const [tasks, setTasks] = useState<ContentTask[]>([])
    const [loading, setLoading] = useState(true)
    const [contentTypes, setContentTypes] = useState<{ name: string; color: string | null }[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<ContentTask | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()

    const { filters, setFilter, isFiltered, resetFilters } = useFilterParams('content', FILTER_DEFAULTS)

    useEffect(() => {
        fetch('/api/content-tasks/options')
            .then(r => r.ok ? r.json() : { contentTypes: [], tags: [] })
            .then(d => {
                const ct = (d.contentTypes || []).map((c: any) => typeof c === 'string' ? { name: c, color: null } : c)
                setContentTypes(ct)
                setAvailableTags(d.tags || [])
            })
    }, [])

    async function reload() {
        setLoading(true)
        const res = await fetch('/api/content-tasks')
        const data = res.ok ? await res.json() : []
        setTasks(Array.isArray(data) ? data : [])
        setLoading(false)
    }

    useEffect(() => { reload() }, [])

    // Deep-link: ?task=<id> opens the modal for that task
    useEffect(() => {
        const taskId = searchParams.get('task')
        if (!taskId) return
        fetch(`/api/content-tasks/${taskId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return
                setEditing(data)
                setModalOpen(true)
                router.replace('/content')
            })
            .catch(() => {})
    }, [searchParams])

    const filtered = useMemo(() => {
        const list = tasks.filter(t => {
            if (filters.search) {
                const q = filters.search.toLowerCase()
                if (!t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false
            }
            if (filters.status.length && !filters.status.includes(t.status)) return false
            if (filters.contentType.length && (!t.contentType || !filters.contentType.includes(t.contentType))) return false
            if (filters.tags.length && !t.tags.some(tag => filters.tags.includes(tag))) return false
            return true
        })

        const col = filters.sortCol as string
        const dir = filters.sortDir as 'asc' | 'desc'
        return [...list].sort((a, b) => {
            let aVal: string | number
            let bVal: string | number
            if (col === 'dueDate') {
                // nulls last regardless of direction
                if (!a.dueDate && !b.dueDate) return 0
                if (!a.dueDate) return 1
                if (!b.dueDate) return -1
                aVal = new Date(a.dueDate).getTime()
                bVal = new Date(b.dueDate).getTime()
            } else if (col === 'event') {
                aVal = a.event?.name ?? ''
                bVal = b.event?.name ?? ''
            } else {
                aVal = (a[col as keyof ContentTask] as string) ?? ''
                bVal = (b[col as keyof ContentTask] as string) ?? ''
            }
            if (aVal < bVal) return dir === 'asc' ? -1 : 1
            if (aVal > bVal) return dir === 'asc' ? 1 : -1
            return 0
        })
    }, [tasks, filters])

    function handleSort(colId: string) {
        if (filters.sortCol === colId) {
            setFilter('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setFilter('sortCol', colId)
            setFilter('sortDir', 'asc')
        }
    }

    function openNew() { setEditing(null); setModalOpen(true) }
    function openEdit(t: ContentTask) { setEditing(t); setModalOpen(true) }

    function toggleMulti(key: 'status' | 'contentType' | 'tags', value: string) {
        const current = filters[key]
        setFilter(key, current.includes(value) ? current.filter(x => x !== value) : [...current, value])
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-zinc-900">Content</h1>
                    <p className="text-sm text-zinc-500 mt-1">Editorial calendar — newsletters, podcasts, articles, social, recaps</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/content/calendar" className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50">Calendar view</Link>
                    <button onClick={openNew} className="px-4 py-2 text-sm rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700">+ New Task</button>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-200 p-4 mb-4 space-y-3">
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Search title or description…"
                        value={filters.search}
                        onChange={e => setFilter('search', e.target.value)}
                        className="flex-1 px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                    />
                    {isFiltered && (
                        <button onClick={resetFilters} className="text-sm text-zinc-500 hover:text-zinc-700">Clear filters</button>
                    )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                    <FilterGroup label="Status" options={['TODO', 'IN_PROGRESS', 'DONE', 'CANCELED']} selected={filters.status} onToggle={v => toggleMulti('status', v)} />
                    {contentTypes.length > 0 && (
                        <FilterGroup label="Type" options={contentTypes.map(c => c.name)} selected={filters.contentType} onToggle={v => toggleMulti('contentType', v)} />
                    )}
                    {availableTags.length > 0 && (
                        <FilterGroup label="Tags" options={availableTags} selected={filters.tags} onToggle={v => toggleMulti('tags', v)} />
                    )}
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                        <tr>
                            {COLUMNS.map(col => (
                                <th
                                    key={col.id}
                                    className={`text-left px-4 py-3 select-none ${col.sortable ? 'cursor-pointer hover:bg-zinc-100' : ''}`}
                                    onClick={col.sortable ? () => handleSort(col.id) : undefined}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {col.label}
                                        {col.sortable && filters.sortCol === col.id && (
                                            <span className="text-indigo-500">{filters.sortDir === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Loading…</td></tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">No content tasks. Click + New Task to add one.</td></tr>
                        )}
                        {!loading && filtered.map(t => (
                            <tr key={t.id} onClick={() => openEdit(t)} className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                                <td className="px-4 py-3 font-medium text-zinc-900">{t.title}</td>
                                <td className="px-4 py-3 text-zinc-600">
                                    {t.contentType ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-full"
                                                style={{ backgroundColor: contentTypes.find(c => c.name === t.contentType)?.color || '#94a3b8' }}
                                            />
                                            {t.contentType}
                                        </span>
                                    ) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[t.status]}`}>
                                        {t.status.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-zinc-600">{formatDate(t.dueDate)}</td>
                                <td className="px-4 py-3 text-zinc-600">{t.assigneeName || '—'}</td>
                                <td className="px-4 py-3 text-zinc-600">
                                    {t.event ? (
                                        <Link href={`/events/${t.event.slug}/dashboard`} onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline">{t.event.name}</Link>
                                    ) : '—'}
                                </td>
                                <td className="px-4 py-3 text-zinc-500 text-xs">{t.tags.join(', ') || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ContentTaskModal
                open={modalOpen}
                initial={editing ?? undefined}
                contentTypes={contentTypes}
                availableTags={availableTags}
                onClose={() => setModalOpen(false)}
                onSaved={() => reload()}
                onDeleted={() => reload()}
            />
        </div>
    )
}

export default function ContentListPageWrapper() {
    return (
        <Suspense fallback={null}>
            <ContentListPage />
        </Suspense>
    )
}

function FilterGroup({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 font-medium">{label}:</span>
            {options.map(o => (
                <button
                    key={o}
                    onClick={() => onToggle(o)}
                    className={`px-2 py-1 rounded-full border text-xs ${selected.includes(o) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'}`}
                >{o.replace('_', ' ')}</button>
            ))}
        </div>
    )
}
