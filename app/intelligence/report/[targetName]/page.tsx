'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'

type ReportData = {
  id: string
  targetType: string
  targetName: string
  summary: string
  salesAngle: string
  recommendedAction: string | null
  fullReport: string
  createdAt: string
}

export default function IntelligenceReportPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const targetName = decodeURIComponent(params.targetName as string)

  const [report, setReport] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = token
      ? `/api/intelligence/report/${encodeURIComponent(targetName)}?token=${encodeURIComponent(token)}`
      : `/api/intelligence/report/${encodeURIComponent(targetName)}`

    fetch(url)
      .then(async res => {
        if (res.status === 401) {
          setError('Access denied. Please log in or use the link from your intelligence email.')
        } else if (res.status === 404) {
          setError('No intelligence report found for this target.')
        } else if (!res.ok) {
          setError('Failed to load report. Please try again later.')
        } else {
          const data = await res.json()
          setReport(data)
        }
      })
      .catch(() => setError('Failed to load report. Please try again later.'))
      .finally(() => setLoading(false))
  }, [targetName, token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading intelligence brief...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <Link href="/intelligence/subscribe" className="text-blue-600 hover:underline text-sm">
            ← Back to subscriptions
          </Link>
        </div>
      </div>
    )
  }

  if (!report) return null

  const createdDate = new Date(report.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/intelligence/subscribe" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to subscriptions
        </Link>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-2 py-1 rounded mb-2">
                {report.targetType}
              </span>
              <h1 className="text-2xl font-bold text-gray-900">{report.targetName}</h1>
              <p className="text-sm text-gray-400 mt-1">Intelligence as of {createdDate}</p>
            </div>
            {['company', 'attendee', 'event'].includes(report.targetType.toLowerCase()) && (
              <Link
                href={`/intelligence?autoQuery=${encodeURIComponent(
                  report.targetType.toLowerCase() === 'event'
                    ? `Show me the latest market intelligence for event ${report.targetName}`
                    : `Show me the latest market intelligence for ${report.targetName}`
                )}`}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-300 text-zinc-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-colors shrink-0 sm:mt-1"
              >
                Ask more questions →
              </Link>
            )}
          </div>

          <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Summary</h2>
            <p className="text-gray-800 text-sm leading-relaxed">{report.summary}</p>
          </div>

          <div className="mb-5 p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r-lg">
            <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2">Sales Angle</h2>
            <p className="text-blue-900 text-sm leading-relaxed">{report.salesAngle}</p>
          </div>

          {report.recommendedAction && (
            <div className="mb-6 p-4 border-l-4 border-yellow-400 bg-yellow-50 rounded-r-lg">
              <h2 className="text-sm font-semibold text-yellow-700 uppercase tracking-wide mb-2">Recommended Action</h2>
              <p className="text-yellow-900 text-sm leading-relaxed">{report.recommendedAction}</p>
            </div>
          )}

          <div className="mt-8 border-t border-gray-100 pt-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Full Intelligence Brief</h2>
            <div className="prose prose-sm max-w-none text-gray-800">
              <ReactMarkdown>{report.fullReport}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
