'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/components/auth'
import { CheckSquare, Square, Save, AlertTriangle, Info, CheckCircle2, Circle } from 'lucide-react'
import Link from 'next/link'

type CheckboxKey =
    | 'eventRecommendation'
    | 'eventROICompleted'
    | 'approval'
    | 'eventPlanning'
    | 'campaignPlanning'
    | 'campaignActivation'
    | 'campaignEvaluation'
    | 'internalAttendeesAdded'
    | 'liveCoverage'
    | 'leadManagement'
    | 'eventDataCapture'
    | 'eventWrapUp'
    | 'contentAmplification'
    | 'crmUpdate'
    | 'reportingActivations'
    | 'debriefOnTeamMeeting'
    | 'eventCompleted'

type ChecklistState = {
    [K in CheckboxKey]: boolean
} & {
    finalReport: string
    notes: Record<string, string>
    nextYearDecision: string
}

const EMPTY_CHECKLIST: ChecklistState = {
    eventRecommendation: false,
    eventROICompleted: false,
    approval: false,
    eventPlanning: false,
    campaignPlanning: false,
    campaignActivation: false,
    campaignEvaluation: false,
    internalAttendeesAdded: false,
    liveCoverage: false,
    leadManagement: false,
    eventDataCapture: false,
    eventWrapUp: false,
    contentAmplification: false,
    crmUpdate: false,
    reportingActivations: false,
    debriefOnTeamMeeting: false,
    eventCompleted: false,
    finalReport: '',
    notes: {},
    nextYearDecision: '',
}

const SECTIONS = [
    {
        id: 'pre',
        label: 'Pre-Event',
        items: [
            {
                key: 'eventRecommendation' as CheckboxKey,
                label: 'Event Recommendation',
                description: 'Highlight the business reasons. Set event status to "PIPELINE" in event-planner tool.',
            },
            {
                key: 'eventROICompleted' as CheckboxKey,
                label: 'Event ROI Completed',
                description: 'Complete all ROI requirements in event-planner tool.',
            },
            {
                key: 'approval' as CheckboxKey,
                label: 'Approval',
                description: 'Secure event approval. Set event status to "COMMITTED" in event-planner tool. If approval rejected, set event status to "CANCELLED" and provide reason in final report field.',
            },
            {
                key: 'eventPlanning' as CheckboxKey,
                label: 'Event Planning',
                description: 'Create detailed marketing plan (include in event-planner ROI Dashboard) and event project plan.',
            },
            {
                key: 'campaignPlanning' as CheckboxKey,
                label: 'Campaign Planning',
                description: 'Finalize the pre-event strategy, campaign plan, and Key Performance Indicators (KPIs).',
            },
            {
                key: 'campaignActivation' as CheckboxKey,
                label: 'Campaign Activation',
                description: 'Start the pre-event campaign(s).',
            },
            {
                key: 'campaignEvaluation' as CheckboxKey,
                label: 'Campaign(s) Evaluation',
                description: 'Fill in campaign results in event-planner tool and evaluate against KPIs.',
            },
        ],
    },
    {
        id: 'during',
        label: 'During-Event',
        items: [
            {
                key: 'internalAttendeesAdded' as CheckboxKey,
                label: 'Add all internal attendees at event',
                description: 'Ensure all internal attendees are logged in the event-planner tool.',
            },
            {
                key: 'liveCoverage' as CheckboxKey,
                label: 'Live Coverage',
                description: 'Execute social media coverage and capture live customer stories and content.',
            },
            {
                key: 'leadManagement' as CheckboxKey,
                label: 'Lead Management',
                description: 'Record all external meetings, meeting details and attendees.',
            },
        ],
    },
    {
        id: 'post',
        label: 'Post-Event',
        items: [
            {
                key: 'eventDataCapture' as CheckboxKey,
                label: 'Event Data Capture',
                description: 'All internal attendees, external contacts and companies, and meets are logged in event-planner tool.',
            },
            {
                key: 'eventWrapUp' as CheckboxKey,
                label: 'Event Wrap-up',
                description: 'Close out vendors, reconcile the budget, gather feedback, send thank-you emails, finalize post-event content and campaigns.',
            },
            {
                key: 'contentAmplification' as CheckboxKey,
                label: 'Content & Amplification',
                description: 'Consolidate event content and amplify coverage (press releases, case studies, interviews).',
            },
            {
                key: 'crmUpdate' as CheckboxKey,
                label: 'CRM Update',
                description: 'Upload all final lead data to the CRM.',
            },
            {
                key: 'reportingActivations' as CheckboxKey,
                label: 'Reporting & Activations',
                description: 'Complete final event reporting in event-planner tool.',
            },
            {
                key: 'debriefOnTeamMeeting' as CheckboxKey,
                label: 'Debrief on Team Meeting',
                description: 'Hold an internal team debrief meeting to review event outcomes, capture learnings, and agree on next steps.',
            },
            {
                key: 'eventCompleted' as CheckboxKey,
                label: 'Event Completed',
                description: 'Event status is set to "OCCURRED".',
            },
        ],
    },
] as const

const CHECKBOX_KEYS = SECTIONS.flatMap(s => s.items.map(i => i.key))
const TOTAL = CHECKBOX_KEYS.length

export default function ChecklistPage() {
    const { id: eventId } = useParams<{ id: string }>()
    const router = useRouter()
    const { user } = useUser()
    const [checklist, setChecklist] = useState<ChecklistState>(EMPTY_CHECKLIST)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [eventStatus, setEventStatus] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(null)
    const [toggleError, setToggleError] = useState<string | null>(null)
    const savedReportRef = useRef<string>('')
    const savedNotesRef = useRef<Record<string, string>>({})
    const savedNextYearRef = useRef<string>('')

    const role = user?.publicMetadata?.role as string
    const canEdit = role === 'root' || role === 'marketing'

    useEffect(() => {
        if (!user) return
        if (!canEdit) return

        fetch(`/api/events/${eventId}/checklist`)
            .then(res => {
                if (res.status === 403) {
                    router.replace('/events')
                    return null
                }
                return res.json()
            })
            .then(data => {
                if (!data) return
                if (data.checklist) {
                    const cl = data.checklist
                    const loadedNotes = (cl.notes as Record<string, string>) ?? {}
                    setChecklist({
                        eventRecommendation: cl.eventRecommendation ?? false,
                        eventROICompleted: cl.eventROICompleted ?? false,
                        approval: cl.approval ?? false,
                        eventPlanning: cl.eventPlanning ?? false,
                        campaignPlanning: cl.campaignPlanning ?? false,
                        campaignActivation: cl.campaignActivation ?? false,
                        campaignEvaluation: cl.campaignEvaluation ?? false,
                        internalAttendeesAdded: cl.internalAttendeesAdded ?? false,
                        liveCoverage: cl.liveCoverage ?? false,
                        leadManagement: cl.leadManagement ?? false,
                        eventDataCapture: cl.eventDataCapture ?? false,
                        eventWrapUp: cl.eventWrapUp ?? false,
                        contentAmplification: cl.contentAmplification ?? false,
                        crmUpdate: cl.crmUpdate ?? false,
                        reportingActivations: cl.reportingActivations ?? false,
                        debriefOnTeamMeeting: cl.debriefOnTeamMeeting ?? false,
                        eventCompleted: cl.eventCompleted ?? false,
                        finalReport: cl.finalReport ?? '',
                        notes: loadedNotes,
                        nextYearDecision: cl.nextYearDecision ?? '',
                    })
                    savedReportRef.current = cl.finalReport ?? ''
                    savedNotesRef.current = loadedNotes
                    savedNextYearRef.current = cl.nextYearDecision ?? ''
                }
            })
            .catch(err => console.error('Failed to load checklist:', err))
            .finally(() => setLoading(false))
    }, [eventId, user, canEdit, router])

    useEffect(() => {
        if (!eventId) return
        fetch(`/api/events/${eventId}/roi`)
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data?.eventStatus) setEventStatus(data.eventStatus) })
            .catch(() => { /* non-critical */ })
    }, [eventId])

    const reportDirty = checklist.finalReport !== savedReportRef.current
    const notesDirty = JSON.stringify(checklist.notes) !== JSON.stringify(savedNotesRef.current)
    const nextYearDirty = checklist.nextYearDecision !== savedNextYearRef.current
    const isDirty = reportDirty || notesDirty || nextYearDirty

    // Warn on browser-level navigation (refresh, tab close, external URL)
    useEffect(() => {
        if (!isDirty) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isDirty])

    // Warn on in-app Next.js navigation (sidebar links, etc.)
    useEffect(() => {
        if (!isDirty) return
        const handler = (e: MouseEvent) => {
            const anchor = (e.target as HTMLElement).closest('a')
            if (!anchor) return
            const href = anchor.getAttribute('href')
            if (!href || href.startsWith('#')) return
            if (!window.confirm('You have unsaved changes. Leave without saving?')) {
                e.preventDefault()
                e.stopPropagation()
            }
        }
        document.addEventListener('click', handler, true)
        return () => document.removeEventListener('click', handler, true)
    }, [isDirty])

    const handleToggle = async (key: CheckboxKey) => {
        const newValue = !checklist[key]
        setChecklist(prev => ({ ...prev, [key]: newValue }))
        setToggleError(null)

        try {
            const res = await fetch(`/api/events/${eventId}/checklist`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: newValue }),
            })
            if (!res.ok) throw new Error('Save failed')
        } catch {
            setChecklist(prev => ({ ...prev, [key]: !newValue }))
            setToggleError('Failed to save. Please try again.')
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setSaveMessage(null)
        try {
            const res = await fetch(`/api/events/${eventId}/checklist`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notes: checklist.notes,
                    finalReport: checklist.finalReport,
                    nextYearDecision: checklist.nextYearDecision || null,
                }),
            })
            if (!res.ok) throw new Error('Save failed')
            savedReportRef.current = checklist.finalReport
            savedNotesRef.current = { ...checklist.notes }
            savedNextYearRef.current = checklist.nextYearDecision
            setSaveMessage('Saved.')
            setTimeout(() => setSaveMessage(null), 3000)
        } catch {
            setSaveMessage('Failed to save.')
        } finally {
            setSaving(false)
        }
    }

    const completedCount = CHECKBOX_KEYS.filter(k => checklist[k]).length

    if (!user) return null

    if (!canEdit) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-16 text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Access Restricted</h2>
                <p className="text-zinc-500">The marketing checklist is only available to root and marketing roles.</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-zinc-100 rounded w-1/3" />
                    <div className="h-4 bg-zinc-100 rounded w-full" />
                    <div className="h-4 bg-zinc-100 rounded w-5/6" />
                </div>
            </div>
        )
    }

    const SaveButton = ({ className = '' }: { className?: string }) => (
        <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${className}`}
        >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
        </button>
    )

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Marketing Execution Checklist</h1>
                    <p className="mt-1 text-sm text-zinc-500">Track all marketing activities for this event from recommendation through wrap-up.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 pt-1">
                    {saveMessage && (
                        <span className={`text-sm ${saveMessage.startsWith('Failed') ? 'text-red-500' : 'text-teal-600'}`}>
                            {saveMessage}
                        </span>
                    )}
                    {isDirty && !saveMessage && (
                        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                            Unsaved changes
                        </span>
                    )}
                    <SaveButton />
                </div>
            </div>

            {/* Event Execution Status */}
            {(() => {
                const checklistComplete = completedCount >= TOTAL
                const reportComplete = checklist.finalReport.trim().length > 0
                const nextYearComplete = checklist.nextYearDecision.length > 0
                const statusComplete = eventStatus === 'OCCURRED'
                const doneCount = [checklistComplete, reportComplete, nextYearComplete, statusComplete].filter(Boolean).length
                const allComplete = doneCount === 4
                const readyForOccurred = checklistComplete && reportComplete && nextYearComplete

                const steps = [
                    {
                        label: 'Checklist Items',
                        detail: checklistComplete
                            ? `${TOTAL} / ${TOTAL} complete`
                            : `${completedCount} / ${TOTAL} complete`,
                        done: checklistComplete,
                    },
                    {
                        label: 'Final Report',
                        detail: reportComplete ? 'Submitted' : 'Not yet written',
                        done: reportComplete,
                    },
                    {
                        label: 'Next Year Decision',
                        detail: nextYearComplete
                            ? checklist.nextYearDecision.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                            : 'No selection made',
                        done: nextYearComplete,
                    },
                    {
                        label: 'Event Status',
                        detail: statusComplete ? 'OCCURRED' : (eventStatus ?? '—'),
                        done: statusComplete,
                        hint: !statusComplete && readyForOccurred ? 'Set status to OCCURRED in Event Settings' : undefined,
                        hintLink: !statusComplete && readyForOccurred ? `/events/${eventId}/settings` : undefined,
                    },
                ]

                return (
                    <div className={`bg-white border rounded-xl overflow-hidden ${allComplete ? 'border-teal-300' : 'border-zinc-200'}`}>
                        <div className={`px-5 py-3 border-b flex items-center justify-between ${allComplete ? 'bg-teal-50 border-teal-200' : 'bg-zinc-50 border-zinc-100'}`}>
                            <h2 className={`text-sm font-semibold uppercase tracking-wide ${allComplete ? 'text-teal-700' : 'text-zinc-700'}`}>
                                {allComplete ? 'All Wrap-Up Tasks Complete' : 'Event Execution Status'}
                            </h2>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${allComplete ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                                {doneCount} / 4 done
                            </span>
                        </div>
                        <ul className="divide-y divide-zinc-100">
                            {steps.map((step, i) => (
                                <li key={i} className="flex items-center gap-3 px-5 py-3">
                                    {step.done
                                        ? <CheckCircle2 className="h-5 w-5 text-teal-500 shrink-0" />
                                        : <Circle className="h-5 w-5 text-zinc-300 shrink-0" />
                                    }
                                    <span className={`text-sm font-medium w-44 shrink-0 ${step.done ? 'text-zinc-500' : 'text-zinc-900'}`}>{step.label}</span>
                                    <span className={`text-sm flex-1 ${step.done ? 'text-zinc-400' : 'text-zinc-600'}`}>{step.detail}</span>
                                    {step.done
                                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">Complete</span>
                                        : step.hint && step.hintLink
                                            ? <Link href={step.hintLink} className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap">{step.hint}</Link>
                                            : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
                                    }
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            })()}

            {/* Toggle error */}
            {toggleError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {toggleError}
                </div>
            )}

            {/* Checklist Sections */}
            {SECTIONS.map(section => (
                <div key={section.id} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
                        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">{section.label}</h2>
                    </div>
                    <ul className="divide-y divide-zinc-100">
                        {section.items.map(item => {
                            const checked = checklist[item.key]
                            return (
                                <li key={item.key}>
                                    <div className="flex items-stretch divide-x divide-zinc-100">
                                        <button
                                            onClick={() => handleToggle(item.key)}
                                            className="flex-1 flex items-start gap-3 px-5 py-4 text-left hover:bg-zinc-50 transition-colors group"
                                        >
                                            <span className="mt-0.5 shrink-0">
                                                {checked
                                                    ? <CheckSquare className="h-5 w-5 text-teal-500" />
                                                    : <Square className="h-5 w-5 text-zinc-300 group-hover:text-zinc-400" />
                                                }
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className={`block text-sm font-medium ${checked ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                                                    {item.label}
                                                </span>
                                                <span className="block text-xs text-zinc-400 mt-0.5">{item.description}</span>
                                            </span>
                                            {checked && <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal-400 shrink-0" />}
                                        </button>
                                        <div className="w-56 px-3 py-4 flex items-start">
                                            <textarea
                                                rows={2}
                                                placeholder="Notes…"
                                                value={checklist.notes[item.key] ?? ''}
                                                onChange={e => setChecklist(prev => ({
                                                    ...prev,
                                                    notes: { ...prev.notes, [item.key]: e.target.value },
                                                }))}
                                                className="w-full text-xs text-zinc-700 border border-zinc-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder:text-zinc-300"
                                            />
                                        </div>
                                    </div>
                                    {/* Event Completed callout */}
                                    {item.key === 'eventCompleted' && checked && (
                                        <div className="mx-5 mb-4 flex items-start gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
                                            <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                            <span>All marketing activities complete. Update the event status to <strong>OCCURRED</strong> in Event Settings.</span>
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </div>
            ))}

            {/* Final Report */}
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
                    <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">Final Event Report</h2>
                </div>
                <div className="p-5 space-y-4">
                    <p className="text-sm text-zinc-500">Write the final marketing report for this event. Summarize outcomes, lessons learned, and recommendations for future events.</p>
                    <textarea
                        value={checklist.finalReport}
                        onChange={e => setChecklist(prev => ({ ...prev, finalReport: e.target.value }))}
                        rows={10}
                        placeholder="Enter your final event report here..."
                        className="w-full text-sm text-zinc-900 border border-zinc-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y placeholder:text-zinc-300"
                    />
                </div>
            </div>

            {/* Next Year Decision */}
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
                    <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">Next Year Decision</h2>
                </div>
                <div className="p-5 space-y-4">
                    <p className="text-sm text-zinc-500">Select whether to attend this event next year.</p>
                    <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
                        {([
                            { value: 'double_down', label: 'Double Down', sub: 'Increase budget next year' },
                            { value: 'maintain', label: 'Maintain', sub: 'Keep same budget/footprint' },
                            { value: 'pivot', label: 'Pivot/Downgrade', sub: 'Send fewer people, skip the booth' },
                            { value: 'cancel', label: 'Cancel', sub: 'Do not attend next year' },
                        ] as const).map(option => (
                            <li key={option.value}>
                                <label className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-zinc-50 transition-colors">
                                    <input
                                        type="radio"
                                        name="nextYearDecision"
                                        value={option.value}
                                        checked={checklist.nextYearDecision === option.value}
                                        onChange={() => setChecklist(prev => ({ ...prev, nextYearDecision: option.value }))}
                                        className="h-4 w-4 text-teal-500 border-zinc-300 focus:ring-teal-500"
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-medium text-zinc-900">{option.label}</span>
                                        <span className="block text-xs text-zinc-400 mt-0.5">{option.sub}</span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Bottom Save */}
            <div className="flex items-center justify-end gap-3 pb-4">
                {saveMessage && (
                    <span className={`text-sm ${saveMessage.startsWith('Failed') ? 'text-red-500' : 'text-teal-600'}`}>
                        {saveMessage}
                    </span>
                )}
                {isDirty && !saveMessage && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                        Unsaved changes
                    </span>
                )}
                <SaveButton />
            </div>
        </div>
    )
}
