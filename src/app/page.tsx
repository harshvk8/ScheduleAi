import Link from 'next/link';
import Logo from '@/components/Logo';
import AnalogClock from '@/components/AnalogClock';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/5">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            href="/professors"
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Find Professors
          </Link>
          <Link
            href="/admin"
            className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200"
          >
            Admin Login
          </Link>
        </div>
      </header>

      {/* ── Main two-column hero ── */}
      <main className="flex-1 flex">
        {/* Left column */}
        <div className="flex-1 flex flex-col justify-center px-16 lg:px-24 xl:px-32">
          <p className="text-[11px] tracking-[0.28em] text-slate-400 dark:text-slate-500 uppercase font-medium mb-10">
            V1.0 — Scheduling, Rewritten
          </p>

          <h1 className="text-5xl sm:text-6xl lg:text-[64px] font-bold text-slate-900 dark:text-white leading-[1.1] mb-6">
            Plan the day<br />you actually<br />have.
          </h1>

          <p className="text-slate-500 dark:text-slate-400 max-w-[360px] leading-relaxed text-[15px] mb-10">
            Most planners assume infinite time. ScheduleAI starts
            with the hours you&apos;ve got — work, class, sleep — and
            arranges everything else around them.
          </p>

          <div className="flex flex-wrap gap-4 mb-8">
            <Link
              href="/normal-user"
              className="px-6 py-3 bg-white text-[#030712] font-semibold rounded-lg text-sm border border-slate-200 dark:border-transparent hover:bg-white/90 shadow-sm transition-colors"
            >
              I&apos;m a normal user
            </Link>
            <Link
              href="/student"
              className="px-6 py-3 border border-slate-300 dark:border-white/25 text-slate-900 dark:text-white font-semibold rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              I&apos;m a student
            </Link>
          </div>

          <p className="text-slate-500 dark:text-slate-600 text-[13px]">
            University admin?{' '}
            <Link href="/admin" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors">
              Open the admin portal.
            </Link>
          </p>
        </div>

        {/* Right column — clock */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <AnalogClock />
        </div>
      </main>

      {/* ── Footer feature row ── */}
      <footer className="px-8 py-5 border-t border-slate-100 dark:border-white/5">
        <div className="flex items-center justify-center gap-0 text-[11px] text-slate-500 dark:text-slate-600 tracking-wide">
          {['conflict detection', 'chat to edit', 'professor insights', 'google calendar sync'].map((f, i, arr) => (
            <span key={f} className="flex items-center gap-0">
              <span>{f}</span>
              {i < arr.length - 1 && <span className="mx-4 opacity-40">·</span>}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
