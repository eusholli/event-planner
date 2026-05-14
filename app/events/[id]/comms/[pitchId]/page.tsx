'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Plus, Search, Megaphone, Calendar as CalendarIcon } from 'lucide-react'
import AddAttendeeForm from '@/components/AddAttendeeForm'
import TagCheckboxGrid from '@/components/TagCheckboxGrid'
import MeetingModal, { Meeting } from '@/components/MeetingModal'
import MeetingDetailsModal from '@/components/MeetingDetailsModal'
import MeetingCard from '@/components/MeetingCard'
import PitchTargetsTable, { type PitchTarget, type PitchMeetingForCounts, type TargetEdit } from '@/components/PitchTargetsTable'
import { setNavGuard } from '@/lib/nav-guard'

interface AttendeeMini {
    id: string
    name: string
    email: string
    title?: string | null
    isExternal?: boolean
    company: { id: string; name: string } | null
}

interface EventMini { id: string; slug: string; name: string; tags: string[]; meetingTypes: string[]; status: string }
interface SourcePitchMini { id: string; title: string; event: { id: string; name: string; slug: string } | null }

interface PitchDetail {
    id: string
    event: EventMini | null
    sourcePitch: SourcePitchMini | null
    title: string
    pitchText: string
    tags: string[]
    targets: PitchTarget[]
    meetings: Array<Meeting & { roomId?: string | null; room?: { id: string; name: string } | null }>
}

interface PitchDraft {
    title: string
    pitchText: string
    tags: string[]
    targetEdits: Record<string, TargetEdit>
}

interface RoomMini { id: string; name: string; capacity?: number }

const UNSAVED_MSG = 'You have unsaved changes. Are you sure you want to leave?'

function buildDraft(pitch: PitchDetail): PitchDraft {
    const targetEdits: Record<string, TargetEdit> = {}
    for (const t of pitch.targets) {
        targetEdits[t.attendeeId] = {
            resultingUrls: t.resultingUrls ?? '',
            additionalNotes: t.additionalNotes ?? '',
        }
    }
    return {
        title: pitch.title,
        pitchText: pitch.pitchText ?? '',
        tags: [...pitch.tags],
        targetEdits,
    }
}

export default function PitchDetailPage() {
    const params = useParams()
    const router = useRouter()
    const eventId = params?.id as string
    const pitchId = params?.pitchId as string

    const [pitch, setPitch] = useState<PitchDetail | null>(null)
    const [draft, setDraft] = useState<PitchDraft | null>(null)
    const initialDraftRef = useRef<string>('')
    const [loading, setLoading] = useState(true)
    const [forbidden, setForbidden] = useState(false)
    const [notFound, setNotFound] = useState(false)
    const [allAttendees, setAllAttendees] = useState<AttendeeMini[]>([])
    const [rooms, setRooms] = useState<RoomMini[]>([])

    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const [targetSearch, setTargetSearch] = useState('')

    const [selectedMeeting, setSelectedMeeting] = useState<Partial<Meeting> | null>(null)
    const [isCreatingMeeting, setIsCreatingMeeting] = useState(false)
    const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false)
    const [viewMeeting, setViewMeeting] = useState<Partial<Meeting> | null>(null)
    const [isViewModalOpen, setIsViewModalOpen] = useState(false)
    const [meetingError, setMeetingError] = useState('')

    const loadPitch = useCallback(async () => {
        const res = await fetch(`/api/pitches/${pitchId}`)
        if (res.status === 403) { setForbidden(true); setLoading(false); return }
        if (res.status === 404) { setNotFound(true); setLoading(false); return }
        const data: PitchDetail = await res.json()
        setPitch(data)
        const nextDraft = buildDraft(data)
        setDraft(nextDraft)
        initialDraftRef.current = JSON.stringify(nextDraft)
        setLoading(false)
    }, [pitchId])

    useEffect(() => {
        if (!pitchId || !eventId) return
        loadPitch()
        fetch(`/api/attendees?all=true`).then(r => r.json()).then(data => {
            if (Array.isArray(data)) setAllAttendees(data)
        }).catch(() => {})
        fetch(`/api/rooms?eventId=${eventId}`).then(r => r.json()).then(data => {
            if (Array.isArray(data)) setRooms(data)
        }).catch(() => {})
    }, [pitchId, eventId, loadPitch])

    const isDirty = useCallback((): boolean => {
        if (!draft) return false
        return JSON.stringify(draft) !== initialDraftRef.current
    }, [draft])

    // beforeunload guard
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty()) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isDirty])

    // Intercept in-app <Link> navigation (e.g. main nav bar) while dirty
    useEffect(() => {
        setNavGuard(() => {
            if (!isDirty()) return true
            return window.confirm(UNSAVED_MSG)
        })
        return () => setNavGuard(null)
    }, [isDirty])

    const guardedNavigate = (href: string) => {
        if (!isDirty() || window.confirm(UNSAVED_MSG)) {
            router.push(href)
        }
    }

    const [candidateResults, setCandidateResults] = useState<AttendeeMini[]>([])
    const [searchingCandidates, setSearchingCandidates] = useState(false)

    useEffect(() => {
        const q = targetSearch.trim()
        if (!q) {
            setCandidateResults([])
            return
        }
        setSearchingCandidates(true)
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/attendees?query=${encodeURIComponent(q)}`)
                const data = await res.json()
                if (Array.isArray(data)) setCandidateResults(data)
                else setCandidateResults([])
            } catch {
                setCandidateResults([])
            } finally {
                setSearchingCandidates(false)
            }
        }, 300)
        return () => clearTimeout(t)
    }, [targetSearch])

    const updateDraft = (patch: Partial<PitchDraft>) => {
        setDraft(prev => prev ? { ...prev, ...patch } : prev)
    }

    const toggleTag = (tag: string) => {
        if (!draft) return
        const nextTags = draft.tags.includes(tag)
            ? draft.tags.filter(t => t !== tag)
            : [...draft.tags, tag]
        updateDraft({ tags: nextTags })
    }

    const handleTargetEditChange = (attendeeId: string, patch: Partial<TargetEdit>) => {
        setDraft(prev => {
            if (!prev) return prev
            const current = prev.targetEdits[attendeeId] ?? { resultingUrls: '', additionalNotes: '' }
            return {
                ...prev,
                targetEdits: {
                    ...prev.targetEdits,
                    [attendeeId]: { ...current, ...patch },
                },
            }
        })
    }

    const handleSave = async () => {
        if (!pitch || !draft || saving) return
        setSaving(true)
        setSaveError('')

        const requests: Promise<Response>[] = []

        // Pitch meta
        const metaPatch: { title?: string; pitchText?: string; tags?: string[] } = {}
        if (draft.title !== pitch.title) metaPatch.title = draft.title
        if (draft.pitchText !== (pitch.pitchText ?? '')) metaPatch.pitchText = draft.pitchText
        if (JSON.stringify(draft.tags) !== JSON.stringify(pitch.tags)) metaPatch.tags = draft.tags

        if (Object.keys(metaPatch).length > 0) {
            requests.push(fetch(`/api/pitches/${pitchId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metaPatch),
            }))
        }

        // Target edits
        for (const t of pitch.targets) {
            const edit = draft.targetEdits[t.attendeeId]
            if (!edit) continue
            const patch: { resultingUrls?: string; additionalNotes?: string } = {}
            if (edit.resultingUrls !== (t.resultingUrls ?? '')) patch.resultingUrls = edit.resultingUrls
            if (edit.additionalNotes !== (t.additionalNotes ?? '')) patch.additionalNotes = edit.additionalNotes
            if (Object.keys(patch).length > 0) {
                requests.push(fetch(`/api/pitches/${pitchId}/targets/${t.attendeeId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patch),
                }))
            }
        }

        try {
            const results = await Promise.all(requests)
            const failed = results.find(r => !r.ok)
            if (failed) {
                const data = await failed.json().catch(() => ({}))
                setSaveError(data.error || 'Failed to save some changes. Please retry.')
                return
            }
            await loadPitch()
        } catch {
            setSaveError('Failed to save changes. Please retry.')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        if (!pitch) return
        if (isDirty() && !window.confirm('Discard your unsaved changes?')) return
        const reverted = buildDraft(pitch)
        setDraft(reverted)
        initialDraftRef.current = JSON.stringify(reverted)
        setSaveError('')
    }

    const addTarget = async (attendeeId: string) => {
        if (isDirty()) return
        const res = await fetch(`/api/pitches/${pitchId}/targets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attendeeId, linkEventId: eventId }),
        })
        if (res.ok) {
            try {
                const refreshed = await fetch(`/api/attendees?all=true`).then(r => r.json())
                if (Array.isArray(refreshed)) setAllAttendees(refreshed)
            } catch {}
            await loadPitch()
            setTargetSearch('')
        } else {
            alert('Failed to add target')
        }
    }

    const removeTarget = async (attendeeId: string) => {
        if (isDirty()) return
        if (!confirm('Remove this target from the pitch?')) return
        const res = await fetch(`/api/pitches/${pitchId}/targets/${attendeeId}`, { method: 'DELETE' })
        if (res.ok) {
            await loadPitch()
        } else {
            alert('Failed to remove target')
        }
    }

    const handleDeletePitch = async () => {
        if (isDirty() && !window.confirm(UNSAVED_MSG)) return
        if (!confirm('Delete this pitch? Briefings will be kept but unlinked.')) return
        const res = await fetch(`/api/pitches/${pitchId}`, { method: 'DELETE' })
        if (res.ok) {
            router.push(`/events/${eventId}/comms`)
        } else {
            alert('Failed to delete pitch')
        }
    }

    const openScheduleBriefing = () => {
        if (!pitch) return
        const targetAttendees = pitch.targets.map(t => ({
            id: t.attendee.id,
            name: t.attendee.name,
            email: t.attendee.email,
            company: t.attendee.company ?? { id: '', name: '' },
            title: t.attendee.title ?? undefined,
            isExternal: t.attendee.isExternal,
        }))
        setMeetingError('')
        setIsCreatingMeeting(true)
        setSelectedMeeting({
            title: pitch.title,
            purpose: '',
            date: null,
            startTime: '09:00',
            endTime: '09:30',
            resourceId: rooms[0]?.id ?? '',
            attendees: targetAttendees,
            status: 'PIPELINE',
            tags: pitch.tags,
            meetingType: '',
            otherDetails: '',
            isApproved: false,
            calendarInviteSent: false,
            pitchId,
        })
        setIsMeetingModalOpen(true)
    }

    const openEditBriefing = (m: Meeting) => {
        setMeetingError('')
        setIsCreatingMeeting(false)
        setSelectedMeeting({ ...m, resourceId: (m as Meeting & { roomId?: string }).roomId ?? (m as Meeting & { roomId?: string }).resourceId ?? '', pitchId })
        setIsMeetingModalOpen(true)
    }

    const openViewBriefing = (m: Meeting) => {
        setViewMeeting({ ...m, resourceId: (m as Meeting & { roomId?: string }).roomId ?? (m as Meeting & { roomId?: string }).resourceId ?? '' })
        setIsViewModalOpen(true)
    }

    const handleSaveMeeting = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedMeeting) return
        const method = isCreatingMeeting ? 'POST' : 'PUT'
        const url = isCreatingMeeting ? '/api/meetings' : `/api/meetings/${selectedMeeting.id}`

        const body: Record<string, unknown> = {
            title: selectedMeeting.title,
            purpose: selectedMeeting.purpose,
            status: selectedMeeting.status,
            tags: selectedMeeting.tags,
            requesterEmail: selectedMeeting.requesterEmail,
            meetingType: selectedMeeting.meetingType,
            location: selectedMeeting.resourceId === 'external' ? selectedMeeting.location : null,
            otherDetails: selectedMeeting.otherDetails,
            isApproved: selectedMeeting.isApproved,
            calendarInviteSent: selectedMeeting.calendarInviteSent,
            date: selectedMeeting.date || null,
            startTime: selectedMeeting.startTime || null,
            endTime: selectedMeeting.endTime || null,
            roomId: (selectedMeeting.resourceId === 'external' ? null : selectedMeeting.resourceId) || null,
            attendeeIds: selectedMeeting.attendees?.map(a => a.id) ?? [],
            pitchId,
        }
        if (isCreatingMeeting) body.eventId = eventId

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (res.ok) {
                const saved = await res.json()
                if (saved.warning) alert(`Warning: ${saved.warning}`)
                setIsMeetingModalOpen(false)
                setSelectedMeeting(null)
                await loadPitch()
            } else {
                const data = await res.json().catch(() => ({}))
                setMeetingError(data.error || 'Failed to save briefing')
            }
        } catch {
            setMeetingError('Failed to save briefing')
        }
    }

    const handleQuickStatusChange = async (meetingId: string, newStatus: 'PIPELINE' | 'CONFIRMED' | 'OCCURRED' | 'CANCELED') => {
        const m = pitch?.meetings.find(x => x.id === meetingId)
        if (!m) return
        const res = await fetch(`/api/meetings/${meetingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: m.title, status: newStatus }),
        })
        if (res.ok) {
            await loadPitch()
        } else {
            alert('Failed to update status')
        }
    }

    const handleDeleteMeeting = async () => {
        if (!selectedMeeting || isCreatingMeeting) return
        if (!confirm('Delete this briefing?')) return
        const res = await fetch(`/api/meetings/${selectedMeeting.id}`, { method: 'DELETE' })
        if (res.ok) {
            setIsMeetingModalOpen(false)
            setSelectedMeeting(null)
            await loadPitch()
        } else {
            alert('Failed to delete briefing')
        }
    }

    const currentEvent = useMemo<EventMini | null>(() => {
        return pitch?.event ?? null
    }, [pitch])

    const targetAttendeeIds = useMemo(() => new Set((pitch?.targets ?? []).map(t => t.attendeeId)), [pitch])

    const filteredCandidates = useMemo(() => {
        return candidateResults.filter(a => !targetAttendeeIds.has(a.id)).slice(0, 20)
    }, [candidateResults, targetAttendeeIds])

    const meetingCardData = useMemo(() => {
        if (!pitch) return []
        return pitch.meetings.map(m => {
            const start = m.date && m.startTime ? new Date(`${m.date}T${m.startTime}`) : null
            const end = m.date && m.endTime ? new Date(`${m.date}T${m.endTime}`) : null
            return {
                ...m,
                start,
                end,
                resourceId: (m as Meeting & { roomId?: string }).roomId ?? '',
            } as Meeting & { start: Date | null; end: Date | null; resourceId: string }
        })
    }, [pitch])

    if (forbidden) {
        return (
            <div className="p-10 max-w-3xl mx-auto">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6">
                    You don&apos;t have access to Comms tracking. This feature is restricted to root and marketing roles.
                </div>
            </div>
        )
    }
    if (notFound) {
        return (
            <div className="p-10 max-w-3xl mx-auto text-center text-zinc-500">
                Pitch not found.
                <div className="mt-4">
                    <button onClick={() => guardedNavigate(`/events/${eventId}/comms`)} className="text-indigo-600 hover:underline">Back to Comms</button>
                </div>
            </div>
        )
    }
    if (loading || !pitch || !draft) {
        return <div className="p-10 text-center text-zinc-500">Loading pitch…</div>
    }

    const dirty = isDirty()

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            <button
                onClick={() => guardedNavigate(`/events/${eventId}/comms`)}
                disabled={dirty}
                title={dirty ? 'Save or cancel your changes first' : ''}
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-6 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-500"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Comms
            </button>

            <div className="flex items-start justify-between gap-4 mb-8">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Megaphone className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <input
                            type="text"
                            value={draft.title}
                            onChange={e => updateDraft({ title: e.target.value })}
                            placeholder="Pitch title"
                            className="text-2xl font-semibold text-zinc-900 w-full bg-transparent border-0 border-b border-transparent hover:border-zinc-200 focus:border-indigo-500 focus:outline-none px-0 py-1 transition-colors"
                        />
                        <p className="text-sm text-zinc-500 mt-1">{currentEvent?.name ?? ''}</p>
                        {pitch.sourcePitch && (
                            <p className="text-xs text-zinc-400 mt-1">
                                Copied from &ldquo;{pitch.sourcePitch.title}&rdquo;
                                {pitch.sourcePitch.event && (
                                    <>
                                        {' · '}
                                        <button
                                            onClick={() => pitch.sourcePitch?.event && guardedNavigate(`/events/${pitch.sourcePitch.event.slug}/comms/${pitch.sourcePitch.id}`)}
                                            disabled={dirty}
                                            title={dirty ? 'Save or cancel your changes first' : ''}
                                            className="text-indigo-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                                        >
                                            {pitch.sourcePitch.event.name}
                                        </button>
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleCancel}
                        disabled={!dirty || saving}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm text-zinc-700 border border-zinc-200 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                        onClick={handleDeletePitch}
                        disabled={dirty}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title={dirty ? 'Save or cancel your changes first' : 'Delete pitch'}
                    >
                        <Trash2 className="w-4 h-4" /> Delete
                    </button>
                </div>
            </div>

            {saveError && (
                <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {saveError}
                </div>
            )}

            {dirty && (
                <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    You have unsaved changes. Save or Cancel to use other actions on this page.
                </div>
            )}

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left column: pitch text + tags */}
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Pitch</h2>
                        <textarea
                            value={draft.pitchText}
                            onChange={e => updateDraft({ pitchText: e.target.value })}
                            placeholder="Describe the media pitch — story angle, key messages, supporting data…"
                            rows={8}
                            className="input-field resize-y"
                        />
                        <div className="mt-4">
                            <TagCheckboxGrid
                                availableTags={currentEvent?.tags ?? []}
                                selectedTags={draft.tags}
                                onToggle={toggleTag}
                                label="Briefing types"
                            />
                        </div>
                    </section>

                    <section className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-zinc-900">Target Audience</h2>
                            <span className="text-xs text-zinc-400">{pitch.targets.length} target{pitch.targets.length === 1 ? '' : 's'}</span>
                        </div>
                        <PitchTargetsTable
                            targets={pitch.targets}
                            meetings={pitch.meetings as unknown as PitchMeetingForCounts[]}
                            edits={draft.targetEdits}
                            onEditChange={handleTargetEditChange}
                            onRemove={removeTarget}
                            removeDisabled={dirty}
                        />
                    </section>

                    <section className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-zinc-400" /> Briefings
                            </h2>
                            <button
                                onClick={openScheduleBriefing}
                                disabled={dirty}
                                title={dirty ? 'Save or cancel your changes first' : ''}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                            >
                                <Plus className="w-4 h-4" /> Schedule briefing
                            </button>
                        </div>
                        {meetingCardData.length === 0 ? (
                            <div className="text-center py-10 text-zinc-500 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                                No briefings scheduled yet.
                            </div>
                        ) : (
                            <div className={`space-y-3 ${dirty ? 'pointer-events-none opacity-50' : ''}`}>
                                {meetingCardData.map(m => (
                                    <MeetingCard
                                        key={(m as Meeting & { roomId?: string }).id}
                                        meeting={m as unknown as Meeting & { resourceId?: string }}
                                        rooms={rooms}
                                        onClick={dirty ? undefined : () => openViewBriefing(m as unknown as Meeting)}
                                        onDoubleClick={dirty ? undefined : () => openEditBriefing(m as unknown as Meeting)}
                                        onStatusChange={dirty ? undefined : handleQuickStatusChange}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Right column: add target picker + AddAttendeeForm */}
                <aside className="space-y-6">
                    <section className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-zinc-900 mb-3">Add target</h2>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={targetSearch}
                                onChange={e => setTargetSearch(e.target.value)}
                                placeholder="Search attendees…"
                                className="input-field pl-9"
                            />
                        </div>
                        <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                            {filteredCandidates.length === 0 ? (
                                <div className="text-xs text-zinc-400 px-2 py-3 text-center">
                                    {searchingCandidates ? 'Searching…' : targetSearch ? 'No matches' : 'Start typing to search all attendees'}
                                </div>
                            ) : (
                                filteredCandidates.map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => addTarget(a.id)}
                                        disabled={dirty}
                                        title={dirty ? 'Save or cancel your changes first' : ''}
                                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 transition-colors group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    >
                                        <div className="text-sm font-medium text-zinc-900 group-hover:text-indigo-700 truncate">{a.name}</div>
                                        <div className="text-xs text-zinc-500 truncate">
                                            {a.title ? `${a.title} · ` : ''}{a.company?.name ?? a.email}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </section>

                    <section className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-zinc-900 mb-3">New media/analyst</h2>
                        <p className="text-xs text-zinc-500 mb-3">Doesn&apos;t exist yet? Create them here and add as a target.</p>
                        <div className={dirty ? 'pointer-events-none opacity-50' : ''} title={dirty ? 'Save or cancel your changes first' : ''}>
                            <AddAttendeeForm
                                eventId={eventId}
                                onSuccess={async (attendee) => {
                                    setAllAttendees(prev => [...prev, attendee as unknown as AttendeeMini])
                                    await addTarget(attendee.id)
                                }}
                            />
                        </div>
                    </section>
                </aside>
            </div>

            <MeetingModal
                isOpen={isMeetingModalOpen}
                onClose={() => { setIsMeetingModalOpen(false); setSelectedMeeting(null); setMeetingError('') }}
                event={selectedMeeting}
                onEventChange={(ev) => setSelectedMeeting({ ...selectedMeeting, ...ev })}
                onSave={handleSaveMeeting}
                onDelete={handleDeleteMeeting}
                rooms={rooms}
                allAttendees={allAttendees as unknown as React.ComponentProps<typeof MeetingModal>['allAttendees']}
                availableTags={currentEvent?.tags ?? []}
                meetingTypes={currentEvent?.meetingTypes ?? []}
                isCreating={isCreatingMeeting}
                error={meetingError}
            />

            <MeetingDetailsModal
                isOpen={isViewModalOpen}
                onClose={() => { setIsViewModalOpen(false); setViewMeeting(null) }}
                meeting={viewMeeting}
                rooms={rooms}
                onEdit={() => {
                    setIsViewModalOpen(false)
                    if (viewMeeting) openEditBriefing(viewMeeting as Meeting)
                }}
            />
        </div>
    )
}
