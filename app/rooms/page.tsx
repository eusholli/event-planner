'use client'

import { useState, useEffect } from 'react'
import { generateMultiMeetingBriefingBook } from '@/lib/briefing-book'

interface Room {
    id: string
    name: string
    capacity: number
}

export default function RoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([])
    const [formData, setFormData] = useState({
        name: '',
        capacity: ''
    })
    const [loading, setLoading] = useState(false)

    // Edit State
    const [editingRoom, setEditingRoom] = useState<Room | null>(null)
    const [editFormData, setEditFormData] = useState({
        name: '',
        capacity: ''
    })
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)

    useEffect(() => {
        fetchRooms()
    }, [])

    const fetchRooms = async () => {
        const res = await fetch('/api/rooms')
        const data = await res.json()
        setRooms(data)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            })
            if (res.ok) {
                setFormData({ name: '', capacity: '' })
                fetchRooms()
            }
        } catch (error) {
            console.error('Error adding room:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this room?')) return

        try {
            const res = await fetch(`/api/rooms/${id}`, {
                method: 'DELETE',
            })
            if (res.ok) {
                fetchRooms()
            } else {
                alert('Failed to delete room')
            }
        } catch (error) {
            console.error('Error deleting room:', error)
        }
    }

    const openEditModal = (room: Room) => {
        setEditingRoom(room)
        setEditFormData({
            name: room.name,
            capacity: room.capacity.toString()
        })
        setIsEditModalOpen(true)
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingRoom) return

        try {
            const res = await fetch(`/api/rooms/${editingRoom.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData),
            })
            if (res.ok) {
                setIsEditModalOpen(false)
                setEditingRoom(null)
                fetchRooms()
            } else {
                alert('Failed to update room')
            }
        } catch (error) {
            console.error('Error updating room:', error)
        }
    }

    const generateBriefing = async (room: Room) => {
        setGeneratingPdf(room.id)
        try {
            const res = await fetch(`/api/rooms/${room.id}/briefing`)
            const data = await res.json()

            // Map meetings to the format expected by generateMultiMeetingBriefingBook
            // data.meetings matches the structure but we need to ensure dates are strings if they aren't already,
            // or just pass them if they are clean.
            // But we also need to wrap them in { meeting, roomName } objects.
            const meetingsForPdf = (data.meetings || []).map((m: any) => ({
                meeting: {
                    ...m,
                    // Ensuring start/end times are formatted as ISO strings if they aren't
                    startTime: m.startTime || '',
                    endTime: m.endTime || ''
                },
                roomName: room.name
            }))

            generateMultiMeetingBriefingBook(
                `Room Meeting Briefing`,
                `${room.name} (Capacity: ${room.capacity})`,
                meetingsForPdf,
                `${room.name}_Briefing_Book`
            )
        } catch (error) {
            console.error("Failed to generate PDF", error)
            alert("Failed to generate briefing book")
        } finally {
            setGeneratingPdf(null)
        }
    }

    return (
        <div className="space-y-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Meeting Rooms</h1>
                    <p className="mt-2 text-zinc-500">Manage available spaces for your events.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Add Room Form */}
                <div className="lg:col-span-1">
                    <div className="card sticky top-24">
                        <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-6">Add Room</h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">Room Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    autoComplete="off"
                                    data-lpignore="true"
                                    required
                                    className="input-field"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="capacity" className="block text-sm font-medium text-zinc-700 mb-1.5">Capacity</label>
                                <input
                                    type="number"
                                    id="capacity"
                                    name="capacity"
                                    autoComplete="off"
                                    data-lpignore="true"
                                    required
                                    min="1"
                                    className="input-field"
                                    value={formData.capacity}
                                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Adding...' : 'Add Room'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Rooms List */}
                <div className="lg:col-span-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {rooms.map((room) => (
                            <div key={room.id} className="card hover:border-zinc-200 group flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-lg font-bold text-zinc-900 tracking-tight group-hover:text-indigo-600 transition-colors">{room.name}</h3>
                                        <div className="flex space-x-1">
                                            <button
                                                onClick={() => openEditModal(room)}
                                                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(room.id)}
                                                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => generateBriefing(room)}
                                                disabled={generatingPdf === room.id}
                                                className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Export Schedule"
                                            >
                                                {generatingPdf === room.id ? (
                                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center text-zinc-600 bg-zinc-50 px-3 py-2 rounded-lg inline-flex">
                                        <svg className="w-4 h-4 mr-2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                        <span className="text-sm font-medium">Capacity: {room.capacity}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {rooms.length === 0 && (
                            <div className="col-span-full text-center py-16 text-zinc-500 bg-white rounded-3xl border border-dashed border-zinc-200">
                                No rooms yet. Add one to get started.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
                        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">Edit Room</h2>
                        <form onSubmit={handleUpdate} className="space-y-5">
                            <div>
                                <label htmlFor="edit-name" className="block text-sm font-medium text-zinc-700 mb-1.5">Room Name</label>
                                <input
                                    type="text"
                                    id="edit-name"
                                    name="name"
                                    autoComplete="off"
                                    data-lpignore="true"
                                    required
                                    className="input-field"
                                    value={editFormData.name}
                                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-capacity" className="block text-sm font-medium text-zinc-700 mb-1.5">Capacity</label>
                                <input
                                    type="number"
                                    id="edit-capacity"
                                    name="capacity"
                                    autoComplete="off"
                                    data-lpignore="true"
                                    required
                                    min="1"
                                    className="input-field"
                                    value={editFormData.capacity}
                                    onChange={(e) => setEditFormData({ ...editFormData, capacity: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
