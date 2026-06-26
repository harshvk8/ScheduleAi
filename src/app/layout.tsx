import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ScheduleAI',
  description: 'AI-powered scheduling for students and professionals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var theme = localStorage.getItem('theme');
            if (theme !== 'light') document.documentElement.classList.add('dark');
          })();
        `}} />
      </head>
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
        <ThemeToggle />
      </body>
    </html>
  );
}
