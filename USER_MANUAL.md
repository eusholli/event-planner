# Event Planner User Manual

Welcome to the Event Planner application! This guide will help you navigate the features and manage your events effectively.

## Table of Contents
1. [User Roles & Permissions](#user-roles--permissions)
2. [Events Portfolio](#events-portfolio)
3. [Event Dashboard](#event-dashboard)
4. [Managing Attendees](#managing-attendees)
5. [Scheduling Meetings](#scheduling-meetings)
6. [AI Chat Assistant](#ai-chat-assistant)
7. [Reports](#reports)
8. [Settings & Data Management](#settings--data-management)

---

## User Roles & Permissions
The application serves different types of users with specific access levels:

- **Root**: Full administrative access. Can manage all settings, users, and data. Access to System Admin and User Management pages. Can create/edit/delete events and generate invites.
- **Marketing**: High-level event management. Can create, edit, and delete events. Can view Reports and manage all event details (Attendees, Meetings, Rooms) but **cannot** access System Admin or User Management.
- **Admin**: Operational access. Can add/edit Meetings, Attendees, and Rooms within an event. Can view Reports. **Cannot** create or delete Events, or modify Event top-level settings (Name/Date). **Cannot** access System Admin.
- **User**: Read-only access to most features. Can view Dashboards, Schedules, and Attendees. **Cannot** create new meetings or edit data. Restricted from sensitive areas.

### Managing User Roles
User roles are managed by **Root** users via the **User Administration** page (`/admin/users`).

---

## Events Portfolio
After logging in, the **Events Portfolio** (`/events`) is your main hub. It provides a high-level view of all events.

- **Views**: Toggle between **List**, **Calendar**, and **Map** views to visualize your event strategy.
- **Status Indicators**: Events are color-coded by status:
    - **Pipeline** (Amber): Early planning stage.
    - **Committed** (Green): Confirmed and verified.
    - **Occurred** (Grey): Past events (Read-Only).
    - **Canceled** (Red): Canceled events.
- **Navigation**: Click on an event card to enter its **Dashboard**.
    - **Note**: Non-management users (Admins/Users) can only access events that are **Committed** or **Occurred**. Pipeline events are restricted to Root/Marketing.

### Creating & Managing Events (Root/Marketing Only)
- **New Event**: Click the **New Event** button to start a fresh event pipeline.
- **Edit/Delete**: Use the icons on the event card to rename/reschedule or delete an event.
    - **Deleting an Event** will automatically trigger a backup of that event's data before permanent deletion.

---

## Event Dashboard
Once inside an event, the **Dashboard** is your command center.

- **Overview**: Real-time stats on Attendees, Meetings, and Room Utilization.
- **Navigation**: Use the events navigation bar to jump between Dashboard, Attendees, Rooms, Calendar, and Chat.
- **Event Password**: Events can be password-protected for extra security. If prompted, enter the password to gain access.

---

## Managing Attendees
Navigate to the **Attendees** page to manage your guest list.

### Auto Complete Feature
Use Google Gemini to quickly fill in professional details.
1.  Enter a **Name** and **Company** in the "Add Attendee" form.
2.  Click **Auto Complete**.
3.  Review and accept the AI-generated bio, title, and LinkedIn URL.

> **Note**: This requires a configured Gemini API Key in System Settings.

---

## Scheduling Meetings
Navigate to the **Calendar** or **New Meeting** page to organize the agenda.

- **Status Workflow**:
    1.  **Pipeline**: Draft meeting.
    2.  **Confirmed**: Locked in.
    3.  **Occurred**: Completed.
    4.  **Canceled**: Removed.
- **Drag and Drop**: Reschedule meetings easily on the Calendar view.
- **Read-Only Mode**: If an event status is **Occurred**, the calendar and meeting details become read-only to verify historical data.

---

## AI Chat Assistant
The built-in **AI Chat** (`/chat` or via Navigation) understands your specific event context.

- **Context Aware**: Knows dates, attendees, and schedule.
- **Actions**: Ask to "Find a room for 5 people" or "Show me meetings with John Doe".
- **Persistent History**: Chat history is saved per event.

---

## Reports
*Access: Root, Marketing, and Admin users.*

The **Reports** page provides analytics on meeting breakdown and attendee engagement.
- **Export**: Generate PDF Briefing Books or CSV dumps for offline analysis.

---

## Settings & Data Management

### System Administration (Root Only)
Access via the User Menu -> **System**.
- **Global Settings**: Configure default tags, meeting types, and the Gemini API Key.
- **Factory Reset**: clear the **entire database** to start fresh.
    - **Safety**: The system performs an automatic **Full System Backup** (JSON) before wiping data.

### Event Settings (Root/Marketing Only)
Access via the **Edit** icon on the Events Portfolio or the Settings tab within an event (if accessible).
- **Event Details**: Update Name, Slug, Dates, and Location.
- **Password Protection**: Set a password to restrict access to the event.
- **Reset Event**: Wipe all meetings and attendees for a specific event while keeping the event shell. Includes auto-backup.
