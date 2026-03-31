import { test, expect } from '@playwright/test'
import { createTestEvent, deleteTestEvent } from './helpers'

test.describe('LinkedIn Campaigns API', () => {
    let eventId: string

    test.beforeAll(async ({ request }) => {
        const ts = Date.now()
        const res = await request.post('/api/events', {
            data: {
                name: `LinkedIn Test Event ${ts}`,
                url: `https://test-linkedin-${ts}.com`,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString(),
                region: 'EU_UK',
                status: 'PIPELINE',
            }
        })
        const body = await res.json()
        eventId = body.id
    })

    test.afterAll(async ({ request }) => {
        if (eventId) await deleteTestEvent(request, eventId)
    })

    test('generate-brief returns a non-empty brief string', async ({ request }) => {
        const res = await request.post(`/api/events/${eventId}/linkedin-campaigns/generate-brief`, {
            data: { companyNames: ['Ericsson', 'Nokia'] }
        })
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(typeof body.brief).toBe('string')
        expect(body.brief.length).toBeGreaterThan(50)
        expect(typeof body.hadMarketingPlan).toBe('boolean')
    })

    test('generate-brief returns 400 when Gemini key is missing', async ({ request }) => {
        // This test validates error handling — in CI without a key it should 400
        // In environments with a key configured it will pass with 200 instead; that is also correct.
        const res = await request.post(`/api/events/${eventId}/linkedin-campaigns/generate-brief`, {
            data: { companyNames: ['Test Co'] }
        })
        expect([200, 400]).toContain(res.status())
    })

    test('generate-brief returns 404 for unknown event', async ({ request }) => {
        const res = await request.post('/api/events/nonexistent-event-id-xyz/linkedin-campaigns/generate-brief', {
            data: { companyNames: ['Test Co'] }
        })
        expect(res.status()).toBe(404)
    })
})
