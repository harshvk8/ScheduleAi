import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
      <div className="w-8 h-8 rounded-lg bg-sky flex items-center justify-center shadow-glow">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="m9 16 2 2 4-4" />
        </svg>
      </div>
      <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">ScheduleAI</span>
    </Link>
  );
}
