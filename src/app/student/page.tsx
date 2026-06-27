'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { UNIVERSITIES } from '@/data/universities';

export default function StudentPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();

  const filtered = UNIVERSITIES.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.location.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUniversity = UNIVERSITIES.find((u) => u.id === selected);

  const handleContinue = () => {
    if (selected) {
      router.push(`/student/info?university=${selected}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/5">
        <Logo />
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 text-center">Select your university</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-8 leading-relaxed">
            We'll personalise your scheduling experience based on your school's programmes and course catalog.
          </p>

          {/* Search */}
          <div className="relative mb-3">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search universities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky/50 focus:ring-1 focus:ring-sky/20 transition-all text-sm"
            />
          </div>

          {/* University list */}
          <div className="space-y-2 mb-6 max-h-80 overflow-y-auto pr-0.5">
            {filtered.map((uni) => (
              <button
                key={uni.id}
                onClick={() => setSelected(uni.id)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${
                  selected === uni.id
                    ? 'border-sky/50 bg-sky/10 text-sky-700 dark:text-white'
                    : 'border-slate-200 dark:border-white/8 bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-slate-900/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{uni.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{uni.location} · {uni.domain}</p>
                  </div>
                  {selected === uni.id && (
                    <div className="w-5 h-5 rounded-full bg-sky flex items-center justify-center shrink-0 ml-3">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">
                No universities found for "{search}"
              </div>
            )}
          </div>

          {/* Continue button */}
          <button
            onClick={handleContinue}
            disabled={!selected}
            className="w-full py-3.5 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {selectedUniversity ? `Continue with ${selectedUniversity.name.split(' ')[0]}` : 'Select a university to continue'}
            {selected && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
