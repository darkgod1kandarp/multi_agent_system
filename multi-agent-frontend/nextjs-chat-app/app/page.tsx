"use client";

import ChatWindow from '../components/chat/ChatWindow';
import { useEffect } from 'react';
import { useUser } from '../components/UserContext';
import { useRouter } from 'next/navigation';

const BACKEND_URL = 'http://localhost:3001';

const Page = () => {
    const { user, setUser, isMaster } = useUser();
    const router = useRouter();

    // Re-sync role from backend in case it changed since last login
    useEffect(() => {
        if (!user) return;
        fetch(`${BACKEND_URL}/users`)
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
            minHeight: '100vh',
            background: '#0b0e17',
            backgroundImage: 'radial-gradient(ellipse at 15% 50%, rgba(99,102,241,0.08) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(168,85,247,0.08) 0%, transparent 50%)',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* Announcement Banner */}
            <div style={{
                background: 'linear-gradient(90deg, #22c55e 0%, #06b6d4 40%, #a855f7 100%)',
                color: '#fff',
                textAlign: 'center',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.2px',
            }}>
                ✨ Vomyra AI is now live in the US, UK, Canada &amp; Australia 🌍 &nbsp;|&nbsp; Create an Agent in YOUR Voice. Try It Free 🚀
            </div>

            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 36px',
                background: 'rgba(19,25,41,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(12px)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Logo mark */}
                    <div style={{
                        width: 36, height: 36,
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px', fontWeight: 700, color: '#fff',
                        boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                    }}>V</div>
                    <span style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        background: 'linear-gradient(90deg, #818cf8, #c084fc)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}>Vomyra Chat</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {user && isMaster && (
                        <button
                            onClick={() => router.push('/admin')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '6px 14px',
                                background: 'rgba(168,85,247,0.12)',
                                border: '1px solid rgba(168,85,247,0.3)',
                                borderRadius: '8px',
                                color: '#c084fc',
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
                            {/* User avatar */}
                            <div style={{
                                width: 30, height: 30, borderRadius: '50%',
                                background: isMaster
                                    ? 'linear-gradient(135deg, #a855f7, #ec4899)'
                                    : 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '12px', fontWeight: 700, color: '#fff',
                                boxShadow: isMaster ? '0 2px 8px rgba(168,85,247,0.4)' : '0 2px 8px rgba(99,102,241,0.35)',
                                flexShrink: 0,
                            }}>
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e0e7ff', lineHeight: 1 }}>
                                    {user.username}
                                </span>
                                <span style={{
                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                                    color: isMaster ? '#c084fc' : '#818cf8',
                                }}>
                                    {isMaster ? '★ MASTER' : 'NORMAL'}
                                </span>
                            </div>
                            <button
                                onClick={() => setUser(null)}
                                title="Switch account"
                                style={{
                                    padding: '4px 10px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    color: 'rgba(255,255,255,0.35)',
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

            {/* Chat area */}
            <main style={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '32px 16px',
            }}>
                <ChatWindow />
            </main>

            {/* Footer */}
            <footer style={{
                textAlign: 'center',
                padding: '14px',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.2)',
                borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
                Powered by Vomyra AI — Empowering Conversation with Voice AI
            </footer>
        </div>
    );
};

export default Page;
