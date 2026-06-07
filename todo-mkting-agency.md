# Agentic Marketing Team — Status & Roadmap

**Last updated:** 2026-06-07 · **Owner:** marketing/root · **Surface:** `/campaigns`, `/campaigns/strategy`, `/content`

Rakuten Symphony's autonomous marketing loop: from a set of **strategy themes** we want to own,
an OpenClaw agent researches the market (recency-bounded, target-company-aware), assembles a
**campaign proposal**, and a human reviews → edits → **Approve & Generate** drafts each content
item in the RS brand voice (Gemini + Google Search) and lands them in the existing `/content`
editorial workstream.

```
MarketingStrategy themes ──> OpenClaw agent (sales-recon) ──> CampaignProposal (PENDING_REVIEW)
        ▲ edit on /campaigns/strategy        │ webhook            │ review on /campaigns
        │                                     ▼                    ▼
   "Generate Campaign" (poll-queue) <── marketing-runner.py    Approve & Generate
                                                                  │  spawns ContentTask(s) [DRAFT]
                                                                  ▼  + per-item R2 markdown draft
                                                            /content (DRAFT → TODO → assign → …)
```

---

## Status at a glance

| Phase | Scope | Status |
|------|-------|--------|
| **1**   | Thin vertical slice: strategy → agent → proposal → approve/activate → ContentTask/LinkedInDraft | ✅ Complete, live-verified |
| **1.5** | Recency + target-aware research, vocab constraint, brand-voice drafting on Approve, regenerate suggestions, multi-theme + on-demand "Generate Campaign" poll-queue | ✅ Complete, live-verified |
| **1.6** | Operator UX: DRAFT status, per-row delete, campaign PDF, live "generating" banner, modal Complete notification | ✅ Complete, build + smoke verified |
| **2**   | Audio/Video slicing (Whisper + ffmpeg → clips/quotes → R2 → `ContentAsset`) | ⬜ Backlog (not started) |
| **3**   | Full autonomy: `marketing-dispatcher.py` cron, scheduled weekly run over all themes | ⬜ Backlog (not started) |

**This deploy ships Phases 1 + 1.5 + 1.6** (all event-planner code was uncommitted; it is one
feature shipped together). All three DB migrations apply automatically via `prisma migrate deploy`
on the Vercel build.

---

## ✅ Complete — shipping in this deploy (event-planner)

**Data model & migrations** (`prisma/schema.prisma`)
- `MarketingStrategy` (single living row) · `CampaignProposal` (`@@unique([runId, theme])`) ·
  `CampaignRunRequest` (poll-queue) · `SystemSettings.brandVoice` · `ContentTaskStatus` += `DRAFT`.
- Migrations: `…_marketing_strategy_and_campaign_proposal`, `…_brand_voice_and_campaign_run_request`,
  `…_content_task_draft_status`. All additive / non-destructive.

**The loop**
- Strategy editor `/campaigns/strategy` (PUT manageEvents; GET dual-auth CRON|manageEvents).
- Inbound webhook `/api/webhooks/campaign-proposal` (CRON; idempotent upsert; vocab coercion;
  resolve-or-create `discoveredCompanies`).
- Review UI `/campaigns` + `CampaignProposalModal` (edit title/rationale/brief, editable content
  items constrained to system vocab, Regenerate suggestions, Approve / Reject / Activate).
- `content-inventory` endpoint feeds the agent existing assets + `companies` + `allowedContentTypes`
  + `allowedTags` (reuse-first + vocab source).

**Drafting (Approve & Generate)**
- `POST /api/content-tasks/[id]/generate-draft` — per-item, RS brand voice, Gemini + Google Search,
  ≤12-month recency, stored as named markdown in R2 and attached to the ContentTask.
- Modal fans out drafts in parallel with per-item progress + retry; created ContentTasks start as
  **DRAFT**.
- Brand voice editable at `/admin/system` (`SystemSettings.brandVoice`, default fallback in
  `lib/brand-voice.ts`).

**On-demand generation (multi-theme)**
- `POST /api/marketing/generate-campaign` (manageEvents) enqueues a `CampaignRunRequest`; debounced
  per theme. **Generate auto-saves the strategy first** (so you can't enqueue an unsaved theme).
- `marketing-runner.py` (sales-recon container) polls `run-requests`, execs the agent, marks
  DONE/FAILED. `GET /api/marketing/run-requests` is dual-auth (CRON for the runner, manageEvents
  for the UI banner; `?active=1` → PENDING+RUNNING).

**Operator UX (1.6)**
- **DRAFT status** (violet chip) distinguishes agent output from human to-dos; 📎 indicator shows a
  draft file is attached; content leader moves `DRAFT → TODO → assign`.
- **Per-row delete** (confirm) on `/campaigns` (new `DELETE /api/campaigns/[id]`, manageEvents — removes
  the proposal only; spawned content stays) and `/content` (existing DELETE, cleans up R2).
- **Download PDF** per campaign (row icon + modal button) → "Rakuten Symphony — Campaign" branded PDF
  via `downloadMarkdownAsPdf`.
- **Live "Generating…" banner** on `/campaigns` (polls every 12s, auto-refreshes when a run finishes).
- **Modal "✓ Complete"** notification when all drafts settle (+ partial-failure variant).

**RBAC:** every `/campaigns` + `/api/marketing` + `/api/campaigns` route is root/marketing only
(`manageEvents`) or CRON-bearer; nav item hidden for admin/user. Audited via `/rbac-check`.

## ✅ Complete — sales-recon (agent side, deployed separately as Docker)
- `MARKETING.md` skill, `prompts/campaign-proposal.{md,schema.json}`, `marketing-once.py` (single
  theme), `marketing-runner.py` (always-on poll-queue worker, started by the container entrypoint).
- Image rebuilt so the corrected agent-CLI invocation + runner are baked (runner confirmed live).

---

## ⚠️ Concerns / watch in production

1. **Vercel function duration.** `generate-draft` sets `maxDuration = 120`s (regenerate-suggestions
   60s). This requires a Vercel plan that allows ≥120s; on Hobby it is capped (~60s) and a slow
   Gemini+Search draft can time out. Mitigated by per-item **retry** in the modal, but confirm the
   plan limit. If drafts time out, lower scope or move drafting to a queue (Phase 3-style).
2. **Gemini API key must be set in the production DB** (`SystemSettings.geminiApiKey`). Without it,
   draft generation, regenerate-suggestions, and ROI generate-plan all fail (400 "not configured").
3. **On-demand "Generate Campaign" is cross-system.** It only works if `marketing-runner.py` is
   running in the OpenClaw container **and** that container's `CRON_EVENT_PLANNER_DNS` points at the
   **production** event-planner URL with the matching `CRON_SECRET_KEY`. Verify before the team tests
   the button against prod.
4. **Brand voice unset → default fallback.** Ship works without it, but the team should set
   `SystemSettings.brandVoice` on `/admin/system` for on-brand drafts.
5. **`proxy.ts` bearer-bypass covers all `/api/marketing(.*)`.** Browser routes there
   (`generate-campaign`, `regenerate-suggestions`) rely on the Clerk session still attaching under
   the bypass — verified working (strategy PUT + generate-campaign succeed with a real session), but
   keep in mind when adding new `/api/marketing` browser routes.
6. **Shared DB note.** Local `.env` and prod may point at the same Postgres (single-DB setup). If so,
   the three migrations are already applied and `migrate deploy` is a no-op; if separate, they apply
   cleanly on deploy. Either way additive/safe.
7. **Cross-event LinkedIn drafts** are intentionally skipped on activation when a proposal has no
   `eventId` (the draft FK needs an event). Expected behavior, not a bug.

---

## 🧪 How the team tests (after deploy)

1. As **root/marketing**, open `/campaigns/strategy`, add/save 1–2 themes, click **Generate Campaign**.
   (As admin/user, confirm the nav item is hidden and `/campaigns` shows "Access restricted".)
2. Watch the `/campaigns` **Generating…** banner; the proposal appears (~1–2 min) with no refresh.
3. Open it: edit the brief, **Regenerate content suggestions**, tweak a row's type/tags.
4. **Approve & Generate** → ContentTasks appear in `/content` as **DRAFT** (violet) with a 📎 draft
   file; the modal shows **✓ Complete**.
5. In `/content`, open a DRAFT, read the attached draft, move it `DRAFT → TODO`, assign.
6. **Download PDF** on a campaign; **delete** a campaign and a content row (confirm prompts).

---

## 🔜 Remaining work (later phases)

### Deferred Phase 1 cleanup (small)
- Register the new custom-auth routes in `.claude/skills/rbac-check/SKILL.md` (was auto-denied as
  self-modification) so future audits don't flag them.
- Browser sign-off matrix across roles on production.

### Optional niceties (nice-to-have, not blocking)
- **"Re-draft" button** on a single ContentTask that reuses `generate-draft` (regenerate one item in
  place without re-running the campaign).
- Flag a proposal whose only sources are >12 months old (timeliness guard).
- Reuse one `googleSearch` context across a run's items (cost).

### Phase 2 — Audio/Video slicing (backlog)
- New `content-slicer` service (Whisper STT → transcript → segmentation → `ffmpeg` clips), exposed as
  an MCP tool / HTTP API; push clips to R2; new `ContentAsset` model; agent's "curate content" step
  calls a uniform `getContentAssets(theme)` returning text (P1) + media (P2).

### Phase 3 — Full autonomy / orchestration (backlog)
- `marketing-dispatcher.py` mirroring `intel-dispatcher.py` (run-lock, poison-pill, resume, bounded
  concurrency, idempotent upsert) — enqueues one `CampaignRunRequest` per theme and **reuses the
  existing `marketing-runner.py`** (no second execution path).
- Register a `marketing-campaigns-weekly` cron in `sales-recon/event-planner-cron.py`.
- Optional: enqueue a run when `MarketingStrategy` is edited (trigger-on-publish).

---

## Key files (reference)

**event-planner** — `prisma/schema.prisma` · `app/api/marketing/{strategy,content-inventory,generate-campaign,run-requests}` ·
`app/api/webhooks/campaign-proposal` · `app/api/campaigns/[id]/{route,approve,reject,activate,regenerate-suggestions}` ·
`app/api/content-tasks/[id]/generate-draft` · `app/campaigns/{page,strategy}` · `components/CampaignProposalModal.tsx` ·
`lib/{brand-voice,campaign-vocab,markdown-to-pdf,storage}.ts` · `proxy.ts` (bearer routes).

**sales-recon** — `openclaw-data/workspace/MARKETING.md` · `prompts/campaign-proposal.{md,schema.json}` ·
`marketing-once.py` · `marketing-runner.py` · (Phase 3) `marketing-dispatcher.py`, `event-planner-cron.py`.
