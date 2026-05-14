'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, ExternalLink } from 'lucide-react'
import type { MeetingStatus } from '@prisma/client'
import type { BriefingStatusResult } from '@/lib/pitch-status'

export interface PitchMeetingForCounts {
    id: string
    status: MeetingStatus
    attendees: { id: string }[]
}

export interface PitchTarget {
    attendeeId: string
    attendee: {
        id: string
        name: string
        email: string
        title?: string | null
        isExternal?: boolean
        company: { id: string; name: string } | null
    }
    resultingUrls: string | null
    additionalNotes: string | null
    briefing: BriefingStatusResult
}

interface PitchTargetsTableProps {
    pitchId: string
    targets: PitchTarget[]
    meetings: PitchMeetingForCounts[]
    onChange: (targets: PitchTarget[]) => void
    onRemove: (attendeeId: string) => void
}

const COUNT_STATUSES: MeetingStatus[] = ['PIPELINE', 'CONFIRMED', 'OCCURRED']

const STATUS_STYLES: Record<string, string> = {
    NOT_SCHEDULED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    PIPELINE: 'bg-amber-50 text-amber-700 border-amber-200',
    CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    OCCURRED: 'bg-zinc-200 text-zinc-700 border-zinc-300',
    CANCELED: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
    NOT_SCHEDULED: 'Not scheduled',
    PIPELINE: 'Pipeline',
    CONFIRMED: 'Confirmed',
    OCCURRED: 'Occurred',
    CANCELED: 'Canceled',
}

export default function PitchTargetsTable({ pitchId, targets, meetings, onChange, onRemove }: PitchTargetsTableProps) {
    if (targets.length === 0) {
        return (
            <div className="text-center py-12 text-zinc-500 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                No target audience yet. Use the panel on the left to add media or analysts.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {targets.map(target => (
                <TargetRow
                    key={target.attendeeId}
                    pitchId={pitchId}
                    target={target}
                    meetings={meetings}
                    onPatch={(patch) => {
                        onChange(
                            targets.map(t => t.attendeeId === target.attendeeId ? { ...t, ...patch } : t)
                        )
                    }}
                    onRemove={() => onRemove(target.attendeeId)}
                />
            ))}
        </div>
    )
}

function TargetRow({
    pitchId,
    target,
    meetings,
    onPatch,
    onRemove,
}: {
    pitchId: string
    target: PitchTarget
    meetings: PitchMeetingForCounts[]
    onPatch: (patch: Partial<PitchTarget>) => void
    onRemove: () => void
}) {
    const [urls, setUrls] = useState(target.resultingUrls ?? '')
    const [notes, setNotes] = useState(target.additionalNotes ?? '')
    const [saving, setSaving] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => { setUrls(target.resultingUrls ?? '') }, [target.resultingUrls])
    useEffect(() => { setNotes(target.additionalNotes ?? '') }, [target.additionalNotes])

    const schedulePersist = (next: { resultingUrls?: string; additionalNotes?: string }) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(async () => {
            setSaving(true)
            try {
                const res = await fetch(`/api/pitches/${pitchId}/targets/${target.attendeeId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(next),
                })
                if (res.ok) {
                    onPatch({
                        resultingUrls: next.resultingUrls ?? target.resultingUrls,
                        additionalNotes: next.additionalNotes ?? target.additionalNotes,
                    })
                }
            } finally {
                setSaving(false)
            }
        }, 600)
    }

    const counts: Record<MeetingStatus, number> = { PIPELINE: 0, CONFIRMED: 0, OCCURRED: 0, CANCELED: 0 }
    for (const m of meetings) {
        if (m.attendees.some(a => a.id === target.attendeeId)) {
            counts[m.status] = (counts[m.status] ?? 0) + 1
        }
    }
    const urlList = (urls || '').split(',').map(u => u.trim()).filter(Boolean)

    return (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-zinc-900">{target.attendee.name}</span>
                        {target.attendee.title && (
                            <span className="text-sm text-zinc-500">· {target.attendee.title}</span>
                        )}
                        {target.attendee.company && (
                            <span className="text-sm text-zinc-500">@ {target.attendee.company.name}</span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">{target.attendee.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {COUNT_STATUSES.map(s => (
                            <span
                                key={s}
                                className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${STATUS_STYLES[s]} ${counts[s] === 0 ? 'opacity-50' : ''}`}
                            >
                                {STATUS_LABELS[s]} ({counts[s]})
                            </span>
                        ))}
                    </div>
                    <button
                        onClick={onRemove}
                        title="Remove target"
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">
                        Resulting URLs <span className="text-zinc-400">(comma-separated)</span>
                    </label>
                    <textarea
                        value={urls}
                        onChange={e => { setUrls(e.target.value); schedulePersist({ resultingUrls: e.target.value }) }}
                        placeholder="https://…, https://…"
                        rows={2}
                        className="input-field text-sm resize-none"
                    />
                    {urlList.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {urlList.map((url, i) => (
                                <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    {url.length > 40 ? url.slice(0, 37) + '…' : url}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Additional notes</label>
                    <textarea
                        value={notes}
                        onChange={e => { setNotes(e.target.value); schedulePersist({ additionalNotes: e.target.value }) }}
                        placeholder="Coverage angle, follow-ups, etc."
                        rows={2}
                        className="input-field text-sm resize-none"
                    />
                </div>
            </div>
            {saving && <div className="mt-2 text-xs text-zinc-400">Saving…</div>}
        </div>
    )
}
