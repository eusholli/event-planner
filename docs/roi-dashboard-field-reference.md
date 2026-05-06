# Event ROI Dashboard — Complete Field Reference

---

## Tab 1: Targets & Approval

This tab is used before the event to establish the plan and get it approved. It contains four sections.

---

### Financial Targets

| Field | Description |
|---|---|
| Requester Email | Email of the person who submitted the event request — used for accountability and approval communications |
| Budget ($) | The approved spend allocated to this event |
| Expected Pipeline | Estimated total value of new sales opportunities expected to be generated from the event |
| Win Rate (%) | Assumed rate at which pipeline converts to closed-won revenue (entered as a decimal, e.g. 0.15 = 15%) |
| Expected Revenue | Auto-calculated read-only field: Expected Pipeline × Win Rate. Never manually entered |

A sparkle (✦) button can auto-populate empty financial fields by extracting values from the Marketing Plan using AI.

---

### Event Targets

| Field | Description |
|---|---|
| Event Scans | Target number of contacts to be scanned or collected at the event (e.g. badge scans, lead capture) |
| External Leads | Target number of confirmed meetings with customers or prospects during the event |
| Speaking | Target number of speaking sessions, panels, or presentations to be secured |
| Media / PR | Target number of media interviews, press mentions, or PR appearances |

A sparkle (✦) button can auto-populate empty event target fields from the Marketing Plan.

---

### Target Companies

The strategic account list — the specific companies the team intends to engage at the event.

| Feature | Description |
|---|---|
| Search & add | Type to search the company database and add individual companies |
| Bulk paste | Enter a comma-separated list of company names; matched companies are added immediately, unmatched ones open the Data Ingestion flow to create new records |
| Upload via Data Ingestion | For spreadsheets or documents containing company lists; reviewed companies are automatically added to the target list |
| Company tags | Each added company appears as a tag showing its name and pipeline value (if set) |
| Remove | Each tag has an × button to remove the company from the target list |
| LinkedIn Article selection | In edit mode, clicking a company tag selects it (up to 5) for AI-generated LinkedIn campaign article drafting |
| LinkedIn Draft button | Appears when 1–5 companies are selected; opens a modal to generate a LinkedIn article targeting those companies |

A sparkle (✦) button suggests 10–15 target companies extracted from the Marketing Plan. A confirmation checklist shows each suggestion with its name, AI rationale, and whether it already exists in the system ("new" badge for companies that would be created). Users check/uncheck before applying.

---

### Marketing Plan

A free-text area containing the event's strategic narrative — the "why" and "how" behind attending the event. Can be manually typed or AI-generated via the sparkle button.

The Marketing Plan is the upstream source that feeds all three sparkle extraction buttons. If no plan exists when a sparkle button is clicked on Financial or Event Targets, a plan is generated first automatically.

---

### Action Buttons

| Button | Who sees it | Behavior |
|---|---|---|
| Save Targets | Marketing / Root (when not approved) | Persists all target fields to the database |
| Submit for Approval | Marketing / Root (when DRAFT) | Moves status to SUBMITTED; requires all required fields to be filled and no unsaved changes |
| Approve | Root only (when SUBMITTED) | Locks targets; status moves to APPROVED |
| Reject | Root only (when SUBMITTED) | Returns to DRAFT with a rejection flag; organizer must revise and resubmit |

---

## Tab 2: Event Results

Used after (or during) the event to record metrics that cannot be automatically derived from meeting logs. The tab locks when the event reaches OCCURRED or CANCELED status.

---

### Engagement Actuals

| Field | Description |
|---|---|
| Actual Cost ($) | The true final spend for the event. When entered, this replaces Budget in the ROI Ratio calculation |
| Event Scans | Actual number of contacts scanned or collected at the event |
| External Leads | **Read-only, auto-calculated.** Counts meetings in CONFIRMED or OCCURRED status. Cannot be manually overridden |
| Speaking | Actual number of speaking sessions delivered |
| Media / PR | Actual number of media or press interactions that took place |

Budget is shown beneath the Actual Cost field as a reference point.

---

## Tab 3: Performance Tracker

A read view that compares targets against actuals in real time as meeting data accumulates. No data entry occurs here.

---

### Financial Performance

| Metric | Description |
|---|---|
| Pipeline | Actual pipeline generated from the event (from associated company pipeline values on meetings) vs. Expected Pipeline target. Shown as a ring chart |
| Revenue | Actual closed-won revenue vs. Expected Revenue target. Shown as a ring chart |
| Budget vs Actual Cost | Planned budget vs. actual spend. Colors invert — being under budget is a positive outcome |
| ROI Ratio | Pipeline ÷ Investment, expressed as a percentage. Uses Actual Cost if entered, otherwise falls back to Budget. Labeled accordingly so the reader knows which denominator was used |

---

### Engagement

Four ring charts comparing actual vs. target for each engagement metric:

| Metric | Actual Source |
|---|---|
| Event Scans | Manually entered in Event Results tab |
| External Leads | Auto-counted from CONFIRMED/OCCURRED meetings |
| Speaking | Manually entered in Event Results tab |
| Media / PR | Manually entered in Event Results tab |

---

### Target Companies

A checklist showing every company from the Target Companies list with a visual indicator of whether they were engaged:

- **Hit** — at least one attendee from that company has a meeting logged for this event
- **Missed** — company was targeted but no meeting recorded

This gives an at-a-glance view of strategic account coverage.

---

### Additional Companies

Companies that appear in the event's meeting attendee records but were **not** on the original Target Companies list. These represent unplanned or opportunistic engagements.

| Field | Description |
|---|---|
| Company name | Name of the company encountered |
| Pipeline value | The company's pipeline value from the company database, if set |

This section is valuable for capturing deals or relationships that emerged outside the original plan and may influence future event targeting.
