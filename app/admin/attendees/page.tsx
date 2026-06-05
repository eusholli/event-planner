'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/components/auth'
import { hasWriteAccess } from '@/lib/role-utils'
import Pagination from '@/components/Pagination'

interface Company {
    id: string
    name: string
    pipelineValue?: number | null
    region?: string | null
}

interface Attendee {
    id: string
    name: string
    title: string
    email: string
    emailMissing?: boolean
    companyId: string
    company: Company
    bio?: string | null
    linkedin?: string | null
    imageUrl?: string | null
    isExternal?: boolean
    type?: string | null
    seniorityLevel?: string | null
    _count: { events: number }
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const EMPTY_EDIT_FORM = {
    name: '', title: '', email: '', companyId: '', bio: '', linkedin: '', imageUrl: '',
    isExternal: false, type: '', seniorityLevel: ''
}

const EMPTY_ADD_FORM = {
    name: '', title: '', email: '', companyId: '', bio: '', linkedin: '', imageUrl: '',
    isExternal: false, type: '', seniorityLevel: ''
}

export default function AdminAttendeesPage() {
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(25)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Company[]>([])
    const [attendeeTypes, setAttendeeTypes] = useState<string[]>([])

    const { user } = useUser()
    const role = user?.publicMetadata?.role as string
    const readOnly = !hasWriteAccess(role)
    const userEmail = user?.primaryEmailAddress?.emailAddress

    // Edit modal state
    const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null)
    const [editFormData, setEditFormData] = useState(EMPTY_EDIT_FORM)
    const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editCompanySearch, setEditCompanySearch] = useState('')
    const [selectedEditCompany, setSelectedEditCompany] = useState<Company | null>(null)
    const [showEditCompanyDropdown, setShowEditCompanyDropdown] = useState(false)
    const editCompanyDropdownRef = useRef<HTMLDivElement>(null)

    // Add form state
    const [addFormData, setAddFormData] = useState(EMPTY_ADD_FORM)
    const [addSelectedFile, setAddSelectedFile] = useState<File | null>(null)
    const [addLoading, setAddLoading] = useState(false)
    const [addCompanySearch, setAddCompanySearch] = useState('')
    const [selectedAddCompany, setSelectedAddCompany] = useState<Company | null>(null)
    const [showAddCompanyDropdown, setShowAddCompanyDropdown] = useState(false)
    const addCompanyDropdownRef = useRef<HTMLDivElement>(null)

    // Debounce search → reset to page 1
    useEffect(() => {
        const timer = setTimeout(() => { setPage(1) }, 500)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => { fetchAttendees() }, [page, limit, search])

    useEffect(() => {
        fetchCompanies()
        fetchAttendeeTypes()
    }, [])

    // Close dropdowns on outside click
    useEffect(() => {
        function handle(e: MouseEvent) {
            if (editCompanyDropdownRef.current && !editCompanyDropdownRef.current.contains(e.target as Node))
                setShowEditCompanyDropdown(false)
            if (addCompanyDropdownRef.current && !addCompanyDropdownRef.current.contains(e.target as Node))
                setShowAddCompanyDropdown(false)
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const fetchAttendees = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page: page.toString(), limit: limit.toString(), search })
            const res = await fetch(`/api/admin/attendees?${params}`)
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setAttendees(data.data || [])
            setTotalCount(data.totalCount || 0)
        } catch (error) {
            console.error('Error fetching attendees:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchCompanies = async () => {
        try {
            const res = await fetch('/api/companies')
            if (res.ok) setCompanies(await res.json())
        } catch (err) { console.error('Failed to fetch companies', err) }
    }

    const fetchAttendeeTypes = async () => {
        try {
            const res = await fetch('/api/admin/system')
            if (res.ok) {
                const data = await res.json()
                if (data.defaultAttendeeTypes && Array.isArray(data.defaultAttendeeTypes))
                    setAttendeeTypes(data.defaultAttendeeTypes)
            }
        } catch { /* non-critical */ }
    }

    const resizeImage = (file: File): Promise<File> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = (event) => {
                const img = new Image()
                img.src = event.target?.result as string
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    const MAX = 800
                    let { width, height } = img
                    if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
                    else { if (height > MAX) { width *= MAX / height; height = MAX } }
                    canvas.width = width; canvas.height = height
                    canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
                    canvas.toBlob(blob => {
                        if (blob) resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }))
                        else reject(new Error('Canvas is empty'))
                    }, 'image/jpeg', 0.8)
                }
                img.onerror = reject
            }
            reader.onerror = reject
        })
    }

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAddCompany) { alert('Please select a company'); return }
        setAddLoading(true)
        try {
            const formData = new FormData()
            formData.append('name', addFormData.name)
            formData.append('title', addFormData.title)
            formData.append('email', addFormData.email)
            formData.append('companyId', addFormData.companyId)
            formData.append('bio', addFormData.bio)
            formData.append('linkedin', addFormData.linkedin)
            formData.append('imageUrl', addFormData.imageUrl)
            formData.append('isExternal', String(addFormData.isExternal))
            formData.append('type', addFormData.type)
            formData.append('seniorityLevel', addFormData.seniorityLevel)
            if (addSelectedFile) formData.append('imageFile', addSelectedFile)

            const res = await fetch('/api/admin/attendees', { method: 'POST', body: formData })
            if (res.ok) {
                setAddFormData(EMPTY_ADD_FORM)
                setAddCompanySearch('')
                setSelectedAddCompany(null)
                setAddSelectedFile(null)
                setPage(1)
                fetchAttendees()
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to add attendee')
            }
        } finally {
            setAddLoading(false)
        }
    }

    const openEditModal = (attendee: Attendee) => {
        setEditingAttendee(attendee)
        setEditSelectedFile(null)
        setSelectedEditCompany(attendee.company)
        setEditCompanySearch(attendee.company.name)
        setEditFormData({
            name: attendee.name,
            title: attendee.title || '',
            email: attendee.emailMissing ? '' : attendee.email,
            companyId: attendee.companyId,
            bio: attendee.bio || '',
            linkedin: attendee.linkedin || '',
            imageUrl: attendee.imageUrl || '',
            isExternal: attendee.isExternal || false,
            type: attendee.type || '',
            seniorityLevel: attendee.seniorityLevel || ''
        })
        setIsEditModalOpen(true)
    }

    const closeEditModal = () => {
        setIsEditModalOpen(false)
        setEditingAttendee(null)
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingAttendee) return
        try {
            const formData = new FormData()
            formData.append('name', editFormData.name)
            formData.append('title', editFormData.title)
            formData.append('email', editFormData.email)
            formData.append('companyId', editFormData.companyId)
            formData.append('bio', editFormData.bio)
            formData.append('linkedin', editFormData.linkedin)
            formData.append('imageUrl', editFormData.imageUrl)
            formData.append('isExternal', String(editFormData.isExternal))
            formData.append('type', editFormData.type)
            formData.append('seniorityLevel', editFormData.seniorityLevel)
            if (editSelectedFile) formData.append('imageFile', editSelectedFile)

            const res = await fetch(`/api/attendees/${editingAttendee.id}`, { method: 'PUT', body: formData })
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

    const handleDelete = async (attendee: Attendee) => {
        if (!confirm(`Delete ${attendee.name} from the entire system? This will remove them from all ${attendee._count.events} event(s) and cannot be undone.`)) return
        try {
            const res = await fetch(`/api/attendees/${attendee.id}`, { method: 'DELETE' })
            if (res.ok) fetchAttendees()
            else alert('Failed to delete attendee')
        } catch (error) {
            console.error('Error deleting attendee:', error)
        }
    }

    const filteredCompaniesForEdit = companies.filter(c => c.name.toLowerCase().includes(editCompanySearch.toLowerCase()))
    const filteredCompaniesForAdd = companies.filter(c => c.name.toLowerCase().includes(addCompanySearch.toLowerCase()))

    return (
        <div className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">All Attendees</h2>
                    <p className="mt-1 text-sm text-gray-500">System-wide attendee directory. New attendees added here are not linked to any event.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Attendee Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm sticky top-24">
                        <h3 className="text-lg font-bold text-gray-900 mb-5">Add Attendee</h3>
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            {/* Photo */}
                            <div className="flex flex-col items-center mb-2 space-y-2">
                                <div className="relative group cursor-pointer" onClick={() => document.getElementById('add-photo-upload')?.click()}>
                                    <div className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden border-2 ${addFormData.imageUrl ? 'border-indigo-500' : 'border-gray-200 bg-gray-50'}`}>
                                        {addFormData.imageUrl
                                            ? <img src={addFormData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                            : <svg className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        }
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </div>
                                </div>
                                <input type="file" id="add-photo-upload" className="hidden" accept="image/*" onChange={async (e) => {
                                    if (e.target.files?.[0]) {
                                        try {
                                            const resized = await resizeImage(e.target.files[0])
                                            setAddSelectedFile(resized)
                                            setAddFormData(f => ({ ...f, imageUrl: URL.createObjectURL(resized) }))
                                        } catch { alert('Failed to process image') }
                                    }
                                }} />
                                <input type="url" placeholder="or paste image URL" className="input-field text-xs py-1.5 w-full"
                                    value={addFormData.imageUrl}
                                    onChange={(e) => { setAddFormData(f => ({ ...f, imageUrl: e.target.value })); setAddSelectedFile(null) }}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                                <input type="text" required className="input-field" value={addFormData.name} onChange={e => setAddFormData(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                                <input type="text" required className="input-field" value={addFormData.title} onChange={e => setAddFormData(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            <div ref={addCompanyDropdownRef} className="relative">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Company *</label>
                                <input type="text" className="input-field" value={addCompanySearch} placeholder="Search company..."
                                    onChange={e => { setAddCompanySearch(e.target.value); setShowAddCompanyDropdown(true); if (selectedAddCompany && e.target.value !== selectedAddCompany.name) { setSelectedAddCompany(null); setAddFormData(f => ({ ...f, companyId: '' })) } }}
                                    onFocus={() => setShowAddCompanyDropdown(true)}
                                />
                                {showAddCompanyDropdown && filteredCompaniesForAdd.length > 0 && (
                                    <div className="absolute z-20 w-full mt-1 bg-white shadow-lg rounded-md border border-gray-200 max-h-48 overflow-y-auto">
                                        {filteredCompaniesForAdd.map(c => (
                                            <div key={c.id} className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm border-b border-gray-50 last:border-none"
                                                onClick={() => { setSelectedAddCompany(c); setAddFormData(f => ({ ...f, companyId: c.id })); setAddCompanySearch(c.name); setShowAddCompanyDropdown(false) }}>
                                                {c.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selectedAddCompany && <div className="mt-1 text-xs text-emerald-600 font-medium">✓ {selectedAddCompany.name}</div>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                                <input type="email" className="input-field" placeholder="name@company.com" value={addFormData.email} onChange={e => setAddFormData(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn URL</label>
                                <input type="url" className="input-field" value={addFormData.linkedin} onChange={e => setAddFormData(f => ({ ...f, linkedin: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Bio</label>
                                <textarea className="input-field h-20 resize-none" value={addFormData.bio} onChange={e => setAddFormData(f => ({ ...f, bio: e.target.value }))} />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input type="checkbox" id="add-isExternal" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={addFormData.isExternal} onChange={e => setAddFormData(f => ({ ...f, isExternal: e.target.checked }))} />
                                <label htmlFor="add-isExternal" className="text-xs font-medium text-gray-700">External Attendee</label>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Seniority Level</label>
                                <select className="input-field" value={addFormData.seniorityLevel} onChange={e => setAddFormData(f => ({ ...f, seniorityLevel: e.target.value }))}>
                                    <option value="">Select level...</option>
                                    <option value="C-Level">C-Level</option>
                                    <option value="VP">VP</option>
                                    <option value="Director">Director</option>
                                    <option value="Manager">Manager</option>
                                    <option value="IC">IC (Individual Contributor)</option>
                                </select>
                            </div>
                            {attendeeTypes.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Attendee Type</label>
                                    <select className="input-field" value={addFormData.type} onChange={e => setAddFormData(f => ({ ...f, type: e.target.value }))}>
                                        <option value="">Select type...</option>
                                        {attendeeTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            )}
                            <button type="submit" disabled={addLoading || !selectedAddCompany} className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                                {addLoading ? 'Adding...' : 'Add Attendee'}
                            </button>
                            <p className="text-xs text-gray-400 text-center">This attendee will not be linked to any event. Add them to an event from that event's Attendees page.</p>
                        </form>
                    </div>
                </div>

                {/* Attendees Table */}
                <div className="lg:col-span-2">
                    {/* Search + Page Size */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <input type="text" className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-10"
                                placeholder="Search by name, email, or company..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className="border border-gray-300 rounded-md text-sm h-10 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                            value={limit} onChange={e => { setLimit(parseInt(e.target.value)); setPage(1) }}>
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} per page</option>)}
                        </select>
                    </div>

                    <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-52">Attendee</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Company</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">Email</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Events</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
                                    <th className="relative px-4 py-3 w-28"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr><td colSpan={6} className="px-4 py-12 text-center">
                                        <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
                                    </td></tr>
                                ) : attendees.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No attendees found</td></tr>
                                ) : attendees.map(attendee => {
                                    const canEdit = !readOnly || (userEmail && attendee.email === userEmail && !attendee.emailMissing)
                                    return (
                                        <tr key={attendee.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 w-52 max-w-52">
                                                <div className="flex items-center min-w-0">
                                                    <div className="h-9 w-9 flex-shrink-0 rounded-full overflow-hidden bg-gray-100 border border-gray-100">
                                                        {attendee.imageUrl
                                                            ? <img src={attendee.imageUrl} alt={attendee.name} className="w-full h-full object-cover" />
                                                            : <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-sm">{attendee.name.charAt(0)}</div>
                                                        }
                                                    </div>
                                                    <div className="ml-3 min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 truncate" title={attendee.name}>{attendee.name}</div>
                                                        <div className="text-xs text-gray-500 truncate" title={attendee.title}>{attendee.title}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 w-36 max-w-36">
                                                <span className="text-sm text-gray-700 truncate block" title={attendee.company?.name || ''}>{attendee.company?.name || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 w-44 max-w-44">
                                                {attendee.emailMissing
                                                    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">No Email</span>
                                                    : <span className="text-xs text-gray-500 font-mono truncate block" title={attendee.email}>{attendee.email}</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${attendee._count.events === 0 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {attendee._count.events} event{attendee._count.events !== 1 ? 's' : ''}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex flex-wrap gap-1">
                                                    {attendee.isExternal && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">External</span>}
                                                    {attendee.seniorityLevel && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">{attendee.seniorityLevel}</span>}
                                                    {attendee.type && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{attendee.type}</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end gap-1">
                                                    {canEdit && (
                                                        <button onClick={() => openEditModal(attendee)}
                                                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors"
                                                            title="Edit">
                                                            Edit
                                                        </button>
                                                    )}
                                                    {!readOnly && (
                                                        <button onClick={() => handleDelete(attendee)}
                                                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 transition-colors"
                                                            title="Delete from system">
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <Pagination page={page} limit={limit} totalCount={totalCount} onPageChange={setPage} />
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingAttendee && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">Edit Attendee</h2>
                        <form onSubmit={handleUpdate} className="space-y-5">
                            {/* Photo */}
                            <div className="flex flex-col items-center mb-6 space-y-3">
                                <div className="relative group cursor-pointer" onClick={() => document.getElementById('edit-photo-upload')?.click()}>
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center overflow-hidden border-2 ${editFormData.imageUrl ? 'border-indigo-500' : 'border-zinc-200 bg-zinc-50'}`}>
                                        {editFormData.imageUrl
                                            ? <img src={editFormData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                            : <svg className="w-10 h-10 text-zinc-300" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        }
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </div>
                                </div>
                                <input type="file" id="edit-photo-upload" className="hidden" accept="image/*" onChange={async (e) => {
                                    if (e.target.files?.[0]) {
                                        try {
                                            const resized = await resizeImage(e.target.files[0])
                                            setEditSelectedFile(resized)
                                            setEditFormData(f => ({ ...f, imageUrl: URL.createObjectURL(resized) }))
                                        } catch { alert('Failed to process image') }
                                    }
                                }} />
                                <div className="text-center w-full max-w-xs">
                                    <div className="text-xs text-zinc-500 mb-1">or enter URL</div>
                                    <input type="url" placeholder="https://example.com/photo.jpg" className="input-field text-xs py-1.5"
                                        value={editFormData.imageUrl}
                                        onChange={e => { setEditFormData(f => ({ ...f, imageUrl: e.target.value })); setEditSelectedFile(null) }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Name</label>
                                <input type="text" required className="input-field" value={editFormData.name} onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Title</label>
                                <input type="text" required className="input-field" value={editFormData.title} onChange={e => setEditFormData(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            <div ref={editCompanyDropdownRef} className="relative">
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company</label>
                                <input type="text" className="input-field" value={editCompanySearch}
                                    onChange={e => { setEditCompanySearch(e.target.value); setShowEditCompanyDropdown(true); if (selectedEditCompany && e.target.value !== selectedEditCompany.name) { setSelectedEditCompany(null); setEditFormData(f => ({ ...f, companyId: '' })) } }}
                                    onFocus={() => setShowEditCompanyDropdown(true)}
                                    placeholder="Search company..."
                                />
                                {showEditCompanyDropdown && (
                                    <div className="absolute z-20 w-full mt-1 bg-white shadow-lg rounded-md border border-zinc-200 max-h-60 overflow-y-auto">
                                        {filteredCompaniesForEdit.map(c => (
                                            <div key={c.id} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b border-zinc-50 last:border-none"
                                                onClick={() => { setSelectedEditCompany(c); setEditFormData(f => ({ ...f, companyId: c.id })); setEditCompanySearch(c.name); setShowEditCompanyDropdown(false) }}>
                                                <div className="font-medium text-zinc-900">{c.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selectedEditCompany && <div className="mt-1 text-xs text-emerald-600 font-medium">✓ {selectedEditCompany.name}</div>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                                    Email <span className="ml-1 text-xs font-normal text-zinc-400">(optional)</span>
                                </label>
                                <input type="email" className="input-field" placeholder="name@company.com" value={editFormData.email} onChange={e => setEditFormData(f => ({ ...f, email: e.target.value }))} />
                                {editingAttendee.emailMissing && <p className="mt-1 text-xs text-orange-600">No email on file. Enter a real email address to update.</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">LinkedIn URL</label>
                                <input type="url" className="input-field" value={editFormData.linkedin} onChange={e => setEditFormData(f => ({ ...f, linkedin: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Bio</label>
                                <textarea className="input-field h-24 resize-none" value={editFormData.bio} onChange={e => setEditFormData(f => ({ ...f, bio: e.target.value }))} />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input type="checkbox" id="edit-isExternal" className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={editFormData.isExternal} onChange={e => setEditFormData(f => ({ ...f, isExternal: e.target.checked }))} />
                                <label htmlFor="edit-isExternal" className="text-sm font-medium text-zinc-700">External Attendee</label>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Seniority Level</label>
                                <select className="input-field" value={editFormData.seniorityLevel} onChange={e => setEditFormData(f => ({ ...f, seniorityLevel: e.target.value }))}>
                                    <option value="">Select level...</option>
                                    <option value="C-Level">C-Level</option>
                                    <option value="VP">VP</option>
                                    <option value="Director">Director</option>
                                    <option value="Manager">Manager</option>
                                    <option value="IC">IC (Individual Contributor)</option>
                                </select>
                            </div>
                            {attendeeTypes.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Attendee Type</label>
                                    <select className="input-field" value={editFormData.type} onChange={e => setEditFormData(f => ({ ...f, type: e.target.value }))}>
                                        <option value="">Select type...</option>
                                        {attendeeTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={closeEditModal} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
