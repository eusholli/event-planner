'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { generateEventDetails } from '@/lib/actions/event'

interface AIScraperProps {
    url: string
    onFill: (data: any) => void
    currentData?: any
}

export function EventAIScraper({ url, onFill, currentData }: AIScraperProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [debugInfo, setDebugInfo] = useState('')

    const handleScrape = async () => {
        if (!url) {
            setError('Please enter a URL first')
            return
        }

        try {
            setLoading(true)
            setError('')
            setDebugInfo('')

            const data = await generateEventDetails(url, currentData)
            console.log('AI Generated Data:', data)

            if (data) {
                if (data.debug) {
                    setDebugInfo(data.debug)
                }

                // If we got valid data fields (check at least one), fill it
                if (data.name || data.startDate || data.location) {
                    onFill(data)
                } else if (!data.debug) {
                    setDebugInfo('AI could not identify specific event details from the page content.')
                }
            } else {
                setDebugInfo('No data returned from analysis.')
            }

        } catch (err: any) {
            console.error(err)
            setError('Failed to extract details.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleScrape}
                    disabled={loading || !url}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 px-3 py-1.5 text-xs"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Thinking...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-3 h-3" />
                            <span>Auto Complete</span>
                        </>
                    )}
                </button>
                {error && <span className="text-xs text-red-500">{error}</span>}
            </div>
            {debugInfo && (
                <div className="text-[10px] text-zinc-500 italic px-1">
                    ℹ️ {debugInfo}
                </div>
            )}
        </div>
    )
}
