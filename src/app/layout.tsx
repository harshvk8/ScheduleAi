import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScheduleAI',
  description: 'AI-powered academic and life scheduling for students.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
