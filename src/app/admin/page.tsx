'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { getAdminAccount, createAdminAccount } from '@/lib/db';

const HARDCODED_EMAIL = 'admin@scheduleai.com';
const HARDCODED_PASS = 'admin2024';

export default function AdminPage() {
  const router = useRouter();

  // ── Login state ──────────────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Register state ───────────────────────────────────────────────────────────
  const [regName, setRegName] = useState('');
  const [regUniversity, setRegUniversity] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    await new Promise((r) => setTimeout(r, 500));

    // Hardcoded super-admin
    if (loginEmail.toLowerCase() === HARDCODED_EMAIL && loginPass === HARDCODED_PASS) {
      sessionStorage.setItem('sa_admin', '1');
      sessionStorage.setItem('sa_admin_name', 'ScheduleAI Admin');
      router.push('/admin/dashboard');
      return;
    }

    // Check registered accounts in Firestore
    try {
      const account = await getAdminAccount(loginEmail);
      if (account && account.password === loginPass) {
        sessionStorage.setItem('sa_admin', '1');
        sessionStorage.setItem('sa_admin_name', account.name);
        sessionStorage.setItem('sa_admin_university', account.universityName);
        router.push('/admin/dashboard');
        return;
      }
    } catch (err) {
      console.error(err);
    }

    setLoginError('Invalid credentials. Check your email and password.');
    setLoginLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');

    if (regPass !== regConfirm) {
      setRegError('Passwords do not match.');
      return;
    }
    if (regPass.length < 6) {
      setRegError('Password must be at least 6 characters.');
      return;
    }

    setRegLoading(true);
    try {
      const existing = await getAdminAccount(regEmail);
      if (existing) {
        setRegError('An account with this email already exists.');
        setRegLoading(false);
        return;
      }

      await createAdminAccount({
        name: regName.trim(),
        email: regEmail,
        universityName: regUniversity.trim(),
        password: regPass,
      });

      sessionStorage.setItem('sa_admin', '1');
      sessionStorage.setItem('sa_admin_name', regName.trim());
      sessionStorage.setItem('sa_admin_university', regUniversity.trim());
      router.push('/admin/dashboard');
    } catch (err) {
      console.error(err);
      setRegError('Registration failed. Please try again.');
      setRegLoading(false);
    }
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Logo />
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to home
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-14">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Admin portal</h1>
          <p className="text-slate-400 text-sm">University administrators only</p>
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl">

          {/* ── Sign In ─────────────────────────────────────────────────────── */}
          <div className="p-7 rounded-2xl border border-white/10 bg-slate-900/50 flex flex-col">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-7 h-7 rounded-lg bg-sky/10 border border-sky/20 flex items-center justify-center shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Sign in</h2>
                <p className="text-slate-500 text-xs">Access your dashboard</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col flex-1 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                  University email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@university.edu"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-sky/40 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-sky/40 transition-colors"
                />
              </div>

              {loginError && (
                <p className="text-red-400 text-xs px-0.5">{loginError}</p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="mt-auto w-full py-3 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {loginLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          {/* ── Register (WIP) ──────────────────────────────────────────────── */}
          <div className="p-7 rounded-2xl border border-white/10 bg-slate-900/50 flex flex-col relative overflow-hidden">
            {/* WIP ribbon */}
            <div className="absolute top-4 right-[-28px] rotate-45 bg-amber-500/90 text-black text-xs font-bold px-10 py-0.5 tracking-widest">
              WIP
            </div>

            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-7 h-7 rounded-lg bg-slate-700/60 border border-white/10 flex items-center justify-center shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
              <div>
                <h2 className="text-slate-400 font-semibold text-sm">Register</h2>
                <p className="text-slate-600 text-xs">Coming in Phase 10</p>
              </div>
            </div>

            {/* Dimmed fields */}
            <div className="flex flex-col flex-1 gap-3 opacity-30 pointer-events-none select-none">
              {['Full name', 'University name', 'University email'].map((label) => (
                <div key={label}>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>
                  <div className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-600 text-sm">
                    ——
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {['Password', 'Confirm'].map((label) => (
                  <div key={label}>
                    <label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>
                    <div className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-600 text-sm">
                      ——
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto w-full py-3 rounded-xl bg-slate-700 text-slate-500 font-semibold text-sm text-center">
                Create account
              </div>
            </div>

            {/* Overlay message */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="mx-6 px-5 py-4 rounded-2xl border border-amber-500/20 bg-midnight/90 backdrop-blur-sm text-center">
                <p className="text-amber-400 font-semibold text-sm mb-1">Coming soon</p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Admin registration will be properly built with Firebase Auth in Phase 10.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-slate-700 text-xs text-center">
          Full authentication coming in Phase 10 · Data stored securely in Firestore
        </p>
      </main>
    </div>
  );
}
