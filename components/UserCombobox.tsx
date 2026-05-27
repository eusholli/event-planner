'use client'

import { useEffect, useRef, useState } from 'react'

type ClerkUserLite = {
    id: string
    firstName?: string | null
    lastName?: string | null
    imageUrl?: string | null
    emailAddresses?: { emailAddress: string }[]
}

function userLabel(u: ClerkUserLite | null | undefined): string {
    if (!u) return ''
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
    return name || u.emailAddresses?.[0]?.emailAddress || u.id
}

interface UserComboboxProps {
    value: string | null
    onChange: (userId: string | null, user?: ClerkUserLite | null) => void
    placeholder?: string
    disabled?: boolean
}

export default function UserCombobox({ value, onChange, placeholder = 'Unassigned', disabled }: UserComboboxProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [users, setUsers] = useState<ClerkUserLite[]>([])
    const [selected, setSelected] = useState<ClerkUserLite | null>(null)
    const [loading, setLoading] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!value) { setSelected(null); return }
        if (selected?.id === value) return
        fetch(`/api/admin/users?page=1&limit=10&search=${encodeURIComponent(value)}`)
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => {
                const u = (d.data || []).find((x: ClerkUserLite) => x.id === value) || null
                setSelected(u)
            })
            .catch(() => setSelected(null))
    }, [value, selected?.id])

    useEffect(() => {
        if (!open) return
        if (debounceRef.current) clearTimeout(debounceRef.current)
        setLoading(true)
        debounceRef.current = setTimeout(() => {
            fetch(`/api/admin/users?page=1&limit=10&search=${encodeURIComponent(query)}`)
                .then(r => r.ok ? r.json() : { data: [] })
                .then(d => setUsers(d.data || []))
                .catch(() => setUsers([]))
                .finally(() => setLoading(false))
        }, 300)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [query, open])

    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [])

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 border border-zinc-300 rounded-2xl bg-white text-left text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
                <span className="flex items-center gap-2 truncate">
                    {selected?.imageUrl && (
                        <img src={selected.imageUrl} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    <span className={selected ? 'text-zinc-900' : 'text-zinc-400'}>
                        {selected ? userLabel(selected) : placeholder}
                    </span>
                </span>
                {value && !disabled && (
                    <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onChange(null, null); setSelected(null) }}
                        className="text-zinc-400 hover:text-zinc-600 ml-2"
                    >
                        ×
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-zinc-200 rounded-2xl shadow-lg p-2">
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search users…"
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl mb-2"
                    />
                    <div className="max-h-56 overflow-y-auto">
                        {loading && <div className="px-3 py-2 text-sm text-zinc-400">Loading…</div>}
                        {!loading && users.length === 0 && (
                            <div className="px-3 py-2 text-sm text-zinc-400">No users found</div>
                        )}
                        {users.map(u => (
                            <button
                                key={u.id}
                                type="button"
                                onClick={() => { onChange(u.id, u); setSelected(u); setOpen(false); setQuery('') }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm hover:bg-zinc-100"
                            >
                                {u.imageUrl && <img src={u.imageUrl} alt="" className="w-6 h-6 rounded-full" />}
                                <span className="truncate">{userLabel(u)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
