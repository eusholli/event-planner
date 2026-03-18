export type FilterParamDefault = string | string[] | boolean

export function parseParam(raw: string | null, defaultVal: string): string
export function parseParam(raw: string | null, defaultVal: string[]): string[]
export function parseParam(raw: string | null, defaultVal: boolean): boolean
export function parseParam(raw: string | null, defaultVal: FilterParamDefault): FilterParamDefault {
    if (raw === null) return defaultVal
    if (Array.isArray(defaultVal)) {
        return raw === '' ? [] : raw.split(',')
    }
    if (typeof defaultVal === 'boolean') {
        return raw === 'true'
    }
    return raw
}

export function serializeParam(value: FilterParamDefault, defaultVal: FilterParamDefault): string | null {
    if (isAtDefault(value, defaultVal)) return null
    if (Array.isArray(value)) return value.join(',')
    if (typeof value === 'boolean') return String(value)
    return value as string
}

export function isAtDefault(value: FilterParamDefault, defaultVal: FilterParamDefault): boolean {
    if (Array.isArray(value) && Array.isArray(defaultVal)) {
        if (value.length !== defaultVal.length) return false
        const sortedValue = [...value].sort()
        const sortedDefault = [...defaultVal].sort()
        return sortedValue.every((v, i) => v === sortedDefault[i])
    }
    return value === defaultVal
}
