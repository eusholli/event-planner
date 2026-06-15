'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, momentLocalizer, Views, View } from 'react-big-calendar'
import moment from 'moment'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import ContentTaskModal from '@/components/ContentTaskModal'
import { useUser } from '@/components/auth'
import { hasWriteAccess } from '@/lib/role-utils'
import useFilterParams from '@/hooks/useFilterParams'
import { STATUS_DISPLAY_ORDER } from '@/lib/status-colors'

const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop(Calendar as any) as any

type ContentTask = {
    id: string
    title: string
    description?: string | null
    contentType?: string | null
    status: 'DRAFT' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'
    dueDate?: string | null
    tags: string[]
    assigneeId?: string | null
    assigneeName?: string | null
    eventId?: string | null
    event?: { id: string; name: string; slug: string } | null
}

type CalEvent = {
    id: string
    title: string
    start: Date
    end: Date
    allDay: boolean
    kind: 'task' | 'conference'
    resource: ContentTask | any
}

type ContentTypeOption = { name: string; color: string | null }
const NEUTRAL_COLOR = '#94a3b8'

const parseLocalDate = (s: string): Date => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
}

const FILTER_DEFAULTS = {
    search: '',
    status: [] as string[],
    contentType: [] as string[],
    tags: [] as string[],
    eventStatuses: [...STATUS_DISPLAY_ORDER] as string[],
    eventRegions: [] as string[],
}

export default function ContentCalendarPage() {
    const [tasks, setTasks] = useState<ContentTask[]>([])
    const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [conferenceEvents, setConferenceEvents] = useState<any[]>([])
    const [regionTypes, setRegionTypes] = useState<string[]>([])
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<ContentTask | null>(null)
    const [date, setDate] = useState(new Date())
    const [view, setView] = useState<View>(Views.MONTH)
    const router = useRouter()
    const { user } = useUser()
    const role = user?.publicMetadata?.role as string
    const readOnly = !hasWriteAccess(role)

    const { filters, setFilter, isFiltered, resetFilters } = useFilterParams('content-calendar', FILTER_DEFAULTS)

    async function reload() {
        try {
            const res = await fetch('/api/content-tasks')
            const data = res.ok ? await res.json() : []
            setTasks(Array.isArray(data) ? data : [])
        } catch {
            // Network error — leave existing tasks in place
        }
    }

    useEffect(() => {
        fetch('/api/content-tasks/options')
            .then(r => r.ok ? r.json() : { contentTypes: [], tags: [] })
            .then(d => {
                const ct = (d.contentTypes || []).map((c: any) =>
                    typeof c === 'string' ? { name: c, color: null } : c
                )
                setContentTypes(ct)
                setAvailableTags(d.tags || [])
            })
        fetch('/api/events')
            .then(r => r.ok ? r.json() : [])
            .then(data => setConferenceEvents(Array.isArray(data) ? data : []))
        fetch('/api/admin/system')
            .then(r => r.ok ? r.json() : {})
            .then((d: { defaultRegionTypes?: string[] }) => setRegionTypes(d.defaultRegionTypes || []))
            .catch(() => {})
        reload()
    }, [])

    const colorMap = useMemo(() => {
        const m: Record<string, string> = {}
        for (const c of contentTypes) if (c.color) m[c.name] = c.color
        return m
    }, [contentTypes])

    const events: CalEvent[] = useMemo(() => {
        const taskEvents: CalEvent[] = tasks
            .filter(t => {
                if (!t.dueDate) return false
                if (filters.search) {
                    const q = (filters.search as string).toLowerCase()
                    if (!t.title.toLowerCase().includes(q)) return false
                }
                if ((filters.status as string[]).length && !(filters.status as string[]).includes(t.status)) return false
                if ((filters.contentType as string[]).length && (!t.contentType || !(filters.contentType as string[]).includes(t.contentType))) return false
                if ((filters.tags as string[]).length && !t.tags.some(tag => (filters.tags as string[]).includes(tag))) return false
                return true
            })
            .map(t => {
                const d = parseLocalDate(t.dueDate as string)
                return { id: t.id, title: t.title, start: d, end: d, allDay: true, kind: 'task' as const, resource: t }
            })
        const confEvents: CalEvent[] = conferenceEvents
            .filter(e => {
                if (!e.startDate || !e.endDate) return false
                if (!(filters.eventStatuses as string[]).includes(e.status)) return false
                if ((filters.eventRegions as string[]).length) {
                    const region = e.region ?? 'Global'
                    if (!(filters.eventRegions as string[]).includes(region)) return false
                }
                return true
            })
            .map(e => ({
                id: `conf-${e.id}`,
                title: e.name,
                start: parseLocalDate(e.startDate),
                end: parseLocalDate(e.endDate),
                allDay: true,
                kind: 'conference' as const,
                resource: e,
            }))
        return [...confEvents, ...taskEvents]
    }, [tasks, conferenceEvents, filters])

    async function handleDrop({ event, start }: any) {
        if (readOnly) return
        const t: ContentTask = event.resource
        const newDate = new Date(start)
        // optimistic
        setTasks(prev => prev.map(x => x.id === t.id ? { ...x, dueDate: newDate.toISOString() } : x))
        const res = await fetch(`/api/content-tasks/${t.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dueDate: newDate.toISOString() }),
        })
        if (!res.ok) reload()
    }

    function toggleMulti(key: 'status' | 'contentType' | 'tags' | 'eventStatuses' | 'eventRegions', value: string) {
        const current = filters[key] as string[]
        setFilter(key, current.includes(value) ? current.filter(x => x !== value) : [...current, value])
    }

    function openNew() { setEditing(null); setModalOpen(true) }

    function EventComponent({ event }: { event: CalEvent }) {
        const assignee = event.resource.assigneeName
        return (
            <div className="leading-tight">
                <div className="truncate font-medium" style={{ fontSize: 11 }}>{event.title}</div>
                {assignee && <div className="truncate opacity-80" style={{ fontSize: 10 }}>{assignee}</div>}
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-zinc-900">Content Calendar</h1>
                    <p className="text-sm text-zinc-500 mt-1">Drag tasks to reschedule. Color by content type.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/content" className="px-4 py-2 text-sm rounded-2xl border border-zinc-300 hover:bg-zinc-50">List view</Link>
                    {!readOnly && <button onClick={openNew} className="px-4 py-2 text-sm rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700">+ New Task</button>}
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-200 p-4 mb-4 space-y-3">
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Search tasks…"
                        value={filters.search as string}
                        onChange={e => setFilter('search', e.target.value)}
                        className="flex-1 px-3 py-2 border border-zinc-300 rounded-2xl text-sm"
                    />
                    {isFiltered && (
                        <button onClick={resetFilters} className="text-sm text-zinc-500 hover:text-zinc-700 whitespace-nowrap">Clear filters</button>
                    )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                    <FilterGroup label="Status" options={['TODO', 'IN_PROGRESS', 'DONE', 'CANCELED']} selected={filters.status as string[]} onToggle={v => toggleMulti('status', v)} />
                    {contentTypes.length > 0 && (
                        <FilterGroup label="Type" options={contentTypes.map(c => c.name)} selected={filters.contentType as string[]} onToggle={v => toggleMulti('contentType', v)} />
                    )}
                    {availableTags.length > 0 && (
                        <FilterGroup label="Tags" options={availableTags} selected={filters.tags as string[]} onToggle={v => toggleMulti('tags', v)} />
                    )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs border-t border-zinc-100 pt-3">
                    <FilterGroup label="Conference Events" options={STATUS_DISPLAY_ORDER} selected={filters.eventStatuses as string[]} onToggle={v => toggleMulti('eventStatuses', v)} />
                    {regionTypes.length > 0 && (
                        <FilterGroup label="Region" options={regionTypes} selected={filters.eventRegions as string[]} onToggle={v => toggleMulti('eventRegions', v)} />
                    )}
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-200 p-4" style={{ height: 1200 }}>
                <DnDCalendar
                    style={{ height: '100%' }}
                    localizer={localizer}
                    events={events}
                    showAllEvents
                    startAccessor="start"
                    endAccessor="end"
                    date={date}
                    onNavigate={setDate}
                    view={view}
                    onView={setView}
                    views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                    defaultView={Views.MONTH}
                    components={{ event: EventComponent as any }}
                    draggableAccessor={(e: any) => !readOnly && e.kind === 'task'}
                    onEventDrop={handleDrop}
                    onSelectEvent={(e: any) => {
                        if (e.kind === 'conference') { router.push(`/events/${e.resource.slug}/roi`); return }
                        setEditing(e.resource); setModalOpen(true)
                    }}
                    selectable={!readOnly}
                    onSelectSlot={(slot: any) => {
                        if (readOnly) return
                        setEditing({
                            id: '', title: '', status: 'TODO', tags: [],
                            dueDate: new Date(slot.start).toISOString(),
                        } as any)
                        setModalOpen(true)
                    }}
                    eventPropGetter={(event: any) => {
                        if (event.kind === 'conference') return {
                            style: {
                                backgroundColor: '#6366f1',
                                border: 'none',
                                color: 'white',
                                borderRadius: 4,
                                fontSize: 11,
                                opacity: 0.75,
                                fontStyle: 'italic',
                                cursor: 'pointer',
                            }
                        }
                        return {
                            style: {
                                backgroundColor: (event.resource?.contentType && colorMap[event.resource.contentType]) || NEUTRAL_COLOR,
                                border: 'none',
                                color: 'white',
                                borderRadius: 6,
                                fontSize: 12,
                                opacity: event.resource?.status === 'DONE' ? 0.6 : event.resource?.status === 'CANCELED' ? 0.4 : 1,
                                textDecoration: event.resource?.status === 'CANCELED' ? 'line-through' : undefined,
                            },
                        }
                    }}
                />
            </div>

            <ContentTaskModal
                open={modalOpen}
                initial={editing && editing.id ? editing : (editing ? { ...editing, id: undefined } : undefined)}
                contentTypes={contentTypes}
                availableTags={availableTags}
                onClose={() => setModalOpen(false)}
                onSaved={() => reload()}
                onDeleted={() => reload()}
            />
        </div>
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
