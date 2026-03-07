import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';

let geocodingClient: ReturnType<typeof mbxGeocoding> | null = null;

function getGeocodingClient() {
    if (!geocodingClient && process.env.MAPBOX_ACCESS_TOKEN) {
        geocodingClient = mbxGeocoding({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });
    }
    return geocodingClient;
}

export async function geocodeAddress(address: string): Promise<{ latitude: number, longitude: number } | null> {
    if (!address || !process.env.MAPBOX_ACCESS_TOKEN) {
        console.warn('Geocoding skipped: Missing address or API token');
        return null; // Or throw error/return default based on requirements
    }

    try {
        const response = await getGeocodingClient()!.forwardGeocode({
            query: address,
            limit: 1
        }).send();

        if (response.body.features && response.body.features.length > 0) {
            const [longitude, latitude] = response.body.features[0].center;
            return { latitude, longitude };
        }
    } catch (error) {
        console.error('Failed to geocode address:', error);
    }

    return null;
}
