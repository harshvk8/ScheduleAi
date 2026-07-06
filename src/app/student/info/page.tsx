'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { getUniversity } from '@/data/universities';
import { saveUserProfile, getUserProfile } from '@/lib/db';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                done ? 'bg-sky text-white' : active ? 'bg-sky/20 border border-sky/50 text-sky' : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'
              }`}>
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-[10px] ${active ? 'text-sky' : done ? 'text-slate-500 dark:text-slate-400' : 'text-slate-500 dark:text-slate-600'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-12 sm:w-20 mx-1 mb-4 transition-colors ${i < current ? 'bg-sky/50' : 'bg-slate-200 dark:bg-white/8'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls = (hasError: boolean) =>
  `w-full px-3.5 py-3 rounded-xl border text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-1 transition-all ${
    hasError ? 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : 'border-slate-200 dark:border-white/10 focus:border-sky/50 focus:ring-sky/20'
  }`;

function friendlyAuthError(err: AuthError): string {
  switch (err.code) {
    case 'auth/email-already-in-use':
      return 'Account already exists. Switch to "Returning student" to sign in.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Wrong email or password. Please try again.';
    case 'auth/user-not-found':
      return 'No account found. Register as a new student.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled — contact support.';
    default:
      return `Something went wrong (${err.code}). Please try again.`;
  }
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function StudentInfoForm() {
  const params = useSearchParams();
  const router = useRouter();

  const universityId = params.get('university') ?? '';
  const university = getUniversity(universityId);

  const [mode, setMode] = useState<'new' | 'returning'>('new');

  // New student
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Returning student
  const [retEmail, setRetEmail] = useState('');
  const [retPassword, setRetPassword] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authError, setAuthError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  if (!university) {
    router.replace('/student');
    return null;
  }

  const clearError = (field: string) =>
    setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  // ── New student ───────────────────────────────────────────────────────────
  const handleNewSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAuthError('');
    const e: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 2) e.name = 'Enter your full name (at least 2 characters)';
    if (!email.trim()) e.email = 'Enter your university email';
    else if (!email.toLowerCase().endsWith(`@${university.domain}`)) e.email = `Must end with @${university.domain}`;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address';
    if (!studentId.trim()) e.studentId = 'Enter your student ID';
    else if (!/^[A-Za-z0-9-_]+$/.test(studentId.trim())) e.studentId = 'ID can only contain letters, numbers, and hyphens';
    if (!password) e.password = 'Choose a password';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';

    if (Object.keys(e).length > 0) { setErrors(e); return; }

    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const profileData = {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'student' as const,
        universityId,
        universityName: university.name,
        studentId: studentId.trim().toUpperCase(),
        domain: university.domain,
      };
      await saveUserProfile(cred.user.uid, profileData);
      sessionStorage.setItem('studentProfile', JSON.stringify({ ...profileData, uid: cred.user.uid }));
      router.push('/student/chatbot');
    } catch (err) {
      setAuthError(friendlyAuthError(err as AuthError));
      setSaving(false);
    }
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!retEmail.trim()) { setAuthError('Enter your email above first, then click Forgot password.'); return; }
    setResetLoading(true);
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, retEmail.trim().toLowerCase());
      setResetSent(true);
    } catch (err) {
      setAuthError(friendlyAuthError(err as AuthError));
    } finally {
      setResetLoading(false);
    }
  };

  // ── Returning student ─────────────────────────────────────────────────────
  const handleReturnSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAuthError('');
    if (!retEmail.trim() || !retPassword) { setAuthError('Enter your email and password.'); return; }

    setSaving(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, retEmail.trim().toLowerCase(), retPassword);
      const prof = await getUserProfile(cred.user.uid);
      if (!prof || prof.role !== 'student') {
        await auth.signOut();
        setAuthError('This account is not a student account.');
        setSaving(false);
        return;
      }
      sessionStorage.setItem('studentProfile', JSON.stringify({ ...prof }));
      router.push('/student/chatbot');
    } catch (err) {
      setAuthError(friendlyAuthError(err as AuthError));
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-100 dark:border-white/5">
        <Logo />
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-14">
        <div className="w-full max-w-md">
          <StepBar current={1} />

          {/* University badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/8 bg-white/95 dark:bg-slate-900/50 mb-6">
            <div className="w-7 h-7 rounded-lg bg-sky/15 border border-sky/25 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 dark:text-slate-500">Selected university</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{university.name}</p>
            </div>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-600 shrink-0">{university.domain}</span>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 p-1 mb-8">
            {(['new', 'returning'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setAuthError(''); setErrors({}); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m ? 'bg-sky text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}>
                {m === 'new' ? 'New student' : 'Returning student'}
              </button>
            ))}
          </div>

          {/* ── New student ── */}
          {mode === 'new' && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Create your account</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
                Your university email and student ID personalise your scheduling experience.
              </p>
              <form onSubmit={handleNewSubmit} noValidate className="space-y-5">
                <Field label="Full name" error={errors.name}>
                  <input type="text" placeholder="e.g. Jordan Smith" value={name}
                    onChange={(e) => { setName(e.target.value); clearError('name'); }}
                    autoComplete="name" className={inputCls(!!errors.name)} />
                </Field>
                <Field label="University email" hint={`Must end with @${university.domain}`} error={errors.email}>
                  <input type="email" placeholder={`you@${university.domain}`} value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
                    autoComplete="email" className={inputCls(!!errors.email)} />
                </Field>
                <Field label="Student ID" error={errors.studentId}>
                  <input type="text" placeholder="e.g. 123456789" value={studentId}
                    onChange={(e) => { setStudentId(e.target.value); clearError('studentId'); }}
                    autoComplete="off" className={inputCls(!!errors.studentId)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Password" error={errors.password}>
                    <input type="password" placeholder="Min 6 chars" value={password}
                      onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
                      autoComplete="new-password" className={inputCls(!!errors.password)} />
                  </Field>
                  <Field label="Confirm" error={errors.confirmPassword}>
                    <input type="password" placeholder="Repeat" value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }}
                      autoComplete="new-password" className={inputCls(!!errors.confirmPassword)} />
                  </Field>
                </div>
                {authError && (
                  <div className="px-3.5 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
                    {authError}
                  </div>
                )}
                <button type="submit" disabled={saving}
                  className="w-full mt-2 py-3.5 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {saving ? 'Creating account…' : 'Create account & start chatbot'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </form>
            </>
          )}

          {/* ── Returning student ── */}
          {mode === 'returning' && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Welcome back</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Sign in with your ScheduleAI student account.</p>
              <form onSubmit={handleReturnSubmit} noValidate className="space-y-5">
                <Field label="University email" error={undefined}>
                  <input type="email" placeholder={`you@${university.domain}`} value={retEmail}
                    onChange={(e) => { setRetEmail(e.target.value); setResetSent(false); }}
                    autoComplete="email" className={inputCls(false)} />
                </Field>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs text-sky hover:text-sky/80 transition-colors disabled:opacity-50"
                    >
                      {resetLoading ? 'Sending…' : 'Forgot password?'}
                    </button>
                  </div>
                  <input type="password" placeholder="••••••••" value={retPassword}
                    onChange={(e) => setRetPassword(e.target.value)}
                    autoComplete="current-password" className={inputCls(false)} />
                </div>
                {resetSent && (
                  <div className="px-3.5 py-2.5 rounded-xl border border-green-500/20 bg-green-500/10 text-green-400 text-sm">
                    Password reset email sent — check your inbox.
                  </div>
                )}
                {authError && (
                  <div className="px-3.5 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
                    {authError}
                  </div>
                )}
                <button type="submit" disabled={saving}
                  className="w-full mt-2 py-3.5 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {saving ? 'Signing in…' : 'Sign in & go to chatbot'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-xs text-slate-500 dark:text-slate-600 text-center leading-relaxed">
            Secured with Firebase Authentication · Passwords are never stored in plain text
          </p>
        </div>
      </main>
    </div>
  );
}

export default function StudentInfoPage() {
  return (
    <Suspense>
      <StudentInfoForm />
    </Suspense>
  );
}
