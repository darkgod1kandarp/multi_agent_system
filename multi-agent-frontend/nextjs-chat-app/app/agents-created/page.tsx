"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AgentsCreatedPage() {
    const router = useRouter();
    const [agentCount, setAgentCount] = useState<number | null>(null);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        const stored = sessionStorage.getItem('finalizedAgents');
        if (stored) {
            try {
                const agents = JSON.parse(stored);
                setAgentCount(agents.length);
            } catch {
                setAgentCount(null);
            }
        }
        const id = sessionStorage.getItem('finalizedGroupId');
        if (id) setGroupId(id);
    }, []);

    useEffect(() => {
        if (countdown <= 0) {
            router.push('/multi-agent-chat');
            return;
        }
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [countdown]);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0d1117 0%, #1a2035 50%, #0d1117 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Inter', sans-serif",
            padding: '24px',
        }}>
            {/* Success icon */}
            <div style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '28px',
                boxShadow: '0 0 40px rgba(34,197,94,0.35)',
            }}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            </div>

            {/* Main message */}
            <h1 style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#f1f3f9',
                margin: '0 0 12px 0',
                textAlign: 'center',
                letterSpacing: '-0.3px',
            }}>
                Agents Successfully Created!
            </h1>

            <p style={{
                fontSize: '15px',
                color: 'rgba(241,243,249,0.55)',
                textAlign: 'center',
                margin: '0 0 8px 0',
                maxWidth: '420px',
                lineHeight: 1.6,
            }}>
                {agentCount !== null
                    ? `Your ${agentCount} AI agent${agentCount !== 1 ? 's have' : ' has'} been finalized and are ready to use.`
                    : 'Your AI agents have been finalized and are ready to use.'}
            </p>

            {/* Group ID badge */}
            {groupId && (
                <div style={{
                    fontSize: '11px',
                    color: 'rgba(129,140,248,0.7)',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    marginTop: '4px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.3px',
                }}>
                    Group ID: {groupId}
                </div>
            )}

            {/* Divider */}
            <div style={{
                width: 48,
                height: 2,
                background: 'linear-gradient(90deg, #4f7fff, #9c4fff)',
                borderRadius: 4,
                margin: '24px 0',
            }} />

            {/* Status badge */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: '10px',
                padding: '10px 18px',
                marginBottom: '28px',
            }}>
                <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 6px #22c55e',
                }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#22c55e' }}>
                    All agents are live
                </span>
            </div>

            {/* Redirect countdown */}
            <p style={{ fontSize: '13px', color: 'rgba(241,243,249,0.35)', marginBottom: '20px' }}>
                Redirecting to agent interface in <span style={{ color: '#818cf8', fontWeight: 700 }}>{countdown}s</span>…
            </p>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                    onClick={() => router.push('/multi-agent-chat')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 24px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 4px 20px rgba(34,197,94,0.35)',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                    </svg>
                    Start Chatting with Agents
                </button>

                <button
                    onClick={() => router.push('/')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '10px',
                        padding: '12px 24px',
                        color: 'rgba(241,243,249,0.6)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Chat
                </button>
            </div>
        </div>
    );
}
