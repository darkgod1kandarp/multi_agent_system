"use client";

import ChatWindow from '../components/chat/ChatWindow';
import { useEffect, useState } from 'react';
import { useUser } from '../components/UserContext';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface AgentGroup {
    id: string;
    company_name: string;
    source_url: string;
    created_at: string;
    agents: { name: string; role: string }[];
}

const Page = () => {
    const { user, setUser, isMaster } = useUser();
    const router = useRouter();
    const [groups, setGroups] = useState<AgentGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [groupsError, setGroupsError] = useState<string | null>(null);

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

    useEffect(() => {
        fetch(`${BACKEND_URL}/agent-groups`)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(data => setGroups(data.groups || []))
            .catch(e => setGroupsError(e.message))
            .finally(() => setGroupsLoading(false));
    }, []);

    const openGroup = (group: AgentGroup) => {
        localStorage.setItem('agentGroupId', group.id);
        sessionStorage.setItem('finalizedAgents', JSON.stringify(group.agents));
        router.push('/multi-agent-chat');
    };

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

            {/* Body: sidebar + chat */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── Left sidebar: Agent Groups ── */}
                <div style={{
                    width: '260px',
                    flexShrink: 0,
                    background: '#0a1f35',
                    borderRight: '1px solid rgba(73,182,132,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '14px 16px 10px',
                        borderBottom: '1px solid rgba(73,182,132,0.08)',
                        flexShrink: 0,
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(73,182,132,0.7)' }}>
                            Agent Teams
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(180,205,225,0.3)', marginTop: '2px' }}>
                            Click to open in chat
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
                        {groupsLoading && (
                            <div style={{ color: 'rgba(180,205,225,0.3)', fontSize: '12px', textAlign: 'center', marginTop: '30px' }}>
                                Loading…
                            </div>
                        )}
                        {groupsError && (
                            <div style={{ color: '#f87171', fontSize: '11px', textAlign: 'center', marginTop: '20px', lineHeight: 1.6, padding: '0 8px' }}>
                                Failed to load groups.<br /><span style={{ color: 'rgba(180,205,225,0.3)' }}>{groupsError}</span>
                            </div>
                        )}
                        {!groupsLoading && !groupsError && groups.length === 0 && (
                            <div style={{ color: 'rgba(180,205,225,0.25)', fontSize: '12px', textAlign: 'center', marginTop: '30px', lineHeight: 1.6 }}>
                                No agent teams yet.<br />Paste a URL to create one.
                            </div>
                        )}
                        {groups.map(group => (
                            <button
                                key={group.id}
                                onClick={() => openGroup(group)}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: 'transparent',
                                    border: '1px solid rgba(73,182,132,0.08)',
                                    borderRadius: '10px',
                                    padding: '10px 12px',
                                    marginBottom: '6px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(73,182,132,0.07)';
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(73,182,132,0.3)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(73,182,132,0.08)';
                                }}
                            >
                                {/* Company name */}
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#EDF2F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {group.company_name || 'Unnamed Build'}
                                </div>

                                {/* Date */}
                                <div style={{ fontSize: '10px', color: 'rgba(180,205,225,0.35)' }}>
                                    {group.created_at ? new Date(group.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                                </div>

                                {/* Agent name pills */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                    {(group.agents || []).slice(0, 4).map((a, i) => (
                                        <span key={i} style={{
                                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.4px',
                                            padding: '2px 7px', borderRadius: '999px',
                                            background: 'rgba(73,182,132,0.1)',
                                            color: '#49B684',
                                            border: '1px solid rgba(73,182,132,0.2)',
                                            textTransform: 'uppercase',
                                        }}>
                                            {a.name}
                                        </span>
                                    ))}
                                    {(group.agents || []).length > 4 && (
                                        <span style={{ fontSize: '9px', color: 'rgba(180,205,225,0.3)' }}>+{group.agents.length - 4}</span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Chat area ── */}
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
        </div>
    );
};

export default Page;
