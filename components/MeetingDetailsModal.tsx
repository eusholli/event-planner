import { Meeting } from '@/components/MeetingModal'
import MeetingCard from '@/components/MeetingCard'

interface Room {
    id: string
    name: string
}

interface MeetingDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    meeting: Partial<Meeting> | null
    rooms: Room[]
}

export default function MeetingDetailsModal({ isOpen, onClose, meeting, rooms }: MeetingDetailsModalProps) {
    if (!isOpen || !meeting) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div
                className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-1 text-left align-middle shadow-xl transition-all">
                    <MeetingCard
                        meeting={meeting as Meeting}
                        rooms={rooms}
                        className="border-none shadow-none"
                    />
                </div>
            </div>
        </div>
    )
}
