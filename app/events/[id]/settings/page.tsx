'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EventAIScraper } from '@/components/EventAIScraper'
import { Save, Trash2, Download, Upload, AlertTriangle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useUser } from '@/components/auth'
import { Roles } from '@/lib/constants'
import { canManageEvents } from '@/lib/role-utils'

interface User {
    id: string
    firstName: string | null
    lastName: string | null
    emailAddresses: { emailAddress: string }[]
    publicMetadata: {
        role?: string
    }
}

interface EventSettings {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
    region: string
    url: string
    budget: number
    targetCustomers: string
    expectedRoi: string
    requesterEmail: string
    status: string
    tags: string[]
    meetingTypes: string[]
    attendeeTypes: string[]
    address: string
    timezone: string
    slug: string
    authorizedUserIds: string[]
    password?: string
    description?: string | null
    boothLocation?: string | null
}

export default function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
    const [event, setEvent] = useState<EventSettings | null>(null)
    const [initialEvent, setInitialEvent] = useState<EventSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    // User Access Control State
    const { user: currentUser } = useUser()
    const [availableUsers, setAvailableUsers] = useState<User[]>([])
    const [userSearch, setUserSearch] = useState('')
    const [loadingUsers, setLoadingUsers] = useState(false)

    // Local state for list inputs to allow free typing
    const [tagsInput, setTagsInput] = useState('')
    const [meetingTypesInput, setMeetingTypesInput] = useState('')
    const [attendeeTypesInput, setAttendeeTypesInput] = useState('')

    const router = useRouter()

    // Unwrapped params
    const [id, setId] = useState<string>('')

    useEffect(() => {
        params.then(p => setId(p.id))
    }, [params])

    useEffect(() => {
        if (!id) return
        fetch(`/api/events/${id}`)
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load event: ${res.status} ${res.statusText}`)
                return res.json()
            })
            .then(data => {
                const loadedEvent = {
                    ...data,
                    startDate: data.startDate ? data.startDate.split('T')[0] : null,
                    endDate: data.endDate ? data.endDate.split('T')[0] : null,
                    // If slug is a draft, clear it for the UI to force user input
                    slug: data.slug && data.slug.startsWith('draft-event-') ? '' : data.slug,
                    // Ensure arrays
                    tags: data.tags || [],
                    meetingTypes: data.meetingTypes || [],
                    attendeeTypes: data.attendeeTypes || [],
                    authorizedUserIds: data.authorizedUserIds || [],
                    boothLocation: data.boothLocation || ''
                }
                setEvent(loadedEvent)
                setInitialEvent(loadedEvent)

                // Init local inputs
                setTagsInput(loadedEvent.tags.join(', '))
                setMeetingTypesInput(loadedEvent.meetingTypes.join(', '))
                setAttendeeTypesInput(loadedEvent.attendeeTypes.join(', '))

                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setLoading(false)
            })
    }, [id])

    // Fetch users if privileged
    useEffect(() => {
        const role = currentUser?.publicMetadata?.role as string
        const canManageAccess = canManageEvents(role)

        if (canManageAccess) {
            setLoadingUsers(true)
            fetch('/api/admin/users')
                .then(res => {
                    if (res.ok) return res.json()
                    throw new Error('Failed to fetch users')
                })
                .then(data => {
                    setAvailableUsers(data.data || data)
                    setLoadingUsers(false)
                })
                .catch(err => {
                    console.error('Failed to load users for access control', err)
                    setLoadingUsers(false)
                })
        }
    }, [currentUser])

    // DIRTY CHECK & WARNING
    useEffect(() => {
        if (!event || !initialEvent) return

        const isDirty = () => {
            // Compare list inputs
            if (tagsInput !== initialEvent.tags.join(', ')) return true
            if (meetingTypesInput !== initialEvent.meetingTypes.join(', ')) return true
            if (attendeeTypesInput !== initialEvent.attendeeTypes.join(', ')) return true

            // Compare simple fields in event object
            // We use JSON stringify on relevant fields to avoid object ref issues
            // but we must exclude lists as they are handled by inputs above
            const { tags, meetingTypes, attendeeTypes, ...currentRest } = event
            const { tags: _t, meetingTypes: _m, attendeeTypes: _a, ...initialRest } = initialEvent

            // We need to ensuring consistent ordering or deepEqual. JSON.stringify works if keys are same order.
            // Since we clone from same shape, keys usually same. 
            // Better to iterate keys.
            return JSON.stringify(currentRest) !== JSON.stringify(initialRest)
        }

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty()) {
                e.preventDefault()
                e.returnValue = '' // Standard for Chrome
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)

    }, [event, initialEvent, tagsInput, meetingTypesInput, attendeeTypesInput])

    const filteredUsers = availableUsers.filter(u => {
        const term = userSearch.toLowerCase()
        const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase()
        const email = u.emailAddresses[0]?.emailAddress.toLowerCase() || ''
        const role = (u.publicMetadata?.role || Roles.User).toLowerCase()
        // Only show admins and users (root/marketing implies global access, no need to assign usually, 
        // but we show them effectively. Actually, wait. 
        // If I assign a Marketing user, it's redundant but harmless.
        // Let's filtered based on search only for now.
        return fullName.includes(term) || email.includes(term) || role.includes(term)
    })

    const handleSelectAllFiltered = () => {
        if (!event) return
        const currentIds = new Set(event.authorizedUserIds)
        filteredUsers.forEach(u => currentIds.add(u.id))
        setEvent({ ...event, authorizedUserIds: Array.from(currentIds) })
    }

    const handleDeselectAllFiltered = () => {
        if (!event) return
        const currentIds = new Set(event.authorizedUserIds)
        filteredUsers.forEach(u => currentIds.delete(u.id))
        setEvent({ ...event, authorizedUserIds: Array.from(currentIds) })
    }

    const toggleUserAccess = (userId: string) => {
        if (!event) return
        const currentIds = new Set(event.authorizedUserIds)
        if (currentIds.has(userId)) {
            currentIds.delete(userId)
        } else {
            currentIds.add(userId)
        }
        setEvent({ ...event, authorizedUserIds: Array.from(currentIds) })
    }

    const calculateBudgetFromAI = (desc: string) => {
        // Mock logic: if description mentions money, parse it? 
        // For now just return 0 if not explicit.
        return 0
    }

    const handleAIFill = (data: any) => {
        if (!event) return
        setEvent(prev => ({
            ...prev!,
            name: data.name || prev!.name,
            description: data.description || prev!.description,
            startDate: data.startDate || prev!.startDate,
            endDate: data.endDate || prev!.endDate,
            address: data.address || data.location || prev!.address, // added location fallback
            region: data.region || prev!.region,
            boothLocation: data.boothLocation || prev!.boothLocation,
            targetCustomers: data.targetCustomers || prev!.targetCustomers,
            budget: data.budget ? parseFloat(data.budget) : prev!.budget,
            expectedRoi: data.expectedRoi || prev!.expectedRoi,
            tags: data.tags ? [...new Set([...prev!.tags, ...data.tags])] : prev!.tags,
            meetingTypes: data.meetingTypes ? [...new Set([...prev!.meetingTypes, ...data.meetingTypes])] : prev!.meetingTypes,
            attendeeTypes: data.attendeeTypes ? [...new Set([...prev!.attendeeTypes, ...data.attendeeTypes])] : prev!.attendeeTypes,
        }))
        setMessage('Auto-filled fields from AI analysis')
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')

        try {
            // Parse local inputs to arrays
            const updatedEvent = {
                ...event!,
                tags: tagsInput.split(',').map(s => s.trim()).filter(Boolean),
                meetingTypes: meetingTypesInput.split(',').map(s => s.trim()).filter(Boolean),
                attendeeTypes: attendeeTypesInput.split(',').map(s => s.trim()).filter(Boolean)
            }

            const res = await fetch(`/api/events/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedEvent)
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to save')
            }

            setMessage('Settings saved successfully')
            // Update event state with saved values to stay in sync
            setEvent(updatedEvent)
            setInitialEvent(updatedEvent) // Reset dirty state baseline
            router.push('/events')
        } catch (err: any) {
            setMessage(err.message || 'Error saving settings')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) return

        const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
        if (res.ok) {
            router.push('/events')
        } else {
            alert('Failed to delete event')
        }
    }



    const isLocked = event?.status === 'OCCURRED'

    if (loading || !event) return <div className="p-10 text-center">Loading settings...</div>

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <Link href={`/events`} className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1 mb-4">
                <ArrowLeft className="w-4 h-4" /> Back to Portfolio
            </Link>

            <div className="flex justify-between items-start border-b border-neutral-200 pb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Event Configuration</h1>
                    <p className="text-neutral-500">Manage lifecycle, details, and data scope.</p>
                </div>
            </div>

            {isLocked && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r shadow-sm">
                    <div className="flex items-start">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 mr-3" />
                        <div>
                            <h3 className="text-sm font-medium text-amber-800">Event is Read-Only</h3>
                            <p className="text-sm text-amber-700 mt-1">
                                This event has occurred and is locked. To make changes, switch the status back to <strong>Committed</strong> or <strong>Pipeline</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-8">
                {/* Section 1: Core Details */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                        Core Details
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* 1. Name - First Priority */}
                        <div className="col-span-2">
                            <label htmlFor="name" className="block text-sm font-medium text-neutral-700">Event Name</label>
                            <input
                                id="name"
                                type="text"
                                disabled={isLocked}
                                value={event.name}
                                onChange={e => setEvent({ ...event, name: e.target.value })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        {/* 2. URL - Second Priority */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-neutral-700">Event URL</label>
                            <input
                                type="url"
                                disabled={isLocked}
                                value={event.url || ''}
                                onChange={e => setEvent({ ...event, url: e.target.value })}
                                placeholder="https://example.com"
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                            <p className="text-xs text-neutral-500 mt-1">Optional: Provide URL for better AI accuracy.</p>
                        </div>

                        {/* 5. Description */}
                        <div className="col-span-2">
                            <label htmlFor="description" className="block text-sm font-medium text-neutral-700">Event Description</label>
                            <textarea
                                id="description"
                                rows={3}
                                disabled={isLocked}
                                value={event.description || ''}
                                onChange={e => setEvent({ ...event, description: e.target.value })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                                placeholder="Brief overview of the event..."
                            />
                        </div>

                        {/* 4. Slug - Mandatory */}
                        <div className="col-span-2">
                            <label htmlFor="slug" className="block text-sm font-medium text-neutral-700">URL Slug (Unique ID)</label>
                            <div className="mt-1 flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 sm:text-sm">
                                    /events/
                                </span>
                                <input
                                    type="text"
                                    id="slug"
                                    disabled={isLocked}
                                    value={event.slug || ''}
                                    onChange={e => setEvent({ ...event, slug: e.target.value })}
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-neutral-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                                    placeholder="my-unique-event-id"
                                />
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">This ID is used in the URL to access the event dashboard.</p>
                        </div>

                        {/* Password Protection */}
                        <div className="col-span-2">
                            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">Event Password (Optional)</label>
                            <input
                                type="text"
                                id="password"
                                disabled={isLocked}
                                value={event.password || ''}
                                onChange={e => setEvent({ ...event, password: e.target.value })}
                                placeholder="Leave empty for public access"
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                            <p className="text-xs text-neutral-500 mt-1">If set, users must enter this password to view the event (unless they are authorized users).</p>
                        </div>

                        {/* 3. AI Action Button - Prominent */}
                        <div className="col-span-2">
                            <EventAIScraper
                                url={event.url}
                                currentData={event}
                                onFill={handleAIFill}
                                className="w-full"
                                disabled={isLocked}
                            />
                            <p className="text-xs text-neutral-500 text-center mt-2 italic">
                                💡 Tip: Enter an Event Name or URL, then click above to auto-fill details using AI.
                                The AI uses all fields you've filled so far as context.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-neutral-700">Status</label>
                            <select
                                id="status"
                                value={event.status}
                                onChange={e => setEvent({ ...event, status: e.target.value })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                            >
                                <option value="PIPELINE">Pipeline</option>
                                <option value="COMMITTED">Committed</option>
                                <option value="OCCURRED">Occurred</option>
                                <option value="CANCELED">Canceled</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="region" className="block text-sm font-medium text-neutral-700">Region</label>
                            <select
                                id="region"
                                value={event.region || ''}
                                onChange={e => setEvent({ ...event, region: e.target.value })}
                                disabled={isLocked}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            >
                                <option value="">Select Region...</option>
                                <option value="NA">North America (NA)</option>
                                <option value="SA">South America (SA)</option>
                                <option value="EU/UK">Europe / UK</option>
                                <option value="MEA">Middle East & Africa</option>
                                <option value="APAC">Asia Pacific</option>
                                <option value="Japan">Japan</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-neutral-700">Start Date</label>
                            <input
                                id="startDate"
                                type="date"
                                disabled={isLocked}
                                value={event.startDate || ''}
                                onChange={e => setEvent({ ...event, startDate: e.target.value || null })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-neutral-700">End Date</label>
                            <input
                                id="endDate"
                                type="date"
                                disabled={isLocked}
                                value={event.endDate || ''}
                                onChange={e => setEvent({ ...event, endDate: e.target.value || null })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        <div className="col-span-2">
                            <label htmlFor="address" className="block text-sm font-medium text-neutral-700">Address / Location</label>
                            <input
                                id="address"
                                type="text"
                                disabled={isLocked}
                                value={event.address || ''}
                                onChange={e => setEvent({ ...event, address: e.target.value })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        <div className="col-span-2">
                            <label htmlFor="boothLocation" className="block text-sm font-medium text-neutral-700">Booth Location</label>
                            <input
                                id="boothLocation"
                                type="text"
                                disabled={isLocked}
                                value={event.boothLocation || ''}
                                onChange={e => setEvent({ ...event, boothLocation: e.target.value })}
                                placeholder="e.g. Hall B, Booth 123"
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>
                    </div>
                </section>

                <hr className="border-neutral-200" />

                {/* Section 2: Strategy */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-neutral-900">Strategy & Budget</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="requesterEmail" className="block text-sm font-medium text-neutral-700">Requester Email</label>
                            <input
                                id="requesterEmail"
                                type="email"
                                disabled={isLocked}
                                value={event.requesterEmail || ''}
                                onChange={e => setEvent({ ...event, requesterEmail: e.target.value })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="budget" className="block text-sm font-medium text-neutral-700">Target Budget ($)</label>
                            <input
                                id="budget"
                                type="number"
                                disabled={isLocked}
                                value={event.budget || ''}
                                onChange={e => setEvent({ ...event, budget: parseFloat(e.target.value) })}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        <div className="col-span-2">
                            <label htmlFor="targetCustomers" className="block text-sm font-medium text-neutral-700">Target Customers</label>
                            <textarea
                                id="targetCustomers"
                                disabled={isLocked}
                                value={event.targetCustomers || ''}
                                onChange={e => setEvent({ ...event, targetCustomers: e.target.value })}
                                rows={2}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>

                        <div className="col-span-2">
                            <label htmlFor="expectedRoi" className="block text-sm font-medium text-neutral-700">Expected ROI</label>
                            <textarea
                                id="expectedRoi"
                                disabled={isLocked}
                                value={event.expectedRoi || ''}
                                onChange={e => setEvent({ ...event, expectedRoi: e.target.value })}
                                rows={2}
                                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                            />
                        </div>
                    </div>
                </section>

                <hr className="border-neutral-200" />

                {/* Section 3: Lists (Dictionaries) */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-neutral-900">Classification Lists</h2>
                    <p className="text-sm text-neutral-500">Manage drop-down values for this event. Enter as comma-separated values.</p>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700">Meeting Tags</label>
                        <input
                            type="text"
                            disabled={isLocked}
                            value={tagsInput}
                            onChange={e => setTagsInput(e.target.value)}
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700">Meeting Types</label>
                        <input
                            type="text"
                            disabled={isLocked}
                            value={meetingTypesInput}
                            onChange={e => setMeetingTypesInput(e.target.value)}
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700">Attendee Types</label>
                        <input
                            type="text"
                            disabled={isLocked}
                            value={attendeeTypesInput}
                            onChange={e => setAttendeeTypesInput(e.target.value)}
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                    </div>
                </section>



                {/* Section 4: User Access Control (Privileged Only) */}
                {availableUsers.length > 0 && (
                    <>
                        <hr className="border-neutral-200" />
                        <section className="space-y-4 pt-4">
                            <h2 className="text-lg font-semibold text-neutral-900">User Access Control</h2>
                            <p className="text-sm text-neutral-500">
                                Select users who can access this event.
                                (Root and Marketing users have global access by default).
                            </p>

                            <div className="bg-white border border-neutral-200 rounded-lg p-4">
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        placeholder="Search users by name, email or role..."
                                        className="flex-1 rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                        value={userSearch}
                                        onChange={e => setUserSearch(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSelectAllFiltered}
                                        className="px-3 py-2 bg-neutral-100 text-neutral-700 rounded-md text-sm font-medium hover:bg-neutral-200"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeselectAllFiltered}
                                        className="px-3 py-2 bg-neutral-100 text-neutral-700 rounded-md text-sm font-medium hover:bg-neutral-200"
                                    >
                                        Deselect All
                                    </button>
                                </div>

                                <div className="max-h-60 overflow-y-auto border border-neutral-200 rounded-md divide-y divide-neutral-100">
                                    {loadingUsers ? (
                                        <div className="p-4 text-center text-neutral-500">Loading users...</div>
                                    ) : filteredUsers.length === 0 ? (
                                        <div className="p-4 text-center text-neutral-500">No users match your search.</div>
                                    ) : (
                                        filteredUsers.map(user => {
                                            const isSelected = event?.authorizedUserIds?.includes(user.id)
                                            const role = user.publicMetadata.role || Roles.User
                                            const isGlobal = role === Roles.Root || role === Roles.Marketing

                                            return (
                                                <div key={user.id} className={`flex items-center justify-between p-3 hover:bg-neutral-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            id={`user-${user.id}`}
                                                            checked={isSelected || isGlobal}
                                                            disabled={isGlobal || isLocked}
                                                            onChange={() => toggleUserAccess(user.id)}
                                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-neutral-300 rounded"
                                                        />
                                                        <div>
                                                            <label htmlFor={`user-${user.id}`} className="block text-sm font-medium text-neutral-900 cursor-pointer">
                                                                {user.firstName} {user.lastName}
                                                            </label>
                                                            <span className="text-xs text-neutral-500">{user.emailAddresses[0]?.emailAddress}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                                                        ${role === Roles.Root ? 'bg-purple-100 text-purple-800' :
                                                                role === Roles.Admin ? 'bg-green-100 text-green-800' :
                                                                    role === Roles.Marketing ? 'bg-blue-100 text-blue-800' :
                                                                        'bg-gray-100 text-gray-800'}`}>
                                                            {role}
                                                        </span>
                                                        {isGlobal && <span className="text-xs text-neutral-400 italic">(Global Access)</span>}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                                <div className="mt-2 text-xs text-neutral-500 text-right">
                                    {event?.authorizedUserIds.length || 0} users selected
                                </div>
                            </div>
                        </section>
                    </>
                )}

                <div className="flex items-center gap-4 pt-4">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Save Changes
                    </button>
                    {message && (
                        <div className={`px-4 py-2 rounded-md text-sm font-medium animate-in fade-in ${message.includes('saved successfully') || message.includes('Auto-filled')
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                            }`}>
                            {message}
                        </div>
                    )}
                </div>
            </form>

            <hr className="border-neutral-200" />

            {/* Section 4: Data Management */}
            <section className="space-y-6 pt-4">
                <h2 className="text-lg font-semibold text-neutral-900 text-red-600 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Danger Zone
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border border-neutral-200 p-4 rounded-lg bg-white">
                        <h3 className="font-medium text-neutral-900">Export Event Data</h3>
                        <p className="text-sm text-neutral-500 mb-4">Download a JSON backup of this event.</p>
                        <button
                            onClick={() => {
                                window.location.href = `/api/events/${id}/export`
                            }}
                            className="text-sm border border-neutral-300 bg-white px-3 py-1.5 rounded-md hover:bg-neutral-50 w-full flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" /> Export
                        </button>
                    </div>

                    {!isLocked && (
                        <>
                            <div className="border border-neutral-200 p-4 rounded-lg bg-white">
                                <h3 className="font-medium text-neutral-900">Import Data</h3>
                                <p className="text-sm text-neutral-500 mb-4">Restore or merge data from JSON.</p>
                                <label className="text-sm border border-neutral-300 bg-white px-3 py-1.5 rounded-md hover:bg-neutral-50 w-full flex items-center justify-center gap-2 cursor-pointer">
                                    <Upload className="w-4 h-4" /> Import
                                    <input
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0]
                                            if (!file) return

                                            const text = await file.text()
                                            try {
                                                const json = JSON.parse(text)
                                                const res = await fetch(`/api/events/${id}/import`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify(json)
                                                })
                                                if (res.ok) {
                                                    alert('Import successful')
                                                    window.location.reload()
                                                } else {
                                                    alert('Import failed')
                                                }
                                            } catch (err) {
                                                alert('Invalid JSON file')
                                            }
                                        }}
                                    />
                                </label>
                            </div>

                            <div className="border border-red-200 bg-red-50 p-4 rounded-lg">
                                <h3 className="font-medium text-red-900">Reset Event</h3>
                                <p className="text-sm text-red-700 mb-4">Wipe all Attendees, Rooms, and Meetings. Event details are preserved. <br /><strong>A backup will be downloaded automatically.</strong></p>
                                <button
                                    onClick={async () => {
                                        if (!confirm('Are you sure you want to reset this event? This will delete all Attendees, Rooms, and Meetings.\n\nA backup JSON file will be downloaded before deletion proceeds.')) return

                                        setMessage('Downloading backup...')
                                        try {
                                            // 1. Download Backup
                                            const resExport = await fetch(`/api/events/${id}/export`)
                                            if (!resExport.ok) throw new Error('Backup failed. Reset aborted.')

                                            const blob = await resExport.blob()
                                            const url = window.URL.createObjectURL(blob)
                                            const a = document.createElement('a')
                                            a.href = url
                                            // wrapper to get filename from headers if possible, or fallback
                                            const disposition = resExport.headers.get('Content-Disposition')
                                            let filename = `event-${id}-backup.json`
                                            if (disposition && disposition.includes('filename=')) {
                                                filename = disposition.split('filename=')[1].replace(/"/g, '')
                                            }
                                            a.download = filename
                                            document.body.appendChild(a)
                                            a.click()
                                            window.URL.revokeObjectURL(url)
                                            document.body.removeChild(a)

                                            setMessage('Backup downloaded. Resetting data...')

                                            // 2. Perform Reset
                                            const resReset = await fetch(`/api/events/${id}/reset`, { method: 'POST' })
                                            if (resReset.ok) {
                                                alert('Event has been reset successfully.')
                                                window.location.reload()
                                            } else {
                                                const err = await resReset.json()
                                                throw new Error(err.error || 'Reset failed')
                                            }
                                        } catch (error: any) {
                                            alert(`Error: ${error.message}`)
                                            setMessage('')
                                        }
                                    }}
                                    className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 w-full flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" /> Reset Event
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div >
    )
}
