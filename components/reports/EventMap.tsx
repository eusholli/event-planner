'use client'

import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import dynamic from 'next/dynamic'
import { getStatusColor } from '@/lib/status-colors'

// Leaflet specific hacks for Next.js (window check)
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false })

interface Event {
    id: string
    name: string
    slug?: string
    address: string | null
    region: string | null
    status: string
    startDate: string | null
    endDate: string | null
    latitude?: number | null
    longitude?: number | null
}

// Map component
export function EventMap({ events, onEventClick }: { events: Event[], onEventClick?: (event: Event) => void }) {
    // Note: We use latitude/longitude if available, otherwise fallback to region centers.

    // Hardcoded centers for demo purposes if no real geocoding service
    const getCoordinates = (region: string, offset: number): [number, number] => {
        const jitter = (offset * 2); // Spread markers slightly
        switch (region) {
            case 'NA': return [40.7128 + jitter, -74.0060 + jitter] // NYC
            case 'SA': return [-23.5505 + jitter, -46.6333 + jitter] // Sao Paulo
            case 'EU/UK': return [51.5074 + jitter, -0.1278 + jitter] // London
            case 'MEA': return [25.2048 + jitter, 55.2708 + jitter] // Dubai
            case 'APAC': return [1.3521 + jitter, 103.8198 + jitter] // Singapore
            case 'Japan': return [35.6762 + jitter, 139.6503 + jitter] // Tokyo
            default: return [0, 0]
        }
    }

    // Fix for default marker icons in Leaflet with Next.js/Webpack
    useEffect(() => {
        // This is a known issue with Leaflet in React
        // Since we are moving to CircleMarker, we might not need the default icon fix anymore 
        // but keeping it just in case we use standard markers later.
        const L = require('leaflet')
        delete L.Icon.Default.prototype._getIconUrl
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        })
    }, [])

    return (
        <div className="h-[500px] w-full bg-neutral-100 rounded-xl overflow-hidden border border-neutral-200">
            {typeof window !== 'undefined' && (
                <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {events.map((event, index) => {
                        let position: [number, number] = [0, 0]

                        if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
                            position = [event.latitude, event.longitude]
                        } else if (event.region) {
                            position = getCoordinates(event.region, index * 0.001) // Smaller jitter
                        }

                        if (position[0] === 0 && position[1] === 0) return null

                        const colors = getStatusColor(event.status)

                        return (
                            <CircleMarker
                                key={event.id}
                                center={position}
                                pathOptions={{
                                    color: colors.text,
                                    fillColor: colors.bg,
                                    fillOpacity: 0.8,
                                    weight: 2
                                }}
                                radius={8}
                                eventHandlers={{
                                    click: () => {
                                        if (onEventClick) {
                                            onEventClick(event)
                                        }
                                    },
                                    mouseover: (e) => {
                                        e.target.openPopup()
                                    },
                                    mouseout: (e) => {
                                        e.target.closePopup()
                                    }
                                }}
                            >
                                <Popup closeButton={false}>
                                    <div className="text-xs font-bold text-neutral-900 whitespace-nowrap">
                                        {event.name}
                                    </div>
                                </Popup>
                            </CircleMarker>
                        )
                    })}
                </MapContainer>
            )}
        </div>
    )
}
