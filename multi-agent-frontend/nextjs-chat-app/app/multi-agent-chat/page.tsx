"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../components/UserContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

const BACKEND_URL = 'https://unbeautified-robbi-nonaffecting.ngrok-free.dev';

interface Agent {
    name: string;
    role: string;
    prompt: string;
    explanation?: string;
}

interface ChatMessage {
    role: 'user' | 'agent' | 'routing';
    content: string;
    agentName?: string;
    agentRole?: string;
    intentUnderstood?: string;
    action?: string | null;
    isClarifying?: boolean;   // agent is asking for more info before final answer
}

// Orchestration context saved between needs_input turns
interface PendingContext {
    orchestration: {
        chosen_agent: string;
        user_language: string;
        intent: string;
        topic: string;
        entities: Record<string, string>;
        reformatted_query: string;
    };
    enrichedEntities: Record<string, string>;
}

const AGENT_COLORS = [
    ['#4f7fff', '#9c4fff'],
    ['#22c55e', '#06b6d4'],
    ['#f59e0b', '#ef4444'],
    ['#ec4899', '#8b5cf6'],
    ['#06b6d4', '#3b82f6'],
];

export default function MultiAgentChatPage() {
    const router = useRouter();
    const { user } = useUser();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [routingTo, setRoutingTo] = useState<string | null>(null);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [pendingContext, setPendingContext] = useState<PendingContext | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const stored = sessionStorage.getItem('finalizedAgents');
        if (stored) {
            try {
                const parsed: Agent[] = JSON.parse(stored);
                setAgents(parsed);
            } catch { /* ignore */ }
        }
        const id = localStorage.getItem('agentGroupId');
        if (id) setGroupId(id);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, routingTo]);

    const agentColor = (name: string) => {
        const idx = agents.findIndex(a => a.name === name);
        return AGENT_COLORS[(idx >= 0 ? idx : 0) % AGENT_COLORS.length];
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text || loading || agents.length === 0) return;

        const updatedMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
        setInput('');
        setMessages(updatedMessages);
        setLoading(true);
        setRoutingTo(pendingContext ? 'Agent is processing your answer…' : 'Orchestrator is routing your message…');

        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/chat/orchestrate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id ?? '' },
                body: JSON.stringify({
                    message: text,
                    agents,
                    groupId,
                    conversationHistory: updatedMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                        agentName: m.agentName,
                    })),
                    pendingContext,
                }),
            });
            const data = await res.json();

            setRoutingTo(null);
            if (!res.ok) throw new Error(data.error || 'Server error');

            if (data.status === 'needs_input') {
                // Orchestrator could not find missing info in RAG — ask the user
                setPendingContext(data.pendingContext);
                setMessages(prev => [...prev, {
                    role: 'agent',
                    content: data.question,
                    agentName: data.agent?.name,
                    agentRole: data.agent?.role,
                    isClarifying: true,
                }]);
            } else {
                // Final answer — clear pending context
                setPendingContext(null);
                const isMetaAgent = data.agent?.name?.toLowerCase().includes('meta');
                setMessages(prev => [...prev, {
                    role: 'agent',
                    content: isMetaAgent ? '✓ Done — your update has been applied.' : data.response,
                    agentName: data.agent?.name,
                    agentRole: data.agent?.role,
                    intentUnderstood: isMetaAgent ? undefined : data.intent_understood,
                    action: isMetaAgent ? undefined : data.action,
                }]);
            }
        } catch (err: unknown) {
            setRoutingTo(null);
            setPendingContext(null);
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setMessages(prev => [...prev, {
                role: 'agent',
                content: `⚠ ${msg === 'Server error' ? 'Could not reach backend. Make sure it is running on port 3001.' : msg}`,
                agentName: 'System',
                agentRole: 'Error',
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0d1117 0%, #1a2035 50%, #0d1117 100%)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
            color: '#f1f3f9',
        }}>
            {/* ── Top bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 24px',
                background: 'rgba(13,17,27,0.98)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Stacked agent avatars */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {agents.slice(0, 4).map((a, i) => {
                            const [c1, c2] = AGENT_COLORS[i % AGENT_COLORS.length];
                            return (
                                <div key={a.name} style={{
                                    width: 30, height: 30, borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${c1}, ${c2})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '11px', fontWeight: 700, color: '#fff',
                                    border: '2px solid rgba(13,17,27,0.98)',
                                    marginLeft: i > 0 ? '-8px' : 0,
                                    zIndex: 10 - i,
                                    position: 'relative',
                                }}>
                                    {a.name.charAt(0).toUpperCase()}
                                </div>
                            );
                        })}
                    </div>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e0e7ff' }}>
                            Multi-Agent Chat
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                            {agents.length} agent{agents.length !== 1 ? 's' : ''} · Orchestrator routes your message
                        </div>
                    </div>
                </div>

                {/* Agent pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {agents.slice(0, 3).map((a, i) => {
                        const [c1] = AGENT_COLORS[i % AGENT_COLORS.length];
                        return (
                            <div key={a.name} style={{
                                padding: '3px 10px',
                                borderRadius: '999px',
                                border: `1px solid ${c1}55`,
                                background: `${c1}18`,
                                color: c1,
                                fontSize: '11px', fontWeight: 600,
                            }}>
                                {a.name}
                            </div>
                        );
                    })}
                    {agents.length > 3 && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>+{agents.length - 3} more</div>
                    )}
                    <button
                        onClick={() => router.push('/')}
                        style={{
                            marginLeft: '8px',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            color: 'rgba(255,255,255,0.35)',
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

            {/* ── Messages ── */}
            <div style={{
                flex: 1, overflowY: 'auto',
                padding: '28px 24px',
                display: 'flex', flexDirection: 'column', gap: '18px',
                maxWidth: '860px', width: '100%', margin: '0 auto',
                boxSizing: 'border-box',
            }}>
                {messages.length === 0 && !loading && (
                    <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: '14px', color: 'rgba(255,255,255,0.18)',
                        textAlign: 'center', padding: '80px 0',
                    }}>
                        <div style={{ fontSize: '48px' }}>🤖</div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>
                            Ask anything
                        </div>
                        <div style={{ fontSize: '13px', maxWidth: '380px', lineHeight: 1.7 }}>
                            The main orchestrator will automatically route your message to the most suitable agent from your team.
                        </div>
                        {/* Agent list hint */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                            {agents.map((a, i) => {
                                const [c1] = AGENT_COLORS[i % AGENT_COLORS.length];
                                return (
                                    <div key={a.name} style={{
                                        padding: '5px 14px', borderRadius: '999px',
                                        border: `1px solid ${c1}44`, background: `${c1}12`,
                                        color: c1, fontSize: '12px', fontWeight: 600,
                                    }}>
                                        {a.name} · {a.role}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    if (msg.role === 'user') {
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <div style={{
                                    maxWidth: '70%',
                                    padding: '12px 16px',
                                    borderRadius: '18px 18px 4px 18px',
                                    background: 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                                    fontSize: '14px', lineHeight: '1.65', color: '#fff',
                                    wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                    boxShadow: '0 6px 20px rgba(79,127,255,0.3)',
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        );
                    }

                    // Agent response
                    const [c1, c2] = agentColor(msg.agentName ?? '');
                    const isError = msg.agentRole === 'Error';
                    const isClarifying = msg.isClarifying;
                    return (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                background: isError ? 'linear-gradient(135deg,#ef4444,#f97316)' : `linear-gradient(135deg, ${c1}, ${c2})`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '12px', fontWeight: 700, color: '#fff',
                                boxShadow: `0 3px 10px ${isError ? 'rgba(239,68,68,0.4)' : c1 + '55'}`,
                                marginTop: '2px',
                            }}>
                                {msg.agentName?.charAt(0).toUpperCase() ?? 'A'}
                            </div>
                            <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {/* Agent label + clarifying badge */}
                                <div style={{
                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
                                    textTransform: 'uppercase', color: isError ? '#f87171' : c1, opacity: 0.8,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                    </svg>
                                    {msg.agentName} · {msg.agentRole}
                                    {isClarifying && (
                                        <span style={{
                                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px',
                                            padding: '2px 7px', borderRadius: '20px',
                                            background: `${c1}25`, color: c1,
                                            border: `1px solid ${c1}50`,
                                            textTransform: 'uppercase',
                                        }}>
                                            needs info
                                        </span>
                                    )}
                                </div>
                                <div style={{
                                    padding: '12px 16px',
                                    borderRadius: '4px 18px 18px 18px',
                                    background: isError ? 'rgba(239,68,68,0.08)' : isClarifying ? `${c1}12` : 'rgba(26,32,53,0.95)',
                                    border: `1px solid ${isError ? 'rgba(239,68,68,0.25)' : isClarifying ? `${c1}40` : 'rgba(255,255,255,0.07)'}`,
                                    fontSize: '14px', lineHeight: '1.65', color: '#f1f3f9',
                                    wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                                }}>
                                    {msg.content}
                                </div>
                                {/* Action badge + intent hint */}
                                {(msg.action || msg.intentUnderstood) && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingLeft: '4px' }}>
                                        {msg.action && msg.action !== 'null' && (
                                            <span style={{
                                                fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                                                textTransform: 'uppercase',
                                                padding: '3px 9px', borderRadius: '20px',
                                                background: `${c1}20`, color: c1,
                                                border: `1px solid ${c1}40`,
                                            }}>
                                                {msg.action.replace(/_/g, ' ')}
                                            </span>
                                        )}
                                        {msg.intentUnderstood && (
                                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                                                {msg.intentUnderstood}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Routing / thinking indicator */}
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', color: '#fff',
                            boxShadow: '0 3px 12px rgba(99,102,241,0.4)',
                        }}>
                            ⚡
                        </div>
                        <div style={{
                            padding: '12px 18px',
                            borderRadius: '4px 18px 18px 18px',
                            background: 'rgba(26,32,53,0.95)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            display: 'flex', flexDirection: 'column', gap: '6px',
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#818cf8', opacity: 0.7 }}>
                                Orchestrator
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{
                                        width: 7, height: 7, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                                    }} />
                                ))}
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                                    {routingTo ?? 'Thinking…'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }`}</style>
                <div ref={bottomRef} />
            </div>

            {/* ── Input bar ── */}
            <div style={{
                padding: '16px 24px 20px',
                background: 'rgba(13,17,27,0.98)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
            }}>
                <div style={{
                    maxWidth: '860px', margin: '0 auto',
                    display: 'flex', gap: '10px', alignItems: 'flex-end',
                }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={agents.length > 0 ? 'Ask anything — the best agent will respond…' : 'No agents loaded. Go back and finalize agents first.'}
                        disabled={loading || agents.length === 0}
                        rows={1}
                        style={{
                            flex: 1,
                            background: 'rgba(26,32,53,0.8)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '14px',
                            padding: '14px 18px',
                            color: '#f1f3f9',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            resize: 'none',
                            outline: 'none',
                            lineHeight: '1.5',
                            maxHeight: '140px',
                            overflowY: 'auto',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading || agents.length === 0}
                        style={{
                            width: 48, height: 48, borderRadius: '14px', flexShrink: 0,
                            background: (!input.trim() || loading || agents.length === 0)
                                ? 'rgba(99,102,241,0.15)'
                                : 'linear-gradient(135deg, #4f7fff, #9c4fff)',
                            border: 'none',
                            cursor: (!input.trim() || loading || agents.length === 0) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: (!input.trim() || loading || agents.length === 0) ? 'none' : '0 4px 18px rgba(99,102,241,0.4)',
                            transition: 'all 0.15s',
                        }}
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
                <div style={{ maxWidth: '860px', margin: '8px auto 0', fontSize: '11px', color: 'rgba(255,255,255,0.18)', paddingLeft: '2px' }}>
                    Enter to send · Shift+Enter for new line · Orchestrator automatically routes to the best agent
                </div>
            </div>
        </div>
    );
}
