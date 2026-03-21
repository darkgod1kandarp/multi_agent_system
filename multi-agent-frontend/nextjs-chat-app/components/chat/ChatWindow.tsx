"use client";

import { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useUser } from '../UserContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

export interface Agent {
    name: string;
    role: string;
    prompt: string;
    'Detailed Explnation for customer'?: string;
    'Detailed Explanation for customer'?: string;
    [key: string]: unknown;
}

export interface Message {
    sender: string;
    message: string;
    agents?: Agent[];
    groupId?: string;
    isError?: boolean;
    isLoading?: boolean;
    isStreaming?: boolean;
    streamStep?: string;
    // Suggestions confirmation flow
    suggestions?: { name: string; description?: string }[];
    sessionId?: string;
    onConfirmSuggestions?: (sessionId: string, agents: { name: string; description?: string }[]) => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const hasURL = (text: string) => /(https?:\/\/[^\s]+)/g.test(text);

const ChatWindow = () => {
    const { user, isMaster } = useUser();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMode, setLoadingMode] = useState<'chat' | 'agent'>('chat');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // ── Phase 2: called when user confirms their agent selection ─────────────
    const handleConfirmSuggestions = async (sessionId: string, confirmedAgents: { name: string; description?: string }[]) => {
        // Replace the suggestions message with a new streaming one
        setMessages(prev => [
            ...prev.filter(m => !m.suggestions),
            {
                sender: 'AI',
                message: '',
                isStreaming: true,
                streamStep: `Creating ${confirmedAgents.length} agent(s): ${confirmedAgents.map(a => a.name).join(', ')}...`,
                agents: [],
                groupId: '',
            },
        ]);
        setLoading(true);

        let streamEnded = false;
        try {
            const res = await fetch(`${BACKEND_URL}/creating/agent/confirm/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id ?? '' },
                body: JSON.stringify({ sessionId, confirmedAgents }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                setMessages(prev => [
                    ...prev.slice(0, -1),
                    { sender: 'AI', message: errData.error || 'Something went wrong generating agents.', isError: true },
                ]);
                return;
            }

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    let event: Record<string, unknown>;
                    try { event = JSON.parse(line.slice(6)); } catch { continue; }

                    if (event.type === 'step') {
                        setMessages(prev => {
                            const last = { ...prev[prev.length - 1] };
                            last.streamStep = event.message as string;
                            return [...prev.slice(0, -1), last];
                        });
                    } else if (event.type === 'agent') {
                        setMessages(prev => {
                            const last = { ...prev[prev.length - 1] };
                            last.agents = [...(last.agents ?? []), event.agent as Agent];
                            return [...prev.slice(0, -1), last];
                        });
                    } else if (event.type === 'done') {
                        streamEnded = true;
                        setMessages(prev => {
                            const last = { ...prev[prev.length - 1] };
                            const count = last.agents?.length ?? 0;
                            return [...prev.slice(0, -1), {
                                ...last,
                                isStreaming: false,
                                streamStep: undefined,
                                message: count > 0
                                    ? `I've generated ${count} AI agent${count !== 1 ? 's' : ''} for you.`
                                    : 'Analysis complete — no agents were returned.',
                                groupId: event.id as string,
                            }];
                        });
                    } else if (event.type === 'error') {
                        setMessages(prev => [
                            ...prev.slice(0, -1),
                            { sender: 'AI', message: (event.message as string) || 'Something went wrong.', isError: true },
                        ]);
                    }
                }
            }
        } catch {
            if (!streamEnded) {
                setMessages(prev => [
                    ...prev.slice(0, -1),
                    { sender: 'AI', message: '⚠ Could not reach the backend server. Make sure it is running on port 3001.', isError: true },
                ]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (userMessage: string) => {
        setMessages(prev => [...prev, { sender: 'User', message: userMessage }]);
        setLoading(true);

        const isAgentRequest = hasURL(userMessage);
        setLoadingMode(isAgentRequest ? 'agent' : 'chat');

        try {
            if (isAgentRequest) {
                // ── Agent generation: master only ──
                if (!isMaster) {
                    setMessages(prev => [...prev, {
                        sender: 'AI',
                        message: 'Only master users can generate agents from a URL. Ask an admin to grant you master access.',
                        isError: true,
                    }]);
                    setLoading(false);
                    return;
                }

                // Add a streaming placeholder message immediately
                setMessages(prev => [...prev, {
                    sender: 'AI',
                    message: '',
                    isStreaming: true,
                    streamStep: 'Connecting...',
                    agents: [],
                    groupId: '',
                }]);
                setLoadingMode('chat'); // hide bottom spinner — streaming message shows progress

                let streamEnded = false;
                try {
                    const res = await fetch(`${BACKEND_URL}/creating/agent/stream`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id ?? '' },
                        body: JSON.stringify({ message: userMessage }),
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        setMessages(prev => [
                            ...prev.slice(0, -1),
                            { sender: 'AI', message: errData.error || 'Something went wrong generating agents.', isError: true },
                        ]);
                        return;
                    }

                    const reader = res.body!.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';

                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            let event: Record<string, unknown>;
                            try { event = JSON.parse(line.slice(6)); } catch { continue; }

                            if (event.type === 'step') {
                                setMessages(prev => {
                                    const last = { ...prev[prev.length - 1] };
                                    last.streamStep = event.message as string;
                                    return [...prev.slice(0, -1), last];
                                });
                            } else if (event.type === 'suggestions') {
                                // Phase 1 complete — show confirmation panel, stop streaming indicator
                                streamEnded = true;
                                const industryInfo = event.industryInfo as Record<string, string> | undefined;
                                setMessages(prev => {
                                    const last = { ...prev[prev.length - 1] };
                                    return [...prev.slice(0, -1), {
                                        ...last,
                                        isStreaming: false,
                                        streamStep: undefined,
                                        message: `Website analyzed! I found **${industryInfo?.company_name || 'your business'}** in the **${industryInfo?.industry || ''}** industry. Select the agents you want to create:`,
                                        suggestions: (event.suggested_agents as Array<string | { name: string; description?: string }>).map(a =>
                                            typeof a === 'string' ? { name: a } : a
                                        ),
                                        sessionId: event.sessionId as string,
                                        onConfirmSuggestions: handleConfirmSuggestions,
                                    }];
                                });
                            } else if (event.type === 'agent') {
                                setMessages(prev => {
                                    const last = { ...prev[prev.length - 1] };
                                    last.agents = [...(last.agents ?? []), event.agent as Agent];
                                    return [...prev.slice(0, -1), last];
                                });
                            } else if (event.type === 'done') {
                                streamEnded = true;
                                setMessages(prev => {
                                    const last = { ...prev[prev.length - 1] };
                                    const count = last.agents?.length ?? 0;
                                    return [...prev.slice(0, -1), {
                                        ...last,
                                        isStreaming: false,
                                        streamStep: undefined,
                                        message: count > 0
                                            ? `I've analyzed the website and generated ${count} AI agent${count !== 1 ? 's' : ''} for you.`
                                            : 'Analysis complete — no agents were returned.',
                                        groupId: event.id as string,
                                    }];
                                });
                            } else if (event.type === 'error') {
                                setMessages(prev => [
                                    ...prev.slice(0, -1),
                                    { sender: 'AI', message: (event.message as string) || 'Something went wrong.', isError: true },
                                ]);
                            }
                        }
                    }
                } catch {
                    if (!streamEnded) {
                        setMessages(prev => [
                            ...prev.slice(0, -1),
                            { sender: 'AI', message: '⚠ Could not reach the backend server. Make sure it is running on port 3001.', isError: true },
                        ]);
                    }
                }
            } else {
                // ── General chat: POST /chat ──
                const res = await fetchWithTimeout(`${BACKEND_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userMessage }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setMessages(prev => [...prev, {
                        sender: 'AI',
                        message: data.error || 'Something went wrong. Please try again.',
                        isError: true,
                    }]);
                } else if (data.agents && Array.isArray(data.agents) && data.agents.length > 0) {
                    // Backend returned agents from /chat route
                    setMessages(prev => [...prev, {
                        sender: 'AI',
                        message: `I've analyzed the website and generated ${data.agents.length} AI agent${data.agents.length !== 1 ? 's' : ''} for you.`,
                        agents: data.agents,
                    }]);
                } else {
                    setMessages(prev => [...prev, {
                        sender: 'AI',
                        message: data.response || 'No response from server.',
                    }]);
                }
            }
        } catch {
            setMessages(prev => [...prev, {
                sender: 'AI',
                message: '⚠ Could not reach the backend server. Make sure it is running on port 3001.',
                isError: true,
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: '820px',
            background: 'transparent',
        }}>
            {/* Status bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 24px',
                background: '#0D2D4B',
                borderBottom: '1px solid rgba(73,182,132,0.1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: loading ? '#f59e0b' : '#49B684',
                        boxShadow: loading ? '0 0 6px rgba(245,158,11,0.8)' : '0 0 6px rgba(73,182,132,0.8)',
                        transition: 'all 0.3s',
                    }} />
                    <span style={{ fontSize: '12px', color: loading ? '#f59e0b' : '#49B684', fontWeight: 500, transition: 'color 0.3s' }}>
                        {loading ? 'Processing...' : 'Ready'}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(180,205,225,0.3)' }}>
                        {messages.length} message{messages.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(73,182,132,0.5)' }}>
                        {isMaster ? '🔗 Paste URL to build agents' : '💬 Chat with Myra'}
                    </span>
                </div>
            </div>

            {/* Messages */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                flex: 1,
                overflowY: 'auto',
                padding: '0',
                background: '#071929',
            }}>
                {messages.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        gap: '16px',
                        padding: '80px 24px',
                        textAlign: 'center',
                    }}>
                        <img
                            src="/logo.png"
                            alt="Vomyra"
                            style={{ height: 72, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 8px 24px rgba(73,182,132,0.4))' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#EDF2F7' }}>Hi, I'm Myra 👋</div>
                        <div style={{ fontSize: '14px', color: 'rgba(180,205,225,0.5)', maxWidth: '380px', lineHeight: 1.7 }}>
                            Chat freely with Vomyra AI, or paste a website URL to analyze the business and generate custom AI voice agents.
                        </div>
                        {isMaster && (
                            <div style={{ marginTop: '8px', padding: '10px 20px', background: 'rgba(73,182,132,0.07)', border: '1px solid rgba(73,182,132,0.2)', borderRadius: '10px', fontSize: '13px', color: 'rgba(73,182,132,0.8)' }}>
                                🔗 Try: <em style={{ color: '#49B684' }}>"Create agents for https://yoursite.com"</em>
                            </div>
                        )}
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <ChatMessage
                            key={index}
                            sender={msg.sender}
                            message={msg.message}
                            agents={msg.agents}
                            groupId={msg.groupId}
                            isError={msg.isError}
                            isStreaming={msg.isStreaming}
                            streamStep={msg.streamStep}
                            suggestions={msg.suggestions}
                            sessionId={msg.sessionId}
                            onConfirmSuggestions={msg.onConfirmSuggestions}
                        />
                    ))
                )}

                {/* Loading indicator */}
                {loading && !messages.some(m => m.isStreaming) && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 24px' }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg, #49B684, #2a9d7a)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', fontWeight: 700, color: '#fff',
                            boxShadow: '0 3px 12px rgba(73,182,132,0.3)',
                            overflow: 'hidden',
                        }}>
                            <img src="/logo.png" alt="Myra" style={{ width: 22, height: 22, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <LoadingDots />
                                <span style={{ fontSize: '14px', color: 'rgba(180,205,225,0.6)' }}>
                                    {loadingMode === 'agent' ? 'Crawling & analyzing website...' : 'Thinking...'}
                                </span>
                            </div>
                            {loadingMode === 'agent' && (
                                <div style={{ fontSize: '12px', color: 'rgba(180,205,225,0.3)' }}>This may take a minute ☕</div>
                            )}
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <ChatInput onSend={handleSend} disabled={loading} />
        </div>
    );
};

const LoadingDots = () => (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
            <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#49B684',
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
        ))}
        <style>{`
            @keyframes bounce {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }
        `}</style>
    </div>
);

export default ChatWindow;
