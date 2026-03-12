"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
    id: string;
    username: string;
    role: 'master' | 'normal';
}

interface UserContextValue {
    user: User | null;
    setUser: (user: User | null) => void;
    isMaster: boolean;
}

const UserContext = createContext<UserContextValue>({
    user: null,
    setUser: () => {},
    isMaster: false,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUserState] = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('vomyara_user');
        if (stored) {
            try { setUserState(JSON.parse(stored)); } catch { /* ignore */ }
        }
        setReady(true);
    }, []);

    const setUser = (u: User | null) => {
        setUserState(u);
        if (u) localStorage.setItem('vomyara_user', JSON.stringify(u));
        else localStorage.removeItem('vomyara_user');
    };

    // Don't render until we've read localStorage to avoid flash
    if (!ready) return null;

    return (
        <UserContext.Provider value={{ user, setUser, isMaster: user?.role === 'master' }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => useContext(UserContext);
