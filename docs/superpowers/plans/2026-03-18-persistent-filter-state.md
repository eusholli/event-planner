# Persistent Filter State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist filter state across page navigations on Dashboard, Attendees, Companies, and Reports pages using URL query parameters, with a "Reset Filters" button on each page.

**Architecture:** Extract pure parse/serialize helpers into `lib/filter-params.ts`, wire them into a `hooks/useFilterParams.ts` React hook that syncs filter state with URL via `router.replace()` (no history pollution), then migrate each page's `useState` filter variables to use the hook. The hook preserves existing non-filter URL params (e.g. `meetingId`, `attendeeId` deep links) since it operates on the full current `searchParams` as a base. Defaults objects are defined at module level (outside components) to avoid reference instability.

**Tech Stack:** Next.js 16 App Router, `useSearchParams` + `useRouter` + `usePathname` from `next/navigation`, TypeScript, Jest + ts-jest (existing test setup at `jest.config.ts`).

---

## Status Clarification (do not skip)

- **Meeting statuses** (Prisma enum `MeetingStatus`): `PIPELINE`, `CONFIRMED`, `OCCURRED`, `CANCELED`
- **Event statuses** (`EventStatus` TS type in `lib/status-colors.ts`): `AWARENESS`, `PIPELINE`, `COMMITTED`, `OCCURRED`, `CANCELED`
- These are **separate systems**. Dashboard filters use meeting statuses. Never mix them.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `lib/filter-params.ts` | Pure functions: parse, serialize, and compare filter param values. No React, no Next.js — pure TypeScript. |
| **Create** | `lib/__tests__/filter-params.test.ts` | Jest tests for every helper function in `lib/filter-params.ts`. |
| **Create** | `hooks/useFilterParams.ts` | React hook that wraps `lib/filter-params.ts` helpers with `useSearchParams` / `useRouter` / `usePathname`. Exposes `setFilter` (single) and `setFilters` (batch) to avoid double router.replace on compound updates. |
| **Modify** | `app/events/[id]/dashboard/page.tsx` | Replace 9 filter `useState` calls with `useFilterParams` hook. Wire existing "Clear Filters" button to `resetFilters()`. |
| **Modify** | `app/events/[id]/attendees/page.tsx` | Replace `searchQuery` `useState` with `useFilterParams` hook. Add conditional Reset Filters button. |
| **Modify** | `app/events/[id]/companies/page.tsx` | Replace `searchQuery` `useState` with `useFilterParams` hook. Add conditional Reset Filters button. |
| **Modify** | `app/events/[id]/reports/page.tsx` | Replace 6 filter/sort `useState` calls with `useFilterParams` hook. Wire existing "Clear Filters" button to `resetFilters()`. Fix `handleSort` to use batch `setFilters`. |

---

## Task 1: Pure Filter Param Helpers

**Files:**
- Create: `lib/filter-params.ts`
- Create: `lib/__tests__/filter-params.test.ts`

### Background

`lib/filter-params.ts` must export three pure functions used by the hook:

- `parseParam(raw, defaultVal)` — decode a URL param string into the correct type, matching the shape of `defaultVal`. Returns `defaultVal` when `raw` is `null`.
- `serializeParam(value, defaultVal)` — encode a typed value back to a URL param string, or `null` when the value equals its default (so we delete the param and keep the URL clean).
- `isAtDefault(value, defaultVal)` — returns `true` when `value` equals `defaultVal`. Array comparison is order-independent (compares sorted arrays).

Supported types: `string`, `string[]`, `boolean`. No other types needed.

Array serialisation: comma-separated string, e.g. `['PIPELINE','CONFIRMED']` ↔ `'PIPELINE,CONFIRMED'`. Empty array serialises as `null` (delete param).

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/filter-params.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/eusholli/dev/event-planner && npx jest lib/__tests__/filter-params.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/filter-params'`

- [ ] **Step 3: Implement `lib/filter-params.ts`**

Create `lib/filter-params.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/eusholli/dev/event-planner && npx jest lib/__tests__/filter-params.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eusholli/dev/event-planner && git add lib/filter-params.ts lib/__tests__/filter-params.test.ts && git commit -m "feat: add pure filter param parse/serialize/compare helpers"
```

---

## Task 2: `useFilterParams` Hook

**Files:**
- Create: `hooks/useFilterParams.ts`

### Background

This hook accepts a `defaults` object (keys are URL param names, values are typed defaults) and returns:
- `filters` — current filter state, typed to match `defaults`
- `setFilter(key, value)` — updates one filter, single `router.replace()` call
- `setFilters(updates)` — updates multiple filters atomically in a **single** `router.replace()` call (avoids the double-replace bug when two state updates must be applied together, e.g. resetting sort column and direction simultaneously)
- `isFiltered` — `true` when any filter differs from its default
- `resetFilters()` — deletes all filter keys from URL, preserving other params (e.g. `meetingId`, `attendeeId`)

**Critical:** The hook must preserve non-filter URL params. It always reads `searchParams.toString()` as its base before modifying params. This means deep-link params (`meetingId`, `attendeeId`) are never lost when a filter changes.

**Critical:** The `defaults` object passed to this hook MUST be defined at module level (outside the component function body) as a `const`. If defined inside the component, a new object is created on every render, causing the `useMemo`/`useCallback` dependencies to be perpetually stale, which can trigger infinite re-render loops.

There are no unit tests for this hook — it requires React rendering + Next.js navigation mocks which the existing `node` test environment doesn't support. It is tested implicitly through manual QA; the pure helpers are tested in Task 1.

- [ ] **Step 1: Create `hooks/useFilterParams.ts`**

```typescript
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
            ;(result as any)[key] = parseParam(raw, defaultVal as any)
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eusholli/dev/event-planner && git add hooks/useFilterParams.ts && git commit -m "feat: add useFilterParams hook for URL-synced filter state"
```

---

## Task 3: Migrate Dashboard Filters

**Files:**
- Modify: `app/events/[id]/dashboard/page.tsx`

### Background

`DashboardContent` has 9 filter `useState` variables plus 1 UI state (`isFiltersExpanded`), declared at lines ~59–68.

The file already has `useSearchParams`, `useRouter`, `usePathname` imported — only add the new hook import.

**Do NOT persist `isFiltersExpanded`** — it is pure UI state (panel open/closed). Keep it as `useState`.

**Meeting status default** (ALL selected): `['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED']`

**Existing "Clear Filters" button** (lines ~635–650): This button already exists in the JSX header and is always visible. Do NOT add a second reset button. Instead, wire this existing button's `onClick` to `resetFilters()` and make it conditionally render only when `isFiltered === true` — matching the behaviour described in requirements. The button currently calls 9 individual setters that will no longer exist after migration.

**Preserve deep link behaviour:** `meetingId` comes from `searchParams.get('meetingId')` independently of the filter hook. The hook's `resetFilters` and `setFilter` both use `new URLSearchParams(searchParams.toString())` as their base, so `meetingId` is never disturbed.

**Defaults object:** Define `DASHBOARD_FILTER_DEFAULTS` at **module level** (outside `DashboardContent`), not inside the component. This keeps the reference stable across renders.

- [ ] **Step 1: Add module-level defaults constant and hook import**

Add `import useFilterParams from '@/hooks/useFilterParams'` to the imports at the top of the file.

Then, **outside** and **above** the `DashboardContent` function definition, add:

```typescript
const DASHBOARD_FILTER_DEFAULTS = {
    search: '',
    statuses: ['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED'] as string[],
    tags: [] as string[],
    attendees: [] as string[],
    date: '',
    roomId: '',
    meetingTypes: [] as string[],
    approved: false,
    inviteSent: false,
} as const satisfies Record<string, import('@/lib/filter-params').FilterParamDefault>
```

- [ ] **Step 2: Replace filter useState declarations inside the component**

Find the filter declarations block (lines ~59–68):

```typescript
    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED'])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
    const [selectedDate, setSelectedDate] = useState('')
    const [selectedRoomId, setSelectedRoomId] = useState('')
    const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>([])
    const [filterApproved, setFilterApproved] = useState(false)
    const [filterInviteSent, setFilterInviteSent] = useState(false)
    const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
```

Replace with:

```typescript
    // Filters — persisted in URL
    const { filters: dashFilters, setFilter, setFilters, isFiltered, resetFilters } = useFilterParams(DASHBOARD_FILTER_DEFAULTS)
    // UI state — not persisted
    const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
```

- [ ] **Step 3: Update the debounced search useEffect**

Find:
```typescript
    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchMeetings()
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])
```

Replace with:
```typescript
    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchMeetings()
        }, 300)
        return () => clearTimeout(timer)
    }, [dashFilters.search])
```

- [ ] **Step 4: Update the immediate-fetch useEffect**

Find:
```typescript
    // Immediate Fetch for other filters
    useEffect(() => {
        fetchMeetings()
    }, [selectedStatuses, selectedTags, selectedAttendees, selectedDate, selectedRoomId, selectedMeetingTypes, filterApproved, filterInviteSent])
```

Replace with:
```typescript
    // Immediate Fetch for other filters
    useEffect(() => {
        fetchMeetings()
    }, [dashFilters.statuses, dashFilters.tags, dashFilters.attendees, dashFilters.date, dashFilters.roomId, dashFilters.meetingTypes, dashFilters.approved, dashFilters.inviteSent])
```

- [ ] **Step 5: Update `fetchMeetings` to read from `dashFilters`**

Find the filter param block inside `fetchMeetings` (lines ~184–192):

```typescript
            if (selectedDate) params.append('date', selectedDate)
            if (selectedRoomId) params.append('roomId', selectedRoomId)
            if (searchQuery) params.append('search', searchQuery)
            if (selectedStatuses.length > 0) params.append('status', selectedStatuses.join(','))
            if (selectedTags.length > 0) params.append('tags', selectedTags.join(','))
            if (selectedMeetingTypes.length > 0) params.append('meetingType', selectedMeetingTypes.join(','))
            if (selectedAttendees.length > 0) params.append('attendeeIds', selectedAttendees.join(','))
            if (filterApproved) params.append('isApproved', 'true')
            if (filterInviteSent) params.append('calendarInviteSent', 'true')
```

Replace with:

```typescript
            if (dashFilters.date) params.append('date', dashFilters.date as string)
            if (dashFilters.roomId) params.append('roomId', dashFilters.roomId as string)
            if (dashFilters.search) params.append('search', dashFilters.search as string)
            if ((dashFilters.statuses as string[]).length > 0) params.append('status', (dashFilters.statuses as string[]).join(','))
            if ((dashFilters.tags as string[]).length > 0) params.append('tags', (dashFilters.tags as string[]).join(','))
            if ((dashFilters.meetingTypes as string[]).length > 0) params.append('meetingType', (dashFilters.meetingTypes as string[]).join(','))
            if ((dashFilters.attendees as string[]).length > 0) params.append('attendeeIds', (dashFilters.attendees as string[]).join(','))
            if (dashFilters.approved) params.append('isApproved', 'true')
            if (dashFilters.inviteSent) params.append('calendarInviteSent', 'true')
```

- [ ] **Step 6: Update all remaining JSX references**

Search the JSX in `DashboardContent` for every remaining use of the old variable names and replace:

| Old | New |
|-----|-----|
| `searchQuery` | `dashFilters.search as string` |
| `setSearchQuery(val)` | `setFilter('search', val)` |
| `selectedStatuses` | `dashFilters.statuses as string[]` |
| `setSelectedStatuses(val)` | `setFilter('statuses', val)` |
| `selectedTags` | `dashFilters.tags as string[]` |
| `setSelectedTags(val)` | `setFilter('tags', val)` |
| `selectedAttendees` | `dashFilters.attendees as string[]` |
| `setSelectedAttendees(val)` | `setFilter('attendees', val)` |
| `selectedDate` | `dashFilters.date as string` |
| `setSelectedDate(val)` | `setFilter('date', val)` |
| `selectedRoomId` | `dashFilters.roomId as string` |
| `setSelectedRoomId(val)` | `setFilter('roomId', val)` |
| `selectedMeetingTypes` | `dashFilters.meetingTypes as string[]` |
| `setSelectedMeetingTypes(val)` | `setFilter('meetingTypes', val)` |
| `filterApproved` | `dashFilters.approved as boolean` |
| `setFilterApproved(val)` | `setFilter('approved', val)` |
| `filterInviteSent` | `dashFilters.inviteSent as boolean` |
| `setFilterInviteSent(val)` | `setFilter('inviteSent', val)` |

- [ ] **Step 7: Wire the existing "Clear Filters" button to `resetFilters()`**

The existing "Clear Filters" button is in the page header area (lines ~635–650). It currently calls 9 individual setters. Replace its entire `onClick` body and add the `isFiltered` condition:

Find:
```tsx
                    <button
                        onClick={() => {
                            setSearchQuery('')
                            setSelectedStatuses(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED'])
                            setSelectedTags([])
                            setSelectedAttendees([])
                            setSelectedDate('')
                            setSelectedRoomId('')
                            setSelectedMeetingTypes([])
                            setFilterApproved(false)
                            setFilterInviteSent(false)
                        }}
                        className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Clear Filters
                    </button>
```

Replace with:
```tsx
                    {isFiltered && (
                        <button
                            onClick={resetFilters}
                            className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 rounded-lg font-medium hover:bg-zinc-50 transition-colors shadow-sm"
                        >
                            Clear Filters
                        </button>
                    )}
```

- [ ] **Step 8: Verify and commit**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint
```

Expected: no errors. Then manually test in browser:
1. Apply a status filter, navigate to attendees, return — filter should be restored.
2. "Clear Filters" button appears when filtered, resets correctly, disappears when at default.
3. `?meetingId=<id>` deep link still opens the meeting modal.

```bash
cd /Users/eusholli/dev/event-planner && git add app/events/\[id\]/dashboard/page.tsx && git commit -m "feat: persist dashboard filter state in URL params"
```

---

## Task 4: Migrate Attendees Filters

**Files:**
- Modify: `app/events/[id]/attendees/page.tsx`

### Background

`AttendeesContent` has one filter: `searchQuery` (line ~66). The file already imports `useSearchParams`, `useRouter`, `usePathname`. The `attendeeId` param is a deep link — **do not touch it**, the hook preserves it automatically.

The search filter is applied client-side (`.filter()` in JSX), not via API. After migration, read `attendeeFilters.search` instead of `searchQuery`.

**Defaults object:** Define at module level, outside `AttendeesContent`.

There is no existing "Clear Filters" or "Clear Search" button — add a new conditional one near the search input.

- [ ] **Step 1: Add module-level defaults constant and hook import**

Add `import useFilterParams from '@/hooks/useFilterParams'` to imports.

Outside and above `AttendeesContent`, add:

```typescript
const ATTENDEES_FILTER_DEFAULTS = { search: '' }
```

- [ ] **Step 2: Replace searchQuery useState**

Find (line ~66):
```typescript
    const [searchQuery, setSearchQuery] = useState('')
```

Replace with:
```typescript
    const { filters: attendeeFilters, setFilter: setAttendeeFilter, isFiltered: attendeeIsFiltered, resetFilters: resetAttendeeFilters } = useFilterParams(ATTENDEES_FILTER_DEFAULTS)
```

- [ ] **Step 3: Update all JSX references**

| Old | New |
|-----|-----|
| `searchQuery` | `attendeeFilters.search as string` |
| `setSearchQuery(val)` | `setAttendeeFilter('search', val)` |

- [ ] **Step 4: Add Reset Filters button near the search input**

Locate the search input `<input>` element for attendees. Immediately after it, add:

```tsx
{attendeeIsFiltered && (
    <button
        onClick={resetAttendeeFilters}
        className="text-sm text-gray-500 hover:text-gray-700 underline"
    >
        Clear Search
    </button>
)}
```

- [ ] **Step 5: Verify and commit**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint
```

Then manually test: type a search, navigate away, return — search should be restored.

```bash
cd /Users/eusholli/dev/event-planner && git add app/events/\[id\]/attendees/page.tsx && git commit -m "feat: persist attendees search filter in URL params"
```

---

## Task 5: Migrate Companies Filters

**Files:**
- Modify: `app/events/[id]/companies/page.tsx`

### Background

`CompaniesContent` has one filter: `searchQuery` (line ~27). It does NOT currently import any Next.js navigation hooks — `useFilterParams` handles those internally, so **only import `useFilterParams`** itself. Do not add `useSearchParams`, `useRouter`, or `usePathname` as direct imports in this file.

The search is client-side (`.filter()` in JSX).

**Defaults object:** Define at module level, outside `CompaniesContent`.

There is no existing clear button — add a new conditional one near the search input.

- [ ] **Step 1: Add hook import and module-level defaults**

Add to imports:
```typescript
import useFilterParams from '@/hooks/useFilterParams'
```

Outside and above `CompaniesContent`, add:
```typescript
const COMPANIES_FILTER_DEFAULTS = { search: '' }
```

- [ ] **Step 2: Replace searchQuery useState**

Find (line ~27):
```typescript
    const [searchQuery, setSearchQuery] = useState('')
```

Replace with:
```typescript
    const { filters: companyFilters, setFilter: setCompanyFilter, isFiltered: companyIsFiltered, resetFilters: resetCompanyFilters } = useFilterParams(COMPANIES_FILTER_DEFAULTS)
```

- [ ] **Step 3: Update all JSX references**

| Old | New |
|-----|-----|
| `searchQuery` | `companyFilters.search as string` |
| `setSearchQuery(val)` | `setCompanyFilter('search', val)` |

- [ ] **Step 4: Add Clear Search button near the search input**

Immediately after the search `<input>` element, add:

```tsx
{companyIsFiltered && (
    <button
        onClick={resetCompanyFilters}
        className="text-sm text-gray-500 hover:text-gray-700 underline"
    >
        Clear Search
    </button>
)}
```

- [ ] **Step 5: Verify and commit**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint
```

```bash
cd /Users/eusholli/dev/event-planner && git add app/events/\[id\]/companies/page.tsx && git commit -m "feat: persist companies search filter in URL params"
```

---

## Task 6: Migrate Reports Filters

**Files:**
- Modify: `app/events/[id]/reports/page.tsx`

### Background

`ReportsContent` has 6 filter/sort variables (lines ~60–67):
- `selectedAttendeeTypes` — `string[]`, default `[]`
- `selectedMeetingTypes` — `string[]`, default `[]`
- `selectedTags` — `string[]`, default `[]`
- `externalFilter` — string, default `'all'`
- `sortColumn` — string, default `'total'`
- `sortDirection` — string, default `'desc'`

`ReportsContent` uses `require('next/navigation').useParams()` at line ~42. It does NOT import `useSearchParams`, `useRouter`, or `usePathname` — these are handled internally by `useFilterParams`. **Only import `useFilterParams`** itself. Do not add the navigation hooks as direct imports in this file.

**Important:** `externalFilter`, `sortColumn`, and `sortDirection` are typed as string unions in the original code. After migration, read them as `string` from `filters` and cast to the original union types at point of use (e.g. `reportFilters.external as 'all' | 'internal' | 'external'`).

**`handleSort` requires special treatment:** The original `handleSort` function calls `setSortColumn(column)` and `setSortDirection('desc')` together (two state updates). After migration these would be two separate `setReportFilter` calls, each triggering its own `router.replace()` on the same stale `searchParams` snapshot — the first call's change would be lost. Use the `setFilters` batch method instead, which applies both changes in a single `router.replace()`.

**Existing "Clear Filters" button** (lines ~365–375): This button already exists in the filter sidebar and is always visible. Wire its `onClick` to `resetReportFilters()`. Keep it always visible (matching existing UX). Do NOT add a second reset button.

**Defaults object:** Define at module level, outside `ReportsContent`.

- [ ] **Step 1: Add hook import and module-level defaults**

Add to imports:
```typescript
import useFilterParams from '@/hooks/useFilterParams'
```

Outside and above `ReportsContent`, add:

```typescript
const REPORTS_FILTER_DEFAULTS = {
    attendeeTypes: [] as string[],
    meetingTypes: [] as string[],
    tags: [] as string[],
    external: 'all',
    sortCol: 'total',
    sortDir: 'desc',
}
```

- [ ] **Step 2: Replace filter/sort useState declarations**

Find (lines ~60–67):
```typescript
    // Filter State
    const [selectedAttendeeTypes, setSelectedAttendeeTypes] = useState<string[]>([])
    const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>([])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [externalFilter, setExternalFilter] = useState<'all' | 'internal' | 'external'>('all')

    // Sort State
    const [sortColumn, setSortColumn] = useState<keyof AttendeeStats>('total')
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
```

Replace with:
```typescript
    // Filter + Sort State — persisted in URL
    const { filters: reportFilters, setFilter: setReportFilter, setFilters: setReportFilters, isFiltered: reportIsFiltered, resetFilters: resetReportFilters } = useFilterParams(REPORTS_FILTER_DEFAULTS)
```

- [ ] **Step 3: Update `handleSort` to use batch `setFilters`**

Find (lines ~175–182):
```typescript
    const handleSort = (column: keyof AttendeeStats) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(column)
            setSortDirection('desc')
        }
    }
```

Replace with:
```typescript
    const handleSort = (column: keyof AttendeeStats) => {
        if (reportFilters.sortCol === column) {
            setReportFilter('sortDir', reportFilters.sortDir === 'asc' ? 'desc' : 'asc')
        } else {
            setReportFilters({ sortCol: column as string, sortDir: 'desc' })
        }
    }
```

- [ ] **Step 4: Update all remaining references**

| Old | New |
|-----|-----|
| `selectedAttendeeTypes` | `reportFilters.attendeeTypes as string[]` |
| `setSelectedAttendeeTypes(val)` | `setReportFilter('attendeeTypes', val)` |
| `selectedMeetingTypes` | `reportFilters.meetingTypes as string[]` |
| `setSelectedMeetingTypes(val)` | `setReportFilter('meetingTypes', val)` |
| `selectedTags` | `reportFilters.tags as string[]` |
| `setSelectedTags(val)` | `setReportFilter('tags', val)` |
| `externalFilter` | `reportFilters.external as 'all' \| 'internal' \| 'external'` |
| `setExternalFilter(val)` | `setReportFilter('external', val)` |
| `sortColumn` | `reportFilters.sortCol as keyof AttendeeStats` |
| `sortDirection` | `reportFilters.sortDir as 'asc' \| 'desc'` |

Note: `setSortColumn` and `setSortDirection` are removed entirely — `handleSort` (updated in Step 3) is the only place sort state is written.

- [ ] **Step 5: Wire existing "Clear Filters" button**

Find the existing "Clear Filters" button (lines ~365–375):
```tsx
                        <button
                            onClick={() => {
                                setSelectedAttendeeTypes([])
                                setSelectedMeetingTypes([])
                                setSelectedTags([])
                                setExternalFilter('all')
                            }}
                            className="w-full px-4 py-2 mt-4 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                            Clear Filters
                        </button>
```

Replace the `onClick` only:
```tsx
                        <button
                            onClick={resetReportFilters}
                            className="w-full px-4 py-2 mt-4 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                            Clear Filters
                        </button>
```

Note: keep the button always visible (no `isFiltered` condition) — this matches the existing UX where it is always shown in the filter sidebar.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint
```

Then manually test: apply a tag filter on reports, navigate away, return — filter should be restored. Click "Clear Filters" — all filters including sort reset. Change sort column — both column and direction update correctly in the URL in a single navigation step.

```bash
cd /Users/eusholli/dev/event-planner && git add app/events/\[id\]/reports/page.tsx && git commit -m "feat: persist reports filter and sort state in URL params"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/eusholli/dev/event-planner && npx jest --no-coverage
```

Expected: all tests pass (new `filter-params` tests + existing `status-colors` tests).

- [ ] **Step 2: Run lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test — filter persistence**

For each page, verify:
1. Apply a non-default filter (e.g. deselect a status on dashboard, type a search on attendees)
2. Navigate to a different event sub-page
3. Use browser back button — filter state is restored
4. Navigate to a detail page and return — filter state is restored
5. "Clear Filters" button works correctly on dashboard and reports; "Clear Search" works on attendees and companies

- [ ] **Step 4: Manual smoke test — deep links unaffected**

1. Open `?meetingId=<id>` on dashboard — meeting modal opens as before
2. Apply a dashboard filter — `meetingId` param is preserved in URL
3. Open `?attendeeId=<id>` on attendees — attendee modal opens as before

- [ ] **Step 5: Manual smoke test — filter sharing**

1. Apply filters on dashboard
2. Copy the URL
3. Open in a new tab — same filters are applied

- [ ] **Step 6: Commit final plan doc**

```bash
cd /Users/eusholli/dev/event-planner && git add docs/superpowers/plans/2026-03-18-persistent-filter-state.md && git commit -m "docs: add persistent filter state implementation plan"
```
