'use client'

function getPageNumbers(page: number, totalPages: number): (number | '...')[] {
    const delta = 2
    const left = Math.max(2, page - delta)
    const right = Math.min(totalPages - 1, page + delta)
    const middle: (number | '...')[] = []

    for (let i = left; i <= right; i++) middle.push(i)
    if (left > 2) middle.unshift('...')
    if (right < totalPages - 1) middle.push('...')

    const result: (number | '...')[] = [1]
    if (totalPages > 1) { result.push(...middle); result.push(totalPages) }
    return result
}

interface PaginationProps {
    page: number
    limit: number
    totalCount: number
    onPageChange: (page: number) => void
}

export default function Pagination({ page, limit, totalCount, onPageChange }: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalCount / limit))
    if (totalCount <= limit) return null

    return (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 rounded-lg shadow">
            <div className="flex-1 flex justify-between sm:hidden">
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Previous
                </button>
                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Next
                </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(page * limit, totalCount)}</span> of{' '}
                        <span className="font-medium">{totalCount}</span> results
                    </p>
                </div>
                <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                            onClick={() => onPageChange(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span className="sr-only">Previous</span>
                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        </button>
                        {getPageNumbers(page, totalPages).map((p, i) =>
                            p === '...'
                                ? <span key={`dots-${i}`} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500">…</span>
                                : <button
                                    key={p}
                                    onClick={() => onPageChange(p as number)}
                                    className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === p
                                        ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    {p}
                                </button>
                        )}
                        <button
                            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
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
    )
}
