'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'

type EntityType = 'attendee' | 'company' | 'event'

type AttendeeItem = { id: string; name: string; title: string; companyName: string }
type CompanyItem  = { id: string; name: string; description: string | null; pipelineValue: number | null }
type EventItem    = { id: string; name: string; startDate: string | null; endDate: string | null; status: string }

type SubState = {
  subscribed: boolean
  email: string | null
  selectedAttendeeIds: string[]
  selectedCompanyIds: string[]
  selectedEventIds: string[]
  lastSentAt: string | null
  lastTargetCount: number | null
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(val: number | null): string {
  if (!val) return ''
  return ' · $' + (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K')
}

function SubscribePage() {
  const { user, isLoaded } = useUser()
  const searchParams = useSearchParams()
  const justUnsubscribed = searchParams.get('unsubscribed') === 'true'

  const [sub, setSub]             = useState<SubState | null>(null)
  const [attendees, setAttendees] = useState<AttendeeItem[]>([])
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [events, setEvents]       = useState<EventItem[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null

  // Load subscription state + all entities
  useEffect(() => {
    if (!isLoaded) return
    Promise.all([
      fetch('/api/intelligence/subscribe').then(r => r.json()),
      fetch('/api/attendees?all=true').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
      fetch('/api/events').then(r => r.json()),
    ])
      .then(([subData, attendeeData, companyData, eventData]) => {
        setSub(subData)
        // Normalize: handle both array and { attendees: [...] } response shapes
        const rawAttendees = Array.isArray(attendeeData) ? attendeeData : (attendeeData.attendees ?? [])
        const rawCompanies = Array.isArray(companyData) ? companyData : (companyData.companies ?? [])
        const rawEvents    = Array.isArray(eventData)   ? eventData   : (eventData.events ?? [])
        setAttendees(rawAttendees.map((a: any) => ({
          id: a.id,
          name: a.name,
          title: a.title ?? '',
          companyName: a.company?.name ?? a.companyName ?? '',
        })))
        setCompanies(rawCompanies.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? null,
          pipelineValue: c.pipelineValue ?? null,
        })))
        setEvents(rawEvents.map((e: any) => ({
          id: e.id,
          name: e.name,
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          status: e.status ?? '',
        })))
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load data')
        setLoading(false)
      })
  }, [isLoaded])

  const q = search.toLowerCase()

  const filteredAttendees = useMemo(() =>
    attendees.filter(a =>
      !q || a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q) || a.companyName.toLowerCase().includes(q)
    ), [attendees, q])

  const filteredCompanies = useMemo(() =>
    companies.filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    ), [companies, q])

  const filteredEvents = useMemo(() =>
    events.filter(e =>
      !q || e.name.toLowerCase().includes(q) || (e.status ?? '').toLowerCase().includes(q)
    ), [events, q])

  const totalSelected = (sub?.selectedAttendeeIds.length ?? 0)
    + (sub?.selectedCompanyIds.length ?? 0)
    + (sub?.selectedEventIds.length ?? 0)

  async function toggleSelection(type: EntityType, id: string, isSelected: boolean) {
    if (!sub) return
    const plural = type === 'company' ? 'companies' : `${type}s`
    const path = `/api/intelligence/subscribe/${plural}`
    const method = isSelected ? 'DELETE' : 'POST'
    const url = isSelected ? `${path}/${id}` : path
    const body = isSelected ? undefined : JSON.stringify({ [`${type}Id`]: id })

    // Optimistic update
    const key = `selected${type.charAt(0).toUpperCase() + type.slice(1)}Ids` as keyof SubState
    const currentArr = (sub[key] as string[])
    setSub(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: isSelected ? currentArr.filter(x => x !== id) : [...currentArr, id],
      }
    })

    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Revert on error
      setSub(prev => {
        if (!prev) return prev
        return {
          ...prev,
          [key]: isSelected ? [...currentArr, id] : currentArr.filter(x => x !== id),
        }
      })
      setError('Failed to update selection')
    }
  }

  async function handleToggleSubscribe() {
    if (!sub || toggling) return
    setToggling(true)
    setError(null)
    try {
      if (sub.subscribed) {
        await fetch('/api/intelligence/subscribe', { method: 'DELETE' })
        setSub(prev => prev ? { ...prev, subscribed: false } : prev)
      } else {
        const res = await fetch('/api/intelligence/subscribe', { method: 'POST' })
        const data = await res.json()
        setSub(prev => prev ? { ...prev, subscribed: data.subscribed, email: data.email } : prev)
      }
    } catch {
      setError('Failed to update subscription')
    } finally {
      setToggling(false)
    }
  }

  if (!isLoaded || loading) {
    return <div className="max-w-3xl mx-auto p-8 text-zinc-500 text-sm">Loading...</div>
  }

  const canSubscribe = totalSelected > 0

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-xl font-semibold text-zinc-900 mb-2">Market Intelligence Subscription</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Select the companies, attendees, and events you want to track. You&apos;ll receive a
        personalised briefing after each research cycle (Tuesday &amp; Thursday mornings).
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

      {/* Subscribe toggle */}
      <div className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Send briefings to</p>
            <p className="text-sm text-zinc-500 font-mono mt-0.5">{userEmail ?? '—'}</p>
            {!canSubscribe && (
              <p className="text-xs text-zinc-400 mt-1">Select at least one item below to subscribe</p>
            )}
          </div>
          <button
            onClick={handleToggleSubscribe}
            disabled={toggling || !userEmail || !canSubscribe}
            title={!canSubscribe ? 'Select at least one item to subscribe' : undefined}
            aria-label={sub?.subscribed ? 'Unsubscribe from briefings' : 'Subscribe to briefings'}
            aria-checked={sub?.subscribed ?? false}
            role="switch"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              sub?.subscribed ? 'bg-zinc-900' : 'bg-zinc-300'
            } ${toggling || !userEmail || !canSubscribe ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              sub?.subscribed ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {sub?.subscribed && sub.lastSentAt && (
          <div className="mt-3 space-y-1 text-sm text-zinc-500">
            <p>Last briefing: <span className="text-zinc-700 font-medium">{formatDate(sub.lastSentAt)}</span></p>
            <p>Targets in last report: <span className="text-zinc-700 font-medium">{sub.lastTargetCount ?? 0}</span></p>
          </div>
        )}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search all events, companies, attendees..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-6 px-4 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
      />

      {/* Events section */}
      {filteredEvents.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 pb-1 border-b border-zinc-200">
            Events {sub && sub.selectedEventIds.length > 0 && (
              <span className="font-normal text-zinc-400">({sub.selectedEventIds.length} selected)</span>
            )}
          </h2>
          <div className="space-y-1">
            {filteredEvents.map(e => {
              const isSelected = sub?.selectedEventIds.includes(e.id) ?? false
              return (
                <label key={e.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection('event', e.id, isSelected)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                  />
                  <span className="text-sm text-zinc-900 flex-1">{e.name}</span>
                  <span className="text-xs text-zinc-400">{formatDate(e.startDate)}–{formatDate(e.endDate)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    e.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                    e.status === 'CANCELED'  ? 'bg-red-100 text-red-700' :
                    'bg-zinc-100 text-zinc-500'
                  }`}>{e.status}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {/* Companies section */}
      {filteredCompanies.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 pb-1 border-b border-zinc-200">
            Companies {sub && sub.selectedCompanyIds.length > 0 && (
              <span className="font-normal text-zinc-400">({sub.selectedCompanyIds.length} selected)</span>
            )}
          </h2>
          <div className="space-y-1">
            {filteredCompanies.map(c => {
              const isSelected = sub?.selectedCompanyIds.includes(c.id) ?? false
              return (
                <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection('company', c.id, isSelected)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                  />
                  <span className="text-sm text-zinc-900 flex-1">{c.name}</span>
                  {c.pipelineValue && (
                    <span className="text-xs text-zinc-400">Pipeline{formatCurrency(c.pipelineValue)}</span>
                  )}
                </label>
              )
            })}
          </div>
        </section>
      )}

      {/* Attendees section */}
      {filteredAttendees.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 pb-1 border-b border-zinc-200">
            Attendees {sub && sub.selectedAttendeeIds.length > 0 && (
              <span className="font-normal text-zinc-400">({sub.selectedAttendeeIds.length} selected)</span>
            )}
          </h2>
          <div className="space-y-1">
            {filteredAttendees.map(a => {
              const isSelected = sub?.selectedAttendeeIds.includes(a.id) ?? false
              return (
                <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection('attendee', a.id, isSelected)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                  />
                  <span className="text-sm text-zinc-900 flex-1">{a.name}</span>
                  <span className="text-xs text-zinc-400">{a.title}{a.companyName ? ` · ${a.companyName}` : ''}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {search && filteredAttendees.length === 0 && filteredCompanies.length === 0 && filteredEvents.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-8">No results for &quot;{search}&quot;</p>
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
