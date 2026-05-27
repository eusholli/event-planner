'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Calendar, momentLocalizer, Views, View } from 'react-big-calendar'
import moment from 'moment'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import ContentTaskModal from '@/components/ContentTaskModal'
import { useUser } from '@/components/auth'
import { hasWriteAccess } from '@/lib/role-utils'

const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop(Calendar as any) as any

type ContentTask = {
    id: string
    title: string
    description?: string | null
    contentType?: string | null
    status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'
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
    resource: ContentTask
}

type ContentTypeOption = { name: string; color: string | null }
const NEUTRAL_COLOR = '#94a3b8'

export default function ContentCalendarPage() {
    const [tasks, setTasks] = useState<ContentTask[]>([])
    const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>([])
    const [availableTags, setAvailableTags] = useState<string[]>([])
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<ContentTask | null>(null)
    const [date, setDate] = useState(new Date())
    const [view, setView] = useState<View>(Views.MONTH)
    const { user } = useUser()
    const role = user?.publicMetadata?.role as string
    const readOnly = !hasWriteAccess(role)

    async function reload() {
        const res = await fetch('/api/content-tasks')
        const data = res.ok ? await res.json() : []
        setTasks(Array.isArray(data) ? data : [])
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
        reload()
    }, [])

    const colorMap = useMemo(() => {
        const m: Record<string, string> = {}
        for (const c of contentTypes) if (c.color) m[c.name] = c.color
        return m
    }, [contentTypes])

    const events: CalEvent[] = useMemo(() => {
        return tasks
            .filter(t => !!t.dueDate)
            .map(t => {
                const d = new Date(t.dueDate as string)
                return { id: t.id, title: t.title, start: d, end: d, allDay: true, resource: t }
            })
    }, [tasks])

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

            <div className="bg-white rounded-3xl border border-zinc-200 p-4" style={{ height: 'calc(100vh - 240px)' }}>
                <DnDCalendar
                    localizer={localizer}
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    date={date}
                    onNavigate={setDate}
                    view={view}
                    onView={setView}
                    views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                    defaultView={Views.MONTH}
                    components={{ event: EventComponent as any }}
                    draggableAccessor={() => !readOnly}
                    onEventDrop={handleDrop}
                    onSelectEvent={(e: any) => { setEditing(e.resource); setModalOpen(true) }}
                    selectable={!readOnly}
                    onSelectSlot={(slot: any) => {
                        if (readOnly) return
                        setEditing({
                            id: '', title: '', status: 'TODO', tags: [],
                            dueDate: new Date(slot.start).toISOString(),
                        } as any)
                        setModalOpen(true)
                    }}
                    eventPropGetter={(event: any) => ({
                        style: {
                            backgroundColor: (event.resource?.contentType && colorMap[event.resource.contentType]) || NEUTRAL_COLOR,
                            border: 'none',
                            color: 'white',
                            borderRadius: 6,
                            fontSize: 12,
                            opacity: event.resource?.status === 'DONE' ? 0.6 : event.resource?.status === 'CANCELED' ? 0.4 : 1,
                            textDecoration: event.resource?.status === 'CANCELED' ? 'line-through' : undefined,
                        },
                    })}
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
