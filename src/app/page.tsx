'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import AnalogClock from '@/components/AnalogClock';
import IntroAnimation from '@/components/IntroAnimation';

export default function Home() {
  const [done, setDone] = useState(false);
  const onDone = useCallback(() => setDone(true), []);

  // Slide-up reveal — CSS animation runs once when `done` flips
  function up(delay: number): React.CSSProperties {
    return done
      ? { animation: `pageUp .65s cubic-bezier(.16,1,.3,1) ${delay}ms both` }
      : { opacity: 0 };
  }

  function fadeIn(delay: number): React.CSSProperties {
    return done
      ? { animation: `pageFade .55s ease-out ${delay}ms both` }
      : { opacity: 0 };
  }

  return (
    <>
      {/* ── Keyframes (injected once when content reveals) ── */}
      {done && (
        <style>{`
          @keyframes pageUp {
            from { opacity: 0; transform: translateY(22px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes pageFade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}</style>
      )}

      {/* ── Cinematic intro (unmounts after transition) ── */}
      {!done && <IntroAnimation onDone={onDone} />}

      {/* ── Page ── */}
      <div className="min-h-screen flex flex-col">

        <header style={fadeIn(0)}
          className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-100 dark:border-white/5"
        >
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/professors"
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <span className="hidden sm:inline">Find Professors</span>
            </Link>
            <Link
              href="/admin"
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200 whitespace-nowrap"
            >
              <span className="sm:hidden">Admin</span>
              <span className="hidden sm:inline">Admin Login</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 flex flex-col lg:flex-row">
          {/* Left column */}
          <div className="flex-1 flex flex-col justify-center items-center lg:items-start text-center lg:text-left px-6 sm:px-10 md:px-16 lg:px-24 xl:px-32 py-12 lg:py-0">

            <div style={up(0)}>
              <p className="text-[10px] sm:text-[11px] tracking-[0.28em] text-slate-400 dark:text-slate-500 uppercase font-medium mb-8 sm:mb-10">
                V1.0 — Scheduling, Rewritten
              </p>
            </div>

            <div style={up(80)}>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[64px] font-bold text-slate-900 dark:text-white leading-[1.1] mb-6">
                Plan the day<br />you actually<br />have.
              </h1>
            </div>

            <div style={up(180)}>
              <p className="text-slate-500 dark:text-slate-400 max-w-[360px] leading-relaxed text-sm sm:text-[15px] mb-8 sm:mb-10">
                Most planners assume infinite time. ScheduleAI starts
                with the hours you&apos;ve got — work, class, sleep — and
                arranges everything else around them.
              </p>
            </div>

            <div style={up(280)} className="flex flex-wrap justify-center lg:justify-start gap-4 mb-8 w-full sm:w-auto">
              <Link
                href="/normal-user"
                className="px-6 py-3 bg-white text-[#030712] font-semibold rounded-lg text-sm border border-slate-200 dark:border-transparent hover:bg-white/90 shadow-sm transition-colors text-center"
              >
                I&apos;m a normal user
              </Link>
              <Link
                href="/student"
                className="px-6 py-3 border border-slate-300 dark:border-white/25 text-slate-900 dark:text-white font-semibold rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-center"
              >
                I&apos;m a student
              </Link>
            </div>

            <div style={up(360)}>
              <p className="text-slate-500 dark:text-slate-600 text-[13px]">
                University admin?{' '}
                <Link href="/admin" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors">
                  Open the admin portal.
                </Link>
              </p>
            </div>
          </div>

          {/* Right column */}
          <div style={fadeIn(200)}
            className="flex-1 flex flex-col items-center justify-center pb-12 lg:py-0"
          >
            <AnalogClock />
          </div>
        </main>

        <footer style={fadeIn(420)}
          className="px-4 sm:px-8 py-5 border-t border-slate-100 dark:border-white/5"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-0 gap-y-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-600 tracking-wide">
            {['conflict detection', 'chat to edit', 'professor insights', 'google calendar sync'].map((f, i, arr) => (
              <span key={f} className="flex items-center gap-0">
                <span>{f}</span>
                {i < arr.length - 1 && <span className="mx-2 sm:mx-4 opacity-40">·</span>}
              </span>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
