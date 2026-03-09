'use client'

import { useEffect, useState, Suspense } from 'react'
import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'

type SubscriptionStatus = {
  subscribed: boolean
  email: string | null
  lastSentAt: string | null
  lastTargetCount: number | null
}

function SubscribePage() {
  const { user, isLoaded } = useUser()
  const searchParams = useSearchParams()
  const justUnsubscribed = searchParams.get('unsubscribed') === 'true'

  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null

  useEffect(() => {
    if (!isLoaded) return
    fetch('/api/intelligence/subscribe')
      .then((r) => r.json())
      .then((data) => {
        setStatus(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load subscription status')
        setLoading(false)
      })
  }, [isLoaded])

  const handleToggle = async () => {
    if (!userEmail || !status) return
    setToggling(true)
    setError(null)
    try {
      if (status.subscribed) {
        await fetch('/api/intelligence/subscribe', { method: 'DELETE' })
        setStatus({ ...status, subscribed: false })
      } else {
        const res = await fetch('/api/intelligence/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        })
        const data = await res.json()
        setStatus({ ...status, subscribed: data.subscribed, email: data.email })
      }
    } catch {
      setError('Failed to update subscription')
    } finally {
      setToggling(false)
    }
  }

  if (!isLoaded || loading) {
    return <div className="max-w-xl mx-auto p-8 text-zinc-500 text-sm">Loading...</div>
  }

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-xl font-semibold text-zinc-900 mb-2">
        Market Intelligence Subscription
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Receive a personalised intelligence briefing after each research cycle
        (Tuesday &amp; Thursday mornings). Your report covers companies and
        contacts from your meetings, plus upcoming events.
      </p>

      {justUnsubscribed && (
        <div className="mb-4 p-3 bg-zinc-100 border border-zinc-200 rounded-lg text-sm text-zinc-600">
          You&apos;ve been unsubscribed successfully.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Send briefings to</p>
            <p className="text-sm text-zinc-500 font-mono mt-0.5">{userEmail ?? '—'}</p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling || !userEmail}
            aria-label={status?.subscribed ? 'Unsubscribe from briefings' : 'Subscribe to briefings'}
            aria-checked={status?.subscribed ?? false}
            role="switch"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              status?.subscribed ? 'bg-zinc-900' : 'bg-zinc-300'
            } ${toggling || !userEmail ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                status?.subscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {!userEmail && (
          <p className="mt-3 text-xs text-zinc-400">No email address found on your account.</p>
        )}
      </div>

      {status?.subscribed && (
        <div className="mt-4 space-y-1 text-sm text-zinc-500">
          {status.lastSentAt ? (
            <>
              <p>
                Last briefing sent:{' '}
                <span className="text-zinc-700 font-medium">
                  {new Date(status.lastSentAt).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </p>
              <p>
                Targets in last report:{' '}
                <span className="text-zinc-700 font-medium">
                  {status.lastTargetCount ?? 0} update{(status.lastTargetCount ?? 0) !== 1 ? 's' : ''}
                </span>
              </p>
            </>
          ) : (
            <p>No briefings sent yet — your first will arrive after the next research cycle.</p>
          )}
        </div>
      )}

      {status?.subscribed === false && !justUnsubscribed && (
        <p className="mt-4 text-sm text-zinc-400">Toggle on to start receiving briefings.</p>
      )}
    </div>
  )
}

export default function SubscribePageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500 text-sm">Loading...</div>}>
      <SubscribePage />
    </Suspense>
  )
}
