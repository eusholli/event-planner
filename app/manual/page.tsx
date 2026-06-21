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
                    Event Planner helps you run multiple events end to end — attendees,
                    companies, meetings, rooms, and ROI — with built-in AI for chat,
                    market intelligence, and content.
                </p>

                <div className="bg-zinc-50 rounded-xl p-6 mb-12 border border-zinc-200">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">Table of Contents</h2>
                    <ul className="space-y-2">
                        <li><a href="#quick-start" className="text-indigo-600 hover:underline">1. Quick Start</a></li>
                        <li><a href="#roles" className="text-indigo-600 hover:underline">2. Roles & Permissions</a></li>
                        <li><a href="#portfolio" className="text-indigo-600 hover:underline">3. Events Portfolio</a></li>
                        <li><a href="#dashboard" className="text-indigo-600 hover:underline">4. Event Dashboard</a></li>
                        <li><a href="#roi" className="text-indigo-600 hover:underline">5. ROI Management</a></li>
                        <li><a href="#audience" className="text-indigo-600 hover:underline">6. Companies & Attendees</a></li>
                        <li><a href="#meetings" className="text-indigo-600 hover:underline">7. Rooms & Meetings</a></li>
                        <li><a href="#ai" className="text-indigo-600 hover:underline">8. AI Chat & OpenClaw Insights</a></li>
                        <li><a href="#reports" className="text-indigo-600 hover:underline">9. Reports</a></li>
                        <li><a href="#settings" className="text-indigo-600 hover:underline">10. Event Settings</a></li>
                        <li><a href="#admin" className="text-indigo-600 hover:underline">11. Administration</a></li>
                    </ul>
                </div>

                <section id="quick-start" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Quick Start</h2>
                    <p className="text-zinc-600 mb-4">A typical flow for running an event:</p>
                    <ol className="list-decimal pl-6 space-y-2 text-zinc-600">
                        <li><strong>Create the event</strong> on the Events Portfolio (<code>+</code> button). It starts in <strong>Pipeline</strong> status; set dates and location in Event Settings.</li>
                        <li><strong>Build your audience</strong> — add Companies (with pipeline values) and Attendees. Use <strong>Auto Complete</strong> to fill attendee details from a name and company.</li>
                        <li><strong>Set ROI targets</strong> — budget, expected pipeline, engagement targets, and the target companies you want to meet. The <strong>✦ sparkle</strong> buttons can draft a marketing plan and auto-fill these.</li>
                        <li><strong>Add rooms and schedule meetings</strong> via New Meeting or the drag-and-drop Calendar.</li>
                        <li><strong>Move the event to Committed</strong> when confirmed; the Dashboard and ROI tracker update automatically as you log meetings.</li>
                        <li><strong>After the event</strong>, enter manual results on the ROI <strong>Event Results</strong> tab, then set the event to <strong>Occurred</strong> to lock it read-only.</li>
                    </ol>
                </section>

                <section id="roles" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Roles & Permissions</h2>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600">
                        <li><strong>Root</strong> — full system access: system settings, users, and all events.</li>
                        <li><strong>Marketing</strong> — event and user management; access to all events. No system settings.</li>
                        <li><strong>Admin</strong> — create/edit meetings, attendees, and rooms within <em>authorized</em> events. Cannot create or delete events.</li>
                        <li><strong>User</strong> — read-only access within <em>authorized</em> events.</li>
                    </ul>
                    <p className="text-zinc-600 mt-4">Root and Marketing reach every event automatically; Admin and User must be authorized per event (in Event Settings). New users start as <strong>User</strong>.</p>
                </section>

                <section id="portfolio" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Events Portfolio</h2>
                    <p className="text-zinc-600 mb-4">The Events Portfolio is your hub, with <strong>List</strong>, <strong>Calendar</strong>, and <strong>Map</strong> views. Events are color-coded by status:</p>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600 mb-4">
                        <li><strong>Pipeline</strong> (amber) — early planning.</li>
                        <li><strong>Committed</strong> (green) — confirmed and active.</li>
                        <li><strong>Occurred</strong> (grey) — past; all data becomes read-only.</li>
                        <li><strong>Canceled</strong> (red).</li>
                    </ul>
                    <p className="text-zinc-600">Root/Marketing users create events with <code>+</code>, and can edit, delete, or click the <strong>✦</strong> icon to generate an AI marketing plan. Deleting an event auto-backs-up first; meetings and rooms cascade-delete while attendees (system-level) are preserved.</p>
                </section>

                <section id="dashboard" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Event Dashboard</h2>
                    <p className="text-zinc-600 mb-4">The Dashboard shows real-time stats (attendees, meetings, room utilization), a filterable meeting list, and a status breakdown. Export options include <strong>CSV</strong>, a <strong>Briefing Book PDF</strong>, and a <strong>Calendar View PDF</strong>.</p>
                </section>

                <section id="roi" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">ROI Management</h2>
                    <p className="text-zinc-600 mb-4">The ROI page tracks investment targets vs. actual results across three tabs.</p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Tab 1 — Targets & Approval</h3>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600 mb-6">
                        <li><strong>Financial Targets</strong>: Requester Email, Budget, Expected Pipeline, Win Rate (Expected Revenue auto-calculates as Pipeline × Win Rate).</li>
                        <li><strong>Event Targets</strong>: Event Scans, External Leads, Speaking, Media/PR.</li>
                        <li><strong>Target Companies</strong>: the companies you want to meet.</li>
                        <li><strong>Approval</strong>: Draft → Submit for Approval → Approved (a Root/Marketing user approves).</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Tab 2 — Event Results</h3>
                    <p className="text-zinc-600 mb-6">Enter results that cannot be derived from meetings: <strong>Actual Cost</strong> (used as the investment figure if set), <strong>Event Scans</strong>, <strong>Speaking</strong>, and <strong>Media/PR</strong>. External Leads are computed automatically from confirmed/occurred meetings. LinkedIn campaign metrics also appear here.</p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Tab 3 — Performance Tracker</h3>
                    <p className="text-zinc-600 mb-4">A live comparison of targets vs. actuals. Pipeline and Revenue progress rings, engagement gauges, a target-company checklist (plus any Additional Companies met), and a LinkedIn campaign summary. Pipeline is summed from the unique companies in confirmed/occurred meetings.</p>

                    <div className="bg-amber-50 border-l-4 border-amber-400 p-4">
                        <p className="text-amber-700">
                            <strong>✦ Sparkle buttons</strong> auto-fill empty Financial Targets, Event Targets, and Target Companies from the event marketing plan. They require a Google Gemini API key configured in System Administration.
                        </p>
                    </div>
                </section>

                <section id="audience" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Companies & Attendees</h2>
                    <p className="text-zinc-600 mb-4"><strong>Companies</strong> are a shared, system-wide directory. Each company holds a single <strong>Pipeline Value</strong> used in ROI; duplicate names are prevented.</p>
                    <p className="text-zinc-600 mb-4"><strong>Attendees</strong> are also system-level (unique email) and shared across events. Add a name, email, company, and title, plus optional bio, LinkedIn, type, seniority, and photo.</p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">AI Auto Complete</h3>
                    <ol className="list-decimal pl-6 space-y-2 text-zinc-600 mb-6">
                        <li>Enter a <strong>Name</strong> and <strong>Company</strong>.</li>
                        <li>Click <strong>Auto Complete</strong> (✦).</li>
                        <li>Gemini suggests title, bio, LinkedIn URL, and company description — review, then accept.</li>
                    </ol>
                    <p className="text-zinc-600">Each attendee card can also generate a <strong>Briefing Book PDF</strong> or jump to <strong>OpenClaw Insights</strong> for company research.</p>
                </section>

                <section id="meetings" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Rooms & Meetings</h2>
                    <p className="text-zinc-600 mb-4">Create <strong>Rooms</strong> with a name and capacity; each room can produce a briefing-book PDF.</p>

                    <h3 className="text-xl font-semibold text-zinc-900 mb-3">Scheduling</h3>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600 mb-6">
                        <li><strong>New Meeting</strong>: set title, purpose, date/time, room, attendees, type, tags, and status.</li>
                        <li><strong>Calendar</strong>: day/week/month views with drag-and-drop rescheduling. Click a meeting for read-only details, then Edit.</li>
                        <li><strong>Status</strong>: Pipeline → Confirmed → Occurred → Canceled.</li>
                    </ul>

                    <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                        <p className="text-blue-700">
                            <strong>Read-only mode</strong>: when an event reaches <strong>Occurred</strong> status, all meeting and calendar editing is disabled to preserve historical data.
                        </p>
                    </div>
                </section>

                <section id="ai" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">AI Chat & OpenClaw Insights</h2>
                    <p className="text-zinc-600 mb-4"><strong>AI Chat Assistant</strong> (per event) is a Gemini-powered chat that knows your event meetings, attendees, and rooms. Ask it to find meetings, look up attendees, or generate navigation links. History is saved per event.</p>
                    <p className="text-zinc-600"><strong>OpenClaw Insights</strong> is a system-wide market-intelligence agent named Kenji. It streams real-time research, runs scheduled intelligence reports, supports follow-up questions, and lets you download each response as a PDF.</p>
                </section>

                <section id="reports" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Reports</h2>
                    <p className="text-zinc-600">The Reports page provides meeting breakdowns by status and per-attendee engagement counts, with filtering, sorting, and CSV/PDF export.</p>
                </section>

                <section id="settings" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Event Settings</h2>
                    <p className="text-zinc-600 mb-4"><em>Root and Marketing only.</em> Configure event details (name, slug, dates, timezone, region, address, booth location, URL, description, status, password) and per-event Tags, Meeting Types, and Attendee Types.</p>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600">
                        <li><strong>Authorized Users</strong>: grant or revoke Admin/User access with searchable, paginated selection.</li>
                        <li><strong>AI Event Scraper</strong>: auto-fill event details from a URL.</li>
                        <li><strong>Data Management</strong>: export, import, reset, or delete the event (a backup is taken before destructive actions).</li>
                    </ul>
                </section>

                <section id="admin" className="mb-12 scroll-mt-20">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-4">Administration</h2>
                    <ul className="list-disc pl-6 space-y-2 text-zinc-600">
                        <li><strong>System Administration</strong> (Root): Gemini API key, default tags/types, full backup/restore, and factory reset.</li>
                        <li><strong>User Administration</strong> (Root/Marketing): manage roles with search and pagination; delete users.</li>
                        <li><strong>AI Usage Report</strong> (Root): aggregated Gemini usage by function and user, with full prompt histories.</li>
                        <li><strong>Data Ingestion</strong> (Root/Marketing): upload documents (PDF/DOCX/CSV/XLSX) and let Gemini extract Companies, Attendees, and Meetings, with diffing against existing records before saving.</li>
                    </ul>

                    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mt-6">
                        <p className="text-amber-700">
                            <strong>Note</strong>: AI features require a valid Google Gemini API key configured in System Administration.
                        </p>
                    </div>
                </section>
            </article>
        </div >
    )
}
