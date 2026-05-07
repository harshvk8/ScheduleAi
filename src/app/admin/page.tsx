import Link from 'next/link';
import Logo from '@/components/Logo';

export default function AdminPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Logo />
        <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors duration-150">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to home
        </Link>
      </header>

      {/* Login form */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Icon */}
          <div className="w-12 h-12 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mx-auto mb-6">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white text-center mb-1">Admin portal</h1>
          <p className="text-slate-400 text-sm text-center mb-8">University administrators only</p>

          {/* Form fields */}
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">University email</label>
              <input
                type="email"
                placeholder="admin@university.edu"
                disabled
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-500 placeholder:text-slate-600 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                disabled
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-500 placeholder:text-slate-600 text-sm cursor-not-allowed"
              />
            </div>
          </div>

          <button
            disabled
            className="w-full py-3.5 rounded-xl bg-sky/50 text-white/60 font-semibold text-sm cursor-not-allowed transition-all"
          >
            Sign in
          </button>

          <div className="mt-6 px-4 py-3 rounded-xl border border-white/8 bg-slate-900/40 text-xs text-slate-500 text-center">
            Authentication coming in Phase 10 · Admin dashboard in Phase 6
          </div>
        </div>
      </main>
    </div>
  );
}
