'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import AddAttendeeForm from '@/components/AddAttendeeForm'
import { generateMultiMeetingBriefingBook } from '@/lib/briefing-book'
import { useUser } from '@/components/auth'
import { hasWriteAccess } from '@/lib/role-utils'

interface Attendee {
    id: string
    name: string
    title: string
    email: string
    company: string
    bio: string
    companyDescription?: string
    linkedin?: string
    imageUrl?: string
    isExternal?: boolean
    type?: string
}

function AttendeesContent() {
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)
    const [attendeeTypes, setAttendeeTypes] = useState<string[]>([])
    const { user } = useUser()
    const readOnly = !hasWriteAccess(user?.publicMetadata?.role as string)
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const attendeeIdParam = searchParams.get('attendeeId')

    // Edit State
    const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null)
    const [editFormData, setEditFormData] = useState({
        name: '',
        title: '',
        email: '',
        company: '',
        bio: '',
        companyDescription: '',
        linkedin: '',
        imageUrl: '',
        isExternal: false,
        type: ''
    })
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        fetchAttendees()
        fetchSettings()
    }, [])

    useEffect(() => {
        if (attendeeIdParam) {
            const attendee = attendees.find(a => a.id === attendeeIdParam)
            if (attendee) {
                if (!isEditModalOpen && editingAttendee?.id !== attendeeIdParam) {
                    openEditModal(attendee)
                }
            } else {
                // Not found in list - fetch individually
                fetch(`/api/attendees/${attendeeIdParam}`)
                    .then(res => {
                        if (res.ok) return res.json()
                        throw new Error('Attendee not found')
                    })
                    .then(data => {
                        // Add to list and open
                        setAttendees(prev => {
                            // Check if already exists to avoid dupes if race condition
                            if (prev.some(a => a.id === data.id)) return prev;
                            return [...prev, data];
                        });
                        openEditModal(data);
                    })
                    .catch(err => {
                        console.error('Failed to fetch deep-linked attendee:', err)
                    })
            }
        }
    }, [attendees, attendeeIdParam])

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings')
            const data = await res.json()
            setAttendeeTypes(data.attendeeTypes || [])
        } catch (error) {
            console.error('Error fetching settings:', error)
        }
    }

    const fetchAttendees = async () => {
        try {
            const res = await fetch('/api/attendees')
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setAttendees(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error('Error fetching attendees:', error)
            setAttendees([])
        }
    }



    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this attendee?')) return

        try {
            const res = await fetch(`/api/attendees/${id}`, {
                method: 'DELETE',
            })
            if (res.ok) {
                fetchAttendees()
            } else {
                alert('Failed to delete attendee')
            }
        } catch (error) {
            console.error('Error deleting attendee:', error)
        }
    }

    const openEditModal = (attendee: Attendee) => {
        setEditingAttendee(attendee)
        setEditFormData({
            name: attendee.name,
            title: attendee.title || '',
            email: attendee.email,
            company: attendee.company || '',
            bio: attendee.bio || '',
            companyDescription: attendee.companyDescription || '',
            linkedin: attendee.linkedin || '',
            imageUrl: attendee.imageUrl || '',
            isExternal: attendee.isExternal || false,
            type: attendee.type || ''
        })
        setIsEditModalOpen(true)
    }

    const closeEditModal = () => {
        setIsEditModalOpen(false)
        setEditingAttendee(null)
        if (attendeeIdParam) {
            const params = new URLSearchParams(searchParams.toString())
            params.delete('attendeeId')
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingAttendee) return

        try {
            const res = await fetch(`/api/attendees/${editingAttendee.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData),
            })
            if (res.ok) {
                closeEditModal()
                fetchAttendees()
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to update attendee')
            }
        } catch (error) {
            console.error('Error updating attendee:', error)
            alert('An unexpected error occurred')
        }
    }

    const generateBriefing = async (attendee: Attendee) => {
        setGeneratingPdf(attendee.id)
        try {
            const res = await fetch(`/api/attendees/${attendee.id}/briefing`)
            const data = await res.json()

            const meetingsForPdf = (data.meetings || []).map((m: any) => ({
                meeting: {
                    ...m,
                    startTime: m.startTime || '',
                    endTime: m.endTime || ''
                },
                roomName: m.room?.name || (m.location ? m.location : 'Unknown')
            }))

            generateMultiMeetingBriefingBook(
                `Attendee Briefing Book`,
                `${attendee.name} - ${attendee.title ? attendee.title + ' at ' : ''}${attendee.company}`,
                meetingsForPdf,
                `${attendee.name}_Briefing_Book`
            )
        } catch (error) {
            console.error("Failed to generate PDF", error)
            alert("Failed to generate briefing book")
        } finally {
            setGeneratingPdf(null)
        }
    }

    const internalAttendees = attendees.filter(a => !a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase())))
    const externalAttendees = attendees.filter(a => a.isExternal && (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.company.toLowerCase().includes(searchQuery.toLowerCase())))

    const renderAttendeeCard = (attendee: Attendee) => (
        <div key={attendee.id} className="card hover:border-zinc-200 group relative flex flex-col">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-100 flex-shrink-0 border border-zinc-100">
                        {attendee.imageUrl ? (
                            <img src={attendee.imageUrl} alt={attendee.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                                {attendee.name.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-zinc-900 tracking-tight group-hover:text-indigo-600 transition-colors">{attendee.name}</h3>
                        <p className="text-sm text-zinc-500 font-medium">
                            {attendee.title ? `${attendee.title} at ` : ''}{attendee.company}
                            {attendee.isExternal && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                    External
                                </span>
                            )}
                            {attendee.type && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    {attendee.type}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex space-x-1">
                    {!readOnly && (
                        <button
                            onClick={() => openEditModal(attendee)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors"
                            title="Edit"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                    )}
                    {!readOnly && (
                        <button
                            onClick={() => handleDelete(attendee.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={() => generateBriefing(attendee)}
                        disabled={generatingPdf === attendee.id}
                        className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Download Briefing Book"
                    >
                        {generatingPdf === attendee.id ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
            <p className="text-sm text-zinc-600 line-clamp-3 leading-relaxed mb-4 flex-grow">{attendee.bio || 'No bio available'}</p>
            {attendee.linkedin && (
                <a href={attendee.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                    </svg>
                    LinkedIn Profile
                </a>
            )}
            <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-between items-center">
                <span className="text-xs text-zinc-400 font-mono">{attendee.email}</span>
            </div>
        </div>
    )

    return (
        <div className="space-y-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Attendees</h1>
                    <p className="mt-2 text-zinc-500">Manage your event participants.</p>
                </div>
                <div className="relative w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        className="input-field pl-10"
                        placeholder="Search attendees..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Attendee Form */}
                <div className="lg:col-span-1">
                    {!readOnly && <AddAttendeeForm onSuccess={fetchAttendees} />}
                </div>

                {/* Attendees List */}
                <div className="lg:col-span-2 space-y-12">
                    {/* Internal Attendees */}
                    <div>
                        <div className="flex items-center mb-6">
                            <h2 className="text-xl font-bold text-zinc-900">Internal Attendees</h2>
                            <span className="ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                                {internalAttendees.length}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {internalAttendees.map(renderAttendeeCard)}
                            {internalAttendees.length === 0 && (
                                <div className="col-span-full text-center py-12 text-zinc-500 bg-white rounded-3xl border border-dashed border-zinc-200">
                                    No internal attendees found.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* External Attendees */}
                    <div>
                        <div className="flex items-center mb-6">
                            <h2 className="text-xl font-bold text-zinc-900">External Attendees</h2>
                            <span className="ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                {externalAttendees.length}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {externalAttendees.map(renderAttendeeCard)}
                            {externalAttendees.length === 0 && (
                                <div className="col-span-full text-center py-12 text-zinc-500 bg-white rounded-3xl border border-dashed border-zinc-200">
                                    No external attendees found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">Edit Attendee</h2>
                        <form onSubmit={handleUpdate} className="space-y-5">
                            {/* Photo Input */}
                            <div className="flex justify-center mb-6">
                                <div className="relative group">
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center overflow-hidden border-2 ${editFormData.imageUrl ? 'border-indigo-500' : 'border-zinc-200 bg-zinc-50'}`}>
                                        {editFormData.imageUrl ? (
                                            <img src={editFormData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <svg className="w-10 h-10 text-zinc-300" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                                            </svg>
                                        )}
                                    </div>
                                    <input
                                        type="url"
                                        placeholder="Photo URL"
                                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-32 text-xs text-center border border-zinc-200 rounded-full px-2 py-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 bg-white"
                                        value={editFormData.imageUrl}
                                        onChange={(e) => setEditFormData({ ...editFormData, imageUrl: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="edit-name" className="block text-sm font-medium text-zinc-700 mb-1.5">Name</label>
                                <input
                                    type="text"
                                    id="edit-name"
                                    required
                                    className="input-field"
                                    value={editFormData.name}
                                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-title" className="block text-sm font-medium text-zinc-700 mb-1.5">Title</label>
                                <input
                                    type="text"
                                    id="edit-title"
                                    required
                                    className="input-field"
                                    value={editFormData.title}
                                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-company" className="block text-sm font-medium text-zinc-700 mb-1.5">Company</label>
                                <input
                                    type="text"
                                    id="edit-company"
                                    required
                                    className="input-field"
                                    value={editFormData.company}
                                    onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-email" className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
                                <input
                                    type="email"
                                    id="edit-email"
                                    required
                                    className="input-field"
                                    value={editFormData.email}
                                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-linkedin" className="block text-sm font-medium text-zinc-700 mb-1.5">LinkedIn URL</label>
                                <input
                                    type="url"
                                    id="edit-linkedin"
                                    className="input-field"
                                    value={editFormData.linkedin}
                                    onChange={(e) => setEditFormData({ ...editFormData, linkedin: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-bio" className="block text-sm font-medium text-zinc-700 mb-1.5">Bio</label>
                                <textarea
                                    id="edit-bio"
                                    className="input-field h-24 resize-none"
                                    value={editFormData.bio}
                                    onChange={(e) => setEditFormData({ ...editFormData, bio: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="edit-isExternal"
                                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={editFormData.isExternal}
                                    onChange={(e) => setEditFormData({ ...editFormData, isExternal: e.target.checked })}
                                />
                                <label htmlFor="edit-isExternal" className="text-sm font-medium text-zinc-700">
                                    External Attendee
                                </label>
                            </div>

                            {attendeeTypes.length > 0 && (
                                <div>
                                    <label htmlFor="edit-type" className="block text-sm font-medium text-zinc-700 mb-1.5">Attendee Type</label>
                                    <select
                                        id="edit-type"
                                        className="input-field"
                                        value={editFormData.type}
                                        onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                                    >
                                        <option value="">Select a type...</option>
                                        {attendeeTypes.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeEditModal}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function AttendeesPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading attendees...</div>}>
            <AttendeesContent />
        </Suspense>
    )
}
