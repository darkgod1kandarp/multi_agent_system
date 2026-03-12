"use client";

import { UserProvider } from './UserContext';
import UserLoginModal from './UserLoginModal';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <UserProvider>
            <UserLoginModal />
            {children}
        </UserProvider>
    );
}
