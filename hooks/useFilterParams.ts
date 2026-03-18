'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { isAtDefault, FilterParamDefault } from '@/lib/filter-params'

type FilterDefaults = Record<string, FilterParamDefault>

type ParsedFilters<T extends FilterDefaults> = {
    [K in keyof T]: T[K] extends string[] ? string[] : T[K] extends boolean ? boolean : string
}

function readFromStorage<T extends FilterDefaults>(storageKey: string, defaults: T): ParsedFilters<T> {
    try {
        const stored = localStorage.getItem(`filterState_${storageKey}`)
        if (!stored) return defaults as unknown as ParsedFilters<T>
        const parsed = JSON.parse(stored)
        // Only keep keys present in current defaults (ignores stale keys from old schema)
        const merged = {} as ParsedFilters<T>
        for (const key in defaults) {
            merged[key as keyof T] = (key in parsed ? parsed[key] : defaults[key]) as ParsedFilters<T>[keyof T]
        }
        return merged
    } catch {
        return defaults as unknown as ParsedFilters<T>
    }
}

function useFilterParams<T extends FilterDefaults>(storageKey: string, defaults: T) {
    // Read from localStorage synchronously at mount — no restore effect needed,
    // no race condition where persist effect can overwrite saved state.
    const [filters, setFiltersState] = useState<ParsedFilters<T>>(() =>
        typeof window !== 'undefined'
            ? readFromStorage(storageKey, defaults)
            : (defaults as unknown as ParsedFilters<T>)
    )

    // Persist every state change to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(`filterState_${storageKey}`, JSON.stringify(filters))
        } catch {
            // localStorage unavailable (private browsing, quota exceeded) — ignore
        }
    }, [storageKey, filters])

    const setFilter = useCallback((key: keyof T & string, value: FilterParamDefault) => {
        setFiltersState(prev => ({ ...prev, [key]: value }))
    }, [])

    const setFilters = useCallback((updates: Partial<Record<keyof T & string, FilterParamDefault>>) => {
        setFiltersState(prev => ({ ...prev, ...updates }))
    }, [])

    const isFiltered = useMemo(() => {
        for (const key in defaults) {
            if (!isAtDefault(filters[key], defaults[key])) return true
        }
        return false
    }, [filters, defaults])

    const resetFilters = useCallback(() => {
        setFiltersState(defaults as unknown as ParsedFilters<T>)
    }, [defaults])

    return { filters, setFilter, setFilters, isFiltered, resetFilters }
}

export default useFilterParams
