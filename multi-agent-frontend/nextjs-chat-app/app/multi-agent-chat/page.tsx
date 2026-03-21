"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../components/UserContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

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
    isClarifying?: boolean;
}

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

// Green palette — different shades so agents are visually distinct
const AGENT_COLORS = [
    '#49B684',
    '#2a9d7a',
    '#3db88f',
    '#1e8c6a',
    '#5cc99a',
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
    const [inputFocused, setInputFocused] = useState(false);
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
                setPendingContext(data.pendingContext);
                setMessages(prev => [...prev, {
                    role: 'agent',
                    content: data.question,
                    agentName: data.agent?.name,
                    agentRole: data.agent?.role,
                    isClarifying: true,
                }]);
            } else {
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

    const canSend = !!input.trim() && !loading && agents.length > 0;

    return (
        <div style={{
            height: '100vh',
            background: '#071929',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, sans-serif",
            color: '#f1f3f9',
            overflow: 'hidden',
        }}>
            {/* ── Top bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px',
                background: '#0D2D4B',
                borderBottom: '1px solid rgba(73,182,132,0.12)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                        src="/logo.png"
                        alt="Vomyra"
                        style={{ height: 38, width: 'auto', objectFit: 'contain' }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div style={{ width: 1, height: 24, background: 'rgba(73,182,132,0.15)' }} />
                    {/* Stacked agent avatars */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {agents.slice(0, 4).map((a, i) => {
                            const color = AGENT_COLORS[i % AGENT_COLORS.length];
                            return (
                                <div key={a.name} style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '11px', fontWeight: 700, color: '#fff',
                                    border: '2px solid #0D2D4B',
                                    marginLeft: i > 0 ? '-7px' : 0,
                                    zIndex: 10 - i,
                                    position: 'relative',
                                    boxShadow: `0 2px 6px ${color}55`,
                                }}>
                                    {a.name.charAt(0).toUpperCase()}
                                </div>
                            );
                        })}
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#EDF2F7' }}>
                            Multi-Agent Chat
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(180,205,225,0.4)' }}>
                            {agents.length} agent{agents.length !== 1 ? 's' : ''} · Orchestrator routes your message
                        </div>
                    </div>
                </div>

                {/* Right side: agent pills + back */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {agents.slice(0, 3).map((a, i) => {
                        const color = AGENT_COLORS[i % AGENT_COLORS.length];
                        return (
                            <div key={a.name} style={{
                                padding: '3px 10px',
                                borderRadius: '999px',
                                border: `1px solid ${color}55`,
                                background: `${color}18`,
                                color: color,
                                fontSize: '11px', fontWeight: 600,
                            }}>
                                {a.name}
                            </div>
                        );
                    })}
                    {agents.length > 3 && (
                        <div style={{ fontSize: '11px', color: 'rgba(180,205,225,0.3)' }}>+{agents.length - 3} more</div>
                    )}
                    <button
                        onClick={() => router.push('/')}
                        style={{
                            marginLeft: '8px',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(73,182,132,0.06)',
                            border: '1px solid rgba(73,182,132,0.18)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            color: 'rgba(180,205,225,0.5)',
                            fontSize: '12px', fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'all 0.15s',
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
                display: 'flex', flexDirection: 'column',
            }}>
                <div style={{
                    padding: '28px 24px',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                    maxWidth: '820px', width: '100%', margin: '0 auto',
                    boxSizing: 'border-box',
                    flex: 1,
                }}>
                    {messages.length === 0 && !loading && (
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: '16px', textAlign: 'center',
                            padding: '80px 0', flex: 1,
                        }}>
                            <img
                                src="/logo.png"
                                alt="Vomyra"
                                style={{ height: 56, width: 'auto', objectFit: 'contain', opacity: 0.6 }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#EDF2F7' }}>
                                Hi, I&apos;m your agent team 👋
                            </div>
                            <div style={{ fontSize: '13px', color: 'rgba(180,205,225,0.45)', maxWidth: '380px', lineHeight: 1.7 }}>
                                The orchestrator will automatically route your message to the most suitable agent.
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '4px' }}>
                                {agents.map((a, i) => {
                                    const color = AGENT_COLORS[i % AGENT_COLORS.length];
                                    return (
                                        <div key={a.name} style={{
                                            padding: '5px 14px', borderRadius: '999px',
                                            border: `1px solid ${color}44`, background: `${color}12`,
                                            color: color, fontSize: '12px', fontWeight: 600,
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
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'flex-end',
                                    padding: '6px 0',
                                }}>
                                    <div style={{
                                        maxWidth: '70%',
                                        padding: '12px 16px',
                                        borderRadius: '18px 18px 4px 18px',
                                        background: '#49B684',
                                        fontSize: '14px', lineHeight: '1.65', color: '#fff',
                                        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                        boxShadow: '0 4px 16px rgba(73,182,132,0.3)',
                                    }}>
                                        {msg.content}
                                    </div>
                                </div>
                            );
                        }

                        const color = agentColor(msg.agentName ?? '');
                        const isError = msg.agentRole === 'Error';
                        const isClarifying = msg.isClarifying;
                        return (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                padding: '6px 0',
                            }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                    background: isError ? '#ef4444' : color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '12px', fontWeight: 700, color: '#fff',
                                    boxShadow: `0 3px 10px ${isError ? 'rgba(239,68,68,0.4)' : color + '55'}`,
                                    marginTop: '2px',
                                }}>
                                    {msg.agentName?.charAt(0).toUpperCase() ?? 'A'}
                                </div>
                                <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{
                                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
                                        textTransform: 'uppercase',
                                        color: isError ? '#f87171' : color,
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
                                                background: `${color}25`, color: color,
                                                border: `1px solid ${color}50`,
                                                textTransform: 'uppercase',
                                            }}>
                                                needs info
                                            </span>
                                        )}
                                    </div>
                                    <div style={{
                                        padding: '12px 16px',
                                        borderRadius: '4px 18px 18px 18px',
                                        background: isError
                                            ? 'rgba(239,68,68,0.08)'
                                            : isClarifying
                                                ? `${color}12`
                                                : 'rgba(13,45,75,0.6)',
                                        border: `1px solid ${isError
                                            ? 'rgba(239,68,68,0.25)'
                                            : isClarifying
                                                ? `${color}40`
                                                : 'rgba(73,182,132,0.1)'}`,
                                        fontSize: '14px', lineHeight: '1.65', color: '#EDF2F7',
                                        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                    }}>
                                        {msg.content}
                                    </div>
                                    {(msg.action || msg.intentUnderstood) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingLeft: '4px' }}>
                                            {msg.action && msg.action !== 'null' && (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                    padding: '3px 9px', borderRadius: '20px',
                                                    background: `${color}20`, color: color,
                                                    border: `1px solid ${color}40`,
                                                }}>
                                                    {msg.action.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            {msg.intentUnderstood && (
                                                <span style={{ fontSize: '11px', color: 'rgba(180,205,225,0.3)', fontStyle: 'italic' }}>
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
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '6px 0' }}>
                            <div style={{
                                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                background: '#49B684',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 3px 12px rgba(73,182,132,0.35)',
                                overflow: 'hidden',
                            }}>
                                <img
                                    src="/logo.png"
                                    alt=""
                                    style={{ height: 22, width: 'auto', objectFit: 'contain' }}
                                    onError={e => {
                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        (e.currentTarget.parentElement as HTMLDivElement).innerText = '⚡';
                                    }}
                                />
                            </div>
                            <div style={{
                                padding: '12px 18px',
                                borderRadius: '4px 18px 18px 18px',
                                background: 'rgba(13,45,75,0.6)',
                                border: '1px solid rgba(73,182,132,0.1)',
                                display: 'flex', flexDirection: 'column', gap: '6px',
                            }}>
                                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#49B684', opacity: 0.8 }}>
                                    Orchestrator
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {[0, 1, 2].map(i => (
                                        <div key={i} style={{
                                            width: 7, height: 7, borderRadius: '50%',
                                            background: '#49B684',
                                            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                                        }} />
                                    ))}
                                    <span style={{ fontSize: '13px', color: 'rgba(180,205,225,0.4)' }}>
                                        {routingTo ?? 'Thinking…'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }`}</style>
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* ── Input bar ── */}
            <div style={{
                padding: '12px 24px 16px',
                background: '#0D2D4B',
                borderTop: '1px solid rgba(73,182,132,0.1)',
                flexShrink: 0,
            }}>
                <div style={{
                    maxWidth: '820px', margin: '0 auto',
                    display: 'flex', gap: '10px', alignItems: 'flex-end',
                }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        placeholder={agents.length > 0 ? 'Ask anything — the best agent will respond…' : 'No agents loaded. Go back and finalize agents first.'}
                        disabled={loading || agents.length === 0}
                        rows={1}
                        style={{
                            flex: 1,
                            background: '#071929',
                            border: `1px solid ${inputFocused && !loading ? '#49B684' : 'rgba(73,182,132,0.12)'}`,
                            borderRadius: '14px',
                            padding: '13px 18px',
                            color: '#EDF2F7',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            resize: 'none',
                            outline: 'none',
                            lineHeight: '1.5',
                            maxHeight: '140px',
                            overflowY: 'auto',
                            transition: 'border-color 0.2s',
                            boxShadow: inputFocused && !loading ? '0 0 0 3px rgba(73,182,132,0.1)' : 'none',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!canSend}
                        style={{
                            width: 48, height: 48, borderRadius: '14px', flexShrink: 0,
                            background: canSend ? '#49B684' : 'rgba(73,182,132,0.08)',
                            border: 'none',
                            cursor: canSend ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: canSend ? '0 4px 16px rgba(73,182,132,0.35)' : 'none',
                            transition: 'all 0.15s',
                        }}
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={canSend ? '#fff' : 'rgba(73,182,132,0.3)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
                <div style={{ maxWidth: '820px', margin: '8px auto 0', fontSize: '11px', color: 'rgba(180,205,225,0.2)', paddingLeft: '2px' }}>
                    Enter to send · Shift+Enter for new line · Orchestrator automatically routes to the best agent
                </div>
            </div>
        </div>
    );
}
