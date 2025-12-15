# Event Planner User Manual

Welcome to the Event Planner application! This guide will help you navigate the features and manage your event effectively.

## Table of Contents
1. [User Roles & Permissions](#user-roles--permissions)
2. [Meeting Tracker](#meeting-tracker)
3. [Managing Attendees](#managing-attendees)
4. [Auto Complete Feature](#auto-complete-feature)
5. [AI Chat Assistant](#ai-chat-assistant)
6. [Scheduling Meetings](#scheduling-meetings)
7. [Reports](#reports)
8. [Settings & Data Management](#settings--data-management)

---

## User Roles & Permissions
The application serves different types of users with specific access levels:

- **Root**: Full administrative access. Can manage all settings, users, and data. Access to all pages including Settings and Admin User Management.
- **Admin**: Operational access. Can view Reports, manage Schedules and Attendees, but cannot modify system-wide Settings or User permissions.
- **User**: Read-only access. Can view Dashboards, Schedules, and Attendees but cannot create new meetings or edit data. Restricted from sensitive areas.

---

## Meeting Tracker
The **Meeting Tracker** is your landing page. It provides a quick overview of your event status, including:
- **Total Attendees**: The number of people registered.
- **Total Meetings**: The number of scheduled sessions.
- **Room Utilization**: How effectively your venue space is being used.
- **Export Options**: Download data as a CSV file or a comprehensive **PDF Briefing Book**.
- **Enhanced Search**: Filter meetings by searching across titles, attendees, rooms, and descriptions.

---

## Managing Attendees
Navigate to the **Attendees** page to view and manage your guest list.

> **Note**: Users with the **User** role have read-only access and cannot add or edit attendees.


### Adding an Attendee
1.  Click the **Add Attendee** button.
2.  Fill in the details manually, or use the [Auto Complete](#auto-complete-feature) feature.
3.  Click **Save** to add them to the list.

### Editing an Attendee
1.  Click on an attendee's card in the list.
2.  Update their information in the form.
3.  Click **Save Changes**.

---

## Auto Complete Feature
The application integrates with Google Gemini to help you quickly fill in professional details.

### How to use:
1.  In the "Add Attendee" form, enter a **Name** and **Company**.
2.  Click the **Auto Complete** button.
3.  The AI will search for the person and suggest their **Title**, **Bio**, **LinkedIn URL**, and **Company Description**.
4.  Review the suggestions in the modal and click **Accept & Fill** to populate the form.

> **Note**: This feature requires a valid Google Gemini API Key to be configured in [Settings](#settings--data-management).

---

## AI Chat Assistant
The built-in **AI Chat** allows you to ask natural language questions about the event and perform quick actions.
- **Context Aware**: The AI knows your event's start and end dates and general configuration.
- **Smart Actions**: You can say "Create a new meeting" or "Edit the Kickoff meeting", and the AI will generate a specialized **Navigation Card**. Click the card to jump directly to the correct page with details pre-filled (where possible).
- **Navigation**: Ask "Where can I manage attendees?" to get a direct link to the relevant page.
- **Security**: The assistant respects your User Role. It will only provide actions and links that you are authorized to use.

---

## Scheduling Meetings
Navigate to the **Schedule** page to organize your event agenda.

### Creating a Meeting
1.  Click **New Meeting** in the navigation or **Schedule Meeting** on the Meeting Tracker.
2.  Enter a **Title** and **Purpose**.
3.  (Optional) Select **Tags** to categorize the meeting.
4.  Select a **Room**.
5.  Choose **Attendees** from the list.
6.  Set the **Date**, **Start Time**, and **Duration**.
7.  Select the **Status** (Started, Completed, Canceled).
8.  Click **Book Meeting**.

### Meeting Tags
You can categorize your meetings using tags.
- **Managing Tags**: Go to [Settings](#settings--data-management) to add or remove tags.
- **Assigning Tags**: When creating or editing a meeting, select one or more tags from the dropdown.

### Editing a Meeting
1. Click on a meeting block in the calendar.
2. A modal will appear with the meeting details.
3. Click **Edit** to modify details or **Delete** to remove the meeting.
4. If the meeting status is "Started", you only need to provide a title. For "Completed", all fields are required.

**Note**: After booking, you will stay on the page to easily book another meeting. A success message will appear at the top.

### Managing the Schedule
- **Drag and Drop**: You can drag meetings around the calendar to reschedule them.
- **Resize**: Drag the bottom edge of a meeting block to change its duration.
- **View Details**: Click on a meeting to view its details or delete it.

---

## Reports
*Access: Root and Admin users only.*

The **Reports** page provides deep insights into meeting metrics and attendee engagement.
- **Analytics Table**: View meetings breakdown (Started, Canceled, Completed) per attendee.
- **Filtering**: Filter by Attendee Type, Meeting Type, and Tags.
- **Sorting**: Click column headers to sort data.
- **Export**: Generate PDF or CSV reports for offline analysis.

---

## Settings & Data Management
The **Settings** page is the control center for your event configuration.

### Event Configuration
- **Event Name**: The title of your event.
- **Date Range**: The start and end dates for the event.
- **Meeting Tags**: Define tags (e.g., "Internal", "Client", "Urgent") to categorize meetings.
- **Gemini API Key**: Enter your Google Gemini API key here to enable the Auto Complete feature.

### Data Management
Use these tools to backup, restore, or reset your application data.

#### Import / Update
Upload a JSON configuration file (e.g., `event-config.json`) to add new data or update existing entries. This supports importing Settings, Attendees, Rooms, and Meetings.

#### Export Database
Download a full backup of your current database as a JSON file. The filename will include a timestamp (e.g., `event-config-2025-11-23-10-00.json`) for easy versioning.

#### Delete Database
**Warning**: This action permanently removes all Attendees, Rooms, and Meetings from the database. It can also optionally delete Event Settings if configured. Use this feature with caution, preferably after creating an [Export](#export-database).
