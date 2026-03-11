import './globals.css';

export const metadata = {
  title: 'Vomyra Chat',
  description: 'AI-powered chat — Vomyra',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#0b0e17', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
