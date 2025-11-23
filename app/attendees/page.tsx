'use client'

import { useState, useEffect } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Attendee {
    id: string
    name: string
    title?: string
    email: string
    company: string
    bio: string
    companyDescription?: string
    linkedin?: string
    imageUrl?: string
}

export default function AttendeesPage() {
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [formData, setFormData] = useState({
        name: '',
        title: '',
        email: '',
        company: '',
        bio: '',
        companyDescription: '',
        linkedin: '',
        imageUrl: ''
    })
    const [loading, setLoading] = useState(false)
    const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)
    const [autoCompleting, setAutoCompleting] = useState(false)
    const [hasApiKey, setHasApiKey] = useState(false)
    const [suggestions, setSuggestions] = useState<Partial<Attendee> | null>(null)

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
        imageUrl: ''
    })
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    useEffect(() => {
        fetchAttendees()
        checkSettings()
    }, [])

    const checkSettings = async () => {
        try {
            const res = await fetch('/api/settings')
            const data = await res.json()
            setHasApiKey(!!data.geminiApiKey)
        } catch (error) {
            console.error('Error checking settings:', error)
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

    const handleAutoComplete = async () => {
        if (!formData.name || !formData.company) return
        setAutoCompleting(true)
        try {
            const res = await fetch('/api/attendees/autocomplete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    company: formData.company
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setSuggestions(data)
            } else {
                alert('Failed to generate suggestions. Please check your API key.')
            }
        } catch (error) {
            console.error('Error auto completing:', error)
            alert('An error occurred while generating suggestions')
        } finally {
            setAutoCompleting(false)
        }
    }

    const applySuggestions = () => {
        if (!suggestions) return
        setFormData(prev => ({
            ...prev,
            title: suggestions.title || prev.title,
            bio: suggestions.bio || prev.bio,
            companyDescription: suggestions.companyDescription || prev.companyDescription,
            linkedin: suggestions.linkedin || prev.linkedin
        }))
        setSuggestions(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/attendees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            })
            if (res.ok) {
                setFormData({ name: '', title: '', email: '', company: '', bio: '', companyDescription: '', linkedin: '', imageUrl: '' })
                fetchAttendees()
            }
        } catch (error) {
            console.error('Error adding attendee:', error)
        } finally {
            setLoading(false)
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
            imageUrl: attendee.imageUrl || ''
        })
        setIsEditModalOpen(true)
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
                setIsEditModalOpen(false)
                setEditingAttendee(null)
                fetchAttendees()
            } else {
                alert('Failed to update attendee')
            }
        } catch (error) {
            console.error('Error updating attendee:', error)
        }
    }

    const generateBriefing = async (attendee: Attendee) => {
        setGeneratingPdf(attendee.id)
        try {
            const res = await fetch(`/api/attendees/${attendee.id}/briefing`)
            const data = await res.json()

            const doc = new jsPDF()

            // Title
            doc.setFontSize(20)
            doc.text(`Briefing Book: ${attendee.name}`, 14, 20)
            doc.setFontSize(12)
            doc.text(`${attendee.title ? attendee.title + ' at ' : ''}${attendee.company}`, 14, 28)

            let yPos = 40

            if (data.meetings.length === 0) {
                doc.text("No meetings scheduled.", 14, yPos)
            } else {
                data.meetings.forEach((meeting: any, index: number) => {
                    // Meeting Header
                    doc.setFontSize(14)
                    doc.setFillColor(240, 240, 240)
                    doc.rect(14, yPos - 6, 182, 10, 'F')
                    doc.text(`${new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${meeting.title}`, 16, yPos)
                    yPos += 10

                    doc.setFontSize(10)
                    doc.text(`Room: ${meeting.room?.name || 'TBD'}`, 14, yPos)
                    yPos += 6
                    doc.text(`Purpose: ${meeting.purpose || 'N/A'}`, 14, yPos)
                    yPos += 10

                    // Participants
                    doc.setFontSize(11)
                    doc.text("Participants:", 14, yPos)
                    yPos += 6

                    const participants = meeting.attendees.filter((a: any) => a.id !== attendee.id)

                    if (participants.length > 0) {
                        participants.forEach((p: any) => {
                            doc.setFontSize(10)
                            doc.setFont("helvetica", "bold")
                            doc.text(`• ${p.name} (${p.company})`, 18, yPos)
                            yPos += 5
                            doc.setFont("helvetica", "normal")
                            const bioLines = doc.splitTextToSize(p.bio || 'No bio available.', 170)
                            doc.text(bioLines, 22, yPos)
                            yPos += (bioLines.length * 4) + 4

                            if (yPos > 270) {
                                doc.addPage()
                                yPos = 20
                            }
                        })
                    } else {
                        doc.text("No other participants.", 18, yPos)
                        yPos += 8
                    }

                    yPos += 10
                    if (yPos > 250) {
                        doc.addPage()
                        yPos = 20
                    }
                })
            }

            doc.save(`Briefing_${attendee.name.replace(/\s+/g, '_')}.pdf`)
        } catch (error) {
            console.error("Failed to generate PDF", error)
            alert("Failed to generate briefing book")
        } finally {
            setGeneratingPdf(null)
        }
    }

    return (
        <div className="space-y-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Attendees</h1>
                    <p className="mt-2 text-zinc-500">Manage your event participants.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Attendee Form */}
                <div className="lg:col-span-1">
                    <div className="card sticky top-24">
                        <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-6">Add Attendee</h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Photo Input */}
                            <div className="flex justify-center mb-6">
                                <div className="relative group">
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center overflow-hidden border-2 ${formData.imageUrl ? 'border-indigo-500' : 'border-zinc-200 bg-zinc-50'}`}>
                                        {formData.imageUrl ? (
                                            <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
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
                                        value={formData.imageUrl}
                                        onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    required
                                    className="input-field"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="title" className="block text-sm font-medium text-zinc-700 mb-1.5">Title</label>
                                <input
                                    type="text"
                                    id="title"
                                    className="input-field"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="company" className="block text-sm font-medium text-zinc-700 mb-1.5">Company</label>
                                <input
                                    type="text"
                                    id="company"
                                    className="input-field"
                                    value={formData.company}
                                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
                                <input
                                    type="email"
                                    id="email"
                                    required
                                    className="input-field"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="linkedin" className="block text-sm font-medium text-zinc-700 mb-1.5">LinkedIn URL</label>
                                <input
                                    type="url"
                                    id="linkedin"
                                    className="input-field"
                                    value={formData.linkedin}
                                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                                    placeholder="https://linkedin.com/in/..."
                                />
                            </div>
                            <div>
                                <label htmlFor="bio" className="block text-sm font-medium text-zinc-700 mb-1.5">Bio</label>
                                <textarea
                                    id="bio"
                                    className="input-field h-24 resize-none"
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3">
                                <div className="relative flex-grow group">
                                    <button
                                        type="button"
                                        onClick={handleAutoComplete}
                                        disabled={loading || !hasApiKey || !formData.name || !formData.company}
                                        className="w-full btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {autoCompleting ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span>Thinking...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                <span>Auto Complete</span>
                                            </>
                                        )}
                                    </button>
                                    {!hasApiKey && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-zinc-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                            Gemini API Key required in Settings
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800"></div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed px-6"
                                >
                                    {loading ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Suggestions Modal */}
                {suggestions && (
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
                            <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-4">Suggestions Found</h2>
                            <div className="space-y-4 mb-6">
                                <div>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Title</span>
                                    <p className="text-zinc-900">{suggestions.title}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Bio</span>
                                    <p className="text-zinc-600 text-sm">{suggestions.bio}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Company Description</span>
                                    <p className="text-zinc-600 text-sm">{suggestions.companyDescription}</p>
                                </div>
                                {suggestions.linkedin && (
                                    <div>
                                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">LinkedIn</span>
                                        <p className="text-indigo-600 text-sm truncate">{suggestions.linkedin}</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSuggestions(null)}
                                    className="flex-1 btn-secondary"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={applySuggestions}
                                    className="flex-1 btn-primary"
                                >
                                    Accept & Fill
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Attendees List */}
                <div className="lg:col-span-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {attendees.map((attendee) => (
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
                                            <p className="text-sm text-zinc-500 font-medium">{attendee.title ? `${attendee.title} at ` : ''}{attendee.company}</p>
                                        </div>
                                    </div>
                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openEditModal(attendee)}
                                            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(attendee.id)}
                                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
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
                        ))}
                        {attendees.length === 0 && (
                            <div className="col-span-full text-center py-16 text-zinc-500 bg-white rounded-3xl border border-dashed border-zinc-200">
                                No attendees yet. Add one to get started.
                            </div>
                        )}
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
                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
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
