# Event Planner — User Manual

Welcome to the Executive Meeting Coordinator! This guide covers every feature of the application.

## Table of Contents
1. [User Roles & Permissions](#user-roles--permissions)
2. [Events Portfolio](#events-portfolio)
3. [Event Dashboard](#event-dashboard)
4. [Managing Attendees](#managing-attendees)
5. [Rooms](#rooms)
6. [Scheduling Meetings](#scheduling-meetings)
7. [AI Chat Assistant](#ai-chat-assistant)
8. [OpenClaw Insights](#openclaw-insights)
9. [Reports](#reports)
10. [Event Settings](#event-settings)
11. [System Administration](#system-administration)
12. [User Administration](#user-administration)

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
- **Deleting an Event**: Triggers an automatic backup before permanent deletion. Meetings and rooms are cascade-deleted; attendees are preserved (they are system-level entities).

### Navigation
Click an event card to enter its **Dashboard**. From there, use the navigation bar to access all event pages.

> **Note**: Admin and User roles can only access events they are authorized for, and only those in **Committed** or **Occurred** status.

---

## Event Dashboard

The **Dashboard** (`/events/[id]/dashboard`) is your event command center.

### Overview
- **Real-time stats**: Attendee count, meeting count, room utilization.
- **Meeting list**: Filterable and searchable. Click meetings to view/edit details.
- **Status breakdown**: Visual indicators for Pipeline, Confirmed, Occurred, and Canceled meetings.

### Export Options
- **Export CSV**: Download all meeting data as a spreadsheet.
- **Briefing Book PDF**: Generate a comprehensive PDF with all meetings and attendee details.
- **Calendar View PDF**: Export the schedule as a formatted calendar PDF.

---

## Managing Attendees

Navigate to **Attendees** (`/events/[id]/attendees`) to manage your guest list.

### Adding Attendees
Fill in the form with name, email, company, title, and optionally bio, LinkedIn URL, attendee type, and profile image.

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
- **Click** a meeting to view details; **double-click** to edit.
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

**OpenClaw Insights** (`/events/[id]/intelligence`) provides market intelligence through a dedicated AI agent powered by OpenClaw.

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
- **URL**, **Description**, **Budget**, **Target Customers**, **Expected ROI**.
- **Status**: Change event status (Pipeline/Committed/Occurred/Canceled).
- **Password**: Set a password to restrict access.

### Customization
- **Tags**: Define meeting tags for this event (comma-separated).
- **Meeting Types**: Define meeting types (comma-separated).
- **Attendee Types**: Define attendee types (comma-separated).

### Authorized Users
- Grant or revoke access for individual Admin and User accounts.
- Search and filter users; select/deselect individually or in bulk.

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
