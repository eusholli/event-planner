'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { X, Linkedin } from 'lucide-react'
import { generateArticle } from '@/lib/article-generator-client'
import type { CompleteEvent } from '@/lib/article-generator-client'
import { useAuth } from '@/components/auth'

interface Company {
    id: string
    name: string
}

interface LinkedInModalProps {
    isOpen: boolean
    onClose: () => void
    companies: Company[]
    eventId: string
    eventSlug: string
}

type Phase = 'brief-loading' | 'params' | 'generating' | 'review'

interface LogEntry {
    elapsedMs: number
    stage?: string
    message: string
    isHeartbeat: boolean
}

const FALLBACK_BRIEF = (companyNames: string[]) =>
    `You are writing a long-form LinkedIn article on behalf of Rakuten Symphony's marketing team.\n\nThe article should position Rakuten Symphony's capabilities in the context of our upcoming event, highlighting our relationship with the following target companies: ${companyNames.join(', ')}.\n\nFocus on thought leadership and strategic insights that resonate with CTOs and VP Operations at tier-1 and tier-2 telcos. Write with quiet confidence, first-principles thinking, and avoid generic buzzwords.`

export default function LinkedInModal({
    isOpen,
    onClose,
    companies,
    eventId,
    eventSlug,
}: LinkedInModalProps) {
    const { getToken } = useAuth()
    const [phase, setPhase] = useState<Phase>('brief-loading')
    const [brief, setBrief] = useState('')
    const [briefWarning, setBriefWarning] = useState(false)
    const [briefError, setBriefError] = useState(false)
    const [wordCountMin, setWordCountMin] = useState(2000)
    const [wordCountMax, setWordCountMax] = useState(2500)
    const [logEntries, setLogEntries] = useState<LogEntry[]>([])
    const [result, setResult] = useState<CompleteEvent | null>(null)
    const [activeTab, setActiveTab] = useState<'humanized' | 'original'>('humanized')
    const [editedHumanized, setEditedHumanized] = useState('')
    const [editedOriginal, setEditedOriginal] = useState('')
    const [savedId, setSavedId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [genError, setGenError] = useState<string | null>(null)

    const controllerRef = useRef<AbortController | null>(null)
    const logEndRef = useRef<HTMLDivElement>(null)
    const startTimeRef = useRef<number>(0)
    const heartbeatCountRef = useRef(0)
    const companyKey = companies.map(c => c.id).join(',')

    // Fetch brief when modal opens
    useEffect(() => {
        if (!isOpen || companies.length === 0) return

        setPhase('brief-loading')
        setBrief('')
        setBriefWarning(false)
        setBriefError(false)
        setLogEntries([])
        setResult(null)
        setSavedId(null)
        setGenError(null)
        setEditedHumanized('')
        setEditedOriginal('')
        heartbeatCountRef.current = 0

        const ac = new AbortController()

        fetch(`/api/events/${eventId}/linkedin-campaigns/generate-brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyNames: companies.map(c => c.name) }),
            signal: ac.signal,
        })
            .then(res => res.json())
            .then(data => {
                if (data.brief) {
                    setBrief(data.brief)
                    if (!data.hadMarketingPlan) setBriefWarning(true)
                } else {
                    setBrief(FALLBACK_BRIEF(companies.map(c => c.name)))
                    setBriefError(true)
                }
                setPhase('params')
            })
            .catch(err => {
                if (err.name === 'AbortError') return
                setBrief(FALLBACK_BRIEF(companies.map(c => c.name)))
                setBriefError(true)
                setPhase('params')
            })

        return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, eventId, companyKey])

    // Seed editable state when result arrives
    useEffect(() => {
        if (result) {
            setEditedHumanized(result.article.humanized)
            setEditedOriginal(result.article.original)
        }
    }, [result])

    // Auto-scroll progress log
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logEntries])

    const elapsedSec = (ms: number) => (ms / 1000).toFixed(1)

    const handleGenerate = useCallback(async () => {
        if (!brief.trim()) return
        if (wordCountMin >= wordCountMax) {
            setGenError('Min words must be less than max words')
            return
        }
        setPhase('generating')
        setGenError(null)
        setLogEntries([])
        startTimeRef.current = Date.now()
        heartbeatCountRef.current = 0

        const baseUrl = process.env.NEXT_PUBLIC_LI_ARTICLE_API_URL ?? 'http://localhost:8000'
        const token = await getToken()

        controllerRef.current = generateArticle(
            baseUrl,
            { draft: brief.trim(), word_count_min: wordCountMin, word_count_max: wordCountMax },
            {
                onProgress: (stage, message) => {
                    const elapsedMs = Date.now() - startTimeRef.current
                    setLogEntries(prev => [...prev, { elapsedMs, stage, message, isHeartbeat: false }])
                },
                onHeartbeat: () => {
                    heartbeatCountRef.current += 1
                    if (heartbeatCountRef.current % 6 === 0) {
                        const elapsedMs = Date.now() - startTimeRef.current
                        setLogEntries(prev => [...prev, { elapsedMs, message: 'waiting…', isHeartbeat: true }])
                    }
                },
                onComplete: (event) => {
                    setResult(event)
                    setActiveTab('humanized')
                    setPhase('review')
                },
                onError: (msg) => {
                    setGenError(msg)
                    setPhase('params')
                },
            },
            token ?? undefined
        )
    }, [brief, wordCountMin, wordCountMax, getToken])

    const handleCancel = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
        setPhase('params')
    }, [])

    const handleClose = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
        onClose()
    }, [onClose])

    const handleSave = useCallback(async () => {
        if (!result) return
        setSaving(true)
        try {
            const res = await fetch('/api/social/drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    companyIds: companies.map(c => c.id),
                    companyNames: companies.map(c => c.name),
                    content: editedHumanized,
                    originalContent: editedOriginal,
                    angle: 'Campaign Article',
                    tone: `${wordCountMin}–${wordCountMax} words`,
                }),
            })
            if (res.ok) {
                const saved = await res.json()
                setSavedId(saved.id)
            } else {
                const err = await res.json().catch(() => ({}))
                setGenError(err.error ?? 'Failed to save draft')
            }
        } finally {
            setSaving(false)
        }
    }, [editedHumanized, editedOriginal, eventId, companies, wordCountMin, wordCountMax])

    const handleCopy = useCallback(() => {
        if (!result) return
        const content = activeTab === 'humanized' ? editedHumanized : editedOriginal
        navigator.clipboard.writeText(content)
    }, [result, activeTab, editedHumanized, editedOriginal])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
                    <div className="flex items-center gap-2">
                        {phase === 'generating' ? (
                            <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                        ) : (
                            <Linkedin className="w-5 h-5 text-blue-600" />
                        )}
                        <h2 className="text-lg font-semibold text-zinc-900">
                            {phase === 'brief-loading' && 'Preparing Article Brief…'}
                            {phase === 'params' && 'Draft LinkedIn Article'}
                            {phase === 'generating' && 'Generating LinkedIn Article…'}
                            {phase === 'review' && 'Article Ready'}
                        </h2>
                    </div>
                    <button onClick={handleClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">

                    {/* PHASE: brief-loading */}
                    {phase === 'brief-loading' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <svg className="w-8 h-8 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <p className="text-sm text-zinc-500">Researching companies and generating article brief…</p>
                        </div>
                    )}

                    {/* PHASE: params */}
                    {phase === 'params' && (
                        <>
                            {/* Company badges */}
                            <div>
                                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Target companies</p>
                                <div className="flex flex-wrap gap-2">
                                    {companies.map(c => (
                                        <span key={c.id} className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-800 rounded-lg text-sm font-medium border border-blue-200">
                                            {c.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Warnings */}
                            {briefWarning && (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                                    No marketing plan found — brief generated using event name and company names only. Consider generating a marketing plan on this page first for a richer brief.
                                </div>
                            )}
                            {briefError && (
                                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                                    Could not generate brief automatically. A fallback template has been provided — edit it before generating.
                                </div>
                            )}
                            {genError && (
                                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                                    Generation failed: {genError}
                                </div>
                            )}

                            {/* Brief editor */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">
                                    Article Brief
                                    <span className="ml-1 font-normal text-zinc-400">— edit to refine the focus</span>
                                </label>
                                <textarea
                                    value={brief}
                                    onChange={e => setBrief(e.target.value)}
                                    rows={10}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                            </div>

                            {/* Word count */}
                            <div className="flex items-center gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 mb-1">Min Words</label>
                                    <input
                                        type="number"
                                        min={100}
                                        value={wordCountMin}
                                        onChange={e => setWordCountMin(Number(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 mb-1">Max Words</label>
                                    <input
                                        type="number"
                                        min={100}
                                        value={wordCountMax}
                                        onChange={e => setWordCountMax(Number(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* PHASE: generating */}
                    {phase === 'generating' && (
                        <div className="font-mono text-xs space-y-1">
                            {logEntries.map((entry, i) => (
                                <p key={i} className={entry.isHeartbeat ? 'text-zinc-400' : 'text-zinc-700'}>
                                    [{elapsedSec(entry.elapsedMs)}s]{entry.stage ? ` [${entry.stage.toUpperCase()}]` : ''} {entry.message}
                                </p>
                            ))}
                            {logEntries.length === 0 && (
                                <p className="text-zinc-400">Connecting to article generator…</p>
                            )}
                            <div ref={logEndRef} />
                        </div>
                    )}

                    {/* PHASE: review */}
                    {phase === 'review' && result && (
                        <>
                            {/* Article meta */}
                            <div className="flex items-center gap-2 text-sm text-zinc-500">
                                <span>{result.score.word_count.toLocaleString()} words</span>
                                <span>·</span>
                                <span>{result.iterations_used} iteration{result.iterations_used !== 1 ? 's' : ''}</span>
                            </div>

                            {/* GPTZero verification nudge */}
                            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start justify-between gap-3">
                                <div className="text-sm text-blue-800">
                                    <p className="font-medium">Verify before publishing</p>
                                    <p className="text-xs text-blue-600 mt-0.5">Copy the humanized article, then check it with GPTZero to confirm AI detection is low.</p>
                                </div>
                                <a
                                    href="https://gptzero.me"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    GPTZero →
                                </a>
                            </div>

                            {/* Tab bar */}
                            <div className="flex gap-1 border-b border-zinc-200">
                                <button
                                    onClick={() => setActiveTab('humanized')}
                                    className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'humanized' ? 'border-blue-500 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                                >
                                    Humanized <span className="ml-1 text-xs text-zinc-400">(recommended)</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('original')}
                                    className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'original' ? 'border-blue-500 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                                >
                                    Original
                                </button>
                            </div>

                            {/* Article content */}
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 max-h-[40vh] overflow-y-auto">
                                <textarea
                                    className="w-full text-sm text-zinc-800 font-sans leading-relaxed resize-y bg-transparent focus:outline-none min-h-[200px]"
                                    value={activeTab === 'humanized' ? editedHumanized : editedOriginal}
                                    onChange={e =>
                                        activeTab === 'humanized'
                                            ? setEditedHumanized(e.target.value)
                                            : setEditedOriginal(e.target.value)
                                    }
                                />
                            </div>

                            {savedId ? (
                                <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-700 flex items-center justify-between">
                                    <span>✓ Saved to campaigns</span>
                                    <Link href={`/events/${eventSlug}/linkedin-campaigns`} className="text-blue-600 hover:text-blue-800 text-xs">
                                        View all campaigns →
                                    </Link>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-zinc-200 flex justify-end gap-3 shrink-0">
                    {phase === 'brief-loading' && (
                        <button onClick={handleClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                            Cancel
                        </button>
                    )}
                    {phase === 'params' && (
                        <>
                            <button onClick={handleClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={!brief.trim()}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Linkedin className="w-4 h-4" />
                                Generate Article
                            </button>
                        </>
                    )}
                    {phase === 'generating' && (
                        <button onClick={handleCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
                            Cancel
                        </button>
                    )}
                    {phase === 'review' && (
                        <>
                            {!savedId && (
                                <button
                                    onClick={handleCopy}
                                    className="px-3 py-2 text-sm border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors"
                                >
                                    Copy
                                </button>
                            )}
                            <button onClick={handleClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                                Close
                            </button>
                            {!savedId && (
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : 'Save to Campaigns'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
