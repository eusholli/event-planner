'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { isAtDefault, FilterParamDefault } from '@/lib/filter-params'

type FilterDefaults = Record<string, FilterParamDefault>

type ParsedFilters<T extends FilterDefaults> = {
    [K in keyof T]: T[K] extends string[] ? string[] : T[K] extends boolean ? boolean : string
}

function useFilterParams<T extends FilterDefaults>(storageKey: string, defaults: T) {
    // Initialise with defaults — safe for SSR; localStorage is read after mount
    const [filters, setFiltersState] = useState<ParsedFilters<T>>(
        defaults as unknown as ParsedFilters<T>
    )

    // After mount, restore from localStorage (only current keys, ignoring stale ones)
    useEffect(() => {
        try {
            const stored = localStorage.getItem(`filterState_${storageKey}`)
            if (!stored) return
            const parsed = JSON.parse(stored)
            const merged = {} as ParsedFilters<T>
            for (const key in defaults) {
                merged[key as keyof T] = (key in parsed ? parsed[key] : defaults[key]) as ParsedFilters<T>[keyof T]
            }
            setFiltersState(merged)
        } catch {
            // localStorage unavailable or corrupt — silently stay on defaults
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey])

    // Persist to localStorage on every change
    useEffect(() => {
        try {
            localStorage.setItem(`filterState_${storageKey}`, JSON.stringify(filters))
        } catch {
            // localStorage unavailable — ignore
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
