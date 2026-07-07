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

// ─── Terms & Conditions ───────────────────────────────────────────────────────

function TermsModal({ onClose, onAgree }: { onClose: () => void; onAgree: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h2 className="text-slate-900 dark:text-white font-semibold">Terms &amp; Conditions and Privacy Policy</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-5">
          <div className="px-3.5 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs leading-relaxed">
            <strong>Notice:</strong> This document is a template intended to give ScheduleAI a strong, comprehensive starting
            point for informing students how their data is collected and used. It is not a substitute for advice from a
            licensed attorney. Before relying on this as your binding, production Terms &amp; Conditions, have it reviewed
            by counsel familiar with FERPA, applicable state law, and the jurisdictions where your students are enrolled.
          </div>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">1. Acceptance of Terms</h3>
            <p>
              By creating an account, accessing, or using ScheduleAI (the &ldquo;Service&rdquo;), you agree to be bound by
              these Terms &amp; Conditions (&ldquo;Terms&rdquo;) and our Privacy Policy, which is incorporated into these
              Terms by reference. If you do not agree to these Terms, do not create an account or use the Service. These
              Terms constitute a legally binding agreement between you and the operator of ScheduleAI (&ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">2. Description of the Service</h3>
            <p>
              ScheduleAI is a scheduling-assistance tool that helps students describe their course, professor, timing, and
              format preferences through a conversational interface, and helps university administrators understand
              aggregate, anonymized demand when planning course offerings. ScheduleAI is an independent tool and is not
              officially operated, endorsed, or controlled by any university unless separately and explicitly agreed in
              writing.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">3. Eligibility</h3>
            <p>
              The Service is intended for currently enrolled college or university students who are at least 13 years old,
              and is not directed at children under 13 within the meaning of the Children&apos;s Online Privacy Protection
              Act (COPPA). If you are under the age of majority in your jurisdiction, you represent that you have your
              parent or guardian&apos;s permission to use the Service. You must register using a valid university-issued
              email address ending in your school&apos;s domain.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">4. Information We Collect</h3>
            <p>When you create a student account and use the Service, we collect:</p>
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              <li>Account information: your full name, university email address, student ID, and university/domain.</li>
              <li>Scheduling preferences: courses, preferred professors, preferred/avoided days and times, class format
                (online, hybrid, in-person), and any work or availability constraints you describe.</li>
              <li>Conversation content: messages you send to the AI scheduling assistant, which are processed to extract
                the preferences above and to generate helpful replies.</li>
              <li>Optional professor feedback: ratings and written comments you submit are stored without your name or
                email attached — they are anonymous by design.</li>
              <li>Technical data: session identifiers, error/crash diagnostics, and basic usage data used to keep the
                Service working correctly.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">5. How We Use Your Information</h3>
            <p>We use the information described above to:</p>
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              <li>Operate, maintain, and personalize the scheduling assistant for you.</li>
              <li>Let your university&apos;s administrators view aggregate, anonymized demand for courses, professors,
                days, times, and class formats — never your name or email.</li>
              <li>Compute anonymous, aggregate professor-demand and rating statistics shown on the public professor
                ratings page.</li>
              <li>Diagnose and fix technical problems.</li>
              <li>Comply with legal obligations and enforce these Terms.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">6. University Administrator Access</h3>
            <p>
              A university administrator account can only view schedule requests submitted by students at that same
              university, and only in anonymized form — requests are labeled &ldquo;Student 1,&rdquo; &ldquo;Student
              2,&rdquo; and so on, never by your name or email address. Administrators cannot access requests submitted
              by students at other universities. This access boundary is enforced both in the application and at the
              database level.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">7. FERPA &amp; Educational Records</h3>
            <p>
              We intend to handle student information consistent with the principles of the Family Educational Rights and
              Privacy Act (FERPA), including minimizing the disclosure of personally identifiable information from
              education records. ScheduleAI is a student-facing scheduling-preference tool; whether specific data
              collected here constitutes an &ldquo;education record&rdquo; under FERPA depends on your university&apos;s
              relationship with this Service, which should be confirmed with your institution&apos;s registrar or legal
              counsel before wide deployment.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">8. Third-Party Service Providers</h3>
            <p>
              We use third-party infrastructure providers to operate the Service, including but not limited to Google
              Firebase (authentication and database hosting), an AI language-model provider (to power the conversational
              scheduling assistant), and Upstash (rate limiting). These providers process data on our behalf under their
              own security and data-processing terms and do not independently use your information for their own
              purposes beyond providing that infrastructure.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">9. Data Retention</h3>
            <p>
              We retain account information and schedule requests for as long as your account remains active and as
              needed to provide the Service, resolve disputes, and comply with legal obligations. You may request
              deletion of your account and associated data at any time using the contact information below; we will
              honor such requests within a reasonable time except where retention is required by law.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">10. Data Security</h3>
            <p>
              We use industry-standard safeguards, including authenticated access controls and database security rules
              that restrict who can read or write your data, to protect your information. No method of transmission or
              storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">11. Your Rights and Choices</h3>
            <p>
              You may request access to, correction of, or deletion of your personal information, and you may withdraw
              your consent to non-essential processing at any time, subject to the limits described above. Doing so may
              limit or end your ability to use the Service.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">12. Cookies and Local Storage</h3>
            <p>
              The Service uses browser session storage and local storage to keep you signed in, remember your theme
              preference, and maintain your in-progress conversation with the scheduling assistant. These are functional
              and not used for third-party advertising.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">13. Changes to These Terms</h3>
            <p>
              We may update these Terms from time to time. Material changes will be reflected by an updated effective
              date. Your continued use of the Service after changes take effect constitutes acceptance of the revised
              Terms.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">14. Disclaimer of Warranties</h3>
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND,
              WHETHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT GUARANTEE THAT SCHEDULING SUGGESTIONS WILL BE ACCURATE,
              CONFLICT-FREE, OR ACCEPTED BY YOUR UNIVERSITY.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">15. Limitation of Liability</h3>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, INCLUDING ANY
              SCHEDULING CONFLICTS, MISSED REGISTRATION DEADLINES, OR DATA LOSS.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">16. Governing Law</h3>
            <p>
              These Terms are governed by the laws of the State of New Jersey, United States, without regard to its
              conflict-of-laws principles, unless otherwise required by the laws of your jurisdiction. <em>(Confirm this
              choice of law with counsel before relying on it.)</em>
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5">17. Contact</h3>
            <p>
              Questions about these Terms, or requests to access, correct, or delete your information, can be sent to
              the ScheduleAI support contact provided by your university administrator or through the feedback channel
              in the app.
            </p>
          </section>
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm hover:text-slate-900 dark:hover:text-white transition-colors">
            Close
          </button>
          <button onClick={onAgree} className="px-4 py-2 rounded-lg bg-sky text-white font-semibold text-sm hover:bg-sky/90 transition-colors">
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

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
    if (!agreedToTerms) e.terms = 'You must agree to the Terms & Conditions to continue';

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

                <div>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => { setAgreedToTerms(e.target.checked); clearError('terms'); }}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-white/20 text-sky focus:ring-sky/40 shrink-0"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      I have read and agree to the{' '}
                      <button type="button" onClick={() => setShowTerms(true)} className="text-sky hover:text-sky/80 underline underline-offset-2">
                        Terms &amp; Conditions and Privacy Policy
                      </button>
                    </span>
                  </label>
                  {errors.terms && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {errors.terms}
                    </p>
                  )}
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

      {showTerms && (
        <TermsModal
          onClose={() => setShowTerms(false)}
          onAgree={() => { setAgreedToTerms(true); clearError('terms'); setShowTerms(false); }}
        />
      )}
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
