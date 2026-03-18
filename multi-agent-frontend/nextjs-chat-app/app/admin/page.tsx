"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../components/UserContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface UserRecord {
    id: string;
    username: string;
    role: 'master' | 'normal';
    created_at: string;
}

export default function AdminPage() {
    const router = useRouter();
    const { user, setUser, isMaster } = useUser();

    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [newUsername, setNewUsername] = useState('');
    const [newRole, setNewRole] = useState<'master' | 'normal'>('normal');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/users`);
            const data = await res.json();
            setUsers(data.users || []);
        } catch {
            /* ignore */
        } finally {
            setLoadingUsers(false);
        }
    };

    // Re-sync logged-in user's role from backend to fix stale localStorage
    useEffect(() => {
        if (!user) return;
        fetchWithTimeout(`${BACKEND_URL}/users`)
            .then(r => r.json())
            .then(data => {
                const fresh = (data.users || []).find((u: UserRecord) => u.id === user.id);
                if (fresh && fresh.role !== user.role) {
                    setUser({ id: fresh.id, username: fresh.username, role: fresh.role });
                }
            })
            .catch(() => {});
    }, [user?.id]);

    useEffect(() => { fetchUsers(); }, []);

    const handleCreate = async () => {
        const username = newUsername.trim();
        if (!username) return;
        setCreating(true);
        setCreateError('');
        setCreateSuccess('');
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/user/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, role: newRole }),
            });
            const data = await res.json();
            if (!res.ok) {
                setCreateError(data.error || 'Failed to create user.');
                return;
            }
            setCreateSuccess(`User "${data.username}" created as ${data.role}.`);
            setNewUsername('');
            setNewRole('normal');
            fetchUsers();
        } catch {
            setCreateError('Cannot reach backend. Make sure it is running on port 3001.');
        } finally {
            setCreating(false);
        }
    };

    const masterCount = users.filter(u => u.role === 'master').length;
    const normalCount = users.filter(u => u.role === 'normal').length;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0d1117 0%, #1a2035 50%, #0d1117 100%)',
            fontFamily: "'Inter', -apple-system, sans-serif",
            color: '#f1f3f9',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 32px',
                background: 'rgba(13,17,27,0.98)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: '10px',
                        background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px', fontWeight: 700, color: '#fff',
                        boxShadow: '0 4px 14px rgba(168,85,247,0.4)',
                    }}>⚙</div>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f3f9' }}>User Management</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Admin Panel</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {user && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: 700, color: '#fff',
                            }}>
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: '13px', color: isMaster ? '#c084fc' : '#818cf8', fontWeight: 600 }}>
                                {user.username}{isMaster ? ' · ★ Master' : ' · Normal'}
                            </span>
                        </div>
                    )}
                    <button
                        onClick={() => router.push('/')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px', padding: '7px 14px',
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: '12px', fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        Back
                    </button>
                </div>
            </div>

            {/* Access guard */}
            {!isMaster ? (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: 'calc(100vh - 72px)', gap: '16px', textAlign: 'center', padding: '24px',
                }}>
                    <div style={{ fontSize: '48px' }}>🔒</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f3f9' }}>Master Access Required</div>
                    <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', maxWidth: '340px', lineHeight: 1.6 }}>
                        Only master users can access the admin panel.
                    </div>
                    <button onClick={() => router.push('/')} style={{
                        marginTop: '8px', padding: '10px 24px',
                        background: 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                        border: 'none', borderRadius: '10px',
                        color: '#fff', fontSize: '14px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                        Go Back
                    </button>
                </div>
            ) : (
                <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '14px' }}>
                        {[
                            { label: 'Total Users', value: users.length, color: '#818cf8' },
                            { label: 'Master', value: masterCount, color: '#c084fc' },
                            { label: 'Normal', value: normalCount, color: '#60a5fa' },
                        ].map(stat => (
                            <div key={stat.label} style={{
                                flex: 1, padding: '18px 20px',
                                background: 'rgba(15,20,35,0.9)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: '14px',
                                display: 'flex', flexDirection: 'column', gap: '6px',
                            }}>
                                <div style={{ fontSize: '28px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Create user form */}
                    <div style={{
                        background: 'rgba(15,20,35,0.9)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: '16px',
                        padding: '24px',
                        display: 'flex', flexDirection: 'column', gap: '16px',
                    }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(129,140,248,0.8)' }}>
                            Create New User
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <input
                                placeholder="Username"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                style={{
                                    flex: 1, minWidth: '180px',
                                    padding: '11px 14px',
                                    background: 'rgba(0,0,0,0.35)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '10px',
                                    color: '#f1f3f9', fontSize: '14px',
                                    fontFamily: 'inherit', outline: 'none',
                                }}
                            />

                            {/* Role selector */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {(['normal', 'master'] as const).map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setNewRole(r)}
                                        style={{
                                            padding: '11px 18px',
                                            borderRadius: '10px',
                                            border: newRole === r
                                                ? `1px solid ${r === 'master' ? 'rgba(168,85,247,0.6)' : 'rgba(99,102,241,0.6)'}`
                                                : '1px solid rgba(255,255,255,0.08)',
                                            background: newRole === r
                                                ? r === 'master' ? 'rgba(168,85,247,0.18)' : 'rgba(99,102,241,0.18)'
                                                : 'rgba(255,255,255,0.04)',
                                            color: newRole === r
                                                ? r === 'master' ? '#c084fc' : '#818cf8'
                                                : 'rgba(255,255,255,0.4)',
                                            fontSize: '13px', fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {r === 'master' ? '★ Master' : 'Normal'}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={handleCreate}
                                disabled={!newUsername.trim() || creating}
                                style={{
                                    padding: '11px 22px',
                                    background: (!newUsername.trim() || creating) ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                                    border: 'none', borderRadius: '10px',
                                    color: '#fff', fontSize: '13px', fontWeight: 600,
                                    cursor: (!newUsername.trim() || creating) ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', flexShrink: 0,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: '7px',
                                }}
                            >
                                {creating ? (
                                    <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                                ) : (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                )}
                                {creating ? 'Creating…' : 'Create User'}
                            </button>
                        </div>

                        {createError && (
                            <div style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '9px 13px' }}>
                                ⚠ {createError}
                            </div>
                        )}
                        {createSuccess && (
                            <div style={{ fontSize: '12px', color: '#4ade80', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', padding: '9px 13px' }}>
                                ✓ {createSuccess}
                            </div>
                        )}
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>

                    {/* Users list */}
                    <div style={{
                        background: 'rgba(15,20,35,0.9)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '16px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(129,140,248,0.8)' }}>
                                All Users
                            </span>
                            <button
                                onClick={fetchUsers}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '7px', padding: '5px 12px',
                                    color: 'rgba(255,255,255,0.4)',
                                    fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                                Refresh
                            </button>
                        </div>

                        {loadingUsers ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
                                Loading…
                            </div>
                        ) : users.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>
                                No users yet.
                            </div>
                        ) : (
                            <div>
                                {/* Table header */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 140px 1fr',
                                    padding: '10px 20px',
                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.7px',
                                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    <span>Username</span>
                                    <span>Role</span>
                                    <span>Created</span>
                                </div>

                                {users.map((u, i) => (
                                    <div
                                        key={u.id}
                                        style={{
                                            display: 'grid', gridTemplateColumns: '1fr 140px 1fr',
                                            padding: '14px 20px',
                                            alignItems: 'center',
                                            borderBottom: i < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                            background: u.id === user?.id ? 'rgba(99,102,241,0.06)' : 'transparent',
                                        }}
                                    >
                                        {/* Username */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                background: u.role === 'master'
                                                    ? 'linear-gradient(135deg, #a855f7, #ec4899)'
                                                    : 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '12px', fontWeight: 700, color: '#fff',
                                            }}>
                                                {u.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e0e7ff' }}>
                                                    {u.username}
                                                    {u.id === user?.id && (
                                                        <span style={{ marginLeft: '7px', fontSize: '10px', color: '#818cf8', fontWeight: 500 }}>(you)</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginTop: '1px' }}>
                                                    {u.id.slice(0, 18)}…
                                                </div>
                                            </div>
                                        </div>

                                        {/* Role badge */}
                                        <div>
                                            <span style={{
                                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px',
                                                padding: '4px 10px', borderRadius: '20px',
                                                background: u.role === 'master' ? 'rgba(168,85,247,0.18)' : 'rgba(99,102,241,0.12)',
                                                color: u.role === 'master' ? '#c084fc' : '#818cf8',
                                                border: `1px solid ${u.role === 'master' ? 'rgba(168,85,247,0.35)' : 'rgba(99,102,241,0.25)'}`,
                                            }}>
                                                {u.role === 'master' ? '★ Master' : 'Normal'}
                                            </span>
                                        </div>

                                        {/* Created at */}
                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                                            {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            <span style={{ marginLeft: '6px', opacity: 0.6 }}>
                                                {new Date(u.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
