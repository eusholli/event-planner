'use client'

import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import dynamic from 'next/dynamic'

// Leaflet specific hacks for Next.js (window check)
// We use dynamic import for the actual map container
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })

interface Event {
    id: string
    name: string
    address: string | null
    region: string | null
    status: string
    startDate?: string | null
    endDate?: string | null
}

// Map component
export function EventMap({ events }: { events: Event[] }) {
    // Note: In a real app we would Geocode the address to Lat/Lng.
    // For this prototype, we'll maintain a static mapping of Regions to Centers, 
    // or mock geocoding for demonstration if address is present.
    // Ideally the Backend would have `lat` and `lng` fields on Event.

    // Hardcoded centers for demo purposes if no real geocoding service
    const getCoordinates = (region: string, offset: number) => {
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
                        if (!event.region) return null
                        const position = getCoordinates(event.region, index * 0.1) as [number, number]
                        if (position[0] === 0) return null

                        return (
                            <Marker key={event.id} position={position}>
                                <Popup>
                                    <strong>{event.name}</strong><br />
                                    {event.region}<br />
                                    Status: {event.status}
                                </Popup>
                            </Marker>
                        )
                    })}
                </MapContainer>
            )}
        </div>
    )
}
