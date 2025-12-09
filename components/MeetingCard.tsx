import { Meeting } from '@/components/MeetingModal'
import { generateBriefingBook } from '@/lib/briefing-book'
import moment from 'moment'

interface Room {
    id: string
    name: string
}

interface MeetingCardProps {
    meeting: Meeting & {
        start?: Date | null
        end?: Date | null
        room?: Room
        resourceId?: string
    }
    rooms: Room[]
    onClick?: (e: React.MouseEvent) => void
    onDoubleClick?: (e: React.MouseEvent) => void
    className?: string
}

export default function MeetingCard({ meeting, rooms, onClick, onDoubleClick, className = '' }: MeetingCardProps) {

    const getStatusBadge = (status: string) => {
        const statusConfig: Record<string, { label: string; className: string }> = {
            STARTED: { label: 'Started', className: 'bg-blue-50 text-blue-700 border-blue-200' },
            COMPLETED: { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
            CANCELED: { label: 'Canceled', className: 'bg-gray-50 text-gray-700 border-gray-200' },
        }
        const config = statusConfig[status] || statusConfig.STARTED
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                {config.label}
            </span>
        )
    }

    return (
        <div
            className={`bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-zinc-200 transition-all cursor-pointer group ${className}`}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
        >
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 text-xs text-zinc-500 mb-2">
                        <span className="font-medium text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md">
                            {meeting.date ? moment(meeting.date).format('ddd, MMM D') : (meeting.start ? moment(meeting.start).format('ddd, MMM D') : 'No Date')}
                        </span>
                        <span className="text-zinc-300">•</span>
                        <span>
                            {meeting.startTime && meeting.endTime
                                ? `${moment(meeting.startTime, 'HH:mm').format('h:mm A')} - ${moment(meeting.endTime, 'HH:mm').format('h:mm A')}`
                                : (meeting.start && meeting.end ? `${moment(meeting.start).format('h:mm A')} - ${moment(meeting.end).format('h:mm A')}` : 'No Time')}
                        </span>
                        <span className="text-zinc-300">•</span>
                        <span className="flex items-center text-zinc-600">
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            {rooms.find(r => r.id === meeting.resourceId)?.name || 'No Room'}
                        </span>
                        {meeting.meetingType && (
                            <>
                                <span className="text-zinc-300">•</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {meeting.meetingType}
                                </span>
                            </>
                        )}
                        {meeting.isApproved && (
                            <>
                                <span className="text-zinc-300">•</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                    Approved
                                </span>
                            </>
                        )}
                        {meeting.calendarInviteSent && (
                            <>
                                <span className="text-zinc-300">•</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                    Invite Sent
                                </span>
                            </>
                        )}
                        <span className="text-zinc-300">•</span>
                        {getStatusBadge(meeting.status)}
                    </div>

                    <h3 className="text-lg font-bold text-zinc-900 tracking-tight group-hover:text-indigo-600 transition-colors truncate">
                        {meeting.title}
                    </h3>

                    {meeting.purpose && (
                        <p className="mt-1 text-sm text-zinc-500 line-clamp-1">{meeting.purpose}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                        {meeting.attendees && meeting.attendees.length > 0 && (
                            <div className="text-sm text-zinc-600 mr-2">
                                {meeting.attendees.slice(0, 3).map(a => a.name).join(', ')}
                                {meeting.attendees.length > 3 && <span className="text-zinc-400 ml-1">+{meeting.attendees.length - 3} more</span>}
                            </div>
                        )}
                        {meeting.tags && meeting.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-50 text-zinc-600 border border-zinc-100">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col justify-center pl-4 border-l border-zinc-100">
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            const roomName = rooms.find(r => r.id === meeting.resourceId)?.name || 'Unknown Room'
                            generateBriefingBook(meeting, roomName)
                        }}
                        className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Export Briefing"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}
