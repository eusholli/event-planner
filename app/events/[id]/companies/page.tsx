'use client'

import { useState, useEffect, Suspense } from 'react'
import useFilterParams from '@/hooks/useFilterParams'

interface Company {
    id: string
    name: string
    description?: string | null
    pipelineValue?: number | null
    _count?: {
        attendees: number
    }
}

const COMPANIES_FILTER_DEFAULTS = { search: '' }

export default function CompaniesPage() {
    const params = require('next/navigation').useParams()
    const id = params?.id as string
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <CompaniesContent eventId={id} />
        </Suspense>
    )
}

function CompaniesContent({ eventId }: { eventId: string }) {
    const [companies, setCompanies] = useState<Company[]>([])
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        pipelineValue: ''
    })
    const [loading, setLoading] = useState(false)
    const { filters: companyFilters, setFilter: setCompanyFilter, isFiltered: companyIsFiltered, resetFilters: resetCompanyFilters } = useFilterParams('companies', COMPANIES_FILTER_DEFAULTS)

    // Edit State
    const [editingCompany, setEditingCompany] = useState<Company | null>(null)
    const [editFormData, setEditFormData] = useState({
        name: '',
        description: '',
        pipelineValue: ''
    })
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    useEffect(() => {
        if (eventId) fetchCompanies()
    }, [eventId])

    const fetchCompanies = async () => {
        const res = await fetch(`/api/companies?eventId=${eventId}`)
        const data = await res.json()
        setCompanies(Array.isArray(data) ? data : [])
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/companies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description || null,
                    pipelineValue: formData.pipelineValue ? parseFloat(formData.pipelineValue) : null
                }),
            })
            if (res.ok) {
                setFormData({ name: '', description: '', pipelineValue: '' })
                fetchCompanies()
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to add company')
            }
        } catch (error) {
            console.error('Error adding company:', error)
        } finally {
            setLoading(false)
        }
    }

    const openEditModal = (company: Company) => {
        setEditingCompany(company)
        setEditFormData({
            name: company.name,
            description: company.description || '',
            pipelineValue: company.pipelineValue ? company.pipelineValue.toString() : ''
        })
        setIsEditModalOpen(true)
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingCompany) return

        try {
            const res = await fetch(`/api/companies/${editingCompany.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editFormData.name,
                    description: editFormData.description || null,
                    pipelineValue: editFormData.pipelineValue ? parseFloat(editFormData.pipelineValue) : null
                }),
            })
            if (res.ok) {
                setIsEditModalOpen(false)
                setEditingCompany(null)
                fetchCompanies()
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to update company')
            }
        } catch (error) {
            console.error('Error updating company:', error)
        }
    }

    return (
        <div className="min-h-screen bg-neutral-50 p-8 pt-24">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Companies</h1>
                        <p className="mt-2 text-neutral-500">Companies represented by attendees at this event.</p>
                    </div>
                    <div className="relative w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            className="input-field pl-10"
                            placeholder="Search companies..."
                            value={companyFilters.search as string}
                            onChange={(e) => setCompanyFilter('search', e.target.value)}
                        />
                        {companyIsFiltered && (
                            <button
                                onClick={resetCompanyFilters}
                                className="text-sm text-gray-500 hover:text-gray-700 underline"
                            >
                                Clear Search
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Company Form */}
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm sticky top-24">
                            <h2 className="text-xl font-bold tracking-tight text-neutral-900 mb-6">Add Company</h2>
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1.5">Company Name</label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        required
                                        className="input-field"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
                                    <textarea
                                        id="description"
                                        name="description"
                                        className="input-field h-24 resize-none"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="pipelineValue" className="block text-sm font-medium text-neutral-700 mb-1.5">Pipeline Value ($)</label>
                                    <input
                                        type="number"
                                        id="pipelineValue"
                                        name="pipelineValue"
                                        min="0"
                                        step="0.01"
                                        className="input-field"
                                        value={formData.pipelineValue}
                                        onChange={(e) => setFormData({ ...formData, pipelineValue: e.target.value })}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Adding...' : 'Add Company'}
                                </button>
                                <p className="text-xs text-neutral-400 text-center">
                                    This company will appear in the list once you add an attendee from it on the Attendees page.
                                </p>
                            </form>
                        </div>
                    </div>

                    {/* Companies List */}
                    <div className="lg:col-span-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {companies
                                .filter(company => company.name.toLowerCase().includes((companyFilters.search as string).toLowerCase()) || (company.description && company.description.toLowerCase().includes((companyFilters.search as string).toLowerCase())))
                                .map((company) => (
                                    <div key={company.id} className="bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-lg transition-all duration-300 group flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-4">
                                                <h3 className="text-lg font-bold text-neutral-900 tracking-tight group-hover:text-blue-600 transition-colors line-clamp-2 pr-2">{company.name}</h3>
                                                <div className="flex space-x-1 shrink-0">
                                                    <button
                                                        onClick={() => openEditModal(company)}
                                                        className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {company.description && (
                                                <p className="text-sm text-neutral-600 mb-4 line-clamp-3">{company.description}</p>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-neutral-100">
                                            {company.pipelineValue != null && (
                                                <div className="flex items-center text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg inline-flex">
                                                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span className="text-xs font-medium">${company.pipelineValue.toLocaleString()}</span>
                                                </div>
                                            )}
                                            {company._count !== undefined && (
                                                <div className="flex items-center text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg inline-flex">
                                                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                    </svg>
                                                    <span className="text-xs font-medium">{company._count.attendees} Attendees at event</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            {companies.filter(c => c.name.toLowerCase().includes((companyFilters.search as string).toLowerCase()) || (c.description && c.description.toLowerCase().includes((companyFilters.search as string).toLowerCase()))).length === 0 && (
                                <div className="col-span-full py-20 text-center border-2 border-dashed border-neutral-200 rounded-xl bg-white/50">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
                                        <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-medium text-neutral-900">No companies found</h3>
                                    <p className="text-neutral-500 mt-1">
                                        {companyFilters.search ? 'Try adjusting your search.' : 'Add attendees from a company to see it here.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Edit Modal */}
                {isEditModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6 border-b border-neutral-100">
                                <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Company</h2>
                            </div>
                            <form onSubmit={handleUpdate} className="p-6 space-y-5">
                                <div>
                                    <label htmlFor="edit-name" className="block text-sm font-medium text-neutral-700 mb-1.5">Company Name</label>
                                    <input
                                        type="text"
                                        id="edit-name"
                                        name="name"
                                        required
                                        className="input-field"
                                        value={editFormData.name}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-description" className="block text-sm font-medium text-neutral-700 mb-1.5">Description</label>
                                    <textarea
                                        id="edit-description"
                                        name="description"
                                        className="input-field h-24 resize-none"
                                        value={editFormData.description}
                                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-pipelineValue" className="block text-sm font-medium text-neutral-700 mb-1.5">Pipeline Value ($)</label>
                                    <input
                                        type="number"
                                        id="edit-pipelineValue"
                                        name="pipelineValue"
                                        min="0"
                                        step="0.01"
                                        className="input-field"
                                        value={editFormData.pipelineValue}
                                        onChange={(e) => setEditFormData({ ...editFormData, pipelineValue: e.target.value })}
                                    />
                                </div>
                                <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="px-4 py-2 text-neutral-600 font-medium hover:bg-neutral-100 rounded-lg transition-colors"
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
        </div>
    )
}
