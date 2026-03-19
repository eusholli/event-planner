'use client'

import { Save, Send, CheckCircle, X, TrendingUp, Target, Mic, Sparkles } from 'lucide-react'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useUser } from '@/components/auth'
import MetricCard from '@/components/roi/MetricCard'
import ProgressBar from '@/components/roi/ProgressBar'
import CompanyChecklist from '@/components/roi/CompanyChecklist'
import Tooltip from '@/components/roi/Tooltip'
import FormattedInput from '@/components/roi/FormattedInput'

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
    targetCompanies: Company[]
    actualErta: number | null
    actualSpeaking: number | null
    actualMediaPR: number | null
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
    actualErta: number
    actualSpeaking: number
    actualMediaPR: number
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
    targetCompanies: [],
    actualErta: null,
    actualSpeaking: null,
    actualMediaPR: null,
    status: 'DRAFT',
    marketingPlan: null,
}

const currency = (v: number) => `$${v.toLocaleString()}`

function ROIPage() {
    const params = useParams()
    const eventId = params?.id as string

    const { user } = useUser()
    const [activeTab, setActiveTab] = useState<'targets' | 'performance' | 'actuals'>('targets')
    const [targets, setTargets] = useState<ROITargets>(emptyTargets)
    const [actuals, setActuals] = useState<ROIActuals | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const searchParams = useSearchParams()
    const router = useRouter()
    const [companyInput, setCompanyInput] = useState('')
    const [availableCompanies, setAvailableCompanies] = useState<Company[]>([])
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
    const companyDropdownRef = useRef<HTMLDivElement>(null)

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

    const role = user?.publicMetadata?.role as string
    const canEdit = role === 'root' || role === 'marketing'
    const canApproveOrReject = role === 'root'

    // Fetch data
    useEffect(() => {
        if (!eventId) return
        fetch(`/api/events/${eventId}/roi`)
            .then(res => res.json())
            .then(data => {
                if (data.targets) setTargets(data.targets)
                if (data.actuals) setActuals(data.actuals)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load ROI data', err)
                setLoading(false)
            })
    }, [eventId])

    // Fetch companies for selector
    useEffect(() => {
        fetch('/api/companies')
            .then(res => res.json())
            .then(data => setAvailableCompanies(data))
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
            setMessage('Targets saved successfully')
        } catch (err: any) {
            setMessage(err.message || 'Error saving targets')
        } finally {
            setSaving(false)
        }
    }

    const handleSubmit = async () => {
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

    const handleSaveActuals = async () => {
        setSaving(true)
        setMessage('')
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actualErta: targets.actualErta,
                    actualSpeaking: targets.actualSpeaking,
                    actualMediaPR: targets.actualMediaPR,
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

    const removeCompany = (companyId: string) => {
        setTargets(prev => ({ ...prev, targetCompanies: prev.targetCompanies.filter(c => c.id !== companyId) }))
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
        targets.targetErta !== null && targets.targetErta !== undefined &&
        targets.targetSpeaking !== null && targets.targetSpeaking !== undefined &&
        targets.targetMediaPR !== null && targets.targetMediaPR !== undefined

    // Runs Phase 1 (if no plan) then Phase 2, returns the draft or null on error
    const runExtraction = async (section: 'financial' | 'events' | 'companies') => {
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

    const tabs = [
        { id: 'targets' as const, label: 'Targets & Approval', icon: Target },
        { id: 'actuals' as const, label: 'Event Execution', icon: Mic },
        { id: 'performance' as const, label: 'Performance Tracker', icon: TrendingUp },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-900">ROI Dashboard</h1>
                    <p className="mt-1 text-zinc-500">Set targets, track performance, and measure event ROI.</p>
                </div>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${statusStyle.color}`}>
                    {targets.status === 'APPROVED' && <CheckCircle className="w-4 h-4" />}
                    {statusStyle.label}
                </div>
            </div>

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
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The target number of meetings to be held with customers or prospects during the event.">Customer Meetings</Tooltip></label>
                                <FormattedInput
                                    value={targets.targetCustomerMeetings}
                                    onChange={val => setTargets(prev => ({ ...prev, targetCustomerMeetings: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="20"
                                    focusRingColor="violet"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="ERTA = (Engagements from employees at targeted companies / Total employees from targeted companies reached) × 100">ERTA</Tooltip></label>
                                <FormattedInput
                                    value={targets.targetErta}
                                    onChange={val => setTargets(prev => ({ ...prev, targetErta: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="15"
                                    suffix="%"
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
                                !targets.targetErta && draft.targetErta != null,
                                !targets.targetSpeaking && draft.targetSpeaking != null,
                                !targets.targetMediaPR && draft.targetMediaPR != null,
                            ].filter(Boolean).length
                            const toSkip = [
                                !!targets.targetCustomerMeetings,
                                !!targets.targetErta,
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
                                            if (draft.targetErta != null && !targets.targetErta) setTargets(prev => ({ ...prev, targetErta: draft.targetErta }))
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
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-teal-500 rounded-full" />
                            Target Companies
                            {canEdit && !isLocked && (
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
                            <div ref={companyDropdownRef} className="relative mb-4">
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
                                                {company.pipelineValue && <div className="text-xs text-zinc-500">Pipeline: ${company.pipelineValue.toLocaleString()}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {targets.targetCompanies.map(company => (
                                <span key={company.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 rounded-lg text-sm font-medium border border-teal-200">
                                    {company.name}
                                    {company.pipelineValue && <span className="text-xs text-teal-500">(${company.pipelineValue.toLocaleString()})</span>}
                                    {!(isLocked || !canEdit) && (
                                        <button onClick={() => removeCompany(company.id)} className="hover:text-teal-900">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {targets.targetCompanies.length === 0 && (
                                <p className="text-sm text-zinc-400 italic">No target companies added yet.</p>
                            )}
                        </div>
                    </section>

                    {/* Marketing Plan */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-2 flex items-center gap-2">
                            <span className="w-1 h-5 bg-amber-500 rounded-full" />
                            Marketing Plan
                        </h3>
                        <p className="text-sm text-zinc-500 mb-4">
                            AI-generated plan from the sparkle icon on the Events page. Editable — saved with &quot;Save Targets&quot;.
                        </p>
                        <textarea
                            value={targets.marketingPlan || ''}
                            readOnly={isLocked || !canEdit}
                            onChange={e => setTargets(prev => ({ ...prev, marketingPlan: e.target.value }))}
                            rows={12}
                            placeholder="Use the ✦ sparkle icon on an event card to generate a marketing plan, or type one here."
                            className={`w-full px-3 py-2.5 rounded-xl border text-sm resize-y ${
                                (isLocked || !canEdit)
                                    ? 'bg-zinc-50 border-zinc-100 text-zinc-600'
                                    : 'border-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                            }`}
                        />
                    </section>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                        {canEdit && !isLocked && (
                            <button onClick={handleSaveTargets} disabled={saving || !allFieldsFilled}
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
                    </div>
                </div>
            )}

            {/* ======================== TAB 2: PERFORMANCE ======================== */}
            {activeTab === 'performance' && actuals && (
                <div className="space-y-8">
                    {/* Financial Overview */}
                    <section>
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-indigo-500 rounded-full" />
                            Financial Performance
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <MetricCard label="Pipeline" tooltip="The actual sales pipeline generated from the event so far." target={targets.expectedPipeline || 0} actual={actuals.actualPipeline} variant="ring" formatValue={currency} size="lg" />
                            <MetricCard label="Revenue" tooltip="The actual closed-won revenue generated from the event so far." target={targets.expectedRevenue || 0} actual={actuals.actualRevenue} variant="ring" formatValue={currency} size="lg" />
                            <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center">
                                <h4 className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3"><Tooltip content="The ratio of actual Pipeline generated divided by the actual Investment (Budget) spent.">ROI Ratio</Tooltip></h4>
                                <div className="text-4xl font-bold text-zinc-900">
                                    {actuals.actualInvestment > 0 ? `${((actuals.actualPipeline / actuals.actualInvestment) * 100).toFixed(0)}%` : '—'}
                                </div>
                                <p className="text-sm text-zinc-400 mt-2">Pipeline / Investment</p>
                                <div className="mt-3 text-xs text-zinc-500">
                                    Investment: {currency(actuals.actualInvestment)}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Meeting KPIs */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
                            <span className="w-1 h-5 bg-violet-500 rounded-full" />
                            Meeting KPIs
                        </h3>
                        <div className="space-y-5">
                            <ProgressBar label="Customer Meetings" tooltip="The actual vs target number of meetings held with customers or prospects during the event." value={actuals.actualCustomerMeetings} max={targets.targetCustomerMeetings || 0} />
                        </div>
                    </section>

                    {/* Engagement */}
                    <section>
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-rose-500 rounded-full" />
                            Engagement
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <MetricCard label="ERTA" tooltip="ERTA = (Engagements from employees at targeted companies / Total employees from targeted companies reached) × 100" target={targets.targetErta || 0} actual={actuals.actualErta} formatValue={(v) => `${v.toLocaleString()}%`} />
                            <MetricCard label="Speaking" tooltip="The actual vs target number of speaking sessions, panels, or presentations secured at the event." target={targets.targetSpeaking || 0} actual={actuals.actualSpeaking} />
                            <MetricCard label="Media / PR" tooltip="The actual vs target number of media interviews, press mentions, or PR activities." target={targets.targetMediaPR || 0} actual={actuals.actualMediaPR} />
                        </div>
                    </section>

                    {/* Target Companies */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <CompanyChecklist targetCompanies={targets.targetCompanies} hitCompanyIds={actuals.targetCompaniesHit.map(c => c.id)} />
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="ERTA = (Engagements from employees at targeted companies / Total employees from targeted companies reached) × 100">ERTA</Tooltip></label>
                                <FormattedInput
                                    value={targets.actualErta}
                                    onChange={val => setTargets(prev => ({ ...prev, actualErta: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="0"
                                    suffix="%"
                                    focusRingColor="rose"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The actual number of speaking sessions, panels, or presentations secured at the event.">Speaking</Tooltip></label>
                                <FormattedInput
                                    value={targets.actualSpeaking}
                                    onChange={val => setTargets(prev => ({ ...prev, actualSpeaking: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="0"
                                    focusRingColor="rose"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1"><Tooltip content="The actual number of media interviews, press mentions, or PR activities.">Media / PR</Tooltip></label>
                                <FormattedInput
                                    value={targets.actualMediaPR}
                                    onChange={val => setTargets(prev => ({ ...prev, actualMediaPR: val }))}
                                    readOnly={isLocked || !canEdit}
                                    placeholder="0"
                                    focusRingColor="rose"
                                />
                            </div>
                        </div>
                    </section>

                    <div className="flex items-center gap-3">
                        {canEdit && (
                            <button onClick={handleSaveActuals} disabled={saving}
                                className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
                                <Save className="w-4 h-4" />
                                Save Actuals
                            </button>
                        )}
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
