"use client";

import ChatWindow from '../components/chat/ChatWindow';
import { useEffect } from 'react';
import { useUser } from '../components/UserContext';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const Page = () => {
    const { user, setUser, isMaster } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!user) return;
        fetchWithTimeout(`${BACKEND_URL}/users`)
            .then(r => r.json())
            .then(data => {
                const fresh = (data.users || []).find((u: { id: string; username: string; role: 'master' | 'normal' }) => u.id === user.id);
                if (fresh && fresh.role !== user.role) {
                    setUser({ id: fresh.id, username: fresh.username, role: fresh.role });
                }
            })
            .catch(() => {});
    }, [user?.id]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: '#071929',
            fontFamily: "'Inter', -apple-system, sans-serif",
            overflow: 'hidden',
        }}>
            {/* Announcement Banner */}
            <div style={{
                background: 'linear-gradient(90deg, #49B684 0%, #2a9d7a 50%, #0D7A6B 100%)',
                color: '#fff',
                textAlign: 'center',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.2px',
                flexShrink: 0,
            }}>
                ✨ Vomyra AI is now live in the US, UK, Canada &amp; Australia 🌍 &nbsp;|&nbsp; Create an Agent in YOUR Voice. Try It Free 🚀
            </div>

            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 28px',
                background: '#0D2D4B',
                borderBottom: '1px solid rgba(73,182,132,0.12)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img
                        src="/logo.png"
                        alt="Vomyra"
                        style={{ height: 42, width: 'auto', objectFit: 'contain' }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {user && isMaster && (
                        <button
                            onClick={() => router.push('/admin')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '6px 14px',
                                background: 'rgba(73,182,132,0.1)',
                                border: '1px solid rgba(73,182,132,0.25)',
                                borderRadius: '8px',
                                color: '#49B684',
                                fontSize: '12px', fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                transition: 'all 0.15s',
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                            </svg>
                            Manage Users
                        </button>
                    )}
                    {user && (
                        <>
                            <div style={{
                                width: 30, height: 30, borderRadius: '50%',
                                background: isMaster
                                    ? 'linear-gradient(135deg, #49B684, #2a9d7a)'
                                    : 'linear-gradient(135deg, #0D2D4B, #1a4a6b)',
                                border: '2px solid rgba(73,182,132,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '12px', fontWeight: 700, color: '#fff',
                                flexShrink: 0,
                            }}>
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#EDF2F7', lineHeight: 1 }}>
                                    {user.username}
                                </span>
                                <span style={{
                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                                    color: isMaster ? '#49B684' : 'rgba(180,205,225,0.5)',
                                }}>
                                    {isMaster ? '★ MASTER' : 'NORMAL'}
                                </span>
                            </div>
                            <button
                                onClick={() => setUser(null)}
                                title="Switch account"
                                style={{
                                    padding: '4px 10px',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '8px',
                                    color: 'rgba(255,255,255,0.3)',
                                    fontSize: '11px', fontWeight: 500,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                Switch
                            </button>
                        </>
                    )}
                </div>
            </header>

            {/* Chat area — fills remaining height */}
            <main style={{
                flex: 1,
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'center',
                overflow: 'hidden',
            }}>
                <ChatWindow />
            </main>
        </div>
    );
};

export default Page;
