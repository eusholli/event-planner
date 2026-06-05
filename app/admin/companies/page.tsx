'use client'

import { useState, useEffect } from 'react'
import Pagination from '@/components/Pagination'

interface Company {
    id: string
    name: string
    description?: string | null
    pipelineValue?: number | null
    region?: string | null
    _count: { attendees: number }
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const EMPTY_FORM = { name: '', description: '', pipelineValue: '', region: '' }

export default function AdminCompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(25)
    const [search, setSearch] = useState('')
    const [region, setRegion] = useState('')
    const [loading, setLoading] = useState(true)
    const [regionTypes, setRegionTypes] = useState<string[]>([])

    // Add form state
    const [addFormData, setAddFormData] = useState(EMPTY_FORM)
    const [addLoading, setAddLoading] = useState(false)

    // Edit modal state
    const [editingCompany, setEditingCompany] = useState<Company | null>(null)
    const [editFormData, setEditFormData] = useState(EMPTY_FORM)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    useEffect(() => {
        fetch('/api/admin/system')
            .then(res => res.ok ? res.json() : {})
            .then((data: { defaultRegionTypes?: string[] }) => setRegionTypes(data.defaultRegionTypes || []))
            .catch(() => {})
    }, [])

    // Debounce search → reset to page 1
    useEffect(() => {
        const timer = setTimeout(() => { setPage(1) }, 500)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => { fetchCompanies() }, [page, limit, search, region])

    const fetchCompanies = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page: page.toString(), limit: limit.toString(), search, region })
            const res = await fetch(`/api/admin/companies?${params}`)
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setCompanies(data.data || [])
            setTotalCount(data.totalCount || 0)
        } catch (error) {
            console.error('Error fetching companies:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setAddLoading(true)
        try {
            const res = await fetch('/api/companies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: addFormData.name,
                    description: addFormData.description || null,
                    pipelineValue: addFormData.pipelineValue ? parseFloat(addFormData.pipelineValue) : null,
                    region: addFormData.region || null
                })
            })
            if (res.ok) {
                setAddFormData(EMPTY_FORM)
                setPage(1)
                fetchCompanies()
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to add company')
            }
        } finally {
            setAddLoading(false)
        }
    }

    const openEditModal = (company: Company) => {
        setEditingCompany(company)
        setEditFormData({
            name: company.name,
            description: company.description || '',
            pipelineValue: company.pipelineValue ? company.pipelineValue.toString() : '',
            region: company.region || ''
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
                    pipelineValue: editFormData.pipelineValue ? parseFloat(editFormData.pipelineValue) : null,
                    region: editFormData.region || null
                })
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
        <div className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">All Companies</h2>
                    <p className="mt-1 text-sm text-gray-500">System-wide company directory shared across all events.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Company Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm sticky top-24">
                        <h3 className="text-lg font-bold text-gray-900 mb-5">Add Company</h3>
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Company Name *</label>
                                <input type="text" required className="input-field" value={addFormData.name} onChange={e => setAddFormData(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                <textarea className="input-field h-20 resize-none" value={addFormData.description} onChange={e => setAddFormData(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Pipeline Value ($)</label>
                                <input type="number" min="0" step="0.01" className="input-field" value={addFormData.pipelineValue} onChange={e => setAddFormData(f => ({ ...f, pipelineValue: e.target.value }))} />
                            </div>
                            {regionTypes.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Region</label>
                                    <select className="input-field" value={addFormData.region} onChange={e => setAddFormData(f => ({ ...f, region: e.target.value }))}>
                                        <option value="">Select region...</option>
                                        {regionTypes.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            )}
                            <button type="submit" disabled={addLoading} className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                                {addLoading ? 'Adding...' : 'Add Company'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Companies Table */}
                <div className="lg:col-span-2">
                    {/* Search + Filters + Page Size */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <div className="relative flex-1 min-w-48">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <input type="text" className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-10"
                                placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        {regionTypes.length > 0 && (
                            <select className="border border-gray-300 rounded-md text-sm h-10 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                                value={region} onChange={e => { setRegion(e.target.value); setPage(1) }}>
                                <option value="">All Regions</option>
                                {regionTypes.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        )}
                        <select className="border border-gray-300 rounded-md text-sm h-10 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                            value={limit} onChange={e => { setLimit(parseInt(e.target.value)); setPage(1) }}>
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} per page</option>)}
                        </select>
                    </div>

                    <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-56">Company</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Pipeline</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Region</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Attendees</th>
                                    <th className="relative px-4 py-3 w-16"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr><td colSpan={5} className="px-4 py-12 text-center">
                                        <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
                                    </td></tr>
                                ) : companies.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">No companies found</td></tr>
                                ) : companies.map(company => (
                                    <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 w-56 max-w-56">
                                            <div className="text-sm font-medium text-gray-900 truncate" title={company.name}>{company.name}</div>
                                            {company.description && <div className="text-xs text-gray-500 truncate" title={company.description}>{company.description}</div>}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {company.pipelineValue != null
                                                ? <span className="text-sm text-emerald-700 font-medium">${company.pipelineValue.toLocaleString()}</span>
                                                : <span className="text-sm text-gray-400">—</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {company.region
                                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">{company.region}</span>
                                                : <span className="text-sm text-gray-400">—</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                {company._count.attendees} attendee{company._count.attendees !== 1 ? 's' : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => openEditModal(company)}
                                                className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors">
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <Pagination page={page} limit={limit} totalCount={totalCount} onPageChange={setPage} />
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingCompany && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Edit Company</h2>
                        </div>
                        <form onSubmit={handleUpdate} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
                                <input type="text" required className="input-field" value={editFormData.name} onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                                <textarea className="input-field h-24 resize-none" value={editFormData.description} onChange={e => setEditFormData(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pipeline Value ($)</label>
                                <input type="number" min="0" step="0.01" className="input-field" value={editFormData.pipelineValue} onChange={e => setEditFormData(f => ({ ...f, pipelineValue: e.target.value }))} />
                            </div>
                            {regionTypes.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Region</label>
                                    <select className="input-field" value={editFormData.region} onChange={e => setEditFormData(f => ({ ...f, region: e.target.value }))}>
                                        <option value="">Select region...</option>
                                        {regionTypes.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                                <button type="button" onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
