'use client'

interface TagCheckboxGridProps {
    availableTags: string[]
    selectedTags: string[]
    onToggle: (tag: string) => void
    label?: string
}

export default function TagCheckboxGrid({
    availableTags,
    selectedTags,
    onToggle,
    label = 'Tags',
}: TagCheckboxGridProps) {
    if (availableTags.length === 0) return null
    return (
        <div className="col-span-full">
            <label className="block text-sm font-medium text-zinc-700 mb-2">{label}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-3 border border-zinc-200 rounded-2xl bg-zinc-50/50">
                {availableTags.map(tag => (
                    <label key={tag} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedTags.includes(tag)}
                            onChange={() => onToggle(tag)}
                            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm text-zinc-700">{tag}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}
