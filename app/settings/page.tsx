'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const TIMEZONE_DATA = [
    { abbr: 'ACDT', name: 'Australian Central Dayling Time' },
    { abbr: 'ACST', name: 'Australian Central Standard Time' },
    { abbr: 'ACT', name: 'Acre Time' },
    { abbr: 'ACT', name: 'ASEAN Common Time' },
    { abbr: 'ADT', name: 'Atlantic Daylight Time' },
    { abbr: 'AEDT', name: 'Australian Eastern Daylight Time' },
    { abbr: 'AEST', name: 'Australian Eastern Standard Time' },
    { abbr: 'AFT', name: 'Afghanistan Time' },
    { abbr: 'AKDT', name: 'Alaska Daylight Time' },
    { abbr: 'AKST', name: 'Alaska Standard Time' },
    { abbr: 'ALMT', name: 'Alma-Ata Time' },
    { abbr: 'AMST', name: 'Amazon Summer Time' },
    { abbr: 'AMT', name: 'Amazon Time' },
    { abbr: 'AMT', name: 'Armenia Time' },
    { abbr: 'ANAT', name: 'Anadyr Time' },
    { abbr: 'AQTT', name: 'Aqtobe Time' },
    { abbr: 'ART', name: 'Argentina Time' },
    { abbr: 'AST', name: 'Arabia Standard Time' },
    { abbr: 'AST', name: 'Atlantic Standard Time' },
    { abbr: 'AWST', name: 'Australian Western Standard Time' },
    { abbr: 'AZOST', name: 'Azores Summer Time' },
    { abbr: 'AZOT', name: 'Azores Standard Time' },
    { abbr: 'AZT', name: 'Azerbaijan Time' },
    { abbr: 'BDT', name: 'Brunei Time' },
    { abbr: 'BIOT', name: 'British Indian Ocean Time' },
    { abbr: 'BIT', name: 'Baker Island Time' },
    { abbr: 'BOT', name: 'Bolivia Time' },
    { abbr: 'BRST', name: 'Brasilia Summer Time' },
    { abbr: 'BRT', name: 'Brasilia Time' },
    { abbr: 'BST', name: 'Bangladesh Standard Time' },
    { abbr: 'BST', name: 'Bougainville Standard Time' },
    { abbr: 'BST', name: 'British Summer Time' },
    { abbr: 'BTT', name: 'Bhutan Time' },
    { abbr: 'CAT', name: 'Central Africa Time' },
    { abbr: 'CCT', name: 'Cocos Islands Time' },
    { abbr: 'CDT', name: 'Central Daylight Time' },
    { abbr: 'CDT', name: 'Cuba Daylight Time' },
    { abbr: 'CEST', name: 'Central European Summer Time' },
    { abbr: 'CET', name: 'Central European Time' },
    { abbr: 'CHADT', name: 'Chatham Island Daylight Time' },
    { abbr: 'CHAST', name: 'Chatham Island Standard Time' },
    { abbr: 'CHOT', name: 'Choibalsan Time' },
    { abbr: 'CHOST', name: 'Choibalsan Summer Time' },
    { abbr: 'CHST', name: 'Chamorro Standard Time' },
    { abbr: 'CHUT', name: 'Chuuk Time' },
    { abbr: 'CIST', name: 'Clipperton Island Standard Time' },
    { abbr: 'CIT', name: 'Central Indonesia Time' },
    { abbr: 'CKT', name: 'Cook Island Time' },
    { abbr: 'CLST', name: 'Chile Summer Time' },
    { abbr: 'CLT', name: 'Chile Standard Time' },
    { abbr: 'COST', name: 'Colombia Summer Time' },
    { abbr: 'COT', name: 'Colombia Time' },
    { abbr: 'CST', name: 'Central Standard Time' },
    { abbr: 'CST', name: 'China Standard Time' },
    { abbr: 'CST', name: 'Cuba Standard Time' },
    { abbr: 'CT', name: 'China Time' },
    { abbr: 'CVT', name: 'Cape Verde Time' },
    { abbr: 'CWST', name: 'Central Western Standard Time' },
    { abbr: 'CXT', name: 'Christmas Island Time' },
    { abbr: 'DAVT', name: 'Davis Time' },
    { abbr: 'DDUT', name: 'Dumont d\'Urville Time' },
    { abbr: 'DFT', name: 'AIX-specific equivalent of Central European Time' },
    { abbr: 'DMT', name: 'AIX-specific equivalent of Mountain Time' },
    { abbr: 'EASST', name: 'Easter Island Summer Time' },
    { abbr: 'EAST', name: 'Easter Island Standard Time' },
    { abbr: 'EAT', name: 'East Africa Time' },
    { abbr: 'ECT', name: 'Eastern Caribbean Time' },
    { abbr: 'ECT', name: 'Ecuador Time' },
    { abbr: 'EDT', name: 'Eastern Daylight Time' },
    { abbr: 'EEST', name: 'Eastern European Summer Time' },
    { abbr: 'EET', name: 'Eastern European Time' },
    { abbr: 'EGST', name: 'Eastern Greenland Summer Time' },
    { abbr: 'EGT', name: 'Eastern Greenland Time' },
    { abbr: 'EIT', name: 'Eastern Indonesian Time' },
    { abbr: 'EST', name: 'Eastern Standard Time' },
    { abbr: 'FET', name: 'Further-eastern European Time' },
    { abbr: 'FJT', name: 'Fiji Time' },
    { abbr: 'FKST', name: 'Falkland Islands Summer Time' },
    { abbr: 'FKT', name: 'Falkland Islands Time' },
    { abbr: 'FNT', name: 'Fernando de Noronha Time' },
    { abbr: 'GALT', name: 'Galapagos Time' },
    { abbr: 'GAMT', name: 'Gambier Islands Time' },
    { abbr: 'GET', name: 'Georgia Standard Time' },
    { abbr: 'GFT', name: 'French Guiana Time' },
    { abbr: 'GILT', name: 'Gilbert Island Time' },
    { abbr: 'GIT', name: 'Gambier Island Time' },
    { abbr: 'GMT', name: 'Greenwich Mean Time' },
    { abbr: 'GST', name: 'South Georgia and the South Sandwich Islands Time' },
    { abbr: 'GST', name: 'Gulf Standard Time' },
    { abbr: 'GYT', name: 'Guyana Time' },
    { abbr: 'HDT', name: 'Hawaii-Aleutian Daylight Time' },
    { abbr: 'HAEC', name: 'Heure Avancee d\'Europe Centrale' },
    { abbr: 'HST', name: 'Hawaii-Aleutian Standard Time' },
    { abbr: 'HKT', name: 'Hong Kong Time' },
    { abbr: 'HMT', name: 'Heard and McDonald Islands Time' },
    { abbr: 'HOVT', name: 'Hovd Time' },
    { abbr: 'ICT', name: 'Indochina Time' },
    { abbr: 'IDT', name: 'Israel Daylight Time' },
    { abbr: 'IOT', name: 'Indian Ocean Time' },
    { abbr: 'IRDT', name: 'Iran Daylight Time' },
    { abbr: 'IRKT', name: 'Irkutsk Time' },
    { abbr: 'IRST', name: 'Iran Standard Time' },
    { abbr: 'IST', name: 'Indian Standard Time' },
    { abbr: 'IST', name: 'Irish Standard Time' },
    { abbr: 'IST', name: 'Israel Standard Time' },
    { abbr: 'JST', name: 'Japan Standard Time' },
    { abbr: 'KALT', name: 'Kaliningrad Time' },
    { abbr: 'KGT', name: 'Kyrgyzstan Time' },
    { abbr: 'KOST', name: 'Kosrae Time' },
    { abbr: 'KRAT', name: 'Krasnoyarsk Time' },
    { abbr: 'KST', name: 'Korea Standard Time' },
    { abbr: 'LHST', name: 'Lord Howe Standard Time' },
    { abbr: 'LINT', name: 'Line Islands Time' },
    { abbr: 'MAGT', name: 'Magadan Time' },
    { abbr: 'MART', name: 'Marquesas Islands Time' },
    { abbr: 'MAWT', name: 'Mawson Station Time' },
    { abbr: 'MDT', name: 'Mountain Daylight Time' },
    { abbr: 'MET', name: 'Middle European Time' },
    { abbr: 'MEST', name: 'Middle European Summer Time' },
    { abbr: 'MHT', name: 'Marshall Islands Time' },
    { abbr: 'MIST', name: 'Macquarie Island Station Time' },
    { abbr: 'MIT', name: 'Marquesas Islands Time' },
    { abbr: 'MMT', name: 'Myanmar Time' },
    { abbr: 'MSK', name: 'Moscow Time' },
    { abbr: 'MST', name: 'Malaysia Standard Time' },
    { abbr: 'MST', name: 'Mountain Standard Time' },
    { abbr: 'MUT', name: 'Mauritius Time' },
    { abbr: 'MVT', name: 'Maldives Time' },
    { abbr: 'MYT', name: 'Malaysia Time' },
    { abbr: 'NCT', name: 'New Caledonia Time' },
    { abbr: 'NDT', name: 'Newfoundland Daylight Time' },
    { abbr: 'NFT', name: 'Norfolk Time' },
    { abbr: 'NOVT', name: 'Novosibirsk Time' },
    { abbr: 'NPT', name: 'Nepal Time' },
    { abbr: 'NST', name: 'Newfoundland Standard Time' },
    { abbr: 'NT', name: 'Newfoundland Time' },
    { abbr: 'NUT', name: 'Niue Time' },
    { abbr: 'NZDT', name: 'New Zealand Daylight Time' },
    { abbr: 'NZST', name: 'New Zealand Standard Time' },
    { abbr: 'OMST', name: 'Omsk Time' },
    { abbr: 'ORAT', name: 'Oral Time' },
    { abbr: 'PDT', name: 'Pacific Daylight Time' },
    { abbr: 'PET', name: 'Peru Time' },
    { abbr: 'PETT', name: 'Kamchatka Time' },
    { abbr: 'PGT', name: 'Papua New Guinea Time' },
    { abbr: 'PHOT', name: 'Phoenix Island Time' },
    { abbr: 'PHT', name: 'Philippine Time' },
    { abbr: 'PKT', name: 'Pakistan Standard Time' },
    { abbr: 'PMDT', name: 'Saint Pierre and Miquelon Daylight Time' },
    { abbr: 'PMST', name: 'Saint Pierre and Miquelon Standard Time' },
    { abbr: 'PONT', name: 'Pohnpei Standard Time' },
    { abbr: 'PST', name: 'Pacific Standard Time' },
    { abbr: 'PST', name: 'Philippine Standard Time' },
    { abbr: 'PYST', name: 'Paraguay Summer Time' },
    { abbr: 'PYT', name: 'Paraguay Time' },
    { abbr: 'RET', name: 'Reunion Time' },
    { abbr: 'ROTT', name: 'Rothera Research Station Time' },
    { abbr: 'SAKT', name: 'Sakhalin Island Time' },
    { abbr: 'SAMT', name: 'Samara Time' },
    { abbr: 'SAST', name: 'South African Standard Time' },
    { abbr: 'SBT', name: 'Solomon Islands Time' },
    { abbr: 'SCT', name: 'Seychelles Time' },
    { abbr: 'SDT', name: 'Samoa Daylight Time' },
    { abbr: 'SGT', name: 'Singapore Time' },
    { abbr: 'SLST', name: 'Sri Lanka Standard Time' },
    { abbr: 'SRET', name: 'Srednekolymsk Time' },
    { abbr: 'SRT', name: 'Suriname Time' },
    { abbr: 'SST', name: 'Samoa Standard Time' },
    { abbr: 'SST', name: 'Singapore Standard Time' },
    { abbr: 'SYOT', name: 'Showa Station Time' },
    { abbr: 'TAHT', name: 'Tahiti Time' },
    { abbr: 'THA', name: 'Thailand Standard Time' },
    { abbr: 'TFT', name: 'Indian/Kerguelen' },
    { abbr: 'TJT', name: 'Tajikistan Time' },
    { abbr: 'TKT', name: 'Tokelau Time' },
    { abbr: 'TLT', name: 'Timor Leste Time' },
    { abbr: 'TMT', name: 'Turkmenistan Time' },
    { abbr: 'TRT', name: 'Turkey Time' },
    { abbr: 'TOT', name: 'Tonga Time' },
    { abbr: 'TVT', name: 'Tuvalu Time' },
    { abbr: 'ULAST', name: 'Ulaanbaatar Summer Time' },
    { abbr: 'ULAT', name: 'Ulaanbaatar Standard Time' },
    { abbr: 'UTC', name: 'Coordinated Universal Time' },
    { abbr: 'UYST', name: 'Uruguay Summer Time' },
    { abbr: 'UYT', name: 'Uruguay Standard Time' },
    { abbr: 'UZT', name: 'Uzbekistan Time' },
    { abbr: 'VET', name: 'Venezuelan Standard Time' },
    { abbr: 'VLAT', name: 'Vladivostok Time' },
    { abbr: 'VOLT', name: 'Volgograd Time' },
    { abbr: 'VOST', name: 'Vostok Station Time' },
    { abbr: 'VUT', name: 'Vanuatu Time' },
    { abbr: 'WAKT', name: 'Wake Island Time' },
    { abbr: 'WAST', name: 'West Africa Summer Time' },
    { abbr: 'WAT', name: 'West Africa Time' },
    { abbr: 'WEST', name: 'Western European Summer Time' },
    { abbr: 'WET', name: 'Western European Time' },
    { abbr: 'WIT', name: 'Western Indonesian Time' },
    { abbr: 'WST', name: 'Western Standard Time' },
    { abbr: 'YAKT', name: 'Yakutsk Time' },
    { abbr: 'YEKT', name: 'Yekaterinburg Time' },
]

export default function SettingsPage() {
    const router = useRouter()
    const [name, setName] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [geminiApiKey, setGeminiApiKey] = useState('')
    const [tags, setTags] = useState('')
    const [meetingTypes, setMeetingTypes] = useState('')
    const [attendeeTypes, setAttendeeTypes] = useState('')
    const [timezone, setTimezone] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setName(data.name)
                setStartDate(data.startDate) // Already in YYYY-MM-DD format
                setEndDate(data.endDate) // Already in YYYY-MM-DD format
                setGeminiApiKey(data.geminiApiKey || '')
                setTags(data.tags ? data.tags.join(', ') : '')
                setMeetingTypes(data.meetingTypes ? data.meetingTypes.join(', ') : '')
                setAttendeeTypes(data.attendeeTypes ? data.attendeeTypes.join(', ') : '')
                setTimezone(data.timezone || '')
                setLoading(false)
            })
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    startDate, // Send as YYYY-MM-DD string
                    endDate, // Send as YYYY-MM-DD string
                    geminiApiKey,
                    tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
                    meetingTypes: meetingTypes.split(',').map(t => t.trim()).filter(t => t !== ''),
                    attendeeTypes: attendeeTypes.split(',').map(t => t.trim()).filter(t => t !== ''),
                    timezone,
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setName(data.name)
                setStartDate(data.startDate) // Already in YYYY-MM-DD format
                setEndDate(data.endDate) // Already in YYYY-MM-DD format
                setGeminiApiKey(data.geminiApiKey || '')
                setTags(data.tags ? data.tags.join(', ') : '')
                setAttendeeTypes(data.attendeeTypes ? data.attendeeTypes.join(', ') : '')
                setTimezone(data.timezone || '')

                alert('Settings saved successfully!')
                router.refresh()
            } else {
                alert('Failed to save settings')
            }
        } catch (error) {
            console.error(error)
            alert('An error occurred')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8">Loading settings...</div>

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-900 mb-8">Event Configuration</h1>

            <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="eventName" className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                        <input
                            type="text"
                            id="eventName"
                            required
                            className="input-field"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                            <input
                                type="date"
                                id="startDate"
                                required
                                className="input-field"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                            <input
                                type="date"
                                id="endDate"
                                required
                                className="input-field"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>


                    <div>
                        <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                        <select
                            id="timezone"
                            className="input-field"
                            value={timezone}
                            onChange={e => setTimezone(e.target.value)}
                        >
                            <option value="">Select a timezone...</option>
                            {[...TIMEZONE_DATA].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                                <option key={`${t.abbr}-${t.name}`} value={t.abbr}>{t.name} ({t.abbr})</option>
                            ))}
                        </select>
                        <p className="mt-1 text-sm text-slate-500">The timezone for the event.</p>
                    </div>

                    <div>
                        <label htmlFor="geminiApiKey" className="block text-sm font-medium text-slate-700 mb-1">Google Gemini API Key</label>
                        <input
                            type="password"
                            id="geminiApiKey"
                            className="input-field"
                            value={geminiApiKey}
                            onChange={e => setGeminiApiKey(e.target.value)}
                            placeholder="Enter your Gemini API Key"
                        />
                        <p className="mt-1 text-sm text-slate-500">Required for Auto Complete features.</p>
                    </div>

                    <div>
                        <label htmlFor="tags" className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
                        <input
                            type="text"
                            id="tags"
                            className="input-field"
                            value={tags}
                            onChange={e => setTags(e.target.value)}
                            placeholder="e.g. Urgent, Work, Personal"
                        />
                        <p className="mt-1 text-sm text-slate-500">Define tags that can be assigned to meetings.</p>
                    </div>

                    <div>
                        <label htmlFor="meetingTypes" className="block text-sm font-medium text-slate-700 mb-1">Meeting Types (comma separated)</label>
                        <input
                            type="text"
                            id="meetingTypes"
                            className="input-field"
                            value={meetingTypes}
                            onChange={e => setMeetingTypes(e.target.value)}
                            placeholder="e.g. Sales, Internal, Vendor"
                        />
                        <p className="mt-1 text-sm text-slate-500">Define meeting types available for selection.</p>
                    </div>

                    <div>
                        <label htmlFor="attendeeTypes" className="block text-sm font-medium text-slate-700 mb-1">Attendee Types (comma separated)</label>
                        <input
                            type="text"
                            id="attendeeTypes"
                            className="input-field"
                            value={attendeeTypes}
                            onChange={e => setAttendeeTypes(e.target.value)}
                            placeholder="e.g. VIP, Speaker, Guest"
                        />
                        <p className="mt-1 text-sm text-slate-500">Define possible attendee types available for selection.</p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-primary"
                        >
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </form>
            </div >

            <div className="mt-8 bg-white shadow-sm rounded-xl border border-slate-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Data Management</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Import */}
                    <div className="flex flex-col h-full space-y-2">
                        <h3 className="font-medium text-slate-900">Import / Update</h3>
                        <p className="text-sm text-slate-500">Upload a config file to add or update data.</p>
                        <input
                            type="file"
                            accept=".json"
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mt-auto"
                            onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return

                                if (!confirm('This will import data from the selected file. Continue?')) {
                                    e.target.value = ''
                                    return
                                }

                                const formData = new FormData()
                                formData.append('file', file)

                                try {
                                    const res = await fetch('/api/settings/import', {
                                        method: 'POST',
                                        body: formData
                                    })
                                    if (res.ok) {
                                        alert('Data imported successfully!')
                                        router.refresh()
                                    } else {
                                        alert('Failed to import data')
                                    }
                                } catch (error) {
                                    console.error(error)
                                    alert('Import failed')
                                }
                                e.target.value = ''
                            }}
                        />
                    </div>

                    {/* Export */}
                    <div className="flex flex-col h-full space-y-2">
                        <h3 className="font-medium text-slate-900">Export Database</h3>
                        <p className="text-sm text-slate-500">Download current data as JSON.</p>
                        <button
                            onClick={() => window.open('/api/settings/export', '_blank')}
                            className="w-full py-2 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mt-auto"
                        >
                            Export Data
                        </button>
                    </div>

                    {/* Delete */}
                    <div className="flex flex-col h-full space-y-2">
                        <h3 className="font-medium text-red-600">Danger Zone</h3>
                        <p className="text-sm text-slate-500">Permanently delete all data.</p>
                        <button
                            onClick={async () => {
                                if (confirm('WARNING: This will delete ALL Attendees, Rooms, Meetings, and Event Settings. This action cannot be undone. Are you sure?')) {
                                    try {
                                        // 1. Export
                                        const exportRes = await fetch('/api/settings/export')
                                        if (!exportRes.ok) throw new Error('Export failed')

                                        const blob = await exportRes.blob()
                                        const url = window.URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = url

                                        // Get filename from header or default
                                        const contentDisposition = exportRes.headers.get('Content-Disposition')
                                        let filename = 'event-config-backup.json'
                                        if (contentDisposition) {
                                            const match = contentDisposition.match(/filename="?([^"]+)"?/)
                                            if (match && match[1]) filename = match[1]
                                        }
                                        a.download = filename
                                        document.body.appendChild(a)
                                        a.click()
                                        window.URL.revokeObjectURL(url)
                                        document.body.removeChild(a)

                                        // 2. Delete
                                        const res = await fetch('/api/settings/delete-data', { method: 'DELETE' })
                                        if (res.ok) {
                                            alert('Database exported and cleared successfully')
                                            router.refresh()
                                        } else {
                                            alert('Failed to clear database')
                                        }
                                    } catch (error) {
                                        console.error(error)
                                        alert('Delete failed')
                                    }
                                }
                            }}
                            className="w-full py-2 px-4 border border-red-300 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 mt-auto"
                        >
                            Delete Database
                        </button>
                    </div>
                </div>
            </div>
        </div >
    )
}
