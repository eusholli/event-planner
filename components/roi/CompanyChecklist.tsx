'use client'

import { CheckCircle2, XCircle, Pencil } from 'lucide-react'

interface CompanyItem {
    id: string
    name: string
    pipelineValue?: number | null
}

interface CompanyChecklistProps {
    targetCompanies: CompanyItem[]
    hitCompanyIds: string[]
    onEdit?: (company: CompanyItem) => void
}

export default function CompanyChecklist({ targetCompanies, hitCompanyIds, onEdit }: CompanyChecklistProps) {
    if (targetCompanies.length === 0) {
        return (
            <div className="text-sm text-zinc-400 italic py-4 text-center">
                No target companies defined. Add them in the Targets tab.
            </div>
        )
    }

    const hitCount = targetCompanies.filter(c => hitCompanyIds.includes(c.id)).length
    const hitRate = targetCompanies.length > 0
        ? Math.round((hitCount / targetCompanies.length) * 100)
        : 0

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Event Target Companies</h4>
                <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-zinc-900">{hitRate}%</span>
                    <span className="text-xs text-zinc-400">hit rate</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {targetCompanies.map(company => {
                    const isHit = hitCompanyIds.includes(company.id)
                    return (
                        <div
                            key={company.id}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${isHit
                                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                                : 'bg-white border-zinc-200 text-zinc-500'
                                }`}
                        >
                            {isHit ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            ) : (
                                <XCircle className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium truncate block">{company.name}</span>
                                <span className="text-xs text-zinc-400">${(company.pipelineValue ?? 0).toLocaleString()}</span>
                            </div>
                            {onEdit && (
                                <button
                                    onClick={() => onEdit(company)}
                                    className="flex-shrink-0 p-1 opacity-40 hover:opacity-100 transition-opacity"
                                    title="Edit company"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
