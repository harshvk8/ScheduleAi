'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

interface StudentProfile {
  name: string;
  email: string;
  studentId: string;
  universityName: string;
}

export default function StudentChatbotPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('studentProfile');
    if (!raw) {
      router.replace('/student');
      return;
    }
    try {
      setProfile(JSON.parse(raw));
    } catch {
      router.replace('/student');
    }
  }, [router]);

  if (!profile) return null;

  const firstName = profile.name.split(' ')[0];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Logo />
        <button
          onClick={() => router.push('/student/info')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Profile summary */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/8 bg-slate-900/50 mb-10">
          <div className="w-9 h-9 rounded-full bg-sky/15 border border-sky/25 flex items-center justify-center text-sky font-bold text-sm shrink-0">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-white">{profile.name}</p>
            <p className="text-xs text-slate-500">{profile.universityName} · {profile.studentId}</p>
          </div>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mx-auto mb-6">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Hey {firstName}, ready to build your schedule?
        </h1>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-3">
          Phase 4 will bring the student scheduling chatbot — tell it your courses, preferred professors, and time constraints.
        </p>

        <div className="px-4 py-3 rounded-xl border border-white/8 bg-slate-900/40 text-xs text-slate-500">
          Student chatbot coming in Phase 4
        </div>
      </main>
    </div>
  );
}
