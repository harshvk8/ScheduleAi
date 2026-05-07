import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NormalUserPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Logo />
        <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors duration-150">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </Link>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mx-auto mb-6">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Personal scheduling chatbot</h1>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
          Phase 2 will bring a full chatbot interface and live timetable so you can plan your week with plain English.
        </p>
        <div className="mt-8 px-4 py-3 rounded-xl border border-white/8 bg-slate-900/40 text-xs text-slate-500">
          Coming in Phase 2
        </div>
      </main>
    </div>
  );
}
