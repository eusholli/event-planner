import { Meeting } from '@/components/MeetingModal'
import moment from 'moment'
import { Calendar, Clock, MapPin, Users, Building, Tag, Info, UserCheck, Mail, Send, CheckCircle2 } from 'lucide-react'

interface Room {
    id: string
    name: string
}

interface MeetingDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    meeting: Partial<Meeting> | null
    rooms: Room[]
    onEdit?: () => void
}

export default function MeetingDetailsModal({ isOpen, onClose, meeting, rooms, onEdit }: MeetingDetailsModalProps) {
    if (!isOpen || !meeting) return null

    const roomName = meeting.location ? meeting.location : (rooms.find(r => r.id === meeting.resourceId)?.name || 'Unknown Room')

    const getStatusBadge = (status?: string) => {
        if (!status) return null
        const statusConfig: Record<string, { label: string; className: string }> = {
            PIPELINE: { label: 'Pipeline', className: 'bg-blue-50 text-blue-700 border-blue-200' },
            CONFIRMED: { label: 'Confirmed', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            OCCURRED: { label: 'Occurred', className: 'bg-green-50 text-green-700 border-green-200' },
            CANCELED: { label: 'Canceled', className: 'bg-gray-50 text-gray-700 border-gray-200' },
        }
        const config = statusConfig[status] || statusConfig.PIPELINE
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                {config.label}
            </span>
        )
    }

    const internalAttendees = meeting.attendees?.filter(a => !a.isExternal) || []
    const externalAttendees = meeting.attendees?.filter(a => a.isExternal) || []

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div
                className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative w-full max-w-2xl transform overflow-hidden rounded-3xl bg-white text-left align-middle shadow-xl transition-all flex flex-col max-h-[90vh]">

                    {/* Header */}
                    <div className="px-6 py-5 border-b border-zinc-100 bg-white sticky top-0 z-10">
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-zinc-900 leading-tight">
                                    {meeting.title}
                                </h3>
                                <div className="mt-2 flex flex-wrap gap-2 items-center text-sm text-zinc-500">
                                    {getStatusBadge(meeting.status)}
                                    {meeting.meetingType && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                                            {meeting.meetingType}
                                        </span>
                                    )}
                                    {meeting.isApproved && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-50 text-green-700 border border-green-100 uppercase tracking-wider">
                                            Approved
                                        </span>
                                    )}
                                    {meeting.calendarInviteSent && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100 uppercase tracking-wider">
                                            Invite Sent
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-5 overflow-y-auto custom-scrollbar flex-1 bg-zinc-50/30">
                        <div className="space-y-6 flex flex-col">

                            {/* Time & Location Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm flex items-start gap-3">
                                    <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600 shrink-0">
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-zinc-500 mb-0.5">Date</div>
                                        <div className="text-sm font-medium text-zinc-900">
                                            {meeting.date ? moment(meeting.date).format('dddd, MMMM D, YYYY') : (meeting.startTime ? moment(meeting.startTime, 'HH:mm').format('dddd, MMMM D, YYYY') : 'No Date')}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm flex items-start gap-3">
                                    <div className="bg-blue-50 p-2 rounded-xl text-blue-600 shrink-0">
                                        <Clock className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-zinc-500 mb-0.5">Time</div>
                                        <div className="text-sm font-medium text-zinc-900">
                                            {meeting.startTime && meeting.endTime
                                                ? `${moment(meeting.startTime, 'HH:mm').format('h:mm A')} - ${moment(meeting.endTime, 'HH:mm').format('h:mm A')}`
                                                : 'No Time'}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm flex items-start gap-3 md:col-span-2">
                                    <div className="bg-amber-50 p-2 rounded-xl text-amber-600 shrink-0">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-zinc-500 mb-0.5">Location / Room</div>
                                        <div className="text-sm font-medium text-zinc-900">
                                            {roomName}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Details Section */}
                            <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm space-y-5">
                                {meeting.purpose && (
                                    <div>
                                        <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Info className="w-4 h-4 text-zinc-400" />
                                            Purpose
                                        </div>
                                        <div className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                                            {meeting.purpose}
                                        </div>
                                    </div>
                                )}

                                {meeting.otherDetails && (
                                    <div>
                                        <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-2">
                                            Other Details
                                        </div>
                                        <div className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                                            {meeting.otherDetails}
                                        </div>
                                    </div>
                                )}

                                {(meeting.requesterEmail || meeting.createdBy) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-50">
                                        {meeting.requesterEmail && (
                                            <div>
                                                <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                    <Mail className="w-3.5 h-3.5 text-zinc-400" />
                                                    Requester
                                                </div>
                                                <div className="text-sm text-zinc-600">{meeting.requesterEmail}</div>
                                            </div>
                                        )}
                                        {meeting.createdBy && (
                                            <div>
                                                <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                    <UserCheck className="w-3.5 h-3.5 text-zinc-400" />
                                                    Created By
                                                </div>
                                                <div className="text-sm text-zinc-600">{meeting.createdBy}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {meeting.tags && meeting.tags.length > 0 && (
                                    <div className="pt-2 border-t border-zinc-50">
                                        <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Tag className="w-3.5 h-3.5 text-zinc-400" />
                                            Tags
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {meeting.tags.map(tag => (
                                                <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Attendees Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm">
                                    <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <Users className="w-4 h-4 text-indigo-500" />
                                        Internal Attendees ({internalAttendees.length})
                                    </div>
                                    {internalAttendees.length > 0 ? (
                                        <div className="space-y-3">
                                            {internalAttendees.map(a => (
                                                <div key={a.id} className="flex flex-col">
                                                    <span className="text-sm font-medium text-zinc-900">{a.name}</span>
                                                    {(a.title || a.company?.name || a.email) && (
                                                        <span className="text-xs text-zinc-500 truncate">
                                                            {[a.title, a.company?.name, a.email].filter(Boolean).join(' • ')}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-zinc-400 italic">None</div>
                                    )}
                                </div>

                                <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm">
                                    <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <Building className="w-4 h-4 text-emerald-500" />
                                        External Attendees ({externalAttendees.length})
                                    </div>
                                    {externalAttendees.length > 0 ? (
                                        <div className="space-y-3">
                                            {externalAttendees.map(a => (
                                                <div key={a.id} className="flex flex-col">
                                                    <span className="text-sm font-medium text-zinc-900">{a.name}</span>
                                                    {(a.title || a.company?.name || a.email) && (
                                                        <span className="text-xs text-zinc-500 truncate">
                                                            {[a.title, a.company?.name, a.email].filter(Boolean).join(' • ')}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-zinc-400 italic">None</div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-zinc-100 bg-white sticky bottom-0 rounded-b-3xl shrink-0 flex justify-end gap-3 items-center">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 bg-white text-zinc-700 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 rounded-xl font-medium transition-colors"
                        >
                            Close
                        </button>
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-medium transition-colors shadow-sm"
                            >
                                Edit Meeting
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
