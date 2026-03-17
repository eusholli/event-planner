# Testing

## Framework

**Playwright** — end-to-end testing only. No unit test framework (Jest/Vitest) is present.

```json
// package.json
"@playwright/test": "^1.x"
```

Config: `playwright.config.ts` (if present) — otherwise default Playwright config.

## Test Structure

```
tests/                      # Playwright test files (if present)
├── e2e/                    # End-to-end tests
└── fixtures/               # Shared test fixtures
```

> Note: The codebase has minimal test coverage. Most tests are e2e API-level tests via Playwright.

## Test Types

### API Tests
Testing API routes by making HTTP requests and asserting responses.

```typescript
import { test, expect } from '@playwright/test'

test('GET /api/events returns event list', async ({ request }) => {
  const response = await request.get('/api/events')
  expect(response.ok()).toBeTruthy()
  const data = await response.json()
  expect(Array.isArray(data)).toBeTruthy()
})
```

### E2E Tests
Testing UI flows through the browser.

```typescript
test('user can view event dashboard', async ({ page }) => {
  await page.goto('/events/test-event/dashboard')
  await expect(page.locator('h1')).toContainText('Dashboard')
})
```

## Auth Mocking

**`NEXT_PUBLIC_DISABLE_CLERK_AUTH=true`** — Set in test environment to bypass Clerk authentication.

- Provides a mock root user
- Eliminates need to manage Clerk test credentials
- All auth checks pass with root permissions
- `components/auth/index.tsx` handles the conditional

## Database Strategy

Tests use a **real database** (not mocks). The test environment connects to the actual Postgres database configured in `.env`.

- `lib/prisma.ts` — real PrismaClient with pg adapter
- No Prisma mock layer
- Tests that write data should clean up after themselves

## Running Tests

```bash
npx playwright test            # Run all tests
npx playwright test --ui       # Interactive UI mode
npx playwright test --debug    # Debug mode
npx playwright show-report     # View last test report
```

## Test Fixtures

Common setup patterns:

```typescript
import { test as base } from '@playwright/test'

const test = base.extend({
  // Custom fixture: authenticated page
  authedPage: async ({ page }, use) => {
    // With NEXT_PUBLIC_DISABLE_CLERK_AUTH=true, just navigate
    await page.goto('/')
    await use(page)
  }
})
```

## Key Testing Gaps

The following areas have no test coverage:

- **Authorization boundaries** — role-based access (root vs admin vs user) untested
- **Concurrent operations** — race conditions in slug generation, meeting conflicts
- **Email delivery** — nodemailer/ICS generation not tested
- **WebSocket flows** — OpenClaw intelligence chat reconnection and message delivery
- **AI tool execution** — event-scoped Gemini tools (getMeetings, createMeeting, etc.)
- **Import/export robustness** — `/api/settings/export` edge cases
- **Pagination/large datasets** — attendee/meeting list performance
- **Error states** — API error handling, DB connection failures

## Coverage Analysis

| Area | Coverage |
|------|----------|
| API routes | Minimal |
| Auth/RBAC | None |
| UI components | None |
| AI tools | None |
| Email/calendar | None |
| Intelligence actions | None |
| PDF generation | None |

## Mocking Strategy

- **Auth**: Disabled via env var (`NEXT_PUBLIC_DISABLE_CLERK_AUTH=true`)
- **Database**: Real DB (no mocking)
- **External APIs**: Not mocked — Mapbox, R2, Gemini calls may fail in CI without credentials
- **Email**: Not mocked — SMTP not configured in test env; email tests will fail without SMTP vars
