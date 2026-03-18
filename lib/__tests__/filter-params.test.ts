import { parseParam, serializeParam, isAtDefault } from '@/lib/filter-params'

describe('parseParam', () => {
    it('string: returns default when raw is null', () => {
        expect(parseParam(null, '')).toBe('')
    })

    it('string: returns raw value when present', () => {
        expect(parseParam('hello', '')).toBe('hello')
    })

    it('array: returns default when raw is null', () => {
        expect(parseParam(null, [])).toEqual([])
    })

    it('array: parses comma-separated string', () => {
        expect(parseParam('a,b,c', [])).toEqual(['a', 'b', 'c'])
    })

    it('array: returns empty array for empty string', () => {
        expect(parseParam('', [])).toEqual([])
    })

    it('boolean: returns false when raw is null and default is false', () => {
        expect(parseParam(null, false)).toBe(false)
    })

    it('boolean: returns true when raw is null and default is true', () => {
        expect(parseParam(null, true)).toBe(true)
    })

    it('boolean: parses "true" string to true', () => {
        expect(parseParam('true', false)).toBe(true)
    })

    it('boolean: parses "false" string to false', () => {
        expect(parseParam('false', true)).toBe(false)
    })
})

describe('serializeParam', () => {
    it('string: returns null when value equals default', () => {
        expect(serializeParam('', '')).toBeNull()
    })

    it('string: returns value string when different from default', () => {
        expect(serializeParam('hello', '')).toBe('hello')
    })

    it('array: returns null for empty array default', () => {
        expect(serializeParam([], [])).toBeNull()
    })

    it('array: returns comma-separated string', () => {
        expect(serializeParam(['a', 'b'], [])).toBe('a,b')
    })

    it('array: returns null when value matches default (order-independent)', () => {
        expect(serializeParam(['B', 'A'], ['A', 'B'])).toBeNull()
    })

    it('array: returns serialized when differs from default', () => {
        expect(serializeParam(['A'], ['A', 'B'])).toBe('A')
    })

    it('boolean: returns null when value equals default', () => {
        expect(serializeParam(false, false)).toBeNull()
    })

    it('boolean: returns "true" when true and default is false', () => {
        expect(serializeParam(true, false)).toBe('true')
    })

    it('boolean: returns "false" when false and default is true', () => {
        expect(serializeParam(false, true)).toBe('false')
    })
})

describe('isAtDefault', () => {
    it('string: true when value equals default', () => {
        expect(isAtDefault('', '')).toBe(true)
    })

    it('string: false when value differs from default', () => {
        expect(isAtDefault('x', '')).toBe(false)
    })

    it('array: true when same elements regardless of order', () => {
        expect(isAtDefault(['B', 'A'], ['A', 'B'])).toBe(true)
    })

    it('array: false when different elements', () => {
        expect(isAtDefault(['A'], ['A', 'B'])).toBe(false)
    })

    it('boolean: true when equal', () => {
        expect(isAtDefault(false, false)).toBe(true)
    })

    it('boolean: false when different', () => {
        expect(isAtDefault(true, false)).toBe(false)
    })
})
