import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
    '/dashboard(.*)',
    '/attendees(.*)',
    '/new-meeting(.*)',
    '/settings(.*)',
    '/admin(.*)',
    '/reports(.*)',
    '/api(.*)',
    '/events(.*)'
]);

const isRootRoute = createRouteMatcher([
    '/settings(.*)'
]);

const isUserManagementRoute = createRouteMatcher([
    '/admin/users(.*)'
]);

const isReportRoute = createRouteMatcher([
    '/reports(.*)'
]);

export default clerkMiddleware(async (auth, req) => {
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
        return;
    }
    if (isProtectedRoute(req)) {
        // Allow backup key bypass for export route
        const backupKey = process.env.BACKUP_SECRET_KEY;
        const headerKey = req.headers.get('x-backup-key');
        if (
            backupKey &&
            headerKey === backupKey &&
            req.nextUrl.pathname === '/api/settings/export'
        ) {
            return NextResponse.next();
        }

        await auth.protect();

        const { sessionClaims } = await auth();
        const role = sessionClaims?.metadata?.role;

        // Redirect logic for RBAC
        if (isRootRoute(req) && role !== 'root') {
            return NextResponse.redirect(new URL('/access-denied', req.url));
        }

        if (isUserManagementRoute(req) && role !== 'root' && role !== 'marketing') {
            return NextResponse.redirect(new URL('/access-denied', req.url));
        }

        // Removed role check for isReportRoute to allow access to all logged-in users
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
