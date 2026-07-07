'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { saveUserProfile, getUserProfile } from '@/lib/db';
import { useAuth } from '@/lib/AuthContext';
import { UNIVERSITIES } from '@/data/universities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function friendlyError(err: AuthError): string {
  switch (err.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/60 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 text-sm focus:outline-none focus:border-sky/40 transition-colors';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && profile?.role === 'admin') {
      router.replace('/admin/dashboard');
    }
  }, [user, profile, loading, router]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [regName, setRegName] = useState('');
  const [regUniversityId, setRegUniversityId] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPass);
      const prof = await getUserProfile(cred.user.uid);
      if (!prof || prof.role !== 'admin') {
        await auth.signOut();
        setLoginError('This account does not have admin access.');
        setLoginLoading(false);
        return;
      }
      router.push('/admin/dashboard');
    } catch (err) {
      setLoginError(friendlyError(err as AuthError));
      setLoginLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');
    const university = UNIVERSITIES.find((u) => u.id === regUniversityId);
    if (!regName.trim()) { setRegError('Enter your full name.'); return; }
    if (!university) { setRegError('Select your university.'); return; }
    if (regPass !== regConfirm) { setRegError('Passwords do not match.'); return; }
    if (regPass.length < 6) { setRegError('Password must be at least 6 characters.'); return; }

    setRegLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPass);
      await saveUserProfile(cred.user.uid, {
        email: regEmail.trim().toLowerCase(),
        name: regName.trim(),
        role: 'admin',
        universityId: university.id,
        universityName: university.name,
      });
      router.push('/admin/dashboard');
    } catch (err) {
      setRegError(friendlyError(err as AuthError));
      setRegLoading(false);
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-100 dark:border-white/5">
        <Logo />
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to home
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-14">
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Admin portal</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">University administrators only</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl">

          {/* Sign In */}
          <div className="p-7 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/50 flex flex-col">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-7 h-7 rounded-lg bg-sky/10 border border-sky/20 flex items-center justify-center shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <div>
                <h2 className="text-slate-900 dark:text-white font-semibold text-sm">Sign in</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs">Access your dashboard</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col flex-1 gap-3">
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">Email</label>
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@university.edu" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">Password</label>
                <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••" required className={inputCls} />
              </div>
              {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
              <button type="submit" disabled={loginLoading}
                className="mt-auto w-full py-3 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                {loginLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          {/* Register */}
          <div className="p-7 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/50 flex flex-col">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
              <div>
                <h2 className="text-slate-900 dark:text-white font-semibold text-sm">Create account</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs">Register as university admin</p>
              </div>
            </div>

            <form onSubmit={handleRegister} className="flex flex-col flex-1 gap-3">
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">Full name</label>
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                  placeholder="Dr. Jane Smith" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">University</label>
                <select value={regUniversityId} onChange={(e) => setRegUniversityId(e.target.value)}
                  required className={`${inputCls} cursor-pointer`}>
                  <option value="">Select your university</option>
                  {UNIVERSITIES.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">Email</label>
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="admin@university.edu" required className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">Password</label>
                  <input type="password" value={regPass} onChange={(e) => setRegPass(e.target.value)}
                    placeholder="••••••" required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-slate-700 dark:text-slate-400 mb-1.5 font-medium">Confirm</label>
                  <input type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)}
                    placeholder="••••••" required className={inputCls} />
                </div>
              </div>
              {regError && <p className="text-red-400 text-xs">{regError}</p>}
              <button type="submit" disabled={regLoading}
                className="mt-auto w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-600/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                {regLoading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-slate-700 text-xs text-center">
          Secured with Firebase Authentication · Passwords are never stored in plain text
        </p>
      </main>
    </div>
  );
}
