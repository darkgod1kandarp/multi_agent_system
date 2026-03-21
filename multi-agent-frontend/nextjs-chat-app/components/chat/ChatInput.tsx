"use client";

import React, { useState } from 'react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
}

const ChatInput = ({ onSend, disabled = false }: ChatInputProps) => {
    const [message, setMessage] = useState('');
    const [focused, setFocused] = useState(false);

    const canSend = message.trim().length > 0 && !disabled;

    const handleSend = () => {
        if (canSend) {
            onSend(message.trim());
            setMessage('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleCreateAgent = () => {
        setMessage('Create AI agents for my business: ');
        setTimeout(() => {
            const input = document.querySelector('input[data-chat-input]') as HTMLInputElement;
            if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
        }, 0);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '12px 24px 16px',
            background: '#0D2D4B',
            borderTop: '1px solid rgba(73,182,132,0.1)',
        }}>
            {/* Quick action */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={handleCreateAgent}
                    disabled={disabled}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 14px',
                        background: 'rgba(73,182,132,0.08)',
                        border: '1px solid rgba(73,182,132,0.25)',
                        borderRadius: '20px',
                        color: '#49B684',
                        fontSize: '12px',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(73,182,132,0.18)'; } }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(73,182,132,0.08)'; }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                    </svg>
                    Create Agent for my Business
                </button>
            </div>

            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                    data-chat-input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    disabled={disabled}
                    placeholder={disabled ? 'Processing...' : 'Message Vomyra AI or paste a URL to generate agents...'}
                    style={{
                        flex: 1,
                        padding: '13px 18px',
                        background: '#071929',
                        border: `1px solid ${focused && !disabled ? '#49B684' : 'rgba(73,182,132,0.12)'}`,
                        borderRadius: '12px',
                        color: disabled ? 'rgba(255,255,255,0.3)' : '#EDF2F7',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        outline: 'none',
                        cursor: disabled ? 'not-allowed' : 'text',
                        transition: 'border-color 0.2s',
                        boxShadow: focused && !disabled ? '0 0 0 3px rgba(73,182,132,0.12)' : 'none',
                    }}
                />

                <button
                    onClick={handleSend}
                    disabled={!canSend}
                    style={{
                        background: canSend ? '#49B684' : 'rgba(73,182,132,0.08)',
                        color: canSend ? '#fff' : 'rgba(73,182,132,0.3)',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '13px 22px',
                        cursor: canSend ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s',
                        boxShadow: canSend ? '0 4px 16px rgba(73,182,132,0.35)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        minWidth: '88px',
                        justifyContent: 'center',
                    }}
                >
                    {disabled ? (
                        <span style={{ width: 14, height: 14, border: '2px solid rgba(73,182,132,0.3)', borderTopColor: '#49B684', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    ) : (
                        <>
                            Send
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </>
                    )}
                </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(180,205,225,0.25)' }}>
                Powered by Vomyra AI — Press Enter to send
            </div>
        </div>
    );
};

export default ChatInput;
