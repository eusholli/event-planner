# Event Planner — User Manual

Welcome to the Executive Meeting Coordinator! This guide covers every feature of the application.

## Table of Contents
1. [User Roles & Permissions](#user-roles--permissions)
2. [Events Portfolio](#events-portfolio)
3. [Event Dashboard](#event-dashboard)
4. [Event ROI Management](#event-roi-management)
5. [Managing Attendees](#managing-attendees)
6. [Rooms](#rooms)
7. [Scheduling Meetings](#scheduling-meetings)
8. [AI Chat Assistant](#ai-chat-assistant)
9. [OpenClaw Insights](#openclaw-insights)
10. [Reports](#reports)
11. [Event Settings](#event-settings)
12. [System Administration](#system-administration)
13. [User Administration](#user-administration)
14. [Data Ingestion](#data-ingestion)

---

## User Roles & Permissions

| Role | Access Level |
| :--- | :--- |
| **Root** | Full system access. System Administration, User Management, all events, all settings. |
| **Marketing** | Event management + User Management. Can create/edit/delete events. Cannot access System Administration. |
| **Admin** | Operational access within *authorized* events. Can create/edit meetings, attendees, rooms. Cannot create or delete events. Cannot manage users or system settings. |
| **User** | Read-only access within *authorized* events. Can view dashboards, schedules, and attendee lists. Cannot modify data. |

### Access Control
- **Root** and **Marketing** users have access to all events automatically.
- **Admin** and **User** users can only access events where they have been explicitly authorized (configured in Event Settings).
- **Password-protected events** prompt for a password if the user is not explicitly authorized.
- User roles are managed by **Root** or **Marketing** users at `/admin/users`.

---

## Events Portfolio

After signing in, the **Events Portfolio** (`/events`) is your main hub.

### Views
Toggle between three views using the icons at the top:
- **List View**: Event cards with status indicators, dates, and quick actions.
- **Calendar View**: Events plotted on a calendar by date range.
- **Map View**: Events plotted geographically (requires event addresses with coordinates).

### Event Status
Events are color-coded by status:
- **Pipeline** (Amber): Early planning stage.
- **Committed** (Green): Confirmed and active.
- **Occurred** (Grey): Past events — all data becomes **read-only**.
- **Canceled** (Red): Canceled events.

### Creating & Managing Events (Root/Marketing Only)
- **New Event**: Click the **"+"** button. Enter a name to create a new event in Pipeline status.
- **Edit/Delete**: Use the icons on event cards.
- **AI Marketing Plan**: Click the Sparkles (✦) icon on any event card to generate a comprehensive marketing plan for the event using Google Gemini. The plan is saved to the event's ROI record and you are navigated to the ROI page. If a plan already exists a warning banner is shown — use the ROI page to regenerate or edit it manually.
- **Deleting an Event**: Triggers an automatic backup before permanent deletion. Meetings and rooms are cascade-deleted; attendees are preserved (they are system-level entities).

### Navigation
Click an event card to enter its **Dashboard**. From there, use the navigation bar to access all event pages, logically grouped into:
- **Performance**: Dashboard, ROI, Reports
- **Audience**: Attendees, Companies
- **Logistics**: New Meeting, Calendar, Rooms

> **Note**: Admin and User roles can only access events they are authorized for, and only those in **Committed** or **Occurred** status.

---

## Event Dashboard

The **Dashboard** (`/events/[id]/dashboard`) is your event command center.

### Overview
- **Real-time stats**: Attendee count, meeting count, room utilization.
- **Meeting list**: Filterable and searchable. Click a meeting to open a view-only details modal. Click **Edit** within the modal to make changes.
- **Status breakdown**: Visual indicators for Pipeline, Confirmed, Occurred, and Canceled meetings.

### Export Options
- **Export CSV**: Download all meeting data as a spreadsheet.
- **Briefing Book PDF**: Generate a comprehensive PDF with all meetings and attendee details.
- **Calendar View PDF**: Export the schedule as a formatted calendar PDF.

---

## Event ROI Management

*Access: Root and Marketing users can set and approve targets. All authorized users can view the Performance Tracker.*

The **ROI Dashboard** (`/events/[id]/roi`) lets you set pre-event investment targets, track post-event results, and measure the return on your event investment — all in one place.

Navigate to the **ROI** tab in the event navigation bar.

### How It Works

The ROI workflow follows three stages:

1. **Before the event** — Set financial targets, meeting KPIs, engagement goals, and a list of target companies you want to meet. Submit targets for management approval.
2. **During the event** — The system automatically tracks actuals as you log meetings and attendees. Pipeline value, C-level meetings, and target company hits update in real time.
3. **After the event** — Enter manual engagement metrics (social reach, keynotes, etc.) and review the full Target vs. Actual comparison.

### AI Auto-Fill (Sparkle Buttons)

Three sparkle (✦) buttons on the Targets & Approval tab let you auto-populate empty fields using Google Gemini. Each button reads the event's marketing plan (generating one automatically if it doesn't exist yet) and extracts relevant values.

| Button | Fields Filled |
| :--- | :--- |
| **Financial Targets ✦** | Budget, Expected Pipeline, Win Rate |
| **Event Targets ✦** | Booth Meetings, C-Level range, Other Meetings, ERTA, Speaking, Media/PR |
| **Target Companies ✦** | Suggests 10–15 companies; creates new records or links to existing ones |

**How it works**:
1. Click a sparkle button. A confirmation panel appears listing fields that will be filled and any already-populated fields that will be skipped.
2. Review the list, then click **Apply** to accept or **Cancel** to dismiss.
3. Only empty fields are modified — existing values are never overwritten.

> **Note**: Sparkle buttons require a configured Gemini API Key in System Administration.

### Tab 1: Targets & Approval

Use this tab to define what success looks like for the event.

#### Financial Targets
| Field | Description |
| :--- | :--- |
| **Requester Email** | Email of the person requesting the event. |
| **Target Budget ($)** | Total budget allocated to this event (e.g., $37,000). |
| **Expected Pipeline** | Total deal value you expect to generate from companies met. |
| **Win Rate** | Expected conversion rate (enter as decimal, e.g., 0.15 for 15%). |
| **Expected Revenue** | Auto-calculated: Pipeline × Win Rate. |

#### Meeting KPI Targets
| Field | Description |
| :--- | :--- |
| **Booth Meetings** | Target number of meetings at your booth. |
| **C-Level Meetings (Min/Max)** | Target range for meetings with C-level executives. |
| **Other Meetings** | Target for non-booth, non-C-level meetings. |

#### Engagement Targets
Set numeric targets for: **Social Reach**, **Target ERTA** (Engagement Rate by Target Account), **Keynotes**, **Seminars**, **Media/PR**, and **Booth Sessions**.

#### Target Companies
Type company names and press Enter (or click **Add**) to build a target list. These are companies you want to ensure you meet with at the event. The Performance Tracker will show which ones you actually met.

#### Approval Workflow
Targets go through a three-step approval process:
1. **Draft** → Edit freely. Click **Save Targets** to save your work.
2. **Submitted** → Click **Submit for Approval** to lock targets and request sign-off.
3. **Approved** → A Root or Marketing user clicks **Approve** to finalize.

### Tab 2: Event Execution

Engagement metrics like social reach, keynotes, and media coverage can't be derived from meeting data. Enter them here after the event:

- **Social Reach**: Total social media impressions/reach.
- **Actual ERTA**: The achieved Engagement Rate by Target Account at the event.
- **Keynotes**: Number of keynote presentations delivered.
- **Seminars**: Number of seminars or panels participated in.
- **Media / PR**: Number of media mentions or PR activities.
- **Booth Sessions**: Number of booth demonstration sessions conducted.

Click **Save Actuals** to persist these values. They immediately appear in the Performance Tracker.

### Tab 3: Performance Tracker

This tab provides a live, visual comparison of your targets versus actuals.

#### What Is Automatically Calculated
The following metrics are computed in real time from your meeting and attendee data — no manual entry required:

| Metric | How It's Calculated |
| :--- | :--- |
| **Actual Pipeline** | Sum of pipeline values across unique companies from confirmed/occurred meetings. |
| **Actual Revenue** | Actual Pipeline × Win Rate. |
| **Booth Meetings** | Count of meetings with type "Booth". |
| **C-Level Meetings** | Count of meetings that include at least one attendee with seniority level "C-Level". |
| **Other Meetings** | Total meetings minus Booth and C-Level meetings. |
| **Target Companies Hit** | Companies from your target list that appear in at least one confirmed/occurred meeting. |
| **Investment** | Pulled from the event's budgeted target. |
| **ROI Ratio** | Pipeline ÷ Investment, shown as a percentage. |

#### Visual Elements
- **Progress Rings**: Large donut charts for Pipeline and Revenue show percentage completion with color coding.
- **Progress Bars**: Horizontal bars for meeting KPIs.
- **Company Checklist**: Each target company shown with a ✅ (met) or ✖ (not met) indicator and overall hit rate.
- **Color Coding**: 🟢 Green (≥100%), 🟡 Amber (≥50%), 🔴 Rose (<50%).

### Pipeline Value — How It Works

Pipeline value is centralized at the **Company level**. This keeps things simple and consistent:

1. When adding or editing a Company in the **Companies** directory, set its **Pipeline Value ($)**.
2. When calculating the event's actual pipeline, the system:
   - Looks at all confirmed/occurred meetings.
   - Identifies the unique companies represented by the attendees in those meetings.
   - Sums the pipeline value of those unique companies.

> **Tip**: You only need to set the pipeline value once per company in the global directory.

### Seniority Level — C-Level Tracking

When adding attendees, you can set their **Seniority Level** (C-Level, VP, Director, Manager, or IC). The ROI system uses this to automatically count C-Level meetings — any meeting with at least one C-Level attendee counts.

### Import & Export

ROI targets are included in both event-level and system-level exports/imports:
- **Event Export/Import**: The `roiTargets` object is embedded in the JSON, preserving all targets, actuals, and approval status.
- **System Backup/Restore**: ROI targets for each event are included in the system backup and restored alongside event data.

---

## Companies

Navigate to **Companies** (`/events/[id]/companies`) to manage the shared directory of companies across the system.

- **Company Structure**: Attendees are linked to relational company records, rather than plain text strings. This ensures data consistency.
- **Adding Companies**: Create new companies with a name, description, and pipeline value.
- **Duplicate Prevention**: The system strictly prevents duplicate company names from being created.
- **Integration**: Companies are shared across events. A target company added in the ROI Dashboard pulls from this centralized list.

## Managing Attendees

Navigate to **Attendees** (`/events/[id]/attendees`) to manage your guest list.

### Adding Attendees
Fill in the form with name, email, company, title, and optionally bio, LinkedIn URL, attendee type, seniority level, and profile image.

- **Seniority Level**: Select from C-Level, VP, Director, Manager, or IC. Used by the ROI system to track C-Level meetings.

### AI Auto Complete
1. Enter a **Name** and **Company** in the form.
2. Click **Auto Complete** (sparkle icon).
3. Google Gemini searches the web and populates the title, bio, LinkedIn URL, and company description.
4. Review the suggestions and accept or modify them.

> **Note**: Requires a configured Gemini API Key in System Administration.

### Attendee Cards
Each attendee card shows:
- Name, title, company, and profile image.
- **External/Internal** badge (if set).
- **Type** label (e.g., VIP, Speaker).
- Actions: Edit, Delete, Generate Briefing Book.

### Briefing Books
Click the briefing book icon on an attendee card to generate a PDF report containing their profile and all scheduled meetings.

### Intelligence Button
Click the intelligence icon on an attendee card to auto-navigate to OpenClaw Insights with a pre-filled query about that attendee's company.

---

## Rooms

Navigate to **Rooms** (`/events/[id]/rooms`) to manage meeting venues.

- **Add Room**: Enter name and capacity.
- **Edit/Delete**: Use the action buttons on each room card.
- **Briefing Book**: Generate a per-room PDF with all meetings scheduled in that room.

---

## Scheduling Meetings

### New Meeting Page
Navigate to **New Meeting** (`/events/[id]/new-meeting`) for a full-featured meeting creation form:
- Title, purpose, date, start/end time.
- Room selection (from event's rooms).
- Attendee selection (multi-select from event's attendees).
- Meeting type and tags.
- Status (Pipeline/Confirmed/Occurred/Canceled).
- Additional fields: requester email, location, other details.

### Calendar View
Navigate to **Calendar** (`/events/[id]/calendar`) for a visual schedule:
- **Day / Week / Month** views.
- **Drag and Drop**: Reschedule meetings by dragging them to new time slots.
- **Click** a meeting to open the read-only details modal; click **Edit** from there to make changes.
- Color-coded by meeting status.

### Meeting Status Workflow
1. **Pipeline**: Draft meeting, not yet confirmed.
2. **Confirmed**: Locked in and scheduled.
3. **Occurred**: Completed (becomes read-only).
4. **Canceled**: Removed from active schedule.

### Read-Only Mode
When an event status is set to **Occurred**, all meeting and calendar editing is disabled to preserve historical accuracy.

---

## AI Chat Assistant

The built-in **AI Chat** (`/events/[id]/chat`) is powered by Google Gemini via the Vercel AI SDK.

### Capabilities
- **Context-Aware**: Knows your event's dates, attendees, meetings, and rooms.
- **Tool Calling**: Can search meetings, look up attendees, find rooms, and generate navigation links.
- **Actions**: Ask questions like:
  - *"Who is attending the keynote?"*
  - *"Find a room for 10 people"*
  - *"Show me all confirmed meetings"*
  - *"Take me to settings"* → Generates a clickable navigation card.
- **Persistent History**: Chat history is saved per event session.
- **Clear Chat**: Reset the conversation with the clear button.

---

## OpenClaw Insights

**OpenClaw Insights** (`/intelligence`) provides system-level market intelligence through a dedicated AI agent powered by OpenClaw.

### How It Works
- Connects via WebSocket to the `ws-proxy` service, which communicates with your configured OpenClaw instance.
- The connection indicator shows **green** (connected) or **red** (connecting/disconnected).
- The agent's name is **Kenji**.

### Features
- **Real-time Streaming**: Responses stream in with thinking indicators and tool usage status messages.
- **New Session**: Click the "New Session" button to start a fresh conversation.
- **Download as PDF**: Each assistant response has a "Download as PDF" button that generates a formatted PDF with the report content. Filenames include the subject and timestamp.
- **Auto-Query**: Navigate from other pages (e.g., attendee intelligence button) with a pre-filled query that executes automatically.
- **Markdown Rendering**: Full markdown support including tables, code blocks, and links.

---

## Reports

*Access: All logged-in users.*

The **Reports** page (`/events/[id]/reports`) provides analytics:
- **Meeting Breakdown**: Counts by status (Pipeline, Confirmed, Occurred, Canceled).
- **Attendee Engagement**: Per-attendee meeting counts across all statuses.
- **Filtering & Sorting**: Filter by meeting type, tags. Sort by any column.

### Export
- **CSV**: Download the attendee engagement table as a spreadsheet.
- **PDF**: Generate a formatted PDF report of the analytics.

---

## Event Settings

*Access: Root and Marketing users.*

Navigate to **Settings** within an event (`/events/[id]/settings`) to configure:

### Event Details
- **Name**, **Slug**, **Start/End Dates**, **Timezone**, **Region**.
- **Address** and **Booth Location** (prefixed to room locations in calendar invites).
- **URL**, **Description**.
- **Status**: Change event status (Pipeline/Committed/Occurred/Canceled).
- **Password**: Set a password to restrict access.

### Customization
- **Tags**: Define meeting tags for this event (comma-separated).
- **Meeting Types**: Define meeting types (comma-separated).
- **Attendee Types**: Define attendee types (comma-separated).

### Authorized Users
- Grant or revoke access for individual Admin and User accounts.
- **Search**: Type in the search box to filter by name or email. Results update after a short delay.
- **Pagination**: Use the Previous/Next buttons to browse through users. The search automatically resets to page 1.
- Select/deselect users individually or in bulk.

### AI Event Scraper
- Enter a URL and let AI auto-populate event details (name, dates, description, address, etc.).

### Data Management
- **Export Event**: Download event data as JSON.
- **Import Event**: Upload event data from a JSON file.
- **Reset Event**: Wipe all meetings and attendees for this event (auto-backup before reset).
- **Delete Event**: Permanently delete the event (auto-backup before deletion).

---

## System Administration

*Access: Root users only.*

Navigate to **System** (`/admin/system`) from the top navigation.

### Global Settings
- **Gemini API Key**: Required for AI Auto Complete and AI Chat features.
- **Default Tags**: Auto-applied to new events.
- **Default Meeting Types**: Auto-applied to new events.
- **Default Attendee Types**: Auto-applied to new events.

### Data Management
- **System Backup**: Download the entire database as JSON (all events, attendees, rooms, meetings).
- **System Restore**: Import a full system backup JSON file (merges data).
- **Factory Reset**: Delete ALL data. Requires typing "DELETE SYSTEM" to confirm. Auto-backup is triggered before reset.

---

## User Administration

*Access: Root and Marketing users.*

Navigate to **Users** (`/admin/users`) from the top navigation.

- **User List**: Table of all users with name, email, current role.
- **Search**: Filter users by name or email.
- **Change Role**: Select a new role from the dropdown (Root, Marketing, Admin, User).
- **Delete User**: Remove a user from the system.
- **Pagination**: Navigate through user pages for large user bases.

> **Note**: New users are automatically assigned the **User** (read-only) role upon first sign-in.

---

## Data Ingestion

*Access: Root and Marketing users.*

Navigate to **Data Ingestion** (`/admin/data-ingestion`) from the top navigation.

The Data Ingestion system is an AI-powered document extraction protocol that seamlessly converts raw offline files (PDFs, DOCXs, CSVs, TXTs) into relational Companies, People, and Meetings schemas mapped directly to the active system database.

### How It Works
1. **Upload File**: Drag-and-drop or select an offline file holding your raw data logs, target lists, or unmapped intelligence.
2. **AI Semantic Extraction**: Google Gemini structurally parses the contents against Event Planner's data schema, leveraging inference to format elements cleanly. 
3. **Review & Compare**: The system maps returned elements into three interactive tabs (Companies, People, Meetings).
4. **Commit Save**: Execute a strictly validated batch commit seamlessly mapping relational data into the active Prisma Database across all events.

### Smart Operations & Diffing
- **Conflict Resolution**: If the AI populates a field that disagrees with an existing entity in your Database (e.g., an altered Job Title or outdated Pipeline Value), the form natively displays a stacked "Diff View" showcasing the current database's data value underneath.
- **Revert to DB**: Click `[Revert]` on any conflict discrepancy to instantaneously disregard the new extracted text and securely default back to your existing system data.
- **Intelligent Pre-fills**: Any data parameters the AI couldn't parse that *are* already present locally in your Database are automatically retrofitted onto the uploaded form blocks, preventing "blank" fields from wiping secure database metrics.
- **Remove Records**: Use the **Trash (Delete)** icon cleanly available on any ingested line-item to drop that entire schema from the saving queue instantly.
