"use client";

import React, { useEffect, useState } from 'react';
import { useUser, User } from './UserContext';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

const BACKEND_URL = 'https://unbeautified-robbi-nonaffecting.ngrok-free.dev';
const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

interface UserRecord {
    id: string;
    username: string;
    role: 'master' | 'normal';
    created_at: string;
}

export default function UserLoginModal() {
    const { user, setUser } = useUser();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [newUsername, setNewUsername] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [promoting, setPromoting] = useState<string | null>(null);
    const [error, setError] = useState('');

    const fetchUsers = () => {
        fetchWithTimeout(`${BACKEND_URL}/users`, { headers: HEADERS })
            .then(r => r.json())
            .then(d => setUsers(d.users || []))
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!user) fetchUsers();
    }, [user]);

    if (user) return null;

    const handleSelect = (u: UserRecord) => {
        setUser({ id: u.id, username: u.username, role: u.role });
    };

    const handleCreate = async () => {
        const username = newUsername.trim();
        if (!username) return;
        setCreating(true);
        setError('');
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/user/create`, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify({ username, role: 'normal' }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not create account.');
                return;
            }
            setUser(data as User);
        } catch {
            setError('Cannot reach backend. Make sure it is running.');
        } finally {
            setCreating(false);
        }
    };

    const handlePromote = async (username: string) => {
        setPromoting(username);
        setError('');
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/user/promote`, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify({ username, role: 'master' }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not promote user.');
                return;
            }
            fetchUsers();
        } catch {
            setError('Cannot reach backend.');
        } finally {
            setPromoting(null);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(5,8,16,0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            <div style={{
                background: 'rgba(15,20,35,0.98)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '20px',
                padding: '36px 32px',
                width: '100%',
                maxWidth: '420px',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
            }}>
                {/* Logo + title */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '14px',
                        background: 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '22px', fontWeight: 800, color: '#fff',
                        boxShadow: '0 8px 24px rgba(99,102,241,0.45)',
                    }}>V</div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f3f9' }}>Welcome to Vomyra AI</div>
                        <div style={{ fontSize: '13px', color: 'rgba(241,243,249,0.45)', marginTop: '4px' }}>
                            Select your account or create one to continue
                        </div>
                    </div>
                </div>

                {/* Existing users */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(129,140,248,0.7)' }}>
                        Existing Accounts
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
                            Loading…
                        </div>
                    ) : users.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '14px', color: 'rgba(255,255,255,0.25)', fontSize: '13px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.08)' }}>
                            No accounts yet — create one below
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                            {users.map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        onClick={() => handleSelect(u)}
                                        style={{
                                            flex: 1,
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '11px 14px',
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            transition: 'all 0.15s',
                                            textAlign: 'left',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLButtonElement).style.background = u.role === 'master' ? 'rgba(168,85,247,0.12)' : 'rgba(99,102,241,0.12)';
                                            (e.currentTarget as HTMLButtonElement).style.borderColor = u.role === 'master' ? 'rgba(168,85,247,0.4)' : 'rgba(99,102,241,0.4)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
                                        }}
                                    >
                                        {/* Avatar */}
                                        <div style={{
                                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                            background: u.role === 'master'
                                                ? 'linear-gradient(135deg, #a855f7, #ec4899)'
                                                : 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '13px', fontWeight: 700, color: '#fff',
                                            boxShadow: u.role === 'master' ? '0 2px 8px rgba(168,85,247,0.4)' : '0 2px 8px rgba(99,102,241,0.35)',
                                        }}>
                                            {u.username.charAt(0).toUpperCase()}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {u.username}
                                            </div>
                                        </div>

                                        {/* Role badge */}
                                        <div style={{
                                            fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                                            padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
                                            background: u.role === 'master' ? 'rgba(168,85,247,0.18)' : 'rgba(99,102,241,0.15)',
                                            color: u.role === 'master' ? '#c084fc' : '#818cf8',
                                            border: `1px solid ${u.role === 'master' ? 'rgba(168,85,247,0.35)' : 'rgba(99,102,241,0.3)'}`,
                                            textTransform: 'uppercase',
                                        }}>
                                            {u.role === 'master' ? '★ Master' : 'Normal'}
                                        </div>
                                    </button>

                                    {/* Promote button — only shown for normal users */}
                                    {u.role === 'normal' && (
                                        <button
                                            onClick={() => handlePromote(u.username)}
                                            disabled={promoting === u.username}
                                            title="Promote to Master"
                                            style={{
                                                flexShrink: 0,
                                                padding: '8px 10px',
                                                background: 'rgba(168,85,247,0.1)',
                                                border: '1px solid rgba(168,85,247,0.3)',
                                                borderRadius: '8px',
                                                color: '#c084fc',
                                                fontSize: '11px', fontWeight: 700,
                                                cursor: promoting === u.username ? 'not-allowed' : 'pointer',
                                                fontFamily: 'inherit',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.15s',
                                                opacity: promoting === u.username ? 0.5 : 1,
                                            }}
                                        >
                                            {promoting === u.username ? '…' : '★ Make Master'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>OR</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                </div>

                {/* Create new */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(129,140,248,0.7)' }}>
                        Create New Account
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            placeholder="Enter your username"
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            style={{
                                flex: 1,
                                padding: '11px 14px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '10px',
                                color: '#f1f3f9',
                                fontSize: '14px',
                                fontFamily: 'inherit',
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={handleCreate}
                            disabled={!newUsername.trim() || creating}
                            style={{
                                padding: '11px 18px',
                                background: (!newUsername.trim() || creating) ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                                border: 'none',
                                borderRadius: '10px',
                                color: '#fff',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: (!newUsername.trim() || creating) ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                flexShrink: 0,
                                transition: 'all 0.15s',
                            }}
                        >
                            {creating ? '…' : 'Join'}
                        </button>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
                        New accounts are created as <strong style={{ color: 'rgba(129,140,248,0.6)' }}>normal users</strong>. Use <strong style={{ color: 'rgba(192,132,252,0.7)' }}>★ Make Master</strong> next to any user to promote them.
                    </div>
                    {error && (
                        <div style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                            ⚠ {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
