'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStatusColor } from '@/lib/status-colors'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventRow {
    id: string
    name: string
    slug?: string
    status: string
    budget?: number | null
    actualCost?: number | null
}

const CHECKLIST_FIELDS = [
    'eventRecommendation', 'eventROICompleted', 'approval', 'eventPlanning',
    'campaignPlanning', 'campaignActivation', 'campaignEvaluation',
    'internalAttendeesAdded', 'liveCoverage', 'leadManagement',
    'eventDataCapture', 'eventWrapUp', 'contentAmplification', 'crmUpdate',
    'reportingActivations', 'debriefOnTeamMeeting', 'eventCompleted',
] as const

interface ChecklistData {
    [key: string]: boolean | string | null | object
    finalReport: string | null
    nextYearDecision: string | null
}

interface RoiActuals {
    actualRevenue: number
    actualPipeline: number
    actualCost: number
    actualInvestment: number
    targetCompaniesHit: { id: string; name: string }[]
}

interface RoiTargets {
    budget: number | null
    winRate: number | null
    actualCost: number | null
}

interface EventDashboardData {
    checklist: ChecklistData | null
    actuals: RoiActuals | null
    targets: RoiTargets | null
    hasLinkedIn: boolean
    hasMediaPR: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function countChecklist(checklist: ChecklistData): number {
    return CHECKLIST_FIELDS.filter(f => checklist[f] === true).length
}

function CheckIcon({ complete }: { complete: boolean }) {
    return complete
        ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50 text-green-700 font-bold text-sm">✓</span>
        : <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600 font-bold text-sm">✗</span>
}

function ChecklistBadge({ done, total }: { done: number; total: number }) {
    const all = done === total
    const none = done === 0
    const cls = all
        ? 'bg-green-50 text-green-700 ring-green-200'
        : none
        ? 'bg-red-50 text-red-600 ring-red-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200'
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${cls}`}>
            {done}/{total}
        </span>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EventDashboardTableView({ events }: { events: EventRow[] }) {
    const [data, setData] = useState<Map<string, EventDashboardData | null>>(new Map())
    const [loading, setLoading] = useState(true)

    const eventIds = events.map(e => e.id).join(',')

    useEffect(() => {
        const fetchAll = async () => {
            if (events.length === 0) {
                setData(new Map())
                setLoading(false)
                return
            }
            setLoading(true)
            const entries = await Promise.all(
                events.map(async (event) => {
                    const id = event.id
                    const [roiRes, checklistRes, pitchRes, draftsRes] = await Promise.allSettled([
                        fetch(`/api/events/${id}/roi`).then(r => r.ok ? r.json() : null),
                        fetch(`/api/events/${id}/checklist`).then(r => r.ok ? r.json() : null),
                        fetch(`/api/events/${id}/pitch-targets`).then(r => r.ok ? r.json() : null),
                        fetch(`/api/social/drafts?eventId=${id}`).then(r => r.ok ? r.json() : null),
                    ])

                    const roi = roiRes.status === 'fulfilled' ? roiRes.value : null
                    const checklistRaw = checklistRes.status === 'fulfilled' ? checklistRes.value : null
                    const pitchRaw = pitchRes.status === 'fulfilled' ? pitchRes.value : null
                    const draftsRaw = draftsRes.status === 'fulfilled' ? draftsRes.value : null

                    const hasLinkedIn = Array.isArray(draftsRaw)
                        ? draftsRaw.some((d: { impressions?: number | null; clicks?: number | null }) =>
                            d.impressions != null || d.clicks != null)
                        : false

                    const hasMediaPR = Array.isArray(pitchRaw?.items)
                        ? pitchRaw.items.length > 0
                        : false

                    const eventData: EventDashboardData = {
                        checklist: checklistRaw?.checklist ?? null,
                        actuals: roi?.actuals ?? null,
                        targets: roi?.targets ?? null,
                        hasLinkedIn,
                        hasMediaPR,
                    }
                    return [id, eventData] as [string, EventDashboardData]
                })
            )
            setData(new Map(entries))
            setLoading(false)
        }

        fetchAll()
    }, [eventIds])  // eslint-disable-line react-hooks/exhaustive-deps

    // ── CSV Export ────────────────────────────────────────────────────────────

    const handleExportCsv = () => {
        const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
        const headers = [
            'Event', 'Status', 'Checklist', 'Final Report', 'Next Year Decision',
            'LinkedIn', 'Media/PR', 'Spend', 'Pipeline', 'ROI Ratio', 'Target Companies Met',
        ]
        const rows = events.map(event => {
            const d = data.get(event.id)
            const checklist = d?.checklist
            const checkDone = checklist ? countChecklist(checklist) : 0
            const finalReport = checklist?.finalReport ? 'Yes' : 'No'
            const nextYear = checklist?.nextYearDecision ? 'Yes' : 'No'
            const linkedin = d?.hasLinkedIn ? 'Yes' : 'No'
            const mediaPR = d?.hasMediaPR ? 'Yes' : 'No'

            const actualCost = d?.actuals?.actualCost ?? 0
            const budget = d?.targets?.budget ?? event.budget ?? 0
            const spend = actualCost > 0 ? actualCost : budget
            const spendStr = spend > 0 ? fmtCurrency(spend) : ''
            const pipeline = d?.actuals?.actualPipeline ?? 0
            const pipelineStr = pipeline > 0 ? fmtCurrency(pipeline) : ''

            const revenue = d?.actuals?.actualRevenue ?? 0
            const investment = actualCost > 0 ? actualCost : (d?.actuals?.actualInvestment ?? budget ?? 0)
            const ratio = investment > 0 && revenue > 0 ? `x${(revenue / investment).toFixed(2)}` : ''

            const companies = (d?.actuals?.targetCompaniesHit ?? []).map(c => c.name).join('; ')

            return [
                event.name, event.status,
                `${checkDone}/17`, finalReport, nextYear,
                linkedin, mediaPR, spendStr, pipelineStr, ratio, companies,
            ].map(escape).join(',')
        })

        const csv = [headers.map(escape).join(','), ...rows].join('\n')
        const now = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `event-dashboard-${now}.csv`
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    // ── Empty state ────────────────────────────────────────────────────────────

    if (events.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm text-center text-neutral-500 py-20">
                No events match the current filters.
            </div>
        )
    }

    // ── Table ─────────────────────────────────────────────────────────────────

    return (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            {/* Header */}
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-neutral-900">Event Health Dashboard</h2>
                    <p className="text-sm text-neutral-500 mt-0.5">At-a-glance readiness for all filtered events.</p>
                </div>
                <button
                    onClick={handleExportCsv}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm disabled:opacity-40"
                >
                    Export CSV
                </button>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        <th className="text-left px-5 py-3 min-w-[180px]">Event</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Status</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Checklist</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Final Report</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Next Year</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">LinkedIn</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Media / PR</th>
                        <th className="px-3 py-3 text-right whitespace-nowrap">Spend</th>
                        <th className="px-3 py-3 text-right whitespace-nowrap">Pipeline</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">ROI Ratio</th>
                        <th className="px-5 py-3 text-left whitespace-nowrap">Target Co. Met</th>
                    </tr>
                </thead>
                <tbody>
                    {events.map((event, i) => {
                        const d = data.get(event.id)
                        const isLoading = loading || d === undefined
                        const checklist = d?.checklist ?? null
                        const checkDone = checklist ? countChecklist(checklist) : 0
                        const hasFinalReport = !!(checklist?.finalReport)
                        const hasNextYear = !!(checklist?.nextYearDecision)

                        const actualCost = d?.actuals?.actualCost ?? 0
                        const budget = d?.targets?.budget ?? event.budget ?? 0
                        const spend = actualCost > 0 ? actualCost : budget

                        const revenue = d?.actuals?.actualRevenue ?? 0
                        const investment = actualCost > 0 ? actualCost : (d?.actuals?.actualInvestment ?? budget ?? 0)
                        const roiRatio = investment > 0 ? revenue / investment : null

                        const companiesHit = d?.actuals?.targetCompaniesHit ?? []
                        const statusColors = getStatusColor(event.status)

                        const rowBg = i % 2 === 0 ? '' : 'bg-neutral-50/50'

                        return (
                            <tr key={event.id} className={`border-b border-neutral-100 ${rowBg} hover:bg-blue-50/20 transition-colors`}>
                                {/* Event name */}
                                <td className="px-5 py-3">
                                    <Link
                                        href={`/events/${event.slug || event.id}/roi`}
                                        className="font-medium text-neutral-900 hover:text-blue-600 hover:underline transition-colors line-clamp-1"
                                    >
                                        {event.name}
                                    </Link>
                                </td>

                                {/* Status */}
                                <td className="px-3 py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase ${statusColors.className}`}>
                                        {event.status}
                                    </span>
                                </td>

                                {isLoading ? (
                                    // Loading skeleton for data columns
                                    <td colSpan={8} className="px-3 py-3 text-center">
                                        <span className="inline-block w-40 h-4 bg-neutral-100 rounded animate-pulse" />
                                    </td>
                                ) : (
                                    <>
                                        {/* Checklist */}
                                        <td className="px-3 py-3 text-center">
                                            {checklist
                                                ? <ChecklistBadge done={checkDone} total={17} />
                                                : <span className="text-neutral-300 text-xs">—</span>
                                            }
                                        </td>

                                        {/* Final Report */}
                                        <td className="px-3 py-3 text-center">
                                            <CheckIcon complete={hasFinalReport} />
                                        </td>

                                        {/* Next Year Decision */}
                                        <td className="px-3 py-3 text-center">
                                            <CheckIcon complete={hasNextYear} />
                                        </td>

                                        {/* LinkedIn */}
                                        <td className="px-3 py-3 text-center">
                                            <CheckIcon complete={d?.hasLinkedIn ?? false} />
                                        </td>

                                        {/* Media / PR */}
                                        <td className="px-3 py-3 text-center">
                                            <CheckIcon complete={d?.hasMediaPR ?? false} />
                                        </td>

                                        {/* Spend */}
                                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">
                                            {spend > 0 ? (
                                                <span>
                                                    {fmtCurrency(spend)}
                                                    {actualCost > 0 && (
                                                        <span className="ml-1 text-[10px] font-semibold text-neutral-400 uppercase">actual</span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="text-neutral-300">—</span>
                                            )}
                                        </td>

                                        {/* Pipeline */}
                                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">
                                            {(d?.actuals?.actualPipeline ?? 0) > 0
                                                ? fmtCurrency(d!.actuals!.actualPipeline)
                                                : <span className="text-neutral-300">—</span>
                                            }
                                        </td>

                                        {/* ROI Ratio */}
                                        <td className="px-3 py-3 text-center tabular-nums">
                                            {roiRatio != null && investment > 0 && revenue > 0 ? (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${
                                                    roiRatio >= 1
                                                        ? 'bg-green-50 text-green-700 ring-green-200'
                                                        : 'bg-red-50 text-red-600 ring-red-200'
                                                }`}>
                                                    x{roiRatio.toFixed(1)}
                                                </span>
                                            ) : (
                                                <span className="text-neutral-300">—</span>
                                            )}
                                        </td>

                                        {/* Target Companies Met */}
                                        <td className="px-5 py-3">
                                            {companiesHit.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {companiesHit.map(c => (
                                                        <span key={c.id} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 text-xs font-medium whitespace-nowrap">
                                                            {c.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-red-400 text-xs font-medium">None</span>
                                            )}
                                        </td>
                                    </>
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
