import Link from 'next/link'

export default function ManualPage() {
    return (
        <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
                <Link href="/" className="text-indigo-600 hover:text-indigo-500 font-medium">
                    &larr; Back to Home
                </Link>
            </div>

            <article className="prose prose-indigo max-w-none">
                <h1 className="text-4xl font-bold text-zinc-900 mb-8">Event Planner User Manual</h1>

                <p className="text-xl text-zinc-600 mb-8">
                    Welcome to the Event Planner application! This guide will help you navigate the features and manage your event effectively.
                </p>

                <div className="bg-zinc-50 rounded-xl p-6 mb-12 border border-zinc-200">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">Table of Contents</h2>
                    <ul className="space-y-2">
                        <li><a href="#meeting-tracker" className="text-indigo-600 hover:underline">1. Meeting Tracker</a></li>
                        <li><a href="#managing-attendees" className="text-indigo-600 hover:underline">2. Managing Attendees</a></li>
                        <li><a href="#auto-complete-feature" className="text-indigo-600 hover:underline">3. Auto Complete Feature</a></li>
                        <li><a href="#scheduling-meetings" className="text-indigo-600 hover:underline">4. Scheduling Meetings</a></li>
                        <li><a href="#settings-data-management" className="text-indigo-600 hover:underline">5. Settings & Data Management</a></li>
                    </ul>
                </div>

                <section id="meeting-tracker" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Meeting Tracker</h2>
                    <p className="text-zinc-600 mb-4">
                        The <strong>Meeting Tracker</strong> is your landing page. It provides a quick overview of your event status, including:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600">
                        <li><strong>Total Attendees</strong>: The number of people registered.</li>
                        <li><strong>Total Meetings</strong>: The number of scheduled sessions.</li>
                        <li><strong>Room Utilization</strong>: How effectively your venue space is being used.</li>
                    </ul>
                </section>

                <section id="managing-attendees" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Managing Attendees</h2>
                    <p className="text-zinc-600 mb-4">
                        Navigate to the <strong>Attendees</strong> page to view and manage your guest list.
                    </p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Adding an Attendee</h3>
                    <ol className="list-decimal pl-6 space-y-2 text-zinc-600 mb-6">
                        <li>Click the <strong>Add Attendee</strong> button.</li>
                        <li>Fill in the details manually, or use the <a href="#auto-complete-feature" className="text-indigo-600 hover:underline">Auto Complete</a> feature.</li>
                        <li>Click <strong>Save</strong> to add them to the list.</li>
                    </ol>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Editing an Attendee</h3>
                    <ol className="list-decimal pl-6 space-y-2 text-zinc-600">
                        <li>Click on an attendee's card in the list.</li>
                        <li>Update their information in the form.</li>
                        <li>Click <strong>Save Changes</strong>.</li>
                    </ol>
                </section>

                <section id="auto-complete-feature" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Auto Complete Feature</h2>
                    <p className="text-zinc-600 mb-4">
                        The application integrates with Google Gemini to help you quickly fill in professional details.
                    </p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">How to use:</h3>
                    <ol className="list-decimal pl-6 space-y-2 text-zinc-600 mb-6">
                        <li>In the "Add Attendee" form, enter a <strong>Name</strong> and <strong>Company</strong>.</li>
                        <li>Click the <strong>Auto Complete</strong> button.</li>
                        <li>The AI will search for the person and suggest their <strong>Title</strong>, <strong>Bio</strong>, <strong>LinkedIn URL</strong>, and <strong>Company Description</strong>.</li>
                        <li>Review the suggestions in the modal and click <strong>Accept & Fill</strong> to populate the form.</li>
                    </ol>

                    <div className="bg-amber-50 border-l-4 border-amber-400 p-4">
                        <p className="text-amber-700">
                            <strong>Note</strong>: This feature requires a valid Google Gemini API Key to be configured in <a href="#settings-data-management" className="text-indigo-600 hover:underline">Settings</a>.
                        </p>
                    </div>
                </section>

                <section id="scheduling-meetings" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Scheduling Meetings</h2>
                    <p className="text-zinc-600 mb-4">
                        Navigate to the <strong>Schedule</strong> page to organize your event agenda.
                    </p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Creating a Meeting</h3>
                    <ol className="list-decimal pl-6 space-y-2 text-zinc-600 mb-6">
                        <li>Click <strong>New Meeting</strong> in the navigation or <strong>Schedule Meeting</strong> on the Meeting Tracker.</li>
                        <li>Enter a <strong>Title</strong> and <strong>Purpose</strong>.</li>
                        <li>(Optional) Select <strong>Tags</strong> to categorize the meeting.</li>
                        <li>Select a <strong>Room</strong>.</li>
                        <li>Choose <strong>Attendees</strong> from the list.</li>
                        <li>Set the <strong>Date</strong>, <strong>Start Time</strong>, and <strong>Duration</strong>.</li>
                        <li>Select the <strong>Status</strong> (Started, Completed, Canceled).</li>
                        <li>Click <strong>Book Meeting</strong>.</li>
                    </ol>

                    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                        <p className="text-blue-700">
                            <strong>Note</strong>: After booking, you will stay on the page to easily book another meeting. A success message will appear at the top.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Meeting Tags</h3>
                    <p className="text-zinc-600 mb-4">You can categorize your meetings using tags.</p>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600 mb-6">
                        <li><strong>Managing Tags</strong>: Go to <a href="#settings-data-management" className="text-indigo-600 hover:underline">Settings</a> to add or remove tags.</li>
                        <li><strong>Assigning Tags</strong>: When creating or editing a meeting, select one or more tags from the dropdown.</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Managing the Schedule</h3>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600">
                        <li><strong>Drag and Drop</strong>: You can drag meetings around the calendar to reschedule them.</li>
                        <li><strong>Resize</strong>: Drag the bottom edge of a meeting block to change its duration.</li>
                        <li><strong>View Details</strong>: Click on a meeting to view its details or delete it.</li>
                    </ul>
                </section>

                <section id="settings-data-management" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Settings & Data Management</h2>
                    <p className="text-zinc-600 mb-4">
                        The <strong>Settings</strong> page is the control center for your event configuration.
                    </p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Event Configuration</h3>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600 mb-6">
                        <li><strong>Event Name</strong>: The title of your event.</li>
                        <li><strong>Date Range</strong>: The start and end dates for the event.</li>
                        <li><strong>Meeting Tags</strong>: Define tags (e.g., "Internal", "Client", "Urgent") to categorize meetings.</li>
                        <li><strong>Gemini API Key</strong>: Enter your Google Gemini API key here to enable the Auto Complete feature.</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Data Management</h3>
                    <p className="text-zinc-600 mb-4">Use these tools to backup, restore, or reset your application data.</p>

                    <div className="space-y-4">
                        <div>
                            <h4 className="font-semibold text-zinc-900">Import / Update</h4>
                            <p className="text-zinc-600">Upload a JSON configuration file (e.g., <code>event-config.json</code>) to add new data or update existing entries. This supports importing Settings, Attendees, Rooms, and Meetings.</p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-zinc-900">Export Database</h4>
                            <p className="text-zinc-600">Download a full backup of your current database as a JSON file. The filename will include a timestamp for easy versioning.</p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-zinc-900">Delete Database</h4>
                            <p className="text-zinc-600">
                                <span className="text-red-600 font-bold">Warning</span>: This action permanently removes all Attendees, Rooms, and Meetings from the database. It can also optionally delete Event Settings if configured. Use this feature with caution, preferably after creating an Export.
                            </p>
                        </div>
                    </div>
                </section>
            </article>
        </div>
    )
}
