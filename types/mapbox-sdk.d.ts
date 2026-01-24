declare module '@mapbox/mapbox-sdk/services/geocoding' {
    export interface GeocodeRequest {
        query: string;
        limit?: number;
    }

    export interface GeocodeResponse {
        body: {
            features: {
                center: [number, number]; // [lng, lat]
                [key: string]: any;
            }[];
            [key: string]: any;
        };
    }

    export interface GeocodeService {
        forwardGeocode(request: GeocodeRequest): {
            send(): Promise<GeocodeResponse>;
        };
    }

    export default function geocodingService(config: { accessToken: string }): GeocodeService;
}
