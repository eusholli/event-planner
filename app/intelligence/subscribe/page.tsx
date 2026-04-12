'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

type EntityType = 'attendee' | 'company' | 'event'

type AttendeeItem = { id: string; name: string; title: string; companyName: string }
type CompanyItem = { id: string; name: string; description: string | null; pipelineValue: number | null }
type EventItem = { id: string; name: string; startDate: string | null; endDate: string | null; status: string }

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

function EntityActionButton({
  name,
  type,
  hasReport,
  onClick,
}: {
  name: string
  type: EntityType
  hasReport: boolean
  onClick?: (e: React.MouseEvent) => void
}) {
  if (hasReport) {
    return (
      <Link
        href={`/intelligence/report/${encodeURIComponent(name)}`}
        onClick={onClick ?? (e => e.stopPropagation())}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors shrink-0 shadow-sm"
      >
        Read full brief
      </Link>
    )
  }
  const query =
    type === 'event'
      ? `Show me the latest market intelligence for event ${name}`
      : `Show me the latest market intelligence for ${name}`
  const url = `/intelligence?autoQuery=${encodeURIComponent(query)}`
  return (
    <Link
      href={url}
      onClick={onClick ?? (e => e.stopPropagation())}
      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-300 text-zinc-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-colors shrink-0"
    >
      Ask questions →
    </Link>
  )
}

function SubscribePage() {
  const { user, isLoaded } = useUser()
  const searchParams = useSearchParams()
  const justUnsubscribed = searchParams.get('unsubscribed') === 'true'

  const [sub, setSub] = useState<SubState | null>(null)
  const [attendees, setAttendees] = useState<AttendeeItem[]>([])
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportableNames, setReportableNames] = useState<Set<string>>(new Set())

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
        const rawEvents = Array.isArray(eventData) ? eventData : (eventData.events ?? [])
        const mappedAttendees: AttendeeItem[] = rawAttendees.map((a: any) => ({
          id: a.id,
          name: a.name,
          title: a.title ?? '',
          companyName: a.company?.name ?? a.companyName ?? '',
        }))
        const mappedCompanies: CompanyItem[] = rawCompanies.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? null,
          pipelineValue: c.pipelineValue ?? null,
        }))
        const mappedEvents: EventItem[] = rawEvents.map((e: any) => ({
          id: e.id,
          name: e.name,
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          status: e.status ?? '',
        }))
        setAttendees(mappedAttendees)
        setCompanies(mappedCompanies)
        setEvents(mappedEvents)
        // Fetch which names have intelligence reports
        const names = [...new Set([
          ...mappedAttendees.map(a => a.name),
          ...mappedCompanies.map(c => c.name),
          ...mappedEvents.map(e => e.name),
        ])]
        if (names.length) {
          fetch('/api/intelligence/report-exists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names }),
          })
            .then(r => r.ok ? r.json() : { existingNames: [] })
            .then(({ existingNames }) => setReportableNames(new Set(existingNames)))
            .catch(() => { })
        }
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

  const subscribedEvents = events.filter(e => sub?.selectedEventIds.includes(e.id))
  const subscribedCompanies = companies.filter(c => sub?.selectedCompanyIds.includes(c.id))
  const subscribedAttendees = attendees.filter(a => sub?.selectedAttendeeIds.includes(a.id))
  const hasSubscribedItems = subscribedEvents.length > 0 || subscribedCompanies.length > 0 || subscribedAttendees.length > 0

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-zinc-50 p-4 md:p-6">
      <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100 bg-white sticky top-0 z-10">
          <Link href="/intelligence" className="p-2 -ml-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors" title="Back to Insights">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Manage Subscriptions</h2>
            <p className="text-xs text-zinc-500 font-mono">
              MARKET INTELLIGENCE
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50">
          <p className="text-sm text-zinc-500">
            Select the companies, attendees, and events you want to track. You&apos;ll receive a
            personalised briefing after each research cycle (Tuesday &amp; Thursday mornings).
          </p>

          {justUnsubscribed && (
            <div className="p-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-600 shadow-sm">
              You&apos;ve been unsubscribed successfully.
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 shadow-sm">
              {error}
            </div>
          )}

          {/* Subscribe toggle */}
          <div className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm">
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
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${sub?.subscribed ? 'bg-zinc-900' : 'bg-zinc-300'
                  } ${toggling || !userEmail || !canSubscribe ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${sub?.subscribed ? 'translate-x-6' : 'translate-x-1'
                  }`} />
              </button>
            </div>

            {sub?.subscribed && sub.lastSentAt && (
              <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center gap-6 text-sm text-zinc-500">
                <p>Last briefing: <span className="text-zinc-900 font-medium">{formatDate(sub.lastSentAt)}</span></p>
                <p>Targets: <span className="text-zinc-900 font-medium">{sub.lastTargetCount ?? 0}</span></p>
              </div>
            )}
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="Search all events, companies, attendees..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm bg-white"
          />

          {/* Jump Navigation */}
          <nav className="flex gap-2">
            <a href="#section-companies" className="text-xs px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 transition-colors shadow-sm">Companies</a>
            <a href="#section-attendees" className="text-xs px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 transition-colors shadow-sm">Attendees</a>
            <a href="#section-events" className="text-xs px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 transition-colors shadow-sm">Events</a>
          </nav>

          {/* Currently Subscribed Box */}
          {hasSubscribedItems && (
            <div className="border border-indigo-100 rounded-xl p-5 bg-indigo-50/30 shadow-sm">
              <h2 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                Currently Subscribed
                <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-medium">
                  {totalSelected}
                </span>
              </h2>

              <div className="space-y-3">
                {subscribedEvents.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-indigo-800 uppercase tracking-wider mb-1">Events</h3>
                    <div className="space-y-1">
                      {subscribedEvents.map(e => (
                        <label key={`sub-event-${e.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleSelection('event', e.id, true)}
                            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-zinc-900 flex-1">{e.name}</span>
                          <EntityActionButton name={e.name} type="event" hasReport={reportableNames.has(e.name)} onClick={e2 => e2.stopPropagation()} />
                          <span className={`text-xs px-2 py-0.5 rounded-full ${e.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                            e.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                              'bg-zinc-100 text-zinc-500'
                            }`}>{e.status}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {subscribedCompanies.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-indigo-800 uppercase tracking-wider mb-1 mt-2">Companies</h3>
                    <div className="space-y-1">
                      {subscribedCompanies.map(c => (
                        <label key={`sub-company-${c.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleSelection('company', c.id, true)}
                            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-zinc-900 flex-1">{c.name}</span>
                          <EntityActionButton name={c.name} type="company" hasReport={reportableNames.has(c.name)} onClick={e => e.stopPropagation()} />
                          {c.pipelineValue ? (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pipeline{formatCurrency(c.pipelineValue)}</span>
                          ) : (
                            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">Pipeline: Not Defined</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {subscribedAttendees.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-indigo-800 uppercase tracking-wider mb-1 mt-2">Attendees</h3>
                    <div className="space-y-1">
                      {subscribedAttendees.map(a => (
                        <label key={`sub-attendee-${a.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleSelection('attendee', a.id, true)}
                            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-zinc-900 flex-1">{a.name}</span>
                          <EntityActionButton name={a.name} type="attendee" hasReport={reportableNames.has(a.name)} onClick={e => e.stopPropagation()} />
                          <span className="text-xs text-zinc-500">{a.title}{a.companyName ? ` · ${a.companyName}` : ''}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Companies section */}
          {filteredCompanies.length > 0 && (
            <section id="section-companies" className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm mt-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center justify-between">
                All Companies
                {sub && sub.selectedCompanyIds.length > 0 && (
                  <span className="font-normal text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{sub.selectedCompanyIds.length} selected</span>
                )}
              </h2>
              <div className="space-y-1">
                {filteredCompanies.map(c => {
                  const isSelected = sub?.selectedCompanyIds.includes(c.id) ?? false
                  return (
                    <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection('company', c.id, isSelected)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                      <span className="text-sm text-zinc-900 flex-1">{c.name}</span>
                      <EntityActionButton name={c.name} type="company" hasReport={reportableNames.has(c.name)} onClick={e => e.stopPropagation()} />
                      {c.pipelineValue ? (
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pipeline{formatCurrency(c.pipelineValue)}</span>
                      ) : (
                        <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">Pipeline: Not Defined</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {/* Attendees section */}
          {filteredAttendees.length > 0 && (
            <section id="section-attendees" className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm mt-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center justify-between">
                All Attendees
                {sub && sub.selectedAttendeeIds.length > 0 && (
                  <span className="font-normal text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{sub.selectedAttendeeIds.length} selected</span>
                )}
              </h2>
              <div className="space-y-1">
                {filteredAttendees.map(a => {
                  const isSelected = sub?.selectedAttendeeIds.includes(a.id) ?? false
                  return (
                    <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection('attendee', a.id, isSelected)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                      <span className="text-sm text-zinc-900 flex-1">{a.name}</span>
                      <EntityActionButton name={a.name} type="attendee" hasReport={reportableNames.has(a.name)} onClick={e => e.stopPropagation()} />
                      <span className="text-xs text-zinc-500">{a.title}{a.companyName ? ` · ${a.companyName}` : ''}</span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {/* Events section */}
          {filteredEvents.length > 0 && (
            <section id="section-events" className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm mt-6">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center justify-between">
                All Events
                {sub && sub.selectedEventIds.length > 0 && (
                  <span className="font-normal text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{sub.selectedEventIds.length} selected</span>
                )}
              </h2>
              <div className="space-y-1">
                {filteredEvents.map(e => {
                  const isSelected = sub?.selectedEventIds.includes(e.id) ?? false
                  return (
                    <label key={e.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection('event', e.id, isSelected)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                      <span className="text-sm text-zinc-900 flex-1">{e.name}</span>
                      <EntityActionButton name={e.name} type="event" hasReport={reportableNames.has(e.name)} onClick={e2 => e2.stopPropagation()} />
                      <span className="text-xs text-zinc-400">{formatDate(e.startDate)}–{formatDate(e.endDate)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${e.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                        e.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                          'bg-zinc-100 text-zinc-500'
                        }`}>{e.status}</span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {search && filteredAttendees.length === 0 && filteredCompanies.length === 0 && filteredEvents.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-zinc-200 shadow-sm mt-6">
              <p className="text-sm text-zinc-500">No results found for &quot;<span className="font-medium text-zinc-900">{search}</span>&quot;</p>
            </div>
          )}
        </div>
      </div>
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
