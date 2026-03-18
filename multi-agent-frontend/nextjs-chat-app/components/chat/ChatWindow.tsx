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
            maxWidth: '860px',
            borderRadius: '20px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
            background: 'rgba(13,18,30,0.9)',
        }}>
            {/* Top bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: 'rgba(19,25,41,0.98)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: loading ? '#f59e0b' : '#22c55e',
                        boxShadow: loading ? '0 0 8px rgba(245,158,11,0.8)' : '0 0 8px rgba(34,197,94,0.8)',
                        transition: 'all 0.3s',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#c4cbe0' }}>
                        Vomyra Agent Builder
                    </span>
                    <span style={{ fontSize: '12px', color: loading ? '#f59e0b' : '#22c55e', transition: 'color 0.3s' }}>
                        {loading ? '● Processing...' : '● Ready'}
                    </span>
                </div>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>
                    {messages.length} message{messages.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Hint bar */}
            <div style={{
                padding: '8px 20px',
                background: 'rgba(99,102,241,0.07)',
                borderBottom: '1px solid rgba(99,102,241,0.12)',
                fontSize: '12px',
                color: 'rgba(160,170,210,0.7)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
            }}>
                <span>💬</span>
                {isMaster
                    ? <span>Chat freely with Vomyra AI &nbsp;·&nbsp; 🔗 Paste a URL to generate agents — e.g. <em>"Analyze https://example.com"</em></span>
                    : <span>Chat freely with Vomyra AI &nbsp;·&nbsp; <span style={{ color: 'rgba(168,85,247,0.7)' }}>★ Master users</span> can generate agents from a URL</span>
                }
            </div>

            {/* Messages */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                minHeight: '420px',
                maxHeight: '560px',
                overflowY: 'auto',
                padding: '24px 20px',
                background: 'rgba(11,14,23,0.6)',
            }}>
                {messages.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        gap: '12px',
                        padding: '60px 0',
                        color: 'rgba(255,255,255,0.18)',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '48px' }}>🤖</div>
                        <div style={{ fontSize: '15px', fontWeight: 600 }}>Vomyra Agent Builder</div>
                        <div style={{ fontSize: '13px', maxWidth: '320px', lineHeight: 1.6 }}>
                            Send a message with a website URL and I'll crawl it, analyze the industry, and generate custom AI agents for you.
                        </div>
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
                        />
                    ))
                )}

                {/* Loading indicator — only show when NOT streaming (streaming message shows its own progress) */}
                {loading && !messages.some(m => m.isStreaming) && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', fontWeight: 700, color: '#fff',
                            boxShadow: '0 3px 12px rgba(34,197,94,0.35)',
                        }}>AI</div>
                        <div style={{
                            padding: '14px 18px',
                            borderRadius: '18px 18px 18px 4px',
                            background: 'rgba(26,32,53,0.95)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#818cf8', opacity: 0.65 }}>AI</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <LoadingDots />
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                                    {loadingMode === 'agent'
                                        ? 'Crawling & analyzing website...'
                                        : 'Thinking...'}
                                </span>
                            </div>
                            {loadingMode === 'agent' && (
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
                                    This may take a minute ☕
                                </div>
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
                background: 'linear-gradient(135deg, #4f7fff, #9c4fff)',
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
