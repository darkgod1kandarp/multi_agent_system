import React from 'react';
import ChatWindow from '../components/chat/ChatWindow';

const Page = () => {
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#22c55e',
                        background: 'rgba(34,197,94,0.1)',
                        border: '1px solid rgba(34,197,94,0.25)',
                        padding: '4px 10px',
                        borderRadius: '20px',
                    }}>● Online</span>
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
