'use client'

import { Save, Send, CheckCircle, CheckCircle2, Circle, X, TrendingUp, Target, Mic, Sparkles, Upload, Megaphone, ExternalLink } from 'lucide-react'
import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useUser } from '@/components/auth'
import MetricCard from '@/components/roi/MetricCard'
import CompanyChecklist from '@/components/roi/CompanyChecklist'
import Tooltip from '@/components/roi/Tooltip'
import FormattedInput from '@/components/roi/FormattedInput'
import SparkleMarketingPlanButton from '@/components/roi/SparkleMarketingPlanButton'
import LinkedInModal from '@/components/roi/LinkedInModal'

interface Company {
    id: string
    name: string
    pipelineValue?: number | null
}

// Types
interface ROITargets {
    id?: string
    budget?: number | null
    requesterEmail?: string | null
    expectedPipeline: number | null
    winRate: number | null
    expectedRevenue: number | null
    targetCustomerMeetings: number | null
    targetErta: number | null
    targetSpeaking: number | null
    targetMediaPR: number | null
    targetEventScans: number | null
    targetCompanies: Company[]
    actualErta: number | null
    actualSpeaking: number | null
    actualMediaPR: number | null
    actualEventScans: number | null
    actualCost?: number | null
    status: string
    approvedBy?: string | null
    approvedAt?: string | null
    submittedAt?: string | null
    rejectedBy?: string | null
    rejectedAt?: string | null
    marketingPlan?: string | null
}

interface ROIActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualCustomerMeetings: number
    targetCompaniesHit: { id: string; name: string }[]
    targetCompaniesHitCount: number
    additionalCompanies: { id: string; name: string; pipelineValue?: number | null }[]
    actualErta: number
    actualSpeaking: number
    actualMediaPR: number
    actualEventScans: number
    actualCost: number
}

interface LinkedInDraft {
    id: string
    status: string
    budget: number | null
    impressions: number | null
    clicks: number | null
    activeUsers: number | null
    avgEngagementTimePerActiveUser: number | null
    adStartDate: string | null
    adEndDate: string | null
    topCompaniesByEngagement: string | null
}

interface MediaTargetRow {
    attendee: {
        id: string
        name: string
        email: string
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

const normalizeCompany = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const urlHostname = (u: string) => {
    try {
        const parsed = new URL(u)
        return parsed.hostname.replace(/^www\./, '')
    } catch {
        return u
    }
}

const emptyTargets: ROITargets = {
    budget: null,
    requesterEmail: '',
    expectedPipeline: null,
    winRate: null,
    expectedRevenue: null,
    targetCustomerMeetings: null,
    targetErta: null,
    targetSpeaking: null,
    targetMediaPR: null,
    targetEventScans: null,
    targetCompanies: [],
    actualErta: null,
    actualSpeaking: null,
    actualMediaPR: null,
    actualEventScans: null,
    actualCost: null,
    status: 'DRAFT',
    marketingPlan: null,
}

const currency = (v: number) => `$${v.toLocaleString()}`

function UnsavedBadge() {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold">
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
            Unsaved changes
        </span>
    )
}

function ROIPage() {
    const params = useParams()
    const eventId = params?.id as string

    const { user } = useUser()
    const [activeTab, setActiveTabState] = useState<'targets' | 'performance' | 'actuals'>('targets')

    useEffect(() => {
        try {
            const saved = localStorage.getItem(`roi-tab-${eventId}`)
            if (saved === 'performance' || saved === 'actuals' || saved === 'targets') setActiveTabState(saved)
        } catch { }
    }, [eventId])

    const setActiveTab = (tab: 'targets' | 'performance' | 'actuals') => {
        setActiveTabState(tab)
        try { localStorage.setItem(`roi-tab-${eventId}`, tab) } catch { }
    }
    const [targets, setTargets] = useState<ROITargets>(emptyTargets)
    const [actuals, setActuals] = useState<ROIActuals | null>(null)
    const [linkedInDrafts, setLinkedInDrafts] = useState<LinkedInDraft[]>([])
    const [mediaTargets, setMediaTargets] = useState<MediaTargetRow[]>([])
    const [eventStatus, setEventStatus] = useState<string | null>(null)
    const [checklistData, setChecklistData] = useState<{ completedCount: number; finalReport: string; nextYearDecision: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const searchParams = useSearchParams()
    const router = useRouter()
    const [companyInput, setCompanyInput] = useState('')
    const [bulkInput, setBulkInput] = useState('')
    const [availableCompanies, setAvailableCompanies] = useState<Company[]>([])
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
    const companyDropdownRef = useRef<HTMLDivElement>(null)
    const savedTargetsRef = useRef<ROITargets | null>(null)

    const isFinancialDirty = useMemo(() => {
        if (!savedTargetsRef.current) return false
        const saved = savedTargetsRef.current
        return (
            saved.budget !== targets.budget ||
            saved.requesterEmail !== targets.requesterEmail ||
            saved.expectedPipeline !== targets.expectedPipeline ||
            saved.winRate !== targets.winRate
        )
    }, [targets])

    const isEventTargetsDirty = useMemo(() => {
        if (!savedTargetsRef.current) return false
        const saved = savedTargetsRef.current
        return (
            saved.targetCustomerMeetings !== targets.targetCustomerMeetings ||
            saved.targetSpeaking !== targets.targetSpeaking ||
            saved.targetMediaPR !== targets.targetMediaPR ||
            saved.targetEventScans !== targets.targetEventScans
        )
    }, [targets])

    const isCompaniesDirty = useMemo(() => {
        if (!savedTargetsRef.current) return false
        return JSON.stringify(savedTargetsRef.current.targetCompanies) !== JSON.stringify(targets.targetCompanies)
    }, [targets])

    const isMarketingPlanDirty = useMemo(() => {
        if (!savedTargetsRef.current) return false
        return savedTargetsRef.current.marketingPlan !== targets.marketingPlan
    }, [targets])

    const isDirty = isFinancialDirty || isEventTargetsDirty || isCompaniesDirty || isMarketingPlanDirty

    // Consolidated LinkedIn campaign summary for the Performance Tracker tab.
    // Aggregates POSTED drafts only. Returns null when no POSTED drafts exist.
    const linkedInSummary = useMemo(() => {
        const posted = linkedInDrafts.filter(d => d.status === 'POSTED')
        const draftCount = linkedInDrafts.filter(d => d.status === 'DRAFT').length

        const sum = (vals: (number | null)[]) => vals.reduce<number>((a, v) => a + (v ?? 0), 0)

        const totalBudget = sum(posted.map(d => d.budget))
        const totalImpressions = sum(posted.map(d => d.impressions))
        const totalClicks = sum(posted.map(d => d.clicks))
        const totalActiveUsers = sum(posted.map(d => d.activeUsers))

        const blendedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null
        const blendedCpc = totalClicks > 0 ? totalBudget / totalClicks : null

        const weightedEngagementNumerator = posted.reduce<number>(
            (a, d) => a + ((d.activeUsers ?? 0) * (d.avgEngagementTimePerActiveUser ?? 0)),
            0
        )
        const weightedEngagement = totalActiveUsers > 0 ? weightedEngagementNumerator / totalActiveUsers : null

        const startDates = posted.map(d => d.adStartDate).filter((v): v is string => !!v)
        const endDates = posted.map(d => d.adEndDate).filter((v): v is string => !!v)
        const earliestStart = startDates.length ? new Date(Math.min(...startDates.map(d => new Date(d).getTime()))) : null
        const latestEnd = endDates.length ? new Date(Math.max(...endDates.map(d => new Date(d).getTime()))) : null

        // Bucket touched companies across POSTED drafts: target → known (system) → other.
        // One touch per draft per canonical company.
        const targetByNorm = new Map<string, string>()
        for (const c of targets.targetCompanies) {
            targetByNorm.set(normalizeCompany(c.name), c.name)
        }
        const systemByNorm = new Map<string, string>()
        for (const c of availableCompanies) {
            systemByNorm.set(normalizeCompany(c.name), c.name)
        }

        const targetTouches = new Map<string, number>()
        const knownTouches = new Map<string, number>()
        const otherTouches = new Map<string, { name: string; count: number }>()

        for (const draft of posted) {
            if (!draft.topCompaniesByEngagement) continue
            const seenInDraft = new Set<string>()
            for (const rawLine of draft.topCompaniesByEngagement.split('\n')) {
                const nameOnly = rawLine.replace(/[\t,;|].*$/, '').replace(/\s+\d.*$/, '').trim()
                if (!nameOnly) continue
                const norm = normalizeCompany(nameOnly)
                if (seenInDraft.has(norm)) continue
                seenInDraft.add(norm)

                const targetCanonical = targetByNorm.get(norm)
                if (targetCanonical) {
                    targetTouches.set(targetCanonical, (targetTouches.get(targetCanonical) ?? 0) + 1)
                    continue
                }
                const knownCanonical = systemByNorm.get(norm)
                if (knownCanonical) {
                    knownTouches.set(knownCanonical, (knownTouches.get(knownCanonical) ?? 0) + 1)
                    continue
                }
                const existing = otherTouches.get(norm)
                if (existing) {
                    existing.count += 1
                } else {
                    otherTouches.set(norm, { name: nameOnly, count: 1 })
                }
            }
        }

        const sortByCount = (a: { count: number }, b: { count: number }) => b.count - a.count
        const targetCompaniesEngaged = Array.from(targetTouches.entries())
            .map(([name, count]) => ({ name, count }))
            .sort(sortByCount)
        const knownCompaniesEngaged = Array.from(knownTouches.entries())
            .map(([name, count]) => ({ name, count }))
            .sort(sortByCount)
        const otherCompaniesEngaged = Array.from(otherTouches.values()).sort(sortByCount)

        const totalTargets = targets.targetCompanies.length
        const targetCoveragePct = totalTargets > 0
            ? (targetCompaniesEngaged.length / totalTargets) * 100
            : null

        return {
            postedCount: posted.length,
            draftCount,
            totalBudget,
            totalImpressions,
            totalClicks,
            totalActiveUsers,
            blendedCtr,
            blendedCpc,
            weightedEngagement,
            earliestStart,
            latestEnd,
            targetCompaniesEngaged,
            knownCompaniesEngaged,
            otherCompaniesEngaged,
            targetCoveragePct,
        }
    }, [linkedInDrafts, targets.targetCompanies, availableCompanies])

    // Sparkle state
    const [sparkleLoading, setSparkleLoading] = useState<'financial' | 'events' | 'companies' | null>(null)
    const [confirmPanel, setConfirmPanel] = useState<{
        section: 'financial' | 'events' | 'companies'
        draft: import('@/lib/actions/roi-generate').ROIDraft
    } | null>(null)
    const [companyChecklist, setCompanyChecklist] = useState<Array<{
        name: string
        description: string
        checked: boolean
        existingId: string | null  // null = will be created
    }> | null>(null)
    const [companySaving, setCompanySaving] = useState(false)

    // LinkedIn multi-company selection
    const [selectedForLinkedIn, setSelectedForLinkedIn] = useState<Set<string>>(new Set())
    const [linkedInModalOpen, setLinkedInModalOpen] = useState(false)

    const role = user?.publicMetadata?.role as string
    const canEdit = role === 'root' || role === 'marketing'
    const canApproveOrReject = role === 'root'

    // Fetch data
    useEffect(() => {
        if (!eventId) return
        fetch(`/api/events/${eventId}/roi`)
            .then(res => res.json())
            .then(data => {
                if (data.targets) {
                    setTargets(data.targets)
                    savedTargetsRef.current = data.targets
                }
                if (data.actuals) setActuals(data.actuals)
                if (data.eventStatus) setEventStatus(data.eventStatus)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load ROI data', err)
                setLoading(false)
            })
    }, [eventId])

    // Fetch checklist completion data for wrap-up status card
    useEffect(() => {
        if (!eventId) return
        const CHECKLIST_KEYS = [
            'eventRecommendation', 'eventROICompleted', 'approval', 'eventPlanning',
            'campaignPlanning', 'campaignActivation', 'campaignEvaluation', 'internalAttendeesAdded',
            'liveCoverage', 'leadManagement', 'eventDataCapture', 'eventWrapUp',
            'contentAmplification', 'crmUpdate', 'reportingActivations', 'debriefOnTeamMeeting',
            'eventCompleted',
        ] as const
        fetch(`/api/events/${eventId}/checklist`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data?.checklist) return
                const cl = data.checklist
                const completedCount = CHECKLIST_KEYS.filter(k => cl[k] === true).length
                setChecklistData({
                    completedCount,
                    finalReport: cl.finalReport ?? '',
                    nextYearDecision: cl.nextYearDecision ?? '',
                })
            })
            .catch(() => { /* non-critical */ })
    }, [eventId])

    // Fetch LinkedIn drafts for Performance Tracker summary
    useEffect(() => {
        if (!eventId) return
        fetch(`/api/social/drafts?eventId=${eventId}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => setLinkedInDrafts(Array.isArray(data) ? data : []))
            .catch(() => { /* non-critical — section just hides */ })
    }, [eventId])

    // Fetch pitch targets for Media/PR Performance section
    useEffect(() => {
        if (!eventId) return
        fetch(`/api/events/${eventId}/pitch-targets`)
            .then(res => res.ok ? res.json() : { items: [] })
            .then(data => setMediaTargets(Array.isArray(data.items) ? data.items : []))
            .catch(() => { /* non-critical — section just hides */ })
    }, [eventId])

    // Fetch companies for selector
    useEffect(() => {
        fetch('/api/companies')
            .then(res => res.json())
            .then(data => {
                setAvailableCompanies(data)
            })
            .catch(err => console.error('Failed to fetch companies', err))
    }, [])


    // Close company dropdown when clicking outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
                setShowCompanyDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // Auto-calculate expected revenue
    useEffect(() => {
        if (targets.expectedPipeline && targets.winRate) {
            const rev = targets.expectedPipeline * targets.winRate
            setTargets(prev => ({ ...prev, expectedRevenue: rev }))
        }
    }, [targets.expectedPipeline, targets.winRate])

    const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

    // Intercept in-app link clicks when dirty
    useEffect(() => {
        if (!isDirty) return
        const handleClick = (e: MouseEvent) => {
            const anchor = (e.target as Element).closest('a')
            if (!anchor) return
            const href = anchor.getAttribute('href')
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
            e.preventDefault()
            e.stopPropagation()
            setPendingNavigation(href)
        }
        document.addEventListener('click', handleClick, true)
        return () => document.removeEventListener('click', handleClick, true)
    }, [isDirty])

    // Warn before browser refresh / close
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        if (isDirty) {
            window.addEventListener('beforeunload', handleBeforeUnload)
        }
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [isDirty])

    // Save scroll position as the user scrolls (not on unmount — avoids StrictMode writing scrollY=0)
    useEffect(() => {
        const key = `roi-scroll-${eventId}`
        let rafId: number
        const onScroll = () => {
            cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
                sessionStorage.setItem(key, String(Math.round(window.scrollY)))
            })
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            cancelAnimationFrame(rafId)
        }
    }, [eventId])

    // Restore scroll position after data finishes loading
    useEffect(() => {
        if (loading) return
        const key = `roi-scroll-${eventId}`
        const saved = sessionStorage.getItem(key)
        if (saved) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.scrollTo({ top: parseInt(saved), behavior: 'instant' })
                })
            })
        }
    }, [loading, eventId])

    // Read planWarning / planError from URL on mount, show message, clear params
    useEffect(() => {
        const warning = searchParams.get('planWarning')
        const error = searchParams.get('planError')
        if (warning) {
            setMessage('An existing marketing plan was found — no new plan was generated.')
            router.replace(window.location.pathname)
        } else if (error) {
            setMessage('Failed to generate marketing plan. Please try again or type one manually.')
            router.replace(window.location.pathname)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSaveTargets = async () => {
        setSaving(true)
        setMessage('')
        try {
            const { id: _id, status: _status, approvedBy: _ab, approvedAt: _aa, submittedAt: _sa, rejectedBy: _rb, rejectedAt: _rat, targetCompanies, ...rest } = targets
            const saveData = {
                ...rest,
                targetCompanyIds: targetCompanies.map(c => c.id)
            }
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData),
            })
            if (!res.ok) throw new Error('Failed to save')
            const result = await res.json()
            setTargets(result)
            savedTargetsRef.current = result
            setMessage('Targets saved successfully')
        } catch (err: any) {
            setMessage(err.message || 'Error saving targets')
        } finally {
            setSaving(false)
        }
    }

    const handleSubmit = async () => {
        if (!allFieldsFilled) {
            setMessage('All fields must be completed before submitting for approval.')
            return
        }
        if (isDirty) {
            setMessage('Please save your changes before submitting for approval.')
            return
        }
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'submit' }),
            })
            if (!res.ok) throw new Error('Failed to submit')
            const result = await res.json()
            setTargets(result)
            setMessage('Submitted for approval')
        } catch (err: any) {
            setMessage(err.message)
        }
    }

    const handleApprove = async () => {
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve' }),
            })
            if (!res.ok) throw new Error('Failed to approve')
            const result = await res.json()
            setTargets(result)
            setMessage('ROI targets approved')
        } catch (err: any) {
            setMessage(err.message)
        }
    }

    const handleReject = async () => {
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject' }),
            })
            if (!res.ok) throw new Error('Failed to reject')
            const result = await res.json()
            setTargets(result)
            setMessage('ROI targets rejected and returned for changes')
        } catch (err: any) {
            setMessage(err.message)
        }
    }

    const handleResetToDraft = async () => {
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset_to_draft' }),
            })
            if (!res.ok) throw new Error('Failed to reset to draft')
            const result = await res.json()
            setTargets(result)
            setMessage('ROI targets unlocked and returned to draft')
        } catch (err: any) {
            setMessage(err.message)
        }
    }

    const handleSaveActuals = async () => {
        setSaving(true)
        setMessage('')
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actualSpeaking: targets.actualSpeaking,
                    actualEventScans: targets.actualEventScans,
                    actualCost: targets.actualCost,
                }),
            })
            if (!res.ok) throw new Error('Failed to save')
            setMessage('Actuals saved successfully')
            const roiRes = await fetch(`/api/events/${eventId}/roi`)
            const data = await roiRes.json()
            if (data.actuals) setActuals(data.actuals)
        } catch (err: any) {
            setMessage(err.message)
        } finally {
            setSaving(false)
        }
    }

    const addCompany = (company: Company) => {
        if (!targets.targetCompanies.some(c => c.id === company.id)) {
            setTargets(prev => ({ ...prev, targetCompanies: [...prev.targetCompanies, company] }))
        }
        setCompanyInput('')
        setShowCompanyDropdown(false)
    }

    // NOTE: company names containing commas are not supported in the bulk input
    const handleBulkProcess = () => {
        if (!bulkInput.trim()) return
        const names = bulkInput.split(',').map(n => n.trim()).filter(Boolean)
        const matched: Company[] = []
        const unmatched: string[] = []
        for (const name of names) {
            const found = availableCompanies.find(c => c.name.toLowerCase() === name.toLowerCase())
            if (found) {
                if (!targets.targetCompanies.some(tc => tc.id === found.id)) matched.push(found)
            } else {
                unmatched.push(name)
            }
        }
        if (matched.length > 0) {
            setTargets(prev => ({ ...prev, targetCompanies: [...prev.targetCompanies, ...matched] }))
        }
        setBulkInput('')
        if (unmatched.length > 0) {
            const encoded = unmatched.map(n => encodeURIComponent(n)).join(',')
            router.push(`/events/${eventId}/data-ingestion?returnTo=roi&pendingCompanies=${encoded}`)
        }
    }

    const removeCompany = (companyId: string) => {
        setTargets(prev => ({ ...prev, targetCompanies: prev.targetCompanies.filter(c => c.id !== companyId) }))
        setSelectedForLinkedIn(prev => { const next = new Set(prev); next.delete(companyId); return next })
    }

    const toggleLinkedInSelection = (companyId: string) => {
        setSelectedForLinkedIn(prev => {
            const next = new Set(prev)
            if (next.has(companyId)) {
                next.delete(companyId)
            } else if (next.size < 5) {
                next.add(companyId)
            }
            return next
        })
    }

    const filteredAvailableCompanies = availableCompanies.filter(
        c => c.name.toLowerCase().includes(companyInput.toLowerCase()) &&
            !targets.targetCompanies.some(tc => tc.id === c.id)
    )

    const allFieldsFilled =
        !!targets.budget &&
        !!targets.requesterEmail &&
        !!targets.expectedPipeline &&
        !!targets.winRate &&
        targets.targetCustomerMeetings !== null && targets.targetCustomerMeetings !== undefined &&
        targets.targetSpeaking !== null && targets.targetSpeaking !== undefined &&
        targets.targetMediaPR !== null && targets.targetMediaPR !== undefined

    // Runs Phase 1 (if no plan) then Phase 2, returns the draft or null on error
    const runExtraction = async (section: 'financial' | 'events' | 'companies'): Promise<import('@/lib/actions/roi-generate').ROIDraft | null> => {
        setSparkleLoading(section)
        setMessage('')
        try {
            // If no marketing plan yet, generate one first
            if (!targets.marketingPlan) {
                const genRes = await fetch(`/api/events/${eventId}/roi/generate-plan`, { method: 'POST' })
                if (!genRes.ok) {
                    const err = await genRes.json()
                    setMessage(err.error || 'Failed to generate marketing plan.')
                    return null
                }
                const genData = await genRes.json()
                setTargets(prev => ({ ...prev, marketingPlan: genData.marketingPlan }))
            }

            // Extract ROI values from the plan
            const extractRes = await fetch(`/api/events/${eventId}/roi/extract-roi`, { method: 'POST' })
            if (!extractRes.ok) {
                const err = await extractRes.json()
                setMessage(err.error || 'Failed to extract ROI values from marketing plan.')
                return null
            }
            return await extractRes.json()
        } catch {
            setMessage('An unexpected error occurred. Please try again.')
            return null
        } finally {
            setSparkleLoading(null)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            </div>
        )
    }

    const statusConfig = {
        DRAFT: { color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Draft' },
        SUBMITTED: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Submitted for Approval' },
        APPROVED: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Approved' },
        REJECTED: { color: 'bg-red-100 text-red-800 border-red-200', label: 'Rejected — Changes Required' },
    }

    // Show REJECTED label if in DRAFT but has rejectedAt
    const displayStatus = targets.status === 'DRAFT' && targets.rejectedAt ? 'REJECTED' : targets.status
    const statusStyle = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.DRAFT

    const isLocked = targets.status === 'APPROVED'
    const isActualsLocked = eventStatus === 'OCCURRED' || eventStatus === 'CANCELED'

    const tabs = [
        { id: 'targets' as const, label: 'Targets & Approval', icon: Target },
        { id: 'actuals' as const, label: 'Event Results', icon: Mic },
        { id: 'performance' as const, label: 'Performance Tracker', icon: TrendingUp },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">ROI Dashboard</h1>
                        {isDirty && <UnsavedBadge />}
                    </div>
                    <p className="mt-1 text-zinc-500">Set targets, track performance, and measure event ROI.</p>
                </div>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${statusStyle.color}`}>
                    {targets.status === 'APPROVED' && <CheckCircle className="w-4 h-4" />}
                    {statusStyle.label}
                </div>
            </div>

            {/* Post-Event Wrap-Up Status */}
            {(() => {
                const CHECKLIST_TOTAL = 17
                const checklistComplete = (checklistData?.completedCount ?? 0) >= CHECKLIST_TOTAL
                const reportComplete = (checklistData?.finalReport ?? '').trim().length > 0
                const nextYearComplete = (checklistData?.nextYearDecision ?? '').length > 0
                const statusComplete = eventStatus === 'OCCURRED'
                const doneCount = [checklistComplete, reportComplete, nextYearComplete, statusComplete].filter(Boolean).length
                const allComplete = doneCount === 4
                const readyForOccurred = checklistComplete && reportComplete && nextYearComplete

                const steps = [
                    {
                        label: 'Checklist Items',
                        detail: checklistComplete
                            ? `${CHECKLIST_TOTAL} / ${CHECKLIST_TOTAL} complete`
                            : `${checklistData?.completedCount ?? 0} / ${CHECKLIST_TOTAL} complete`,
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
                            ? (checklistData?.nextYearDecision ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
                            <div className="flex items-center gap-2">
                                <h2 className={`text-sm font-semibold uppercase tracking-wide ${allComplete ? 'text-teal-700' : 'text-zinc-700'}`}>
                                    {allComplete ? 'All Wrap-Up Tasks Complete' : 'Event Execution Status'}
                                </h2>
                                <Link href={`/events/${eventId}/checklist`} title="Marketing Execution Checklist"
                                    className={`transition-colors ${allComplete ? 'text-teal-400 hover:text-teal-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>
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

            {/* Tabs */}
            <div className="border-b border-zinc-200">
                <nav className="flex gap-8" aria-label="Tabs">
                    {tabs.map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 pb-3 px-1 border-b-2 text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? 'border-zinc-900 text-zinc-900'
                                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        )
                    })}
                </nav>
            </div>

            {/* Message */}
            {message && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in ${message.includes('success') || message.includes('approved') || message.includes('Submitted') || message.includes('updated') || message.includes('added')
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                    {message}
                </div>
            )}

            {/* ======================== TAB 1: TARGETS ======================== */}
            {activeTab === 'targets' && (
                <div className="space-y-8">
                    {/* Financials */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-indigo-500 rounded-full" />
                            Financial Targets
                            {isFinancialDirty && <UnsavedBadge />}
                            {canEdit && !isLocked && (
                                <button
                                    onClick={async () => {
                                        const draft = await runExtraction('financial')
                                        if (draft) setConfirmPanel({ section: 'financial', draft })
                                    }}
                                    disabled={sparkleLoading === 'financial'}
                                    title="Fill empty financial fields from marketing plan"
                                    className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {sparkleLoading === 'financial' ? (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                        </svg>
                                    ) : (
                                        <Sparkles className="w-4 h-4" />
                                    )}
                                </button>
                            )}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The email address of the person who submitted the event request.">Requester Email</Tooltip></label>
                                <input type="email" value={targets.requesterEmail || ''} readOnly={isLocked || !canEdit} onChange={e => setTargets(prev => ({ ...prev, requesterEmail: e.target.value }))}
                                    className={`w-full px-3 py-2.5 rounded-xl border text-sm ${(isLocked || !canEdit) ? 'bg-zinc-50 border-zinc-100 text-zinc-600' : 'border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'}`} placeholder="email@example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The total approved budget for this event.">Budget ($)</Tooltip></label>
                                <FormattedInput
                                    prefix="$"
                                    value={targets.budget}
                                    onChange={val => setTargets(prev => ({ ...prev, budget: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="37,000"
                                    focusRingColor="indigo"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The estimated total value of potential sales opportunities expected to be generated from this event.">Expected Pipeline</Tooltip></label>
                                <FormattedInput
                                    prefix="$"
                                    value={targets.expectedPipeline}
                                    onChange={val => setTargets(prev => ({ ...prev, expectedPipeline: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="2,304,000"
                                    focusRingColor="indigo"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The estimated percentage of expected pipeline that will convert into closed-won revenue.">Win Rate (%)</Tooltip></label>
                                <FormattedInput
                                    value={targets.winRate}
                                    onChange={val => setTargets(prev => ({ ...prev, winRate: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="0.15"
                                    isFloat={true}
                                    suffix={targets.winRate ? `${(targets.winRate * 100).toFixed(0)}%` : ''}
                                    focusRingColor="indigo"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The estimated closed-won revenue, calculated as Expected Pipeline × Win Rate.">Expected Revenue</Tooltip></label>
                                <FormattedInput
                                    prefix="$"
                                    value={targets.expectedRevenue}
                                    readOnly={true}
                                    placeholder="Auto-calculated"
                                    focusRingColor="indigo"
                                />
                                <p className="text-xs text-zinc-400 mt-1">Pipeline × Win Rate</p>
                            </div>
                        </div>
                        {confirmPanel?.section === 'financial' && (() => {
                            const draft = confirmPanel.draft
                            const toFill = [
                                !targets.budget && draft.budget != null,
                                !targets.expectedPipeline && draft.expectedPipeline != null,
                                !targets.winRate && draft.winRate != null,
                            ].filter(Boolean).length
                            const toSkip = [
                                !!targets.budget,
                                !!targets.expectedPipeline,
                                !!targets.winRate,
                            ].filter(Boolean).length
                            return (
                                <div className="mt-4 p-4 bg-white/70 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-sm flex items-center justify-between gap-4">
                                    <div className="text-sm text-zinc-700">
                                        <span className="font-medium text-amber-600">✦ {toFill} field{toFill !== 1 ? 's' : ''} will be filled</span>
                                        {toSkip > 0 && <span className="text-zinc-500"> · {toSkip} already ha{toSkip !== 1 ? 've' : 's'} a value and will be skipped</span>}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button onClick={() => setConfirmPanel(null)}
                                            className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                                            Cancel
                                        </button>
                                        <button onClick={() => {
                                            if (draft.budget != null && !targets.budget) setTargets(prev => ({ ...prev, budget: draft.budget }))
                                            if (draft.expectedPipeline != null && !targets.expectedPipeline) setTargets(prev => ({ ...prev, expectedPipeline: draft.expectedPipeline }))
                                            if (draft.winRate != null && !targets.winRate) setTargets(prev => ({ ...prev, winRate: draft.winRate }))
                                            setConfirmPanel(null)
                                            setMessage('Financial targets updated — remember to save.')
                                        }}
                                            className="px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors font-medium">
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            )
                        })()}
                    </section>

                    {/* Event Targets */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-violet-500 rounded-full" />
                            Event Targets
                            {isEventTargetsDirty && <UnsavedBadge />}
                            {canEdit && !isLocked && (
                                <button
                                    onClick={async () => {
                                        const draft = await runExtraction('events')
                                        if (draft) setConfirmPanel({ section: 'events', draft })
                                    }}
                                    disabled={sparkleLoading === 'events'}
                                    title="Fill empty event target fields from marketing plan"
                                    className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {sparkleLoading === 'events' ? (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                        </svg>
                                    ) : (
                                        <Sparkles className="w-4 h-4" />
                                    )}
                                </button>
                            )}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The target number of contacts to be scanned or collected at the event.">Event Scans</Tooltip></label>
                                <FormattedInput
                                    value={targets.targetEventScans}
                                    onChange={val => setTargets(prev => ({ ...prev, targetEventScans: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="50"
                                    focusRingColor="violet"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The target number of external leads to be met with customers or prospects during the event.">External Leads</Tooltip></label>
                                <FormattedInput
                                    value={targets.targetCustomerMeetings}
                                    onChange={val => setTargets(prev => ({ ...prev, targetCustomerMeetings: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="20"
                                    focusRingColor="violet"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The target number of speaking sessions, panels, or presentations secured at the event.">Speaking</Tooltip></label>
                                <FormattedInput
                                    value={targets.targetSpeaking}
                                    onChange={val => setTargets(prev => ({ ...prev, targetSpeaking: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="5"
                                    focusRingColor="violet"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The target number of media interviews, press mentions, or PR activities.">Media / PR</Tooltip></label>
                                <FormattedInput
                                    value={targets.targetMediaPR}
                                    onChange={val => setTargets(prev => ({ ...prev, targetMediaPR: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="5"
                                    focusRingColor="violet"
                                />
                            </div>
                        </div>
                        {confirmPanel?.section === 'events' && (() => {
                            const draft = confirmPanel.draft
                            const toFill = [
                                !targets.targetCustomerMeetings && draft.targetCustomerMeetings != null,
                                !targets.targetSpeaking && draft.targetSpeaking != null,
                                !targets.targetMediaPR && draft.targetMediaPR != null,
                            ].filter(Boolean).length
                            const toSkip = [
                                !!targets.targetCustomerMeetings,
                                !!targets.targetSpeaking,
                                !!targets.targetMediaPR,
                            ].filter(Boolean).length
                            return (
                                <div className="mt-4 p-4 bg-white/70 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-sm flex items-center justify-between gap-4">
                                    <div className="text-sm text-zinc-700">
                                        <span className="font-medium text-amber-600">✦ {toFill} field{toFill !== 1 ? 's' : ''} will be filled</span>
                                        {toSkip > 0 && <span className="text-zinc-500"> · {toSkip} already ha{toSkip !== 1 ? 've' : 's'} a value and will be skipped</span>}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button onClick={() => setConfirmPanel(null)}
                                            className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                                            Cancel
                                        </button>
                                        <button onClick={() => {
                                            if (draft.targetCustomerMeetings != null && !targets.targetCustomerMeetings) setTargets(prev => ({ ...prev, targetCustomerMeetings: draft.targetCustomerMeetings }))
                                            if (draft.targetSpeaking != null && !targets.targetSpeaking) setTargets(prev => ({ ...prev, targetSpeaking: draft.targetSpeaking }))
                                            if (draft.targetMediaPR != null && !targets.targetMediaPR) setTargets(prev => ({ ...prev, targetMediaPR: draft.targetMediaPR }))
                                            setConfirmPanel(null)
                                            setMessage('Event targets updated — remember to save.')
                                        }}
                                            className="px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors font-medium">
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            )
                        })()}
                    </section>

                    {/* Target Companies */}
                    <section id="target-companies" className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-teal-500 rounded-full" />
                            Target Companies
                            {isCompaniesDirty && <UnsavedBadge />}
                            {canEdit && !isLocked && (
                                <>
                                    <button
                                        onClick={async () => {
                                            const draft = await runExtraction('companies')
                                            if (!draft) return
                                            const suggested = (draft.targetCompanies || [])
                                                .filter(c => !targets.targetCompanies.some(tc => tc.name.toLowerCase() === c.name.toLowerCase()))
                                                .map(c => ({
                                                    name: c.name,
                                                    description: c.description,
                                                    checked: true,
                                                    existingId: availableCompanies.find(ac => ac.name.toLowerCase() === c.name.toLowerCase())?.id ?? null,
                                                }))
                                            if (suggested.length === 0) {
                                                setMessage('All suggested companies are already in your target list.')
                                                return
                                            }
                                            setCompanyChecklist(suggested)
                                        }}
                                        disabled={sparkleLoading === 'companies'}
                                        title="Add suggested target companies from marketing plan"
                                        className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        {sparkleLoading === 'companies' ? (
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                            </svg>
                                        ) : (
                                            <Sparkles className="w-4 h-4" />
                                        )}
                                    </button>
                                </>
                            )}
                        </h3>
                        {companyChecklist && (
                            <div className="mb-4 p-4 bg-white/70 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-sm">
                                <p className="text-sm font-medium text-zinc-700 mb-3">
                                    <span className="text-amber-600 font-semibold">✦ {companyChecklist.length} companies suggested</span>
                                    {targets.targetCompanies.length > 0 && (
                                        <span className="text-zinc-500"> · {targets.targetCompanies.length} already in your targets</span>
                                    )}
                                </p>
                                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                                    {companyChecklist.map((item, i) => (
                                        <label key={i} className="flex items-start gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={item.checked}
                                                onChange={() => setCompanyChecklist(prev => prev!.map((c, j) =>
                                                    j === i ? { ...c, checked: !c.checked } : c
                                                ))}
                                                className="mt-0.5 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-zinc-900 group-hover:text-teal-700">{item.name}</span>
                                                {item.existingId === null && (
                                                    <span className="ml-2 text-xs text-amber-600 font-medium">new</span>
                                                )}
                                                {item.description && (
                                                    <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setCompanyChecklist(null)}
                                        className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                                        Cancel
                                    </button>
                                    <button
                                        disabled={companySaving || companyChecklist.every(c => !c.checked)}
                                        onClick={async () => {
                                            setCompanySaving(true)
                                            try {
                                                const selected = companyChecklist.filter(c => c.checked)
                                                const resolved: Array<{ id: string; name: string }> = []
                                                let skipped = 0

                                                for (const item of selected) {
                                                    if (item.existingId) {
                                                        resolved.push({ id: item.existingId, name: item.name })
                                                    } else {
                                                        // Try to create the company
                                                        const res = await fetch('/api/companies', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ name: item.name, description: item.description }),
                                                        })
                                                        if (res.ok) {
                                                            const created = await res.json()
                                                            resolved.push({ id: created.id, name: created.name })
                                                            setAvailableCompanies(prev => [...prev, created])
                                                        } else if (res.status === 409) {
                                                            // Already exists — fetch it
                                                            const listRes = await fetch(`/api/companies?query=${encodeURIComponent(item.name)}`)
                                                            if (listRes.ok) {
                                                                const list = await listRes.json()
                                                                const match = list.find((c: { name: string; id: string }) =>
                                                                    c.name.toLowerCase() === item.name.toLowerCase()
                                                                )
                                                                if (match) {
                                                                    resolved.push({ id: match.id, name: match.name })
                                                                    setAvailableCompanies(prev => [...prev, match])
                                                                } else {
                                                                    skipped++
                                                                }
                                                            } else {
                                                                skipped++
                                                            }
                                                        } else {
                                                            // Non-200, non-409 — skip and track
                                                            skipped++
                                                        }
                                                    }
                                                }

                                                setTargets(prev => ({
                                                    ...prev,
                                                    targetCompanies: [
                                                        ...prev.targetCompanies,
                                                        ...resolved.filter(r => !prev.targetCompanies.some(tc => tc.id === r.id)),
                                                    ],
                                                }))
                                                setCompanyChecklist(null)
                                                setMessage(`${resolved.length} compan${resolved.length !== 1 ? 'ies' : 'y'} added${skipped > 0 ? `, ${skipped} could not be created` : ''} — remember to save.`)
                                            } finally {
                                                setCompanySaving(false)
                                            }
                                        }}
                                        className="px-3 py-1.5 text-sm bg-teal-600 text-white hover:bg-teal-700 rounded-lg transition-colors font-medium disabled:opacity-50">
                                        {companySaving ? 'Adding…' : 'Add Selected'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {!(isLocked || !canEdit) && (
                            <>
                                <div ref={companyDropdownRef} className="relative mb-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={companyInput}
                                            onChange={e => { setCompanyInput(e.target.value); setShowCompanyDropdown(true) }}
                                            onFocus={() => setShowCompanyDropdown(true)}
                                            placeholder="Search companies to add..."
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                                        />
                                    </div>
                                    {showCompanyDropdown && filteredAvailableCompanies.length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-white shadow-lg rounded-md border border-zinc-200 max-h-60 overflow-y-auto">
                                            {filteredAvailableCompanies.map(company => (
                                                <div
                                                    key={company.id}
                                                    className="px-4 py-2 hover:bg-teal-50 cursor-pointer border-b border-zinc-50 last:border-none"
                                                    onClick={() => addCompany(company)}
                                                >
                                                    <div className="font-medium text-zinc-900">{company.name}</div>
                                                    {!!company.pipelineValue && <div className="text-xs text-zinc-500">Pipeline: ${company.pipelineValue.toLocaleString()}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <label className="text-xs text-zinc-500 mb-1.5 block">Or paste a comma-separated list of company names</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={bulkInput}
                                            onChange={e => setBulkInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleBulkProcess()}
                                            placeholder="Acme Corp, Beta Inc, Gamma Ltd..."
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                                        />
                                        <button
                                            onClick={handleBulkProcess}
                                            disabled={!bulkInput.trim()}
                                            className="px-4 py-2.5 text-sm bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                                        >
                                            Process
                                        </button>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-1.5">Matched companies are added immediately. Unmatched ones open Data Ingestion to create them.</p>
                                </div>
                                <div className="mb-4 p-4 border border-dashed border-zinc-300 rounded-xl bg-zinc-50">
                                    <p className="text-sm text-zinc-600 mb-2">Have a spreadsheet or document with company names? Upload it via Data Ingestion — reviewed companies will be automatically added to your target list.</p>
                                    <button
                                        onClick={() => router.push(`/events/${eventId}/data-ingestion?returnTo=roi`)}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 hover:border-zinc-400 transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Upload File via Data Ingestion
                                    </button>
                                </div>
                            </>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {targets.targetCompanies.map(company => {
                                const isSelected = selectedForLinkedIn.has(company.id)
                                return (
                                    <span
                                        key={company.id}
                                        onClick={!(isLocked || !canEdit) ? () => toggleLinkedInSelection(company.id) : undefined}
                                        className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${!(isLocked || !canEdit) ? 'cursor-pointer' : ''
                                            } ${isSelected
                                                ? 'bg-blue-50 text-blue-800 border-blue-400 ring-2 ring-blue-200'
                                                : 'bg-teal-50 text-teal-800 border-teal-200 hover:border-teal-400'
                                            }`}
                                    >
                                        {isSelected && (
                                            <span className="w-3 h-3 rounded-sm bg-blue-600 flex items-center justify-center text-white" style={{ fontSize: '8px' }}>✓</span>
                                        )}
                                        {company.name}
                                        {!!company.pipelineValue && <span className="text-xs opacity-60">(${company.pipelineValue.toLocaleString()})</span>}
                                        {!(isLocked || !canEdit) && (
                                            <button
                                                onClick={e => { e.stopPropagation(); removeCompany(company.id) }}
                                                className="hover:text-red-600 ml-0.5"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </span>
                                )
                            })}
                            {targets.targetCompanies.length === 0 && (
                                <p className="text-sm text-zinc-400 italic">No target companies added yet.</p>
                            )}
                        </div>
                        {/* LinkedIn multi-company draft trigger */}
                        {canEdit && !isLocked && targets.targetCompanies.length > 0 && (
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                                {selectedForLinkedIn.size > 0 ? (
                                    <>
                                        <button
                                            onClick={() => setLinkedInModalOpen(true)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                            </svg>
                                            Draft LinkedIn Article ({selectedForLinkedIn.size} {selectedForLinkedIn.size === 1 ? 'company' : 'companies'})
                                        </button>
                                        <button
                                            onClick={() => setSelectedForLinkedIn(new Set())}
                                            className="text-xs text-zinc-400 hover:text-zinc-600"
                                        >
                                            Clear selection
                                        </button>
                                        {selectedForLinkedIn.size === 5 && (
                                            <span className="text-xs text-amber-600">Maximum 5 selected</span>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-xs text-zinc-400">Select companies to generate a LinkedIn article campaign (up to 5)</p>
                                )}
                            </div>
                        )}
                    </section>

                    {/* LinkedIn Campaigns Modal */}
                    {linkedInModalOpen && (
                        <LinkedInModal
                            isOpen={linkedInModalOpen}
                            onClose={() => { setLinkedInModalOpen(false); setSelectedForLinkedIn(new Set()) }}
                            companies={targets.targetCompanies.filter(c => selectedForLinkedIn.has(c.id))}
                            eventId={eventId}
                            eventSlug={eventId}
                        />
                    )}

                    {/* Marketing Plan */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-2 flex items-center gap-2">
                            <span className="w-1 h-5 bg-amber-500 rounded-full" />
                            Marketing Plan
                            {isMarketingPlanDirty && <UnsavedBadge />}
                            {canEdit && !isLocked && (
                                <SparkleMarketingPlanButton
                                    eventId={eventId}
                                    hasPlan={!!targets.marketingPlan}
                                    onHasPlan={() => setMessage('An existing marketing plan was found — no new plan was generated.')}
                                    onGenerated={(plan) => {
                                        setTargets(prev => ({ ...prev, marketingPlan: plan }))
                                        setMessage('Marketing plan generated — review and save.')
                                    }}
                                    onError={() => setMessage('Failed to generate marketing plan. Please try again or type one manually.')}
                                    className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
                                    title="Generate Event Marketing Plan"
                                />
                            )}
                        </h3>
                        <p className="text-sm text-zinc-500 mb-4">
                            AI-generated plan from the sparkle icon on the Events page. Editable — saved with &quot;Save Targets&quot;.
                        </p>
                        <textarea
                            value={targets.marketingPlan || ''}
                            readOnly={isLocked || !canEdit}
                            onChange={e => setTargets(prev => ({ ...prev, marketingPlan: e.target.value }))}
                            rows={12}
                            placeholder="Use the ✦ sparkle icon above to generate a marketing plan, or type one here."
                            className={`w-full px-3 py-2.5 rounded-xl border text-sm resize-y ${(isLocked || !canEdit)
                                    ? 'bg-zinc-50 border-zinc-100 text-zinc-600'
                                    : 'border-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                                }`}
                        />
                    </section>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                        {canEdit && !isLocked && (
                            <button onClick={handleSaveTargets} disabled={saving}
                                className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
                                <Save className="w-4 h-4" />
                                Save Targets
                            </button>
                        )}
                        {targets.id && targets.status === 'DRAFT' && canEdit && (
                            <button onClick={handleSubmit}
                                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
                                <Send className="w-4 h-4" />
                                Submit for Approval
                            </button>
                        )}
                        {targets.id && targets.status === 'SUBMITTED' && canApproveOrReject && (
                            <>
                                <button onClick={handleApprove}
                                    className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm">
                                    <CheckCircle className="w-4 h-4" />
                                    Approve
                                </button>
                                <button onClick={handleReject}
                                    className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm">
                                    <X className="w-4 h-4" />
                                    Reject
                                </button>
                            </>
                        )}
                        {isLocked && (
                            <p className="text-sm text-emerald-700 font-medium flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Targets approved and locked
                            </p>
                        )}
                        {isLocked && canApproveOrReject && (
                            <button onClick={handleResetToDraft}
                                className="bg-amber-100 text-amber-800 border border-amber-300 px-4 py-2.5 rounded-xl font-medium hover:bg-amber-200 transition-colors flex items-center gap-2 text-sm">
                                <X className="w-4 h-4" />
                                Reset to Draft
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== TAB 2: PERFORMANCE ======================== */}
            {activeTab === 'performance' && actuals && (
                <div className="space-y-8">
                    {/* Budget Performance */}
                    <section>
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                            Budget Performance
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-center">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Budget</h4>
                                <div className="text-3xl font-bold text-zinc-900">{targets.budget ? currency(targets.budget) : '—'}</div>
                                <p className="text-sm mt-2 text-zinc-400">Planned spend</p>
                            </div>
                            <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-center">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Actual</h4>
                                <div className="text-3xl font-bold text-zinc-900">{actuals.actualCost ? currency(actuals.actualCost) : '—'}</div>
                                <p className="text-sm mt-2 text-zinc-400">Actual spend</p>
                            </div>
                            <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-center">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">% of Budget</h4>
                                {(() => {
                                    const budget = targets.budget || 0
                                    const actual = actuals.actualCost
                                    if (budget === 0 && actual === 0) {
                                        return (
                                            <>
                                                <div className="text-3xl font-bold text-zinc-300">—</div>
                                                <p className="text-sm mt-2 text-zinc-400">No data</p>
                                            </>
                                        )
                                    }
                                    if (budget === 0) {
                                        return (
                                            <>
                                                <div className="text-3xl font-bold text-red-600">—</div>
                                                <p className="text-sm mt-2 text-red-500">No budget set</p>
                                            </>
                                        )
                                    }
                                    const pct = (actual / budget) * 100
                                    const overBy = pct - 100
                                    const colorClass = overBy <= 0 ? 'text-emerald-600' : overBy <= 5 ? 'text-amber-600' : 'text-red-600'
                                    const labelClass = overBy <= 0 ? 'text-emerald-500' : overBy <= 5 ? 'text-amber-500' : 'text-red-500'
                                    const label = overBy <= 0 ? 'Under / on budget' : overBy <= 5 ? 'Slightly over budget' : 'Over budget'
                                    return (
                                        <>
                                            <div className={`text-3xl font-bold ${colorClass}`}>{pct.toFixed(1)}%</div>
                                            <p className={`text-sm mt-2 ${labelClass}`}>{label}</p>
                                        </>
                                    )
                                })()}
                            </div>
                        </div>
                    </section>

                    {/* Event Executive Summary */}
                    <section>
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-rose-500 rounded-full" />
                            Event Executive Summary
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <MetricCard label="LI Company Touches" tooltip="Number of event target companies engaged by POSTED LinkedIn campaigns." target={targets.targetCompanies.length} actual={linkedInSummary.targetCompaniesEngaged.length} href="#section-linkedin" />
                            <MetricCard label="Media / PR" tooltip="The actual vs target number of media interviews, press mentions, or PR activities." target={targets.targetMediaPR || 0} actual={actuals.actualMediaPR} href="#section-media-pr" />
                            <MetricCard label="Event Scans" tooltip="Actual vs target contacts scanned or collected at the event." target={targets.targetEventScans || 0} actual={actuals.actualEventScans} />
                            <MetricCard label="External Leads" tooltip="Actual vs target number of confirmed/occurred external leads." target={targets.targetCustomerMeetings || 0} actual={actuals.actualCustomerMeetings} href={`/events/${eventId}/dashboard`} />
                            <MetricCard label="Speaking" tooltip="The actual vs target number of speaking sessions, panels, or presentations secured at the event." target={targets.targetSpeaking || 0} actual={actuals.actualSpeaking} />
                        </div>
                    </section>

                    {/* LinkedIn Campaigns Summary */}
                    <section id="section-linkedin" className="space-y-4">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-1 flex items-center gap-2">
                            <span className="w-1 h-5 bg-blue-500 rounded-full" />
                            LinkedIn Campaigns
                            <Link href={`/events/${eventId}/linkedin-campaigns`}
                                className="text-zinc-400 hover:text-blue-600 transition-colors" title="View LinkedIn Campaigns">
                                <ExternalLink className="w-4 h-4" />
                            </Link>
                        </h3>
                        <p className="text-xs text-zinc-500 mb-4">Numbers next to each company show how many POSTED campaigns engaged them.</p>

                        <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                            <h4 className="text-sm font-semibold text-zinc-900 mb-1 flex items-center gap-2">
                                <Tooltip content="Target companies engaged by your LinkedIn campaigns, ranked by number of POSTED campaigns each appeared in. Matching is case- and whitespace-insensitive.">
                                    Event Target Companies Engaged
                                </Tooltip>
                                <span className="ml-1 text-xs font-normal text-zinc-500">({linkedInSummary.targetCompaniesEngaged.length})</span>
                                {linkedInSummary.targetCoveragePct !== null && linkedInSummary.targetCompaniesEngaged.length > 0 && (
                                    <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                                        {linkedInSummary.targetCoveragePct.toFixed(0)}% coverage
                                    </span>
                                )}
                            </h4>
                            <p className="text-xs text-zinc-500 mb-4">Event ROI target companies touched by your POSTED LinkedIn campaigns.</p>
                            {linkedInSummary.targetCompaniesEngaged.length === 0 ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                    None
                                </span>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {linkedInSummary.targetCompaniesEngaged.map(c => (
                                        <span key={c.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-50 text-teal-800 border border-teal-200">
                                            {c.name}
                                            <span className="text-xs opacity-60">· {c.count}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                            <h4 className="text-sm font-semibold text-zinc-900 mb-1 flex items-center gap-2">
                                <Tooltip content="Companies engaged by your campaigns that exist in the system company directory but are not on this event's target list.">
                                    Known Companies Engaged
                                </Tooltip>
                                <span className="ml-1 text-xs font-normal text-zinc-500">({linkedInSummary.knownCompaniesEngaged.length})</span>
                            </h4>
                            <p className="text-xs text-zinc-500 mb-4">In the system company directory, but not event targets.</p>
                            {linkedInSummary.knownCompaniesEngaged.length === 0 ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                    None
                                </span>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {linkedInSummary.knownCompaniesEngaged.map(c => (
                                        <span key={c.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-800 border border-indigo-200">
                                            {c.name}
                                            <span className="text-xs opacity-60">· {c.count}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                            <h4 className="text-sm font-semibold text-zinc-900 mb-1 flex items-center gap-2">
                                <Tooltip content="Companies engaged by your campaigns that are neither event targets nor in the system company directory.">
                                    Other Companies Engaged
                                </Tooltip>
                                <span className="ml-1 text-xs font-normal text-zinc-500">({linkedInSummary.otherCompaniesEngaged.length})</span>
                            </h4>
                            <p className="text-xs text-zinc-500 mb-4">Not targets, not in the directory — potential new additions.</p>
                            {linkedInSummary.otherCompaniesEngaged.length === 0 ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                    None
                                </span>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {linkedInSummary.otherCompaniesEngaged.map(c => (
                                        <span key={c.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-700 border border-zinc-300">
                                            {c.name}
                                            <span className="text-xs opacity-60">· {c.count}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {linkedInSummary.postedCount > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Total POSTED campaigns. Sub-line shows POSTED vs DRAFT counts.">Campaigns</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.postedCount}</div>
                                    <p className="text-xs text-zinc-400 mt-1">{linkedInSummary.postedCount} posted · {linkedInSummary.draftCount} drafts</p>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Sum of budget across POSTED campaigns. Sub-line shows the campaign date range.">Total Ad Spend</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{currency(linkedInSummary.totalBudget)}</div>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        {linkedInSummary.earliestStart ? linkedInSummary.earliestStart.toLocaleDateString() : '—'}
                                        {' → '}
                                        {linkedInSummary.latestEnd ? linkedInSummary.latestEnd.toLocaleDateString() : 'ongoing'}
                                    </p>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Total ad impressions across POSTED campaigns.">Impressions</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.totalImpressions.toLocaleString()}</div>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Total link clicks across POSTED campaigns.">Clicks</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.totalClicks.toLocaleString()}</div>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Blended click-through rate: total clicks divided by total impressions. More accurate than averaging per-campaign rates.">Aggregate CTR</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.blendedCtr !== null ? `${linkedInSummary.blendedCtr.toFixed(2)}%` : '—'}</div>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Blended cost per click: total spend divided by total clicks.">Aggregate CPC</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.blendedCpc !== null ? `$${linkedInSummary.blendedCpc.toFixed(2)}` : '—'}</div>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Total unique active users who engaged across POSTED campaigns.">Active Users</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.totalActiveUsers.toLocaleString()}</div>
                                </div>
                                <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm">
                                    <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2"><Tooltip content="Average engagement time per active user, weighted by active-user count of each campaign.">Avg Engagement Time</Tooltip></h4>
                                    <div className="text-2xl font-bold text-zinc-900">{linkedInSummary.weightedEngagement !== null ? `${linkedInSummary.weightedEngagement.toFixed(1)}s` : '—'}</div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Media/PR Performance */}
                    <section id="section-media-pr" className="space-y-4">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-indigo-500 rounded-full" />
                            <Megaphone className="w-5 h-5 text-indigo-600" />
                            Media/PR Performance
                            <Link href={`/events/${eventId}/comms`}
                                className="text-zinc-400 hover:text-indigo-600 transition-colors" title="View Pitches">
                                <ExternalLink className="w-4 h-4" />
                            </Link>
                        </h3>
                        <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-zinc-100">
                                <p className="text-sm text-zinc-500">Pitch targets across all event pitches.</p>
                            </div>
                            {mediaTargets.length === 0 ? (
                                <div className="px-6 py-10 text-center text-zinc-500">
                                    No pitch targets yet for this event.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-zinc-200">
                                        <thead className="bg-zinc-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Target</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Pipeline</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Committed</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Occurred</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Resulting URLs</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-zinc-100">
                                            {mediaTargets.map(row => (
                                                <tr key={row.attendee.id} className="hover:bg-zinc-50">
                                                    <td className="px-4 py-3 align-top">
                                                        <div className="text-sm font-medium text-zinc-900">{row.attendee.name}</div>
                                                        <div className="text-xs text-zinc-500">
                                                            {row.attendee.title ? `${row.attendee.title} · ` : ''}
                                                            {row.attendee.company?.name ?? row.attendee.email}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 align-top text-sm text-zinc-700">{row.pipelineCount}</td>
                                                    <td className="px-4 py-3 align-top text-sm text-zinc-700">{row.committedCount}</td>
                                                    <td className="px-4 py-3 align-top text-sm text-zinc-700">{row.occurredCount}</td>
                                                    <td className="px-4 py-3 align-top">
                                                        {row.urls.length === 0 ? (
                                                            <span className="text-xs text-zinc-400">—</span>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {row.urls.map(u => (
                                                                    <a
                                                                        key={u}
                                                                        href={u}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                                                        title={u}
                                                                    >
                                                                        {urlHostname(u)}
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-zinc-50 border-t border-zinc-200">
                                            <tr>
                                                <td className="px-4 py-3 text-sm font-semibold text-zinc-900">Totals</td>
                                                <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                                                    {mediaTargets.reduce((s, r) => s + r.pipelineCount, 0)}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                                                    {mediaTargets.reduce((s, r) => s + r.committedCount, 0)}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                                                    {mediaTargets.reduce((s, r) => s + r.occurredCount, 0)}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                                                    {mediaTargets.reduce((s, r) => s + r.urls.length, 0)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Physical Event Execution */}
                    <section className="space-y-4">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-violet-500 rounded-full" />
                            Physical Event Execution
                        </h3>

                        {/* Target Companies */}
                        <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                            <CompanyChecklist targetCompanies={targets.targetCompanies} hitCompanyIds={actuals.targetCompaniesHit.map(c => c.id)} />
                        </section>

                        {/* Additional Companies */}
                        <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-zinc-900 mb-2 flex items-center gap-2">
                                <span className="w-1 h-5 bg-orange-400 rounded-full" />
                                Additional Companies
                                <span className="ml-1 text-sm font-normal text-zinc-500">({actuals.additionalCompanies.length})</span>
                            </h3>
                            <p className="text-sm text-zinc-500 mb-4">Companies of event attendees not in the target list.</p>
                            <div className="flex flex-wrap gap-2">
                                {actuals.additionalCompanies.length === 0 ? (
                                    <p className="text-sm text-zinc-400 italic">No additional companies recorded.</p>
                                ) : (
                                    actuals.additionalCompanies.map(c => (
                                        <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-800 border border-orange-200">
                                            {c.name}
                                            {!!c.pipelineValue && <span className="text-xs opacity-60">(${c.pipelineValue.toLocaleString()})</span>}
                                        </span>
                                    ))
                                )}
                            </div>
                        </section>
                    </section>

                    {/* Pipeline Performance */}
                    <section>
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-indigo-500 rounded-full" />
                            Pipeline Performance
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <MetricCard label="Pipeline" tooltip="The actual sales pipeline generated from the event so far." target={targets.expectedPipeline || 0} actual={actuals.actualPipeline} variant="ring" formatValue={currency} size="lg" />
                            <MetricCard label="Revenue" tooltip="The actual closed-won revenue generated from the event so far." target={targets.expectedRevenue || 0} actual={actuals.actualRevenue} variant="ring" formatValue={currency} size="lg" />
                            <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center">
                                <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3"><Tooltip content="The ratio of actual Pipeline generated divided by the actual Investment spent. Uses Actual Cost if entered, otherwise falls back to Budget.">ROI Ratio</Tooltip></h4>
                                <div className="text-4xl font-bold text-zinc-900">
                                    {(actuals.actualCost > 0 ? actuals.actualCost : actuals.actualInvestment) > 0 ? `${((actuals.actualPipeline / (actuals.actualCost > 0 ? actuals.actualCost : actuals.actualInvestment)) * 100).toFixed(0)}%` : '—'}
                                </div>
                                <p className="text-sm text-zinc-400 mt-2">Pipeline / Investment</p>
                                <div className="mt-3 text-xs text-zinc-500">
                                    Investment: {currency(actuals.actualCost > 0 ? actuals.actualCost : actuals.actualInvestment)}
                                    <span className="ml-1 text-zinc-400">{actuals.actualCost > 0 ? '(actual)' : '(budget)'}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'performance' && !actuals && (
                <div className="text-center py-12 text-zinc-500">
                    <TrendingUp className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
                    <p className="text-lg font-medium">No performance data yet</p>
                    <p className="text-sm mt-1">Start logging meetings to see actuals populate here.</p>
                </div>
            )}

            {/* ======================== TAB 3: POST-EVENT ACTUALS ======================== */}
            {activeTab === 'actuals' && (
                <div className="space-y-8">
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-2 flex items-center gap-2">
                            <span className="w-1 h-5 bg-rose-500 rounded-full" />
                            Engagement Actuals
                        </h3>
                        <p className="text-sm text-zinc-500 mb-6">Enter the actual metrics that can&apos;t be auto-calculated from meeting data.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The actual spend for this event.">Actual Cost ($)</Tooltip></label>
                                <FormattedInput
                                    prefix="$"
                                    value={targets.actualCost ?? null}
                                    onChange={val => setTargets(prev => ({ ...prev, actualCost: val }))}
                                    readOnly={isActualsLocked || !canEdit}
                                    placeholder="0"
                                    focusRingColor="rose"
                                />
                                <p className="text-xs text-zinc-400 mt-1">Budget: {targets.budget ? `$${targets.budget.toLocaleString()}` : '—'}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The actual number of contacts scanned or collected at the event.">Event Scans</Tooltip></label>
                                <FormattedInput
                                    value={targets.actualEventScans ?? null}
                                    onChange={val => setTargets(prev => ({ ...prev, actualEventScans: val }))}
                                    readOnly={isActualsLocked || !canEdit}
                                    placeholder="0"
                                    focusRingColor="rose"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="Number of confirmed and occurred external leads at this event (auto-calculated).">External Leads</Tooltip></label>
                                <div className="px-3 py-2.5 rounded-xl border border-zinc-100 bg-zinc-50 text-sm text-zinc-600">
                                    {actuals?.actualCustomerMeetings ?? 0}
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">Auto-counted (confirmed &amp; occurred)</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The actual number of speaking sessions, panels, or presentations secured at the event.">Speaking</Tooltip></label>
                                <FormattedInput
                                    value={targets.actualSpeaking}
                                    onChange={val => setTargets(prev => ({ ...prev, actualSpeaking: val }))}
                                    readOnly={isActualsLocked || !canEdit}
                                    placeholder="0"
                                    focusRingColor="rose"
                                />
                            </div>
                        </div>
                    </section>

                    <div className="flex items-center gap-3">
                        {canEdit && !isActualsLocked && (
                            <button onClick={handleSaveActuals} disabled={saving}
                                className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
                                <Save className="w-4 h-4" />
                                Save Actuals
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Unsaved changes navigation warning */}
            {pendingNavigation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-zinc-200">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-zinc-900">Unsaved changes</h3>
                                <p className="mt-1 text-sm text-zinc-500">You have unsaved changes that will be lost if you leave this page. Do you want to continue?</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPendingNavigation(null)}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
                            >
                                Stay on page
                            </button>
                            <button
                                onClick={() => {
                                    const dest = pendingNavigation
                                    setPendingNavigation(null)
                                    router.push(dest!)
                                }}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                            >
                                Leave without saving
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function ROIPageWrapper() {
    return (
        <Suspense fallback={null}>
            <ROIPage />
        </Suspense>
    )
}
