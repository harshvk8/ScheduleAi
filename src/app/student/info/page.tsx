'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { getUniversity } from '@/data/universities';
import { saveUser } from '@/lib/db';

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['University', 'Your info', 'Chatbot'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  done
                    ? 'bg-sky text-white'
                    : active
                    ? 'bg-sky/20 border border-sky/50 text-sky'
                    : 'bg-slate-800 border border-white/10 text-slate-500'
                }`}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-[10px] ${active ? 'text-sky' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-12 sm:w-20 mx-1 mb-4 transition-colors ${
                  i < current ? 'bg-sky/50' : 'bg-white/8'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls = (hasError: boolean) =>
  `w-full px-3.5 py-3 rounded-xl border text-sm text-white placeholder:text-slate-600 bg-slate-900/60 focus:outline-none focus:ring-1 transition-all ${
    hasError
      ? 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20'
      : 'border-white/10 focus:border-sky/50 focus:ring-sky/20'
  }`;

// ─── Form (needs useSearchParams → must be inside Suspense) ──────────────────

function StudentInfoForm() {
  const params = useSearchParams();
  const router = useRouter();

  const universityId = params.get('university') ?? '';
  const university = getUniversity(universityId);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Redirect back if no valid university in URL
  if (!university) {
    router.replace('/student');
    return null;
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2)
      e.name = 'Enter your full name (at least 2 characters)';

    if (!email.trim()) {
      e.email = 'Enter your university email';
    } else if (!email.toLowerCase().endsWith(`@${university.domain}`)) {
      e.email = `Must end with @${university.domain}`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'Enter a valid email address';
    }

    if (!studentId.trim())
      e.studentId = 'Enter your student ID';
    else if (!/^[A-Za-z0-9-_]+$/.test(studentId.trim()))
      e.studentId = 'ID can only contain letters, numbers, and hyphens';

    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const profile = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      studentId: studentId.trim().toUpperCase(),
      universityId,
      universityName: university.name,
      domain: university.domain,
    };

    sessionStorage.setItem('studentProfile', JSON.stringify(profile));

    setSaving(true);
    saveUser(profile).catch(console.error);

    router.push('/student/chatbot');
  };

  const clearError = (field: string) =>
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Logo />
        <button
          onClick={() => router.push('/student')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-6 py-14">
        <div className="w-full max-w-md">
          <StepBar current={1} />

          {/* University badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/8 bg-slate-900/50 mb-8">
            <div className="w-7 h-7 rounded-lg bg-sky/15 border border-sky/25 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Selected university</p>
              <p className="text-sm font-medium text-white truncate">{university.name}</p>
            </div>
            <span className="ml-auto text-xs text-slate-600 shrink-0">{university.domain}</span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">Tell us about yourself</h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            We only need three things to personalise your scheduling experience.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Name */}
            <Field label="Full name" error={errors.name}>
              <input
                type="text"
                placeholder="e.g. Jordan Smith"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError('name'); }}
                autoComplete="name"
                className={inputCls(!!errors.name)}
              />
            </Field>

            {/* Email */}
            <Field
              label="University email"
              hint={`Must end with @${university.domain}`}
              error={errors.email}
            >
              <input
                type="email"
                placeholder={`you@${university.domain}`}
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
                autoComplete="email"
                className={inputCls(!!errors.email)}
              />
            </Field>

            {/* Student ID */}
            <Field label="Student ID" error={errors.studentId}>
              <input
                type="text"
                placeholder="e.g. 123456789"
                value={studentId}
                onChange={(e) => { setStudentId(e.target.value); clearError('studentId'); }}
                autoComplete="off"
                className={inputCls(!!errors.studentId)}
              />
            </Field>

            {/* Submit */}
            <button
              type="submit"
              disabled={saving}
              className="w-full mt-2 py-3.5 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Start chatbot'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-600 text-center leading-relaxed">
            Your profile is saved to the database. Real authentication comes in Phase 10.
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── Page export (Suspense required for useSearchParams in App Router) ────────

export default function StudentInfoPage() {
  return (
    <Suspense>
      <StudentInfoForm />
    </Suspense>
  );
}
