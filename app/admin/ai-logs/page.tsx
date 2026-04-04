'use client'

import { useState, useEffect, useMemo } from 'react'
import useFilterParams from '@/hooks/useFilterParams'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import moment from 'moment'

// Interfaces
interface AILog {
    id: string
    userEmail: string
    functionName: string
    prompt: string
    modelUsed: string
    createdAt: string
}

const REPORTS_FILTER_DEFAULTS = {
    functionNames: [] as string[],
    models: [] as string[],
    sortCol: 'createdAt',
    sortDir: 'desc',
}

export default function AILogsPage() {
    // Data State
    const [logs, setLogs] = useState<AILog[]>([])
    const [availableFunctions, setAvailableFunctions] = useState<string[]>([])
    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedLog, setSelectedLog] = useState<AILog | null>(null)

    // Filter + Sort State — persisted in URL
    const { filters: reportFilters, setFilter: setReportFilter, setFilters: setReportFilters, resetFilters: resetReportFilters } = useFilterParams('ai-logs', REPORTS_FILTER_DEFAULTS)

    // Fetch Date
    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams()
                if ((reportFilters.functionNames as string[]).length > 0) params.append('functionName', (reportFilters.functionNames as string[]).join(','))
                if ((reportFilters.models as string[]).length > 0) params.append('modelUsed', (reportFilters.models as string[]).join(','))

                const res = await fetch(`/api/admin/ai-logs?${params.toString()}`)
                const data = await res.json()
                if (res.ok) {
                    setLogs(data.logs || [])
                    // Set available filter values from first fetch or limit to overall unique set
                    if (data.filters) {
                        setAvailableFunctions(data.filters.functionNames)
                        setAvailableModels(data.filters.models)
                    }
                }
            } catch (err) {
                console.error('Failed to fetch AI logs', err)
            } finally {
                setLoading(false)
            }
        }

        fetchLogs()
    }, [reportFilters.functionNames, reportFilters.models])

    // Process Data
    const tableData = useMemo(() => {
        // 1. Sort
        const sorted = [...logs].sort((a, b) => {
            let valA = a[reportFilters.sortCol as keyof AILog] as string | number
            let valB = b[reportFilters.sortCol as keyof AILog] as string | number
            
            if (reportFilters.sortCol === 'createdAt') {
                valA = new Date(valA).getTime()
                valB = new Date(valB).getTime()
            }

            if (typeof valA === 'string' && typeof valB === 'string') {
                return (reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
            }

            if (valA < valB) return (reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? -1 : 1
            if (valA > valB) return (reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? 1 : -1
            return 0
        })
        return sorted
    }, [logs, reportFilters.sortCol, reportFilters.sortDir])

    const handleSort = (column: keyof AILog) => {
        if (reportFilters.sortCol === column) {
            setReportFilter('sortDir', reportFilters.sortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setReportFilters({ sortCol: column as string, sortDir: 'desc' })
        }
    }

    const handleExportCSV = () => {
        const headers = ['User Email', 'Function', 'Model', 'Prompt', 'Date']
        const rows = tableData.map(row => [
            `"${row.userEmail}"`,
            `"${row.functionName}"`,
            `"${row.modelUsed}"`,
            `"${row.prompt.replace(/"/g, '""')}"`,
            `"${moment(row.createdAt).format('YYYY-MM-DD HH:mm:ss')}"`
        ])

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
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

        const tableBody = tableData.map(row => [
            row.userEmail,
            row.functionName,
            row.modelUsed,
            moment(row.createdAt).format('MM/DD/YY HH:mm')
        ])

        autoTable(doc, {
            head: [['User Email', 'Function', 'Model', 'Date']],
            body: tableBody,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181] }
        })

        doc.save(`ai_usage_report_${moment().format('YYYYMMDD-HHmmss')}.pdf`)
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto py-10 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">AI Usage Report</h1>
                    <p className="mt-2 text-zinc-500">Analyze usage of AI models across the system.</p>
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

                        {/* Functions */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Functions</label>
                            <div className="space-y-2">
                                {availableFunctions.map(fn => (
                                    <label key={fn} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={(reportFilters.functionNames as string[]).includes(fn)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setReportFilter('functionNames', [...(reportFilters.functionNames as string[]), fn])
                                                } else {
                                                    setReportFilter('functionNames', (reportFilters.functionNames as string[]).filter(t => t !== fn))
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-zinc-600 truncate">{fn}</span>
                                    </label>
                                ))}
                                {availableFunctions.length === 0 && <div className="text-sm text-zinc-400 italic">No functions found</div>}
                            </div>
                        </div>

                        {/* Models */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Models</label>
                            <div className="space-y-2">
                                {availableModels.map(model => (
                                    <label key={model} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={(reportFilters.models as string[]).includes(model)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setReportFilter('models', [...(reportFilters.models as string[]), model])
                                                } else {
                                                    setReportFilter('models', (reportFilters.models as string[]).filter(t => t !== model))
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-zinc-600 truncate">{model}</span>
                                    </label>
                                ))}
                                {availableModels.length === 0 && <div className="text-sm text-zinc-400 italic">No models found</div>}
                            </div>
                        </div>

                        <button
                            onClick={resetReportFilters}
                            className="w-full px-4 py-2 mt-4 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="lg:col-span-3">
                    <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {[
                                        { id: 'userEmail', label: 'User' },
                                        { id: 'functionName', label: 'Function' },
                                        { id: 'modelUsed', label: 'Model' },
                                        { id: 'createdAt', label: 'Date' }
                                    ].map((column) => (
                                        <th
                                            key={column.id}
                                            scope="col"
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort(column.id as keyof AILog)}
                                        >
                                            <div className="flex items-center space-x-1">
                                                <span>{column.label}</span>
                                                {reportFilters.sortCol === column.id && (
                                                    <span className="text-indigo-500">
                                                        {(reportFilters.sortDir as 'asc' | 'desc') === 'asc' ? '↑' : '↓'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading && tableData.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-10 text-center">
                                            <div className="flex justify-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : tableData.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                                            No tracking data matches your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    tableData.map((row) => (
                                        <tr 
                                            key={row.id} 
                                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                                            onClick={() => setSelectedLog(row)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {row.userEmail}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                                                {row.functionName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {row.modelUsed}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {moment(row.createdAt).format('MM/DD/YYYY HH:mm')}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Prompt Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        {/* Background overlay */}
                        <div 
                            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
                            aria-hidden="true"
                            onClick={() => setSelectedLog(null)}
                        ></div>

                        {/* Centering trick */}
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        {/* Modal panel */}
                        <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full sm:p-6">
                            <div>
                                <div className="mt-3 text-center sm:mt-0 sm:text-left">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                        Prompt details for <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{selectedLog.functionName}</span>
                                    </h3>
                                    <div className="mt-4">
                                        <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-md border border-gray-200 max-h-[60vh] overflow-y-auto shrink-0 font-mono">
                                            {selectedLog.prompt}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-5 sm:mt-6">
                                <button
                                    type="button"
                                    className="inline-flex justify-center w-full rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm transition-colors"
                                    onClick={() => setSelectedLog(null)}
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
