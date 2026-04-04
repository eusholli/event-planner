'use client'

import { useState, useEffect, useMemo } from 'react'
import useFilterParams from '@/hooks/useFilterParams'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import moment from 'moment'

// Interfaces
interface UsageDetailRow {
    userEmail: string
    functionName: string
    uses: number
}

interface UserRow {
    userEmail: string
    uses: number
}

interface FunctionRow {
    functionName: string
    uses: number
}

interface PromptEntry {
    id: string
    userEmail: string
    prompt: string
    functionName: string
    createdAt: string
}

// Modal can be opened from a user row or a function-type row
type ModalSource =
    | { kind: 'user'; userEmail: string }
    | { kind: 'function'; functionName: string }

const REPORTS_FILTER_DEFAULTS = {
    functionNames: [] as string[], // empty = all selected
    userSortCol: 'userEmail',
    userSortDir: 'asc',
    fnSortCol: 'functionName',
    fnSortDir: 'asc',
}

export default function AILogsPage() {
    // Data State — detail rows (per user+function) from the API
    const [detailRows, setDetailRows] = useState<UsageDetailRow[]>([])
    const [availableFunctions, setAvailableFunctions] = useState<string[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state — shared between both tables
    const [modalSource, setModalSource] = useState<ModalSource | null>(null)
    const [promptsData, setPromptsData] = useState<PromptEntry[]>([])
    const [promptPage, setPromptPage] = useState(1)
    const [promptTotalPages, setPromptTotalPages] = useState(1)
    const [promptTotalCount, setPromptTotalCount] = useState(0)
    const [loadingPrompts, setLoadingPrompts] = useState(false)

    // Filter + Sort State — persisted in URL
    const { filters: reportFilters, setFilter: setReportFilter, setFilters: setReportFilters, resetFilters: resetReportFilters } = useFilterParams('ai-logs', REPORTS_FILTER_DEFAULTS)

    const selectedFunctions = reportFilters.functionNames as string[]
    const isAllFunctionsSelected = selectedFunctions.length === 0

    // Fetch aggregated usage data whenever filter changes
    useEffect(() => {
        const fetchUsage = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams()
                if (!isAllFunctionsSelected) {
                    params.append('functionName', selectedFunctions.join(','))
                }
                const res = await fetch(`/api/admin/ai-logs?${params.toString()}`)
                const data = await res.json()
                if (res.ok) {
                    setDetailRows(data.usage || [])
                    if (data.filters) {
                        setAvailableFunctions(data.filters.functionNames)
                    }
                }
            } catch (err) {
                console.error('Failed to fetch AI usage', err)
            } finally {
                setLoading(false)
            }
        }
        fetchUsage()
    }, [reportFilters.functionNames])

    // ── Function-type table rows ──────────────────────────────────────────────
    const functionRows = useMemo<FunctionRow[]>(() => {
        const byFn: Record<string, FunctionRow> = {}
        for (const row of detailRows) {
            if (!byFn[row.functionName]) {
                byFn[row.functionName] = { functionName: row.functionName, uses: 0 }
            }
            byFn[row.functionName].uses += row.uses
        }
        const rows = Object.values(byFn)
        const col = reportFilters.fnSortCol as keyof FunctionRow
        const dir = reportFilters.fnSortDir as 'asc' | 'desc'
        return rows.sort((a, b) => {
            const valA = a[col]
            const valB = b[col]
            if (typeof valA === 'number' && typeof valB === 'number') {
                return dir === 'asc' ? valA - valB : valB - valA
            }
            if (typeof valA === 'string' && typeof valB === 'string') {
                return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
            }
            return 0
        })
    }, [detailRows, reportFilters.fnSortCol, reportFilters.fnSortDir])

    // ── User table rows ───────────────────────────────────────────────────────
    const userRows = useMemo<UserRow[]>(() => {
        const byUser: Record<string, UserRow> = {}
        for (const row of detailRows) {
            if (!byUser[row.userEmail]) {
                byUser[row.userEmail] = { userEmail: row.userEmail, uses: 0 }
            }
            byUser[row.userEmail].uses += row.uses
        }
        const rows = Object.values(byUser)
        const col = reportFilters.userSortCol as keyof UserRow
        const dir = reportFilters.userSortDir as 'asc' | 'desc'
        return rows.sort((a, b) => {
            const valA = a[col]
            const valB = b[col]
            if (typeof valA === 'number' && typeof valB === 'number') {
                return dir === 'asc' ? valA - valB : valB - valA
            }
            if (typeof valA === 'string' && typeof valB === 'string') {
                return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
            }
            return 0
        })
    }, [detailRows, reportFilters.userSortCol, reportFilters.userSortDir])

    const grandTotal = useMemo(() => userRows.reduce((sum, r) => sum + r.uses, 0), [userRows])

    // Sort handlers
    const handleUserSort = (column: keyof UserRow) => {
        if (reportFilters.userSortCol === column) {
            setReportFilter('userSortDir', reportFilters.userSortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setReportFilters({ userSortCol: column as string, userSortDir: 'asc' })
        }
    }

    const handleFnSort = (column: keyof FunctionRow) => {
        if (reportFilters.fnSortCol === column) {
            setReportFilter('fnSortDir', reportFilters.fnSortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setReportFilters({ fnSortCol: column as string, fnSortDir: 'asc' })
        }
    }

    // Checkbox helpers
    const isFunctionChecked = (fn: string) => isAllFunctionsSelected || selectedFunctions.includes(fn)

    const handleFunctionToggle = (fn: string, checked: boolean) => {
        if (checked) {
            const next = [...selectedFunctions, fn]
            setReportFilter('functionNames', next.length === availableFunctions.length ? [] : next)
        } else {
            const current = isAllFunctionsSelected ? availableFunctions : selectedFunctions
            setReportFilter('functionNames', current.filter(f => f !== fn))
        }
    }

    // ── Modal helpers ─────────────────────────────────────────────────────────
    const fetchPromptPage = async (source: ModalSource, page: number) => {
        setLoadingPrompts(true)
        try {
            const params = new URLSearchParams({ page: String(page) })
            if (source.kind === 'user') {
                params.set('userEmail', source.userEmail)
                // If the sidebar has a function filter active, apply it too
                if (!isAllFunctionsSelected && selectedFunctions.length > 0) {
                    params.append('functionName', selectedFunctions.join(','))
                }
            } else {
                // function-type modal — filter strictly by this function name
                params.set('functionName', source.functionName)
            }
            const res = await fetch(`/api/admin/ai-logs/prompts?${params.toString()}`)
            const data = await res.json()
            if (res.ok) {
                setPromptsData(data.prompts || [])
                setPromptTotalPages(data.totalPages ?? 1)
                setPromptTotalCount(data.totalCount ?? 0)
                setPromptPage(page)
            }
        } catch (err) {
            console.error('Failed to fetch prompts', err)
        } finally {
            setLoadingPrompts(false)
        }
    }

    const handleOpenModal = (source: ModalSource) => {
        setModalSource(source)
        setPromptsData([])
        setPromptPage(1)
        setPromptTotalPages(1)
        setPromptTotalCount(0)
        fetchPromptPage(source, 1)
    }

    const handleCloseModal = () => {
        setModalSource(null)
        setPromptsData([])
    }

    const handlePrevPage = () => {
        if (modalSource && promptPage > 1) fetchPromptPage(modalSource, promptPage - 1)
    }

    const handleNextPage = () => {
        if (modalSource && promptPage < promptTotalPages) fetchPromptPage(modalSource, promptPage + 1)
    }

    // Derive a human-readable label for the modal header
    const modalTitle = modalSource
        ? modalSource.kind === 'user'
            ? modalSource.userEmail
            : modalSource.functionName
        : ''

    const modalSubtitle = modalSource?.kind === 'user' ? 'User prompt history' : 'Function prompt history'

    // ── Export helpers ────────────────────────────────────────────────────────
    const handleExportCSV = () => {
        const fnHeaders = ['Function Name', 'Total Uses']
        const fnRows = functionRows.map(r => [`"${r.functionName}"`, String(r.uses)])
        fnRows.push(['"GRAND TOTAL"', String(grandTotal)])

        const userHeaders = ['User Email', 'Total Uses']
        const uRows = userRows.map(r => [`"${r.userEmail}"`, String(r.uses)])

        const csvContent = [
            '"AI Function Types"',
            fnHeaders.join(','),
            ...fnRows.map(r => r.join(',')),
            '',
            '"Users"',
            userHeaders.join(','),
            ...uRows.map(r => r.join(',')),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.setAttribute('href', URL.createObjectURL(blob))
        link.setAttribute('download', `ai_usage_report_${moment().format('YYYYMMDD-HHmmss')}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleExportPDF = () => {
        const doc = new jsPDF()
        doc.setFontSize(18)
        doc.text('AI Usage Report', 14, 22)
        doc.setFontSize(11)
        doc.text(`Generated on ${moment().format('MMMM D, YYYY')}`, 14, 30)

        doc.setFontSize(13)
        doc.text('AI Function Types', 14, 42)
        autoTable(doc, {
            head: [['Function Name', 'Total Uses']],
            body: [
                ...functionRows.map(r => [r.functionName, String(r.uses)]),
                ['GRAND TOTAL', String(grandTotal)],
            ],
            startY: 46,
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181] },
            didParseCell: (data) => {
                if (data.row.index >= functionRows.length) {
                    data.cell.styles.fontStyle = 'bold'
                    data.cell.styles.fillColor = [240, 240, 255]
                }
            }
        })

        const afterFnTable = (doc as any).lastAutoTable.finalY + 12
        doc.setFontSize(13)
        doc.text('Users', 14, afterFnTable)
        autoTable(doc, {
            head: [['User Email', 'Total Uses']],
            body: userRows.map(r => [r.userEmail, String(r.uses)]),
            startY: afterFnTable + 4,
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181] },
        })

        doc.save(`ai_usage_report_${moment().format('YYYYMMDD-HHmmss')}.pdf`)
    }

    // ── Render ────────────────────────────────────────────────────────────────
    const SortIcon = ({ col, activeCol, activeDir }: { col: string; activeCol: string; activeDir: string }) =>
        activeCol === col ? (
            <span className="text-indigo-500">{activeDir === 'asc' ? '↑' : '↓'}</span>
        ) : null

    return (
        <div className="space-y-8 max-w-7xl mx-auto py-10 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">AI Usage Report</h1>
                    <p className="mt-2 text-zinc-500">Analyze usage of AI functions across the system.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleExportPDF}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export PDF
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Filters Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-6">
                        <h3 className="font-semibold text-zinc-900">Filters</h3>

                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Functions</label>
                            <div className="space-y-2">
                                {availableFunctions.map(fn => (
                                    <label key={fn} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isFunctionChecked(fn)}
                                            onChange={(e) => handleFunctionToggle(fn, e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-zinc-600 truncate">{fn}</span>
                                    </label>
                                ))}
                                {availableFunctions.length === 0 && (
                                    <div className="text-sm text-zinc-400 italic">No functions found</div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={resetReportFilters}
                            className="w-full px-4 py-2 mt-4 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                            Reset Filters
                        </button>
                    </div>
                </div>

                {/* Tables */}
                <div className="lg:col-span-3 space-y-8">

                    {/* ── Table 1: AI Function Types ─────────────────────────── */}
                    <div>
                        <h2 className="text-xl font-semibold text-zinc-800 mb-3">AI Function Types</h2>
                        <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {([
                                            { id: 'functionName', label: 'Function Name' },
                                            { id: 'uses', label: 'Total Uses' },
                                        ] as { id: keyof FunctionRow; label: string }[]).map((col) => (
                                            <th
                                                key={col.id}
                                                scope="col"
                                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                onClick={() => handleFnSort(col.id)}
                                            >
                                                <div className="flex items-center space-x-1">
                                                    <span>{col.label}</span>
                                                    <SortIcon col={col.id} activeCol={reportFilters.fnSortCol as string} activeDir={reportFilters.fnSortDir as string} />
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {loading && functionRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="px-6 py-10 text-center">
                                                <div className="flex justify-center">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : functionRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="px-6 py-10 text-center text-sm text-gray-500">
                                                No tracking data matches your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        functionRows.map((row) => (
                                            <tr
                                                key={row.functionName}
                                                className="hover:bg-indigo-50 transition-colors cursor-pointer"
                                                onClick={() => handleOpenModal({ kind: 'function', functionName: row.functionName })}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900">
                                                    {row.functionName}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                                    {row.uses}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {functionRows.length > 0 && (
                                    <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                                        <tr>
                                            <td className="px-6 py-3 text-xs font-bold text-indigo-900 uppercase tracking-wider">
                                                Grand Total
                                            </td>
                                            <td className="px-6 py-3 text-sm font-extrabold text-indigo-900">
                                                {grandTotal}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* ── Table 2: Users ────────────────────────────────────── */}
                    <div>
                        <h2 className="text-xl font-semibold text-zinc-800 mb-3">Users</h2>
                        <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {([
                                            { id: 'userEmail', label: 'User' },
                                            { id: 'uses', label: 'Total Uses' },
                                        ] as { id: keyof UserRow; label: string }[]).map((col) => (
                                            <th
                                                key={col.id}
                                                scope="col"
                                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                onClick={() => handleUserSort(col.id)}
                                            >
                                                <div className="flex items-center space-x-1">
                                                    <span>{col.label}</span>
                                                    <SortIcon col={col.id} activeCol={reportFilters.userSortCol as string} activeDir={reportFilters.userSortDir as string} />
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {loading && userRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="px-6 py-10 text-center">
                                                <div className="flex justify-center">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : userRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="px-6 py-10 text-center text-sm text-gray-500">
                                                No tracking data matches your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        userRows.map((row) => (
                                            <tr
                                                key={row.userEmail}
                                                className="hover:bg-indigo-50 transition-colors cursor-pointer"
                                                onClick={() => handleOpenModal({ kind: 'user', userEmail: row.userEmail })}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {row.userEmail}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                                    {row.uses}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {userRows.length > 0 && (
                                    <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                                        <tr>
                                            <td className="px-6 py-3 text-xs font-bold text-indigo-900 uppercase tracking-wider">
                                                Grand Total
                                            </td>
                                            <td className="px-6 py-3 text-sm font-extrabold text-indigo-900">
                                                {grandTotal}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Prompt History Modal (shared) ────────────────────────────── */}
            {modalSource && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        {/* Background overlay */}
                        <div
                            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                            aria-hidden="true"
                            onClick={handleCloseModal}
                        />
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        {/* Modal panel */}
                        <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full sm:p-6">
                            {/* Header */}
                            <div className="mb-4">
                                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                    {modalSubtitle}
                                </h3>
                                <p className="mt-1 text-sm text-gray-500 font-mono">{modalTitle}</p>
                                {modalSource.kind === 'user' && !isAllFunctionsSelected && (
                                    <p className="mt-1 text-xs text-indigo-500">
                                        Filtered to: {selectedFunctions.join(', ')}
                                    </p>
                                )}
                            </div>

                            {/* Prompts list */}
                            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                                {loadingPrompts ? (
                                    <div className="flex justify-center py-10">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                    </div>
                                ) : promptsData.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-6">No prompts found.</p>
                                ) : (
                                    promptsData.map((entry, idx) => (
                                        <div key={entry.id} className="border border-gray-200 rounded-md overflow-hidden">
                                            <div className="bg-gray-100 px-3 py-1.5 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                        #{(promptPage - 1) * 10 + idx + 1} of {promptTotalCount}
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 font-mono">
                                                        {entry.functionName}
                                                    </span>
                                                    {modalSource.kind === 'function' && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600">
                                                            {entry.userEmail ?? ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-400">
                                                    {moment(entry.createdAt).format('MMM D, YYYY HH:mm')}
                                                </span>
                                            </div>
                                            <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 font-mono">
                                                {entry.prompt}
                                            </pre>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Pagination */}
                            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                                <p className="text-sm text-gray-500">
                                    Page {promptPage} of {promptTotalPages}&nbsp;·&nbsp;{promptTotalCount} total prompt{promptTotalCount !== 1 ? 's' : ''}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePrevPage}
                                        disabled={promptPage <= 1 || loadingPrompts}
                                        className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        ← Previous
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleNextPage}
                                        disabled={promptPage >= promptTotalPages || loadingPrompts}
                                        className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>

                            {/* Close */}
                            <div className="mt-4">
                                <button
                                    type="button"
                                    className="inline-flex justify-center w-full rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm transition-colors"
                                    onClick={handleCloseModal}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
