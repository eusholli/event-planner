'use client'

import { useEffect, useRef, useState } from 'react'

type EventLite = { id: string; name: string; slug?: string }

interface EventComboboxProps {
    value: string | null
    onChange: (eventId: string | null) => void
    placeholder?: string
    disabled?: boolean
}

export default function EventCombobox({ value, onChange, placeholder = 'No event link', disabled }: EventComboboxProps) {
    const [events, setEvents] = useState<EventLite[]>([])
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetch('/api/events')
            .then(r => r.ok ? r.json() : [])
            .then(d => setEvents(Array.isArray(d) ? d : (d.events || [])))
            .catch(() => setEvents([]))
    }, [])

    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [])

    const selected = events.find(e => e.id === value)
    const filtered = query
        ? events.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
        : events

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 border border-zinc-300 rounded-2xl bg-white text-left text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
                <span className={selected ? 'text-zinc-900 truncate' : 'text-zinc-400'}>
                    {selected ? selected.name : placeholder}
                </span>
                {value && !disabled && (
                    <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onChange(null) }}
                        className="text-zinc-400 hover:text-zinc-600 ml-2"
                    >×</span>
                )}
            </button>
            {open && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-zinc-200 rounded-2xl shadow-lg p-2">
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search events…"
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl mb-2"
                    />
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 && (
                            <div className="px-3 py-2 text-sm text-zinc-400">No events</div>
                        )}
                        {filtered.map(ev => (
                            <button
                                key={ev.id}
                                type="button"
                                onClick={() => { onChange(ev.id); setOpen(false); setQuery('') }}
                                className="w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-zinc-100 truncate"
                            >
                                {ev.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
