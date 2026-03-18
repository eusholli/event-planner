'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { parseParam, serializeParam, isAtDefault, FilterParamDefault } from '@/lib/filter-params'

type FilterDefaults = Record<string, FilterParamDefault>

type ParsedFilters<T extends FilterDefaults> = {
    [K in keyof T]: T[K] extends string[] ? string[] : T[K] extends boolean ? boolean : string
}

function useFilterParams<T extends FilterDefaults>(defaults: T) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const filters = useMemo((): ParsedFilters<T> => {
        const result = {} as ParsedFilters<T>
        for (const key in defaults) {
            const raw = searchParams.get(key)
            const defaultVal = defaults[key]
            result[key as keyof T] = parseParam(raw, defaultVal as FilterParamDefault) as ParsedFilters<T>[keyof T]
        }
        return result
    }, [searchParams, defaults])

    const setFilter = useCallback((key: keyof T & string, value: FilterParamDefault) => {
        const params = new URLSearchParams(searchParams.toString())
        const serialized = serializeParam(value, defaults[key])
        if (serialized === null) {
            params.delete(key)
        } else {
            params.set(key, serialized)
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [searchParams, router, pathname, defaults])

    const setFilters = useCallback((updates: Partial<Record<keyof T & string, FilterParamDefault>>) => {
        const params = new URLSearchParams(searchParams.toString())
        for (const key in updates) {
            const serialized = serializeParam(updates[key]!, defaults[key])
            if (serialized === null) {
                params.delete(key)
            } else {
                params.set(key, serialized)
            }
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [searchParams, router, pathname, defaults])

    const isFiltered = useMemo(() => {
        for (const key in defaults) {
            if (!isAtDefault(filters[key], defaults[key])) return true
        }
        return false
    }, [filters, defaults])

    const resetFilters = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString())
        for (const key in defaults) {
            params.delete(key)
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [searchParams, router, pathname, defaults])

    return { filters, setFilter, setFilters, isFiltered, resetFilters }
}

export default useFilterParams
