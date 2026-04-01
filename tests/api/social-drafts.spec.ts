import { test, expect } from '@playwright/test'
import { createTestEvent, deleteTestEvent } from './helpers'

test.describe('Social Drafts API — originalContent', () => {
    let eventId: string
    let draftId: string

    test.beforeAll(async ({ request }) => {
        const ts = Date.now()
        const res = await request.post('/api/events', {
            data: {
                name: `Drafts Test Event ${ts}`,
                url: `https://test-drafts-${ts}.com`,
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
        if (draftId) await request.delete(`/api/social/drafts/${draftId}`)
        if (eventId) await deleteTestEvent(request, eventId)
    })

    test('POST saves both content and originalContent', async ({ request }) => {
        const res = await request.post('/api/social/drafts', {
            data: {
                eventId,
                content: 'Humanized article text',
                originalContent: 'Original article text',
                angle: 'Campaign Article',
                tone: '2000–2500 words',
                companyIds: [],
                companyNames: [],
            }
        })
        expect(res.status()).toBe(201)
        const body = await res.json()
        expect(body.content).toBe('Humanized article text')
        expect(body.originalContent).toBe('Original article text')
        draftId = body.id
    })

    test('POST without originalContent stores null', async ({ request }) => {
        const res = await request.post('/api/social/drafts', {
            data: {
                eventId,
                content: 'Humanized only',
                angle: 'Campaign Article',
                tone: '2000–2500 words',
                companyIds: [],
                companyNames: [],
            }
        })
        expect(res.status()).toBe(201)
        const body = await res.json()
        expect(body.originalContent).toBeNull()
        await request.delete(`/api/social/drafts/${body.id}`)
    })

    test('PUT updates originalContent independently', async ({ request }) => {
        const res = await request.put(`/api/social/drafts/${draftId}`, {
            data: { originalContent: 'Updated original text' }
        })
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body.originalContent).toBe('Updated original text')
        expect(body.content).toBe('Humanized article text')
    })

    test('GET returns originalContent in draft list', async ({ request }) => {
        const res = await request.get(`/api/social/drafts?eventId=${eventId}`)
        expect(res.status()).toBe(200)
        const drafts = await res.json()
        const draft = drafts.find((d: { id: string }) => d.id === draftId)
        expect(draft).toBeDefined()
        expect(draft.originalContent).toBe('Updated original text')
    })
})
