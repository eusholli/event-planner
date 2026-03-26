'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'

interface SparkleMarketingPlanButtonProps {
    eventId: string
    /**
     * If provided, skips the fetch check and uses this value directly.
     * Pass `!!targets.marketingPlan` from the ROI page.
     * Omit (undefined) from the events portfolio — the component will fetch to check.
     */
    hasPlan?: boolean
    onHasPlan: () => void
    onGenerated: (plan: string) => void
    onError: () => void
    className?: string
    title?: string
}

export default function SparkleMarketingPlanButton({
    eventId,
    hasPlan,
    onHasPlan,
    onGenerated,
    onError,
    className = 'p-1.5 text-neutral-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait',
    title = 'Generate Event Marketing Plan',
}: SparkleMarketingPlanButtonProps) {
    const [loading, setLoading] = useState(false)

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setLoading(true)
        try {
            // Determine if a plan already exists
            let planExists = hasPlan
            if (planExists === undefined) {
                // Fetch to check (used when caller doesn't have the plan state loaded)
                const roiRes = await fetch(`/api/events/${eventId}/roi`)
                const roiData = roiRes.ok ? await roiRes.json() : {}
                planExists = !!(roiData.targets?.marketingPlan)
            }

            if (planExists) {
                onHasPlan()
                return
            }

            // Generate the plan
            const genRes = await fetch(`/api/events/${eventId}/roi/generate-plan`, {
                method: 'POST',
            })
            if (genRes.ok) {
                const genData = await genRes.json()
                onGenerated(genData.marketingPlan ?? '')
            } else {
                onError()
            }
        } catch {
            onError()
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className={className}
            title={title}
        >
            {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            ) : (
                <Sparkles className="w-4 h-4" />
            )}
        </button>
    )
}
