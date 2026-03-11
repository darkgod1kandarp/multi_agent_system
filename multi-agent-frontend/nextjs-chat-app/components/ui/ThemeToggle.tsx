"use client"

import { useState } from 'react';

const ThemeToggle = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);

    const toggleTheme = () => {
        setIsDarkMode(!isDarkMode);
        document.body.classList.toggle('dark', !isDarkMode);
    };

    return (
        <button
            onClick={toggleTheme}
            style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '7px 14px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: 'inherit',
            }}
        >
            {isDarkMode ? '☀ Light' : '🌙 Dark'}
        </button>
    );
};

export default ThemeToggle;