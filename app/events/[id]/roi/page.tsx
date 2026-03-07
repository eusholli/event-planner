'use client'

import { Save, Send, CheckCircle, X, Plus, TrendingUp, Target, Mic } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useUser } from '@/components/auth'
import { canManageEvents as canManageEventsCheck } from '@/lib/role-utils'
import MetricCard from '@/components/roi/MetricCard'
import ProgressBar from '@/components/roi/ProgressBar'
import CompanyChecklist from '@/components/roi/CompanyChecklist'
import ProgressRing from '@/components/roi/ProgressRing'

interface Company {
    id: string
    name: string
    pipelineValue?: number | null
}

// Types
interface ROITargets {
    id?: string
    targetInvestment?: number | null
    budget?: number | null
    requesterEmail?: string | null
    expectedPipeline: number | null
    winRate: number | null
    expectedRevenue: number | null
    targetBoothMeetings: number | null
    targetCLevelMeetingsMin: number | null
    targetCLevelMeetingsMax: number | null
    targetOtherMeetings: number | null
    targetSocialReach: number | null
    targetKeynotes: number | null
    targetSeminars: number | null
    targetMediaPR: number | null
    targetBoothSessions: number | null
    targetCompanies: Company[]
    actualSocialReach: number | null
    actualKeynotes: number | null
    actualSeminars: number | null
    actualMediaPR: number | null
    actualBoothSessions: number | null
    status: string
    approvedBy?: string | null
    approvedAt?: string | null
    submittedAt?: string | null
}

interface ROIActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualBoothMeetings: number
    actualCLevelMeetings: number
    actualOtherMeetings: number
    actualTotalMeetings: number
    targetCompaniesHit: { id: string; name: string }[]
    targetCompaniesHitCount: number
    actualSocialReach: number
    actualKeynotes: number
    actualSeminars: number
    actualMediaPR: number
    actualBoothSessions: number
}

const emptyTargets: ROITargets = {
    budget: null,
    requesterEmail: '',
    expectedPipeline: null,
    winRate: null,
    expectedRevenue: null,
    targetBoothMeetings: null,
    targetCLevelMeetingsMin: null,
    targetCLevelMeetingsMax: null,
    targetOtherMeetings: null,
    targetSocialReach: null,
    targetKeynotes: null,
    targetSeminars: null,
    targetMediaPR: null,
    targetBoothSessions: null,
    targetCompanies: [],
    actualSocialReach: null,
    actualKeynotes: null,
    actualSeminars: null,
    actualMediaPR: null,
    actualBoothSessions: null,
    status: 'DRAFT',
}

const currency = (v: number) => `$${v.toLocaleString()}`

export default function ROIPage() {
    const params = useParams()
    const eventId = params?.id as string

    const { user } = useUser()
    const [activeTab, setActiveTab] = useState<'targets' | 'performance' | 'actuals'>('targets')
    const [targets, setTargets] = useState<ROITargets>(emptyTargets)
    const [actuals, setActuals] = useState<ROIActuals | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [companyInput, setCompanyInput] = useState('')
    const [availableCompanies, setAvailableCompanies] = useState<Company[]>([])
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
    const companyDropdownRef = useRef<HTMLDivElement>(null)

    const role = user?.publicMetadata?.role as string
    const canApprove = canManageEventsCheck(role)

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

    const handleSaveTargets = async () => {
        setSaving(true)
        setMessage('')
        try {
            const { id: _id, status: _status, approvedBy: _ab, approvedAt: _aa, submittedAt: _sa, targetCompanies, ...rest } = targets
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

    const handleSaveActuals = async () => {
        setSaving(true)
        setMessage('')
        try {
            const res = await fetch(`/api/events/${eventId}/roi`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actualSocialReach: targets.actualSocialReach,
                    actualKeynotes: targets.actualKeynotes,
                    actualSeminars: targets.actualSeminars,
                    actualMediaPR: targets.actualMediaPR,
                    actualBoothSessions: targets.actualBoothSessions,
                }),
            })
            if (!res.ok) throw new Error('Failed to save')
            setMessage('Actuals saved successfully')
            // Refresh actuals
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
    }

    const statusStyle = statusConfig[targets.status as keyof typeof statusConfig] || statusConfig.DRAFT

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
                <div className={`px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in ${message.includes('success') || message.includes('approved') || message.includes('Submitted')
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
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Requester Email</label>
                                <input type="email" value={targets.requesterEmail || ''} onChange={e => setTargets(prev => ({ ...prev, requesterEmail: e.target.value }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" placeholder="email@example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Target Budget ($)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                                    <input type="number" value={targets.budget ?? ''} onChange={e => setTargets(prev => ({ ...prev, budget: e.target.value ? parseFloat(e.target.value) : null }))}
                                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" placeholder="37,000" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Expected Pipeline</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                                    <input type="number" value={targets.expectedPipeline ?? ''} onChange={e => setTargets(prev => ({ ...prev, expectedPipeline: e.target.value ? parseFloat(e.target.value) : null }))}
                                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" placeholder="2,304,000" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Win Rate (%)</label>
                                <div className="relative">
                                    <input type="number" step="0.01" min="0" max="1" value={targets.winRate ?? ''} onChange={e => setTargets(prev => ({ ...prev, winRate: e.target.value ? parseFloat(e.target.value) : null }))}
                                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" placeholder="0.15" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">{targets.winRate ? `${(targets.winRate * 100).toFixed(0)}%` : ''}</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Expected Revenue</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                                    <input type="number" value={targets.expectedRevenue ?? ''} readOnly
                                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-zinc-100 bg-zinc-50 text-sm text-zinc-600" placeholder="Auto-calculated" />
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">Pipeline × Win Rate</p>
                            </div>
                        </div>
                    </section>

                    {/* Meeting KPIs */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-violet-500 rounded-full" />
                            Meeting KPI Targets
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Booth Meetings</label>
                                <input type="number" value={targets.targetBoothMeetings ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetBoothMeetings: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-sm" placeholder="20" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">C-Level Meetings (Min)</label>
                                <input type="number" value={targets.targetCLevelMeetingsMin ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetCLevelMeetingsMin: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-sm" placeholder="5" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">C-Level Meetings (Max)</label>
                                <input type="number" value={targets.targetCLevelMeetingsMax ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetCLevelMeetingsMax: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-sm" placeholder="10" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Other Meetings</label>
                                <input type="number" value={targets.targetOtherMeetings ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetOtherMeetings: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-sm" placeholder="15" />
                            </div>
                        </div>
                    </section>

                    {/* Engagement */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-rose-500 rounded-full" />
                            Engagement Targets
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Social Reach</label>
                                <input type="number" value={targets.targetSocialReach ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetSocialReach: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="50,000" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Keynotes</label>
                                <input type="number" value={targets.targetKeynotes ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetKeynotes: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="2" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Seminars</label>
                                <input type="number" value={targets.targetSeminars ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetSeminars: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="3" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Media / PR</label>
                                <input type="number" value={targets.targetMediaPR ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetMediaPR: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="5" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Booth Sessions</label>
                                <input type="number" value={targets.targetBoothSessions ?? ''} onChange={e => setTargets(prev => ({ ...prev, targetBoothSessions: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="10" />
                            </div>
                        </div>
                    </section>

                    {/* Target Companies */}
                    <section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-teal-500 rounded-full" />
                            Target Companies
                        </h3>
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
                        <div className="flex flex-wrap gap-2">
                            {targets.targetCompanies.map(company => (
                                <span key={company.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 rounded-lg text-sm font-medium border border-teal-200">
                                    {company.name}
                                    {company.pipelineValue && <span className="text-xs text-teal-500">(${company.pipelineValue.toLocaleString()})</span>}
                                    <button onClick={() => removeCompany(company.id)} className="hover:text-teal-900">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            ))}
                            {targets.targetCompanies.length === 0 && (
                                <p className="text-sm text-zinc-400 italic">No target companies added yet.</p>
                            )}
                        </div>
                    </section>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                        <button onClick={handleSaveTargets} disabled={saving}
                            className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
                            <Save className="w-4 h-4" />
                            Save Targets
                        </button>
                        {targets.id && targets.status === 'DRAFT' && (
                            <button onClick={handleSubmit}
                                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
                                <Send className="w-4 h-4" />
                                Submit for Approval
                            </button>
                        )}
                        {targets.id && targets.status === 'SUBMITTED' && canApprove && (
                            <button onClick={handleApprove}
                                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm">
                                <CheckCircle className="w-4 h-4" />
                                Approve
                            </button>
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
                            <MetricCard label="Pipeline" target={targets.expectedPipeline || 0} actual={actuals.actualPipeline} variant="ring" formatValue={currency} size="lg" />
                            <MetricCard label="Revenue" target={targets.expectedRevenue || 0} actual={actuals.actualRevenue} variant="ring" formatValue={currency} size="lg" />
                            <div className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">ROI Ratio</h4>
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
                            <ProgressBar label="Booth Meetings" value={actuals.actualBoothMeetings} max={targets.targetBoothMeetings || 0} />
                            <ProgressBar label="C-Level Meetings" value={actuals.actualCLevelMeetings} max={targets.targetCLevelMeetingsMax || targets.targetCLevelMeetingsMin || 0} />
                            <ProgressBar label="Other Meetings" value={actuals.actualOtherMeetings} max={targets.targetOtherMeetings || 0} />
                            <div className="pt-3 border-t border-zinc-100 flex justify-between items-center">
                                <span className="text-sm font-semibold text-zinc-700">Total Meetings</span>
                                <span className="text-2xl font-bold text-zinc-900">{actuals.actualTotalMeetings}</span>
                            </div>
                        </div>
                    </section>

                    {/* Engagement */}
                    <section>
                        <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-1 h-5 bg-rose-500 rounded-full" />
                            Engagement
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <MetricCard label="Social Reach" target={targets.targetSocialReach || 0} actual={actuals.actualSocialReach} />
                            <MetricCard label="Keynotes" target={targets.targetKeynotes || 0} actual={actuals.actualKeynotes} />
                            <MetricCard label="Seminars" target={targets.targetSeminars || 0} actual={actuals.actualSeminars} />
                            <MetricCard label="Media / PR" target={targets.targetMediaPR || 0} actual={actuals.actualMediaPR} />
                            <MetricCard label="Booth Sessions" target={targets.targetBoothSessions || 0} actual={actuals.actualBoothSessions} />
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
                            Speaking & Social Actuals
                        </h3>
                        <p className="text-sm text-zinc-500 mb-6">Enter the actual metrics that can&apos;t be auto-calculated from meeting data.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Social Reach</label>
                                <input type="number" value={targets.actualSocialReach ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualSocialReach: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Keynotes</label>
                                <input type="number" value={targets.actualKeynotes ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualKeynotes: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Seminars</label>
                                <input type="number" value={targets.actualSeminars ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualSeminars: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Media / PR</label>
                                <input type="number" value={targets.actualMediaPR ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualMediaPR: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Booth Sessions</label>
                                <input type="number" value={targets.actualBoothSessions ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualBoothSessions: e.target.value ? parseInt(e.target.value) : null }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
                            </div>
                        </div>
                    </section>

                    <div className="flex items-center gap-3">
                        <button onClick={handleSaveActuals} disabled={saving}
                            className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
                            <Save className="w-4 h-4" />
                            Save Actuals
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
