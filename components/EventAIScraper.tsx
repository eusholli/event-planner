'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { generateEventDetails } from '@/lib/actions/event'

interface AIScraperProps {
    url: string
    onFill: (data: any) => void
    currentData?: any
}

export function EventAIScraper({ url, onFill, currentData, className }: { url: string, onFill: (data: any) => void, currentData?: any, className?: string }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [debugInfo, setDebugInfo] = useState('')

    const canScrape = (url && url.length > 4) || (currentData?.name && currentData.name.length > 2)

    const handleScrape = async () => {
        if (!canScrape) {
            setError('Please enter a URL or Event Name')
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
                // Check basically any non-debug field
                const hasData = Object.keys(data).some(k => k !== 'debug' && data[k])

                if (hasData) {
                    onFill(data)
                } else if (!data.debug) {
                    setDebugInfo('AI could not identify specific event details.')
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
        <div className={`flex flex-col gap-1 ${className || ''}`}>
            <div className="flex items-center gap-2 w-full">
                <button
                    type="button"
                    onClick={handleScrape}
                    disabled={loading || !canScrape}
                    className="w-full btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Thinking...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4" />
                            <span>Auto Complete</span>
                        </>
                    )}
                </button>
            </div>
            {error && <div className="text-xs text-red-600 font-medium text-center bg-red-50 p-2 rounded-md">{error}</div>}
            {debugInfo && (
                <div className="text-xs text-neutral-600 bg-neutral-100 p-2 rounded-md text-center mt-1 border border-neutral-200">
                    <span className="font-semibold">Info:</span> {debugInfo}
                </div>
            )}
        </div>
    )
}
