import { EVENT_STATUS_COLORS, getStatusColor, STATUS_DISPLAY_ORDER, EventStatus } from '@/lib/status-colors'

describe('EVENT_STATUS_COLORS - AWARENESS entry', () => {
    it('Test 1: AWARENESS entry exists with correct bg color', () => {
        expect(EVENT_STATUS_COLORS.AWARENESS.bg).toBe('#3b82f6')
    })

    it('Test 2: AWARENESS className is correct', () => {
        expect(EVENT_STATUS_COLORS.AWARENESS.className).toBe('bg-blue-50 text-blue-700 border border-blue-100')
    })

    it('Test 3: AWARENESS markerColor is correct', () => {
        expect(EVENT_STATUS_COLORS.AWARENESS.markerColor).toBe('#3b82f6')
    })
})

describe('EVENT_STATUS_COLORS - OCCURRED slate colors', () => {
    it('Test 4: OCCURRED bg is slate (#64748b)', () => {
        expect(EVENT_STATUS_COLORS.OCCURRED.bg).toBe('#64748b')
    })

    it('Test 5: OCCURRED text is slate-700 (#334155)', () => {
        expect(EVENT_STATUS_COLORS.OCCURRED.text).toBe('#334155')
    })

    it('Test 6: OCCURRED border is slate-100 (#f1f5f9)', () => {
        expect(EVENT_STATUS_COLORS.OCCURRED.border).toBe('#f1f5f9')
    })

    it('Test 7: OCCURRED className uses slate palette', () => {
        expect(EVENT_STATUS_COLORS.OCCURRED.className).toBe('bg-slate-50 text-slate-700 border border-slate-100')
    })

    it('Test 8: OCCURRED markerColor is slate (#64748b)', () => {
        expect(EVENT_STATUS_COLORS.OCCURRED.markerColor).toBe('#64748b')
    })
})

describe('STATUS_DISPLAY_ORDER', () => {
    it('Test 9: STATUS_DISPLAY_ORDER has all five statuses in correct order', () => {
        expect(STATUS_DISPLAY_ORDER).toEqual(['AWARENESS', 'PIPELINE', 'COMMITTED', 'CANCELED', 'OCCURRED'])
    })
})

describe('getStatusColor', () => {
    it('Test 10: getStatusColor("AWARENESS") returns the AWARENESS entry', () => {
        const color = getStatusColor('AWARENESS')
        expect(color.bg).toBe('#3b82f6')
        expect(color.markerColor).toBe('#3b82f6')
    })
})

describe('EventStatus type', () => {
    it('Test 11: EventStatus type includes AWARENESS (compile-time check via assignment)', () => {
        const status: EventStatus = 'AWARENESS'
        expect(status).toBe('AWARENESS')
    })
})
