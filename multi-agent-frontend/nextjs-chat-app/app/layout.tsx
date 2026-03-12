import './globals.css';
import ClientProviders from '../components/ClientProviders';

export const metadata = {
  title: 'Vomyra Chat',
  description: 'AI-powered chat — Vomyra',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#0b0e17', minHeight: '100vh' }}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
