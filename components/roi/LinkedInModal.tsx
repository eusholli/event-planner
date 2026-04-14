'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Linkedin } from 'lucide-react'
import { generateArticle, humanizeArticle } from '@/lib/article-generator-client'
import type { ArticleType, ArticleScore, GenerateCompleteEvent } from '@/lib/article-generator-client'
import { useAuth } from '@/components/auth'
import Tooltip from '@/components/roi/Tooltip'

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
    initialPhase?: Phase
    initialBrief?: string
    mode?: 'create' | 'existing'
}

type Phase = 'brief-loading' | 'params' | 'generating' | 'review' | 'humanizing'

interface LogEntry {
    elapsedMs: number
    stage?: string
    message: string
    isHeartbeat: boolean
}

const ARTICLE_TYPES: Array<{ key: ArticleType; label: string; description: string }> = [
    { key: 'thought_leadership', label: 'Thought Leadership', description: 'Deep analytical content that challenges conventional wisdom and establishes authoritative voice.' },
    { key: 'awareness', label: 'Awareness', description: 'Educates and builds brand recognition. Optimizes for shareability and attracting new followers.' },
    { key: 'demand_gen', label: 'Demand Generation', description: 'Drives qualified leads. Vividly articulates the problem, presents solution with proof, closes with CTA.' },
    { key: 'event_attendance', label: 'Event Attendance', description: 'Drives registrations for a conference or webinar. Highlights event value and creates FOMO.' },
    { key: 'recruitment', label: 'Recruitment', description: 'Attracts qualified candidates. Authentically portrays culture, growth, and mission.' },
    { key: 'product_announcement', label: 'Product Announcement', description: 'Creates excitement for a new product. Explains problem solved, quantifies benefits, builds credibility.' },
    { key: 'case_study', label: 'Case Study', description: 'Builds credibility through a customer success story with specific metrics and transferable lessons.' },
]

const FALLBACK_BRIEF = (companyNames: string[]) =>
    `You are writing a long-form LinkedIn article on behalf of Rakuten Symphony's marketing team.\n\nThe article should position Rakuten Symphony's capabilities in the context of our upcoming event, highlighting our relationship with the following target companies: ${companyNames.join(', ')}.\n\nFocus on thought leadership and strategic insights that resonate with CTOs and VP Operations at tier-1 and tier-2 telcos. Write with quiet confidence, first-principles thinking, and avoid generic buzzwords.`

export default function LinkedInModal({
    isOpen,
    onClose,
    companies,
    eventId,
    eventSlug,
    initialPhase = 'brief-loading',
    initialBrief = '',
    mode = 'create',
}: LinkedInModalProps) {
    const { getToken } = useAuth()
    const router = useRouter()
    const [phase, setPhase] = useState<Phase>(initialPhase)
    const [brief, setBrief] = useState('')
    const [briefWarning, setBriefWarning] = useState(false)
    const [briefError, setBriefError] = useState(false)
    const [articleType, setArticleType] = useState<ArticleType>('thought_leadership')
    const [wordCountMin, setWordCountMin] = useState(150)
    const [wordCountMax, setWordCountMax] = useState(300)
    const [logEntries, setLogEntries] = useState<LogEntry[]>([])

    // Generation result state
    const [generatedText, setGeneratedText] = useState<string | null>(null)
    const [humanizedText, setHumanizedText] = useState<string | null>(null)
    const [editedGenerated, setEditedGenerated] = useState('')
    const [editedHumanized, setEditedHumanized] = useState('')
    const [generateScore, setGenerateScore] = useState<ArticleScore | null>(null)
    const [activeReviewTab, setActiveReviewTab] = useState<'humanized' | 'generated'>('humanized')

    const [title, setTitle] = useState('')
    const [savedId, setSavedId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [genError, setGenError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [humanizeBlocked, setHumanizeBlocked] = useState(false)

    const controllerRef = useRef<AbortController | null>(null)
    const humanizeAbortRef = useRef<AbortController | null>(null)
    const logEndRef = useRef<HTMLDivElement>(null)
    const startTimeRef = useRef<number>(0)
    const heartbeatCountRef = useRef(0)
    const companyKey = companies.map(c => c.id).join(',')

    // Fetch brief when modal opens
    useEffect(() => {
        if (!isOpen) return

        // Reset all state
        setLogEntries([])
        setGeneratedText(null)
        setHumanizedText(null)
        setEditedGenerated('')
        setEditedHumanized('')
        setGenerateScore(null)
        setSavedId(null)
        setGenError(null)
        setArticleType('thought_leadership')
        setActiveReviewTab('generated')
        heartbeatCountRef.current = 0

        if (mode === 'existing') {
            setTitle('')
            setPhase('review')
            setGeneratedText('')
            setEditedGenerated('')
            setEditedHumanized('')
            setActiveReviewTab('generated')
            return
        }

        setTitle(companies.map(c => c.name).join(', '))

        if (companies.length === 0) {
            setPhase(initialPhase)
            setBrief(initialBrief)
            setBriefWarning(false)
            setBriefError(false)
            return
        }

        setPhase('brief-loading')
        setBrief('')
        setBriefWarning(false)
        setBriefError(false)

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
    }, [isOpen, eventId, companyKey, initialPhase, initialBrief, mode])

    // Auto-scroll progress log
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logEntries])

    const elapsedSec = (ms: number) => (ms / 1000).toFixed(1)

    const appendLog = useCallback((stage: string | undefined, message: string, isHeartbeat: boolean) => {
        const elapsedMs = Date.now() - startTimeRef.current
        setLogEntries(prev => [...prev, { elapsedMs, stage, message, isHeartbeat }])
    }, [])

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
            {
                draft: brief.trim(),
                article_type: articleType,
                word_count_min: wordCountMin,
                word_count_max: wordCountMax,
            },
            {
                onProgress: (stage, message) => appendLog(stage, message, false),
                onHeartbeat: () => {
                    heartbeatCountRef.current += 1
                    if (heartbeatCountRef.current % 6 === 0) {
                        appendLog(undefined, 'waiting…', true)
                    }
                },
                onComplete: (event: GenerateCompleteEvent) => {
                    setGeneratedText(event.article.text)
                    setEditedGenerated(event.article.text)
                    setGenerateScore(event.score)
                    setPhase('review')
                },
                onError: (msg) => {
                    setGenError(msg)
                    setPhase('params')
                },
            },
            token ?? undefined
        )
    }, [brief, articleType, wordCountMin, wordCountMax, getToken, appendLog])

    const handleCancel = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
        setPhase('params')
    }, [])

    const handleHumanize = useCallback(async () => {
        if (!editedGenerated) return
        if (editedHumanized.trim() !== '') {
            setHumanizeBlocked(true)
            setTimeout(() => setHumanizeBlocked(false), 2500)
            return
        }
        setPhase('humanizing')
        setLogEntries([])
        startTimeRef.current = Date.now()
        heartbeatCountRef.current = 0

        const baseUrl = process.env.NEXT_PUBLIC_LI_ARTICLE_API_URL ?? 'http://localhost:8000'
        const token = await getToken()

        humanizeAbortRef.current = humanizeArticle(
            baseUrl,
            { article: editedGenerated },
            {
                onProgress: (stage, message) => appendLog(stage, message, false),
                onHeartbeat: () => {
                    heartbeatCountRef.current += 1
                    if (heartbeatCountRef.current % 6 === 0) {
                        appendLog(undefined, 'waiting…', true)
                    }
                },
                onComplete: (event) => {
                    setHumanizedText(event.article.humanized)
                    setEditedHumanized(event.article.humanized)
                    setActiveReviewTab('humanized')
                    setPhase('review')
                },
                onError: (msg) => {
                    setGenError(msg)
                    setPhase('review') // return to review — preserve generated text
                },
            },
            token ?? undefined
        )
    }, [editedGenerated, editedHumanized, getToken, appendLog])

    const handleCancelHumanize = useCallback(() => {
        humanizeAbortRef.current?.abort()
        humanizeAbortRef.current = null
        setPhase('review')
    }, [])

    const handleClose = useCallback(() => {
        controllerRef.current?.abort()
        humanizeAbortRef.current?.abort()
        controllerRef.current = null
        humanizeAbortRef.current = null
        onClose()
    }, [onClose])

    const articleTypeLabel = ARTICLE_TYPES.find(t => t.key === articleType)?.label ?? 'Campaign Article'

    const handleSave = useCallback(async () => {
        if (generatedText === null) return
        setSaving(true)
        try {
            const res = await fetch('/api/social/drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    companyIds: companies.map(c => c.id),
                    companyNames: companies.map(c => c.name),
                    title: title.trim() || null,
                    content: editedHumanized,
                    originalContent: editedGenerated || null,
                    angle: articleTypeLabel,
                    tone: `${wordCountMin}–${wordCountMax} words`,
                    articleType,
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
    }, [generatedText, editedHumanized, editedGenerated, title, articleType, articleTypeLabel, eventId, companies, wordCountMin, wordCountMax])

    const handleCopy = useCallback(() => {
        if (generatedText === null) return
        const content = activeReviewTab === 'humanized' ? editedHumanized : editedGenerated
        navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [generatedText, activeReviewTab, editedHumanized, editedGenerated])

    if (!isOpen) return null

    const isProcessing = phase === 'generating' || phase === 'humanizing'

    return (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
                    <div className="flex items-center gap-2">
                        {isProcessing ? (
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
                            {phase === 'humanizing' && 'Humanizing Article…'}
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
                            {companies.length > 0 && (
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
                            )}

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

                            {/* Article type selector */}
                            <div>
                                <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide mb-2">Article Type</p>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {ARTICLE_TYPES.map(type => (
                                        <label
                                            key={type.key}
                                            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${articleType === type.key
                                                    ? 'border-blue-300 bg-blue-50'
                                                    : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="articleType"
                                                value={type.key}
                                                checked={articleType === type.key}
                                                onChange={() => setArticleType(type.key)}
                                                className="mt-0.5 shrink-0 accent-blue-600"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-zinc-900">{type.label}</span>
                                                <span className="ml-2 text-xs text-zinc-400">{type.description}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Word count */}
                            <div className="flex items-center gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                                        <Tooltip content={
                                            <span>
                                                <strong>Post:</strong> 150–300 words (optimal engagement)<br />
                                                <strong>Article:</strong> 1,500–2,000 words (long-form)
                                            </span>
                                        }>
                                            Min Words
                                        </Tooltip>
                                    </label>
                                    <input
                                        type="number"
                                        min={100}
                                        value={wordCountMin}
                                        onChange={e => setWordCountMin(Number(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                                        <Tooltip content={
                                            <span>
                                                <strong>Post:</strong> 150–300 words (optimal engagement)<br />
                                                <strong>Article:</strong> 1,500–2,000 words (long-form)
                                            </span>
                                        }>
                                            Max Words
                                        </Tooltip>
                                    </label>
                                    <input
                                        type="number"
                                        min={100}
                                        value={wordCountMax}
                                        onChange={e => setWordCountMax(Number(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                            </div>

                            {/* Brief editor */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">
                                    Article Brief
                                    <span className="ml-1 font-normal text-zinc-400">— edit to refine the focus</span>
                                </label>
                                <textarea
                                    value={brief}
                                    onChange={e => setBrief(e.target.value)}
                                    rows={8}
                                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                            </div>
                        </>
                    )}

                    {/* PHASE: generating or humanizing — shared progress log */}
                    {isProcessing && (
                        <div className="font-mono text-xs space-y-1">
                            {logEntries.map((entry, i) => (
                                <p key={i} className={entry.isHeartbeat ? 'text-zinc-400' : 'text-zinc-700'}>
                                    [{elapsedSec(entry.elapsedMs)}s]{entry.stage ? ` [${entry.stage.toUpperCase()}]` : ''} {entry.message}
                                </p>
                            ))}
                            {logEntries.length === 0 && (
                                <p className="text-zinc-400">
                                    {phase === 'generating' ? 'Connecting to article generator…' : 'Connecting to humanizer…'}
                                </p>
                            )}
                            <div ref={logEndRef} />
                        </div>
                    )}

                    {/* PHASE: review */}
                    {phase === 'review' && generatedText !== null && (
                        <>
                            {/* Article meta */}
                            {generateScore && (
                                <div className="flex items-center gap-2 text-sm text-zinc-500">
                                    <span>{generateScore.word_count.toLocaleString()} words</span>
                                </div>
                            )}

                            {/* Humanize error (if humanization failed) */}
                            {genError && (
                                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                                    Humanization failed: {genError}
                                </div>
                            )}

                            {/* GPTZero verification nudge — only after humanization */}
                            {editedHumanized.trim() !== '' && (
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
                            )}

                            {/* Campaign Title */}
                            <div>
                                <label className="block text-xs font-medium text-zinc-700 mb-1">Campaign Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Enter a title for this campaign…"
                                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                            </div>

                            {/* Tabs — always shown */}
                            <div className="flex gap-1 border-b border-zinc-200">
                                <button
                                    onClick={() => setActiveReviewTab('generated')}
                                    className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeReviewTab === 'generated' ? 'border-blue-500 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                                >
                                    Original
                                </button>
                                <button
                                    onClick={() => setActiveReviewTab('humanized')}
                                    className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeReviewTab === 'humanized' ? 'border-blue-500 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                                >
                                    Humanized {editedHumanized.trim() !== '' && <span className="ml-1 text-xs text-zinc-400">(recommended)</span>}
                                </button>
                            </div>

                            {/* Article content */}
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 max-h-[40vh] overflow-y-auto">
                                <textarea
                                    className="w-full text-sm text-zinc-800 font-sans leading-relaxed resize-y bg-transparent focus:outline-none min-h-[200px]"
                                    value={activeReviewTab === 'humanized' ? editedHumanized : editedGenerated}
                                    placeholder={
                                        activeReviewTab === 'humanized'
                                            ? 'Paste or generate humanized text here…'
                                            : 'Paste your original article here…'
                                    }
                                    onChange={e => {
                                        if (activeReviewTab === 'humanized') {
                                            setEditedHumanized(e.target.value)
                                        } else {
                                            setEditedGenerated(e.target.value)
                                        }
                                    }}
                                />
                            </div>

                            {savedId ? (
                                <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-700 flex items-center justify-between">
                                    <span>✓ Saved to campaigns</span>
                                    <button
                                        onClick={() => { handleClose(); router.push(`/events/${eventSlug}/linkedin-campaigns`) }}
                                        className="text-blue-600 hover:text-blue-800 text-xs underline"
                                    >
                                        View all campaigns →
                                    </button>
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

                    {phase === 'humanizing' && (
                        <button onClick={handleCancelHumanize} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
                            Cancel
                        </button>
                    )}

                    {phase === 'review' && generatedText !== null && (
                        <>
                            {!savedId && (
                                <div className="relative">
                                    {copied && (
                                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs bg-zinc-800 text-white px-2 py-1 rounded shadow-md pointer-events-none">
                                            Copied!
                                        </span>
                                    )}
                                    <button
                                        onClick={handleCopy}
                                        className="px-3 py-2 text-sm border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors"
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                            <button onClick={handleClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                                Close
                            </button>
                            {!savedId && (
                                <div className="relative">
                                    {humanizeBlocked && (
                                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs bg-zinc-800 text-white px-2 py-1 rounded shadow-md pointer-events-none">
                                            Humanized text field not empty
                                        </span>
                                    )}
                                    <button
                                        onClick={handleHumanize}
                                        className="inline-flex items-center gap-2 px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                                    >
                                        Humanize
                                    </button>
                                </div>
                            )}
                            {!savedId && (
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : 'Save Campaign'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
