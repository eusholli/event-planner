'use client'

import { useState, useEffect } from 'react'
import { Roles } from '@/lib/constants'

interface User {
    id: string
    firstName: string | null
    lastName: string | null
    emailAddresses: { emailAddress: string }[]
    publicMetadata: {
        role?: string
    }
}

export default function UserAdminPage() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [updating, setUpdating] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [limit, setLimit] = useState(10)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1) // Reset to page 1 on search change
            fetchUsers(1, search)
        }, 500)

        return () => clearTimeout(timer)
    }, [search])

    // Handle page changes
    useEffect(() => {
        fetchUsers(page, search)
    }, [page])

    const fetchUsers = async (pageNum = page, searchTerm = search) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: pageNum.toString(),
                limit: limit.toString(),
                search: searchTerm,
            })

            const res = await fetch(`/api/admin/users?${params}`)
            if (!res.ok) {
                throw new Error('Failed to fetch users')
            }
            const data = await res.json()

            setUsers(data.data || [])
            setTotalCount(data.totalCount || 0)
        } catch (err) {
            setError('Error loading users')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleRoleChange = async (userId: string, newRole: string) => {
        setUpdating(userId)
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, role: newRole }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to update role')
            }

            // Refresh users
            await fetchUsers(page, search)
        } finally {
            setUpdating(null)
        }
    }

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return
        }

        setUpdating(userId)
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            })

            if (!res.ok) {
                throw new Error('Failed to delete user')
            }

            // Refresh users
            await fetchUsers(page, search)
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete user')
            console.error(err)
        } finally {
            setUpdating(null)
        }
    }

    const getRoleColor = (role?: string) => {
        switch (role) {
            case Roles.Root:
                return 'bg-purple-100 text-purple-800 border-purple-200'
            case Roles.Admin:
                return 'bg-green-100 text-green-800 border-green-200'
            case Roles.Marketing:
                return 'bg-blue-100 text-blue-800 border-blue-200'
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200'
        }
    }

    const totalPages = Math.ceil(totalCount / limit)

    return (
        <div className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        User Administration
                    </h2>
                </div>
                <div className="mt-4 flex md:mt-0 md:ml-4">
                    <div className="relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-10"
                            placeholder="Search users..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-8 bg-red-50 border-l-4 border-red-400 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col">
                <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                        <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            User
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Email
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Role
                                        </th>
                                        <th scope="col" className="relative px-6 py-3">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center">
                                                <div className="flex justify-center">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                                No users found
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map((user) => (
                                            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="h-10 w-10 flex-shrink-0">
                                                            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                                                {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0].toUpperCase()}
                                                            </div>
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {user.firstName} {user.lastName}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                ID: {user.id.slice(0, 8)}...
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">{user.emailAddresses[0]?.emailAddress}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <select
                                                        className={`block w-full pl-3 pr-10 py-1 text-xs font-semibold border rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm ${getRoleColor(user.publicMetadata.role)}`}
                                                        value={user.publicMetadata.role || Roles.User}
                                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                        disabled={updating === user.id}
                                                    >
                                                        {Object.values(Roles).map((role) => (
                                                            <option key={role} value={role} className="bg-white text-gray-900">
                                                                {role.charAt(0).toUpperCase() + role.slice(1)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        disabled={updating === user.id}
                                                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pagination */}
            {totalCount > limit && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 rounded-lg shadow">
                    <div className="flex-1 flex justify-between sm:hidden">
                        <button
                            onClick={() => setPage(page - 1)}
                            disabled={page === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(page + 1)}
                            disabled={page === totalPages}
                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-gray-700">
                                Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to <span className="font-medium">{Math.min(page * limit, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                            </p>
                        </div>
                        <div>
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="sr-only">Previous</span>
                                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                {Array.from({ length: totalPages }).map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setPage(i + 1)}
                                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === i + 1
                                                ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    disabled={page === totalPages}
                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="sr-only">Next</span>
                                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
