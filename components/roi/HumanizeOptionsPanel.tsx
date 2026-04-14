'use client'

import type {
    UndetectableReadability,
    UndetectablePurpose,
    UndetectableStrength,
    UndetectableModel,
} from '@/lib/article-generator-client'

export interface HumanizeOptions {
    strength: UndetectableStrength
    readability: UndetectableReadability
    purpose: UndetectablePurpose
    undetectable_model: UndetectableModel
}

export const DEFAULT_HUMANIZE_OPTIONS: HumanizeOptions = {
    strength: 'More Human',
    readability: 'Marketing',
    purpose: 'Article',
    undetectable_model: 'v11sr',
}

interface Props {
    value: HumanizeOptions
    onChange: (opts: HumanizeOptions) => void
}

const STRENGTH_OPTIONS: Array<{ value: UndetectableStrength; label: string; hint: string }> = [
    { value: 'Quality', label: 'Quality', hint: 'Minimal changes, preserves original voice' },
    { value: 'Balanced', label: 'Balanced', hint: 'Moderate rewrite for natural flow' },
    { value: 'More Human', label: 'More Human', hint: 'Aggressive AI-pattern removal' },
]

const READABILITY_OPTIONS: Array<{ value: UndetectableReadability; label: string }> = [
    { value: 'High School', label: 'High School' },
    { value: 'University', label: 'University' },
    { value: 'Doctorate', label: 'Doctorate' },
    { value: 'Journalist', label: 'Journalist' },
    { value: 'Marketing', label: 'Marketing' },
]

const PURPOSE_OPTIONS: Array<{ value: UndetectablePurpose; label: string }> = [
    { value: 'General Writing', label: 'General Writing' },
    { value: 'Essay', label: 'Essay' },
    { value: 'Article', label: 'Article' },
    { value: 'Marketing Material', label: 'Marketing Material' },
    { value: 'Story', label: 'Story' },
    { value: 'Cover Letter', label: 'Cover Letter' },
    { value: 'Report', label: 'Report' },
    { value: 'Business Material', label: 'Business Material' },
    { value: 'Legal Material', label: 'Legal Material' },
]

const MODEL_OPTIONS: Array<{ value: UndetectableModel; label: string; hint: string }> = [
    { value: 'v2', label: 'v2', hint: 'Multilingual' },
    { value: 'v11', label: 'v11', hint: 'English' },
    { value: 'v11sr', label: 'v11sr', hint: 'Best English' },
]

export default function HumanizeOptionsPanel({ value, onChange }: Props) {
    const set = <K extends keyof HumanizeOptions>(key: K, val: HumanizeOptions[K]) =>
        onChange({ ...value, [key]: val })

    return (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 divide-y divide-zinc-100 text-sm">

            {/* Strength */}
            <div className="px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Strength</p>
                <div className="flex rounded-lg border border-zinc-200 overflow-hidden bg-white divide-x divide-zinc-200">
                    {STRENGTH_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => set('strength', opt.value)}
                            title={opt.hint}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${value.strength === opt.value
                                ? 'bg-violet-600 text-white'
                                : 'text-zinc-600 hover:bg-zinc-50'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-zinc-400 leading-snug">
                    {STRENGTH_OPTIONS.find(o => o.value === value.strength)?.hint}
                </p>
            </div>

            {/* Readability + Purpose */}
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block">
                        Reading Level
                    </label>
                    <select
                        value={value.readability}
                        onChange={e => set('readability', e.target.value as UndetectableReadability)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-300 appearance-none"
                    >
                        {READABILITY_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block">
                        Content Type
                    </label>
                    <select
                        value={value.purpose}
                        onChange={e => set('purpose', e.target.value as UndetectablePurpose)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-300 appearance-none"
                    >
                        {PURPOSE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Model */}
            <div className="px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Model</p>
                <div className="flex gap-2">
                    {MODEL_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => set('undetectable_model', opt.value)}
                            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg border text-xs transition-colors ${value.undetectable_model === opt.value
                                ? 'border-violet-400 bg-violet-50 text-violet-800'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
                                }`}
                        >
                            <span className="font-semibold font-mono">{opt.label}</span>
                            <span className={`text-[10px] mt-0.5 ${value.undetectable_model === opt.value ? 'text-violet-500' : 'text-zinc-400'}`}>
                                {opt.hint}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
