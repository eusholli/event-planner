import React from 'react';
import * as ClerkNextjs from '@clerk/nextjs';

const isAuthDisabled = process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true';

// Mock User
const mockUser = {
    id: 'mock-user-id',
    fullName: 'Mock User',
    firstName: 'Mock',
    lastName: 'User',
    primaryEmailAddress: { emailAddress: 'mock@example.com' },
    emailAddresses: [{ emailAddress: 'mock@example.com' }],
    imageUrl: 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
    publicMetadata: { role: 'root' },
    reload: async () => { },
};

// Mock Hooks
export const useUser = () => {
    if (isAuthDisabled) {
        return {
            isLoaded: true,
            isSignedIn: true,
            user: mockUser,
        };
    }
    return ClerkNextjs.useUser();
};

export const useAuth = () => {
    if (isAuthDisabled) {
        return {
            isLoaded: true,
            isSignedIn: true,
            userId: mockUser.id,
            sessionId: 'mock-session-id',
            getToken: async () => 'mock-token',
        };
    }
    return ClerkNextjs.useAuth();
};

// Mock Components
export const ClerkProvider = ({ children, ...props }: any) => {
    if (isAuthDisabled) {
        return <>{children}</>;
    }
    return <ClerkNextjs.ClerkProvider {...props}>{children}</ClerkNextjs.ClerkProvider>;
};

export const SignedIn = ({ children }: { children: React.ReactNode }) => {
    if (isAuthDisabled) {
        return <>{children}</>;
    }
    return <ClerkNextjs.SignedIn>{children}</ClerkNextjs.SignedIn>;
};

export const SignedOut = ({ children }: { children: React.ReactNode }) => {
    if (isAuthDisabled) {
        return null;
    }
    return <ClerkNextjs.SignedOut>{children}</ClerkNextjs.SignedOut>;
};

export const SignInButton = ({ children, ...props }: any) => {
    if (isAuthDisabled) {
        return null;
    }
    return <ClerkNextjs.SignInButton {...props}>{children}</ClerkNextjs.SignInButton>;
};

export const SignUpButton = ({ children, ...props }: any) => {
    if (isAuthDisabled) {
        return null;
    }
    return <ClerkNextjs.SignUpButton {...props}>{children}</ClerkNextjs.SignUpButton>;
};

export const UserButton = (props: any) => {
    if (isAuthDisabled) {
        return (
            <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                MU
            </div>
        );
    }
    return <ClerkNextjs.UserButton {...props} />;
};

// Re-export everything else to be safe, though we mostly use the above
export const {
    // Add other exports if needed, but for now we focus on what's used
} = ClerkNextjs;
