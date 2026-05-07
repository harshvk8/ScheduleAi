import Link from 'next/link';
import Logo from '@/components/Logo';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Logo />
        <Link
          href="/admin"
          className="px-4 py-2 text-sm text-slate-400 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white hover:border-white/20 transition-all duration-200"
        >
          Admin Login
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-full border border-sky/30 bg-sky/10 text-sky text-sm font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-sky animate-pulse inline-block" />
          AI-Powered Scheduling
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight max-w-3xl mb-5">
          Your schedule,{' '}
          <span className="text-sky">intelligently</span> planned.
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-slate-400 max-w-xl mb-14 leading-relaxed">
          Tell ScheduleAI about your courses, work hours, and life.
          Get a balanced, conflict-free schedule — built by AI, refined by you.
        </p>

        {/* Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
          {/* Normal User */}
          <Link href="/normal-user" className="group">
            <div className="h-full p-7 rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl hover:border-sky/40 hover:bg-slate-900/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow text-left cursor-pointer">
              <div className="w-11 h-11 rounded-xl bg-sky/10 border border-sky/20 flex items-center justify-center mb-5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Normal User</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Manage your personal schedule. Add work shifts, routines, and goals — let AI organize your day.
              </p>
              <div className="flex items-center gap-1.5 text-sky text-sm font-medium group-hover:gap-3 transition-all duration-200">
                Continue
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Student */}
          <Link href="/student" className="group">
            <div className="h-full p-7 rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl hover:border-sky/40 hover:bg-slate-900/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow text-left cursor-pointer">
              <div className="w-11 h-11 rounded-xl bg-sky/10 border border-sky/20 flex items-center justify-center mb-5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Student</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                University scheduling assistant. Plan courses, choose professors, and avoid time conflicts with AI.
              </p>
              <div className="flex items-center gap-1.5 text-sky text-sm font-medium group-hover:gap-3 transition-all duration-200">
                Continue
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Feature highlights */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl text-left">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-sky/20 flex items-center justify-center shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Conflict Detection</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Spots scheduling clashes before they happen.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-sky/20 flex items-center justify-center shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Chat to Edit</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Adjust your schedule with plain English.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-sky/20 flex items-center justify-center shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Professor Insights</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Find the right professors from real student feedback.</p>
            </div>
          </div>
        </div>

        {/* Admin footer link */}
        <p className="mt-14 text-slate-600 text-sm">
          University admin?{' '}
          <Link href="/admin" className="text-slate-500 hover:text-sky transition-colors duration-150">
            Access the admin portal →
          </Link>
        </p>
      </main>
    </div>
  );
}
