// Teach Clerk's TypeScript types that our session JWT carries a `role` field
// in publicMetadata. This eliminates the need for `as` casts on
// `sessionClaims?.metadata?.role` throughout the codebase.
// See: https://clerk.com/docs/backend-requests/handling/custom-session-token
export {}

declare global {
    interface CustomJwtSessionClaims {
        metadata?: {
            role?: string
        }
    }
}
