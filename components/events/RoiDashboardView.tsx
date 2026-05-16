'use client'

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'
import { getStatusColor } from '@/lib/status-colors'

interface Event {
    id: string
    name: string
    slug?: string
    startDate: string | null
    endDate: string | null
    region: string | null
    status: string
}

interface RoiTargets {
    budget: number | null
    expectedPipeline: number | null
    winRate: number | null
    expectedRevenue: number | null
    actualCost: number | null
    targetCustomerMeetings: number | null
    targetEventScans: number | null
    targetSpeaking: number | null
    targetMediaPR: number | null
    targetCompanies: Array<{ id: string; name: string; pipelineValue?: number | null }>
    status: string
}

interface RoiActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualCustomerMeetings: number
    targetCompaniesHit: Array<{ id: string; name: string }>
    targetCompaniesHitCount: number
    additionalCompanies: Array<{ id: string; name: string; pipelineValue?: number | null }>
    actualErta: number
    actualSpeaking: number
    actualMediaPR: number
    actualEventScans: number
    actualCost: number
}

interface PitchRow {
    attendee: {
        id: string
        name: string
        title: string | null
        isExternal: boolean
        company: { id: string; name: string } | null
    }
    pipelineCount: number
    committedCount: number
    occurredCount: number
    urls: string[]
    pitchCount: number
}

interface AttendeeRow {
    id: string
    name: string
    title: string | null
    isExternal: boolean
    companyId: string | null
    company: { id: string; name: string } | null
    eventCount: number
}

interface EventRoiData {
    roi: { targets: RoiTargets; actuals: RoiActuals; eventStatus: string | null } | null
    pitchTargets: PitchRow[]
    linkedInTargetCompanies: string[]
    linkedInEngagedCompanies: Array<{ id: string; name: string; pipelineValue?: number | null }>
    attendees: AttendeeRow[]
}

const EXEC_REGEX = /(VP|C[A-Z]{1,3}O|Chief|Director|President|Executive|SVP|EVP|Head of|Partner|Managing Director)/i

// ── Fixed 16:9 design box ────────────────────────────────────────────────────
const BOX_W = 1280
const BOX_H = 720
const PAD = 24
const HEADER_H = 84
const BODY_GAP = 16
const LEFT_W = 452
const COL_GAP = 20
const RIGHT_W = BOX_W - 2 * PAD - LEFT_W - COL_GAP // 760
const BODY_Y = PAD + HEADER_H + BODY_GAP
const BODY_H = BOX_H - PAD - BODY_Y // 572

// Right column: 3 stacked panels (gaps 12), 45/30/25 split
const PANEL_GAP = 12
const RIGHT_CONTENT_H = BODY_H - 2 * PANEL_GAP // 548
const COMP_PANEL_H = Math.round(RIGHT_CONTENT_H * 0.45)
const LEADS_PANEL_H = Math.round(RIGHT_CONTENT_H * 0.30)
const MEDIA_PANEL_H = RIGHT_CONTENT_H - COMP_PANEL_H - LEADS_PANEL_H
const PANEL_HEAD_H = 30

const ROW_C = 26
const ROW_L = 30
const ROW_M = 32
const MAX_COMPANIES = Math.floor((COMP_PANEL_H - PANEL_HEAD_H) / ROW_C)
const MAX_LEADS = Math.floor((LEADS_PANEL_H - PANEL_HEAD_H) / ROW_L)
const MAX_MEDIA = Math.floor((MEDIA_PANEL_H - PANEL_HEAD_H) / ROW_M)

const fmtCurrency = (v: number | null | undefined, compact = false) => {
    if (v == null || v === 0) return '—'
    if (compact && Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (compact && Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const fmtDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const pctOf = (actual: number, target: number | null | undefined) => {
    if (!target || target === 0) return null
    return Math.round((actual / target) * 100)
}

const kpiColor = (pct: number | null): string => {
    if (pct == null) return 'text-neutral-400'
    if (pct >= 100) return 'text-emerald-600'
    if (pct >= 70) return 'text-amber-600'
    return 'text-red-500'
}

const kpiBg = (pct: number | null): string => {
    if (pct == null) return 'bg-neutral-50 text-neutral-500 border-neutral-200'
    if (pct >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (pct >= 70) return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-red-50 text-red-700 border-red-200'
}

const hostOf = (url: string) => {
    try { return new URL(url).hostname.replace('www.', '') }
    catch { return url.slice(0, 24) }
}

// ── Tier colour maps ─────────────────────────────────────────────────────────
const tierDot: Record<number, string> = {
    1: 'bg-emerald-500',
    2: 'bg-blue-500',
    3: 'bg-neutral-400',
}
const tierText: Record<number, string> = {
    1: 'text-emerald-700',
    2: 'text-blue-700',
    3: 'text-neutral-500',
}

// ── Scaled 16:9 wrapper ──────────────────────────────────────────────────────
function ScaledSlide({ children, slideRef }: { children: React.ReactNode; slideRef?: React.Ref<HTMLDivElement> }) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(0)

    useLayoutEffect(() => {
        const el = wrapRef.current
        if (!el) return
        const measure = () => setScale(el.clientWidth / BOX_W)
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    return (
        <div ref={wrapRef} className="w-full" style={{ height: scale ? scale * BOX_H : undefined, aspectRatio: scale ? undefined : '16 / 9' }}>
            <div
                ref={slideRef}
                style={{ width: BOX_W, height: BOX_H, transform: `scale(${scale || 0.0001})`, transformOrigin: 'top left' }}
            >
                {children}
            </div>
        </div>
    )
}

// ── Outcome tile (Pipeline / Revenue) ────────────────────────────────────────
function OutcomeTile({ label, actual, target }: { label: string; actual: number | null; target: number | null }) {
    const pct = pctOf(actual ?? 0, target)
    const barW = pct != null ? Math.min(100, pct) : 0
    return (
        <div className="flex-1 bg-white rounded-xl border border-neutral-200 px-5 py-4 flex flex-col justify-center">
            <div className="text-[13px] font-bold uppercase tracking-widest text-neutral-400">{label}</div>
            <div className={`text-[34px] leading-none font-bold tabular-nums mt-1 ${kpiColor(pct)}`}>
                {fmtCurrency(actual, true)}
            </div>
            {target != null && target > 0 && (
                <>
                    <div className="mt-3 h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${pct != null && pct >= 100 ? 'bg-emerald-500' : pct != null && pct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${barW}%` }}
                        />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[13px]">
                        <span className="text-neutral-400">target {fmtCurrency(target, true)}</span>
                        {pct != null && <span className={`font-bold ${kpiColor(pct)}`}>{pct}%</span>}
                    </div>
                </>
            )}
        </div>
    )
}

// ── Secondary KPI gauge chip ─────────────────────────────────────────────────
function GaugeChip({ label, actual, target }: { label: string; actual: number | null; target: number | null }) {
    const pct = actual != null && target ? pctOf(actual ?? 0, target) : null
    return (
        <div className={`rounded-lg px-3 py-2 border ${kpiBg(pct)}`}>
            <div className="flex items-baseline justify-between">
                <span className={`text-xl font-bold tabular-nums ${kpiColor(pct)}`}>{actual ?? 0}</span>
                {target != null && target > 0 && <span className="text-[11px] text-neutral-400">/ {target}</span>}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mt-0.5 leading-tight">{label}</div>
        </div>
    )
}

// ── Right-column panel shell ─────────────────────────────────────────────────
function Panel({ title, count, height, legend, children }: {
    title: string; count?: number; height: number; legend?: React.ReactNode; children: React.ReactNode
}) {
    return (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden flex flex-col" style={{ height }}>
            <div className="flex items-center justify-between px-4 bg-neutral-50 border-b border-neutral-200" style={{ height: PANEL_HEAD_H }}>
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold uppercase tracking-widest text-neutral-600">{title}</span>
                    {count != null && (
                        <span className="text-[12px] font-semibold text-neutral-400">{count}</span>
                    )}
                </div>
                {legend}
            </div>
            <div className="flex-1 min-h-0 px-4 py-2">{children}</div>
        </div>
    )
}

// ── Tier derivation ──────────────────────────────────────────────────────────
interface CompanyEntry { id: string; name: string; tier: number; pipelineValue: number }
interface LeadEntry { id: string; name: string; title: string; companyName: string; tier: number; pipelineValue: number; isExec: boolean }

function deriveSlide(data: EventRoiData | undefined) {
    const targets = data?.roi?.targets ?? null
    const actuals = data?.roi?.actuals ?? null
    const attendees = data?.attendees ?? []

    const targetCompanyIds = new Set<string>((targets?.targetCompanies ?? []).map(c => c.id))
    ;(actuals?.targetCompaniesHit ?? []).forEach(c => targetCompanyIds.add(c.id))

    // Max events any external attendee of a company has been linked to
    const companyEventMax = new Map<string, number>()
    for (const a of attendees) {
        if (!a.company) continue
        companyEventMax.set(a.company.id, Math.max(companyEventMax.get(a.company.id) ?? 0, a.eventCount ?? 1))
    }

    // Pipeline map: targeted companies use targets.targetCompanies pipelineValue; additional use their own
    const pipelineByCompany = new Map<string, number>()
    for (const c of targets?.targetCompanies ?? []) {
        if (c.pipelineValue) pipelineByCompany.set(c.id, c.pipelineValue)
    }
    for (const c of actuals?.additionalCompanies ?? []) {
        if (!pipelineByCompany.has(c.id) && c.pipelineValue) {
            pipelineByCompany.set(c.id, c.pipelineValue)
        }
    }

    const tierOfCompany = (id: string | null | undefined): number => {
        if (id && targetCompanyIds.has(id)) return 1
        if (id && (companyEventMax.get(id) ?? 1) > 1) return 2
        return 3
    }

    // Companies: targetCompaniesHit (T1) ∪ additionalCompanies, sorted by pipeline desc
    const compMap = new Map<string, CompanyEntry>()
    for (const c of actuals?.targetCompaniesHit ?? []) {
        compMap.set(c.id, { id: c.id, name: c.name, tier: 1, pipelineValue: pipelineByCompany.get(c.id) ?? 0 })
    }
    for (const c of actuals?.additionalCompanies ?? []) {
        if (compMap.has(c.id)) continue
        compMap.set(c.id, { id: c.id, name: c.name, tier: tierOfCompany(c.id), pipelineValue: pipelineByCompany.get(c.id) ?? (c.pipelineValue ?? 0) })
    }
    const companies = [...compMap.values()].sort(
        (a, b) => b.pipelineValue - a.pipelineValue || a.name.localeCompare(b.name)
    )

    // Calculated pipeline: Physical Event Execution companies only
    const calculatedPipeline = [...compMap.keys()].reduce(
        (sum, id) => sum + (pipelineByCompany.get(id) ?? 0), 0
    )
    const calculatedRevenue = calculatedPipeline * (targets?.winRate ?? 0)

    // Leads: 1 most-senior person per company with physical meetings, ordered by company pipeline desc
    const meetingCompanyIds = new Set(compMap.keys())
    const leadByCompany = new Map<string, LeadEntry>()
    for (const a of attendees) {
        if (!a.company || !meetingCompanyIds.has(a.company.id)) continue
        const pipelineValue = pipelineByCompany.get(a.company.id) ?? 0
        const isExec = !!(a.title && EXEC_REGEX.test(a.title))
        const existing = leadByCompany.get(a.company.id)
        if (!existing || (!existing.isExec && isExec)) {
            leadByCompany.set(a.company.id, {
                id: a.id, name: a.name, title: a.title ?? '',
                companyName: a.company.name,
                tier: tierOfCompany(a.company.id),
                pipelineValue,
                isExec,
            })
        }
    }
    const leads = [...leadByCompany.values()]
        .sort((a, b) => b.pipelineValue - a.pipelineValue || a.companyName.localeCompare(b.companyName))

    const media = (data?.pitchTargets ?? [])
        .filter(p => p.occurredCount > 0)
        .sort((a, b) => b.occurredCount - a.occurredCount)

    return { targets, actuals, companies, leads, media, calculatedPipeline, calculatedRevenue }
}

// ── Individual Event Slide ───────────────────────────────────────────────────
function EventSlide({ event, data, slideRef }: { event: Event; data: EventRoiData | undefined; slideRef?: React.Ref<HTMLDivElement> }) {
    const eventPath = event.slug || event.id
    const { targets, actuals, companies, leads, media, calculatedPipeline, calculatedRevenue } = deriveSlide(data)
    const statusCfg = getStatusColor(event.status)

    const dateRange = event.startDate
        ? (event.endDate ? `${fmtDate(event.startDate)} – ${fmtDate(event.endDate)}` : fmtDate(event.startDate))
        : 'Dates TBD'

    const visibleCompanies = companies.slice(0, MAX_COMPANIES)
    const compOverflow = companies.length - visibleCompanies.length
    const visibleLeads = leads.slice(0, MAX_LEADS)
    const leadOverflow = leads.length - visibleLeads.length
    const visibleMedia = media.slice(0, MAX_MEDIA)
    const mediaOverflow = media.length - visibleMedia.length

    return (
        <div ref={slideRef} className="bg-neutral-50 overflow-hidden" style={{ width: BOX_W, height: BOX_H, padding: PAD }}>
            {/* HEADER */}
            <div
                className="rounded-xl px-6 flex items-center justify-between"
                style={{ height: HEADER_H, background: '#BF0000' }}
            >
                <div className="min-w-0">
                    <h2 className="text-[26px] font-bold text-white truncate leading-tight">{event.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                        {event.region && (
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-300 border border-slate-600 px-2 py-0.5 rounded-full">
                                {event.region}
                            </span>
                        )}
                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusCfg.className}`}>
                            {event.status}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[15px] text-slate-300 whitespace-nowrap">{dateRange}</span>
                    <Link
                        href={`/events/${eventPath}/roi`}
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="View full ROI"
                        onClick={e => e.stopPropagation()}
                    >
                        <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* BODY */}
            <div className="flex" style={{ marginTop: BODY_GAP, height: BODY_H, gap: COL_GAP }}>
                {/* LEFT — COCKPIT */}
                <div className="flex flex-col" style={{ width: LEFT_W }}>
                    <div className="flex flex-col gap-3" style={{ flex: 3 }}>
                        <OutcomeTile label="Pipeline" actual={calculatedPipeline} target={targets?.expectedPipeline ?? null} />
                        <OutcomeTile label="Revenue" actual={calculatedRevenue} target={targets?.expectedRevenue ?? null} />
                        <div className="flex-1 bg-white rounded-xl border border-neutral-200 px-5 py-4 flex flex-col justify-center">
                            <div className="text-[13px] font-bold uppercase tracking-widest text-neutral-400">Investment</div>
                            <div className="text-[34px] leading-none font-bold tabular-nums mt-1 text-neutral-900">
                                {fmtCurrency((actuals?.actualCost ?? 0) > 0 ? (actuals?.actualCost ?? null) : (actuals?.actualInvestment ?? null), true)}
                            </div>
                            {targets?.budget != null && targets.budget > 0 && (
                                <>
                                    <div className="mt-3 h-2 bg-neutral-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-blue-400"
                                            style={{ width: `${Math.min(100, (((actuals?.actualCost ?? 0) > 0 ? (actuals?.actualCost ?? 0) : (actuals?.actualInvestment ?? 0)) / targets.budget) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="mt-1.5 text-[13px] text-neutral-400">
                                        budget {fmtCurrency(targets.budget, true)}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col mt-3" style={{ flex: 2 }}>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Key Metrics</div>
                        <div className="grid grid-cols-3 gap-2 flex-1 content-start">
                            <GaugeChip label="LI Touches" actual={data?.linkedInTargetCompanies.length ?? null} target={targets?.targetCompanies.length ?? null} />
                            <GaugeChip label="Media / PR" actual={actuals?.actualMediaPR ?? null} target={targets?.targetMediaPR ?? null} />
                            <GaugeChip label="Event Scans" actual={actuals?.actualEventScans ?? null} target={targets?.targetEventScans ?? null} />
                            <GaugeChip label="Ext. Leads" actual={actuals?.actualCustomerMeetings ?? null} target={targets?.targetCustomerMeetings ?? null} />
                            <GaugeChip label="Speaking" actual={actuals?.actualSpeaking ?? null} target={targets?.targetSpeaking ?? null} />
                        </div>
                    </div>
                </div>

                {/* RIGHT — KEY CONTACTS */}
                <div className="flex flex-col" style={{ width: RIGHT_W, gap: PANEL_GAP }}>
                    {/* Companies */}
                    <Panel
                        title={`Top ${visibleCompanies.length} Companies (Total: ${companies.length})`}
                        height={COMP_PANEL_H}
                    >
                        {visibleCompanies.length > 0 ? (
                            <div className="flex flex-col">
                                {visibleCompanies.map(c => (
                                    <div key={c.id} className="flex items-center gap-2.5" style={{ height: ROW_C }}>
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${tierDot[c.tier]}`} />
                                        <span className="text-[13px] font-semibold text-neutral-900 truncate flex-1">{c.name}</span>
                                        <span className="text-[13px] font-semibold tabular-nums text-neutral-500 shrink-0">
                                            {fmtCurrency(c.pipelineValue > 0 ? c.pipelineValue : null, true)}
                                        </span>
                                    </div>
                                ))}
                                {compOverflow > 0 && (
                                    <div className="text-[12px] text-neutral-400 pt-1">+{compOverflow} more</div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[13px] text-neutral-400 italic pt-2">No companies with contact recorded</div>
                        )}
                    </Panel>

                    {/* Leads */}
                    <Panel title={`Top ${visibleLeads.length} Contacts`} count={leads.length} height={LEADS_PANEL_H}>
                        {visibleLeads.length > 0 ? (
                            <div className="flex flex-col">
                                {visibleLeads.map(l => (
                                    <div key={l.id} className="flex items-center gap-2.5" style={{ height: ROW_L }}>
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${tierDot[l.tier]}`} />
                                        <span className="text-[14px] font-semibold text-neutral-900 truncate" style={{ width: '34%' }}>{l.name}</span>
                                        <span className="text-[13px] text-neutral-500 truncate flex-1">{l.title}</span>
                                        <span className={`text-[13px] font-semibold truncate text-right ${tierText[l.tier]}`} style={{ width: '30%' }} title={l.companyName}>
                                            {l.companyName}
                                        </span>
                                    </div>
                                ))}
                                {leadOverflow > 0 && (
                                    <div className="text-[12px] text-neutral-400 pt-1">+{leadOverflow} more</div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[13px] text-neutral-400 italic pt-2">No contacts recorded</div>
                        )}
                    </Panel>

                    {/* Media & PR */}
                    <Panel title="Media & PR Coverage" count={media.length} height={MEDIA_PANEL_H}>
                        {visibleMedia.length > 0 ? (
                            <div className="flex flex-col">
                                {visibleMedia.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2.5" style={{ height: ROW_M }}>
                                        <span className="w-2 h-2 rounded-full shrink-0 bg-violet-500" />
                                        <span className="text-[14px] font-semibold text-neutral-900 truncate" style={{ width: '26%' }}>{p.attendee.name}</span>
                                        <span className="text-[13px] text-neutral-500 truncate flex-1">
                                            {[p.attendee.title, p.attendee.company?.name].filter(Boolean).join(' · ')}
                                        </span>
                                        <div className="flex gap-1 shrink-0">
                                            {p.urls.slice(0, 3).map((url, j) => (
                                                <a
                                                    key={j}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    className="inline-flex items-center gap-0.5 text-[11px] bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded hover:bg-violet-100 transition-colors max-w-[110px] truncate"
                                                >
                                                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                                    {hostOf(url)}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {mediaOverflow > 0 && (
                                    <div className="text-[12px] text-neutral-400 pt-1">+{mediaOverflow} more</div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[13px] text-neutral-400 italic pt-2">No media / analyst briefings recorded</div>
                        )}
                    </Panel>
                </div>
            </div>
        </div>
    )
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────
function SlideSkeleton() {
    return (
        <ScaledSlide>
            <div className="bg-neutral-50 animate-pulse" style={{ width: BOX_W, height: BOX_H, padding: PAD }}>
                <div className="rounded-xl" style={{ height: HEADER_H, background: '#BF0000' }} />
                <div className="flex" style={{ marginTop: BODY_GAP, height: BODY_H, gap: COL_GAP }}>
                    <div className="flex flex-col gap-3" style={{ width: LEFT_W }}>
                        {[...Array(3)].map((_, i) => <div key={i} className="flex-1 bg-white rounded-xl border border-neutral-200" />)}
                    </div>
                    <div className="flex flex-col" style={{ width: RIGHT_W, gap: PANEL_GAP }}>
                        <div className="bg-white rounded-xl border border-neutral-200" style={{ height: COMP_PANEL_H }} />
                        <div className="bg-white rounded-xl border border-neutral-200" style={{ height: LEADS_PANEL_H }} />
                        <div className="bg-white rounded-xl border border-neutral-200" style={{ height: MEDIA_PANEL_H }} />
                    </div>
                </div>
            </div>
        </ScaledSlide>
    )
}

// ── PDF export ───────────────────────────────────────────────────────────────
// Captures the full-size (1280×720) rendered slides exactly as they appear on
// screen and writes one 16:9 landscape page per event, so the result can be
// pasted straight into a PowerPoint slide.
async function exportSlidesPdf(slideEls: HTMLElement[]) {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [BOX_W, BOX_H] })
    for (let i = 0; i < slideEls.length; i++) {
        const canvas = await html2canvas(slideEls[i], {
            width: BOX_W,
            height: BOX_H,
            windowWidth: BOX_W,
            windowHeight: BOX_H,
            scale: 2,
            backgroundColor: '#f5f5f4',
            useCORS: true,
        })
        const img = canvas.toDataURL('image/png')
        if (i > 0) pdf.addPage([BOX_W, BOX_H], 'landscape')
        pdf.addImage(img, 'PNG', 0, 0, BOX_W, BOX_H)
    }
    const now = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`
    pdf.save(`roi-dashboard-${ts}.pdf`)
}

// ── Main Export ──────────────────────────────────────────────────────────────
export function RoiDashboardView({ events }: { events: Event[] }) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [roiDataMap, setRoiDataMap] = useState<Record<string, EventRoiData>>({})
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const slideRefs = useRef<Record<string, HTMLDivElement | null>>({})

    useEffect(() => {
        setCurrentIndex(i => Math.min(i, Math.max(0, events.length - 1)))
    }, [events.length])

    useEffect(() => {
        if (events.length === 0) return
        setLoading(true)

        const fetchEventData = async (event: Event): Promise<[string, EventRoiData]> => {
            const id = event.slug || event.id
            const [roiRes, pitchRes, draftsRes, attendeesRes, companiesRes] = await Promise.allSettled([
                fetch(`/api/events/${id}/roi`),
                fetch(`/api/events/${id}/pitch-targets`),
                fetch(`/api/social/drafts?eventId=${id}`),
                fetch(`/api/attendees?eventId=${id}`),
                fetch(`/api/companies`),
            ])

            const roi = roiRes.status === 'fulfilled' && roiRes.value.ok
                ? await roiRes.value.json().catch(() => null) : null
            const pitchTargets: PitchRow[] = pitchRes.status === 'fulfilled' && pitchRes.value.ok
                ? ((await pitchRes.value.json().catch(() => ({ items: [] })))?.items ?? []) : []
            const drafts = draftsRes.status === 'fulfilled' && draftsRes.value.ok
                ? await draftsRes.value.json().catch(() => []) : []
            const allAttendees: AttendeeRow[] = attendeesRes.status === 'fulfilled' && attendeesRes.value.ok
                ? await attendeesRes.value.json().catch(() => []) : []
            const allCompanies: Array<{ id: string; name: string; pipelineValue?: number | null }> =
                companiesRes.status === 'fulfilled' && companiesRes.value.ok
                ? await companiesRes.value.json().catch(() => []) : []

            const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

            const targetByNorm = new Map<string, { id: string; name: string; pipelineValue?: number | null }>()
            for (const c of roi?.targets?.targetCompanies ?? []) {
                targetByNorm.set(normalizeName(c.name), c)
            }
            const systemByNorm = new Map<string, { id: string; name: string; pipelineValue?: number | null }>()
            for (const c of allCompanies) {
                systemByNorm.set(normalizeName(c.name), c)
            }

            const linkedInTargetCompanies: string[] = []
            const linkedInEngagedCompanies: Array<{ id: string; name: string; pipelineValue?: number | null }> = []
            const seenNames = new Set<string>()
            const seenIds = new Set<string>()
            for (const draft of drafts) {
                if (draft.status !== 'POSTED' || !draft.topCompaniesByEngagement) continue
                for (const rawLine of draft.topCompaniesByEngagement.split('\n')) {
                    const nameOnly = rawLine.replace(/[\t,;|].*$/, '').replace(/\s+\d.*$/, '').trim()
                    if (!nameOnly) continue
                    const norm = normalizeName(nameOnly)
                    if (seenNames.has(norm)) continue
                    seenNames.add(norm)
                    const targetComp = targetByNorm.get(norm)
                    if (targetComp) {
                        linkedInTargetCompanies.push(targetComp.name)
                        if (!seenIds.has(targetComp.id)) {
                            seenIds.add(targetComp.id)
                            linkedInEngagedCompanies.push(targetComp)
                        }
                        continue
                    }
                    const knownComp = systemByNorm.get(norm)
                    if (knownComp && !seenIds.has(knownComp.id)) {
                        seenIds.add(knownComp.id)
                        linkedInEngagedCompanies.push(knownComp)
                    }
                }
            }

            const attendees = allAttendees.filter(a => a.isExternal)
            return [event.id, { roi, pitchTargets, linkedInTargetCompanies, linkedInEngagedCompanies, attendees }]
        }

        Promise.all(events.map(fetchEventData))
            .then(results => {
                setRoiDataMap(Object.fromEntries(results))
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [events])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(0, i - 1))
            if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(events.length - 1, i + 1))
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [events.length])

    const handleExport = async () => {
        if (exporting || events.length === 0) return
        setExporting(true)
        try {
            const els = events
                .map(e => slideRefs.current[e.id])
                .filter((el): el is HTMLDivElement => !!el)
            if (els.length) await exportSlidesPdf(els)
        } finally {
            setExporting(false)
        }
    }

    if (events.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm text-center text-neutral-500 py-20">
                No events match the current filters.
            </div>
        )
    }

    const currentEvent = events[Math.min(currentIndex, events.length - 1)]
    const currentData = roiDataMap[currentEvent?.id]
    const showDots = events.length <= 8

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-neutral-900">ROI Performance</h2>
                    <p className="text-sm text-neutral-500 mt-0.5">One 16:9 executive slide per filtered event.</p>
                </div>
                <button
                    onClick={handleExport}
                    disabled={exporting || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
                >
                    <Download className="w-4 h-4" />
                    {exporting ? 'Exporting…' : 'Export PDF'}
                </button>
            </div>

            <div className="rounded-2xl shadow-xl border border-neutral-200 overflow-hidden">
                {loading ? <SlideSkeleton /> : (
                    currentEvent && (
                        <ScaledSlide>
                            <EventSlide event={currentEvent} data={currentData} />
                        </ScaledSlide>
                    )
                )}
            </div>

            {/* Off-screen full-size slides used only for PDF capture */}
            {!loading && (
                <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}>
                    {events.map(ev => (
                        <EventSlide
                            key={ev.id}
                            event={ev}
                            data={roiDataMap[ev.id]}
                            slideRef={el => { slideRefs.current[ev.id] = el }}
                        />
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between gap-4 px-1">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                        disabled={currentIndex === 0}
                        className="p-2 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm"
                        title="Previous event (←)"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    {showDots ? (
                        <div className="flex items-center gap-1.5">
                            {events.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentIndex(i)}
                                    className={`rounded-full transition-all ${i === currentIndex ? 'w-4 h-2.5 bg-blue-600' : 'w-2 h-2 bg-neutral-300 hover:bg-neutral-400'}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <span className="text-sm font-medium text-neutral-600">
                            {currentIndex + 1} <span className="text-neutral-400">/</span> {events.length}
                        </span>
                    )}

                    <button
                        onClick={() => setCurrentIndex(i => Math.min(events.length - 1, i + 1))}
                        disabled={currentIndex === events.length - 1}
                        className="p-2 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm"
                        title="Next event (→)"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
