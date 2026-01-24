export const EVENT_STATUS_COLORS = {
    PIPELINE: {
        bg: '#f59e0b', // Amber
        text: '#b45309', // Amber-700
        border: '#fef3c7', // Amber-100
        className: 'bg-amber-50 text-amber-700 border border-amber-100',
        markerColor: '#f59e0b'
    },
    COMMITTED: {
        bg: '#10b981', // Green
        text: '#047857', // Green-700
        border: '#d1fae5', // Green-100
        className: 'bg-green-50 text-green-700 border border-green-100',
        markerColor: '#10b981'
    },
    OCCURRED: {
        bg: '#3b82f6', // Blue
        text: '#1d4ed8', // Blue-700
        border: '#dbeafe', // Blue-100
        className: 'bg-blue-50 text-blue-700 border border-blue-100',
        markerColor: '#3b82f6'
    },
    CANCELED: {
        bg: '#ef4444', // Red
        text: '#b91c1c', // Red-700
        border: '#fee2e2', // Red-100
        className: 'bg-red-50 text-red-700 border border-red-100',
        markerColor: '#ef4444'
    }
} as const;

export type EventStatus = keyof typeof EVENT_STATUS_COLORS;

export const getStatusColor = (status: string) => {
    const key = status.toUpperCase();
    if (key in EVENT_STATUS_COLORS) {
        return EVENT_STATUS_COLORS[key as EventStatus];
    }
    return EVENT_STATUS_COLORS.PIPELINE; // Default
};
