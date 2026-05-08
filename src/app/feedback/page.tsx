'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { saveProfessorFeedback } from '@/lib/db';
import { UNIVERSITIES } from '@/data/universities';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarPicker({
  value,
  onChange,
  low,
  high,
}: {
  value: number | null;
  onChange: (v: number) => void;
  low: string;
  high: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? value;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="focus:outline-none transition-transform hover:scale-110"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill={active !== null && i <= active ? '#0ea5e9' : 'none'}
              stroke={active !== null && i <= active ? '#0ea5e9' : '#334155'}
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        ))}
      </div>
      <div className="flex justify-between text-slate-600 text-xs">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function RatingRow({
  label,
  description,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  description: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-8 py-4 border-b border-white/5 last:border-0">
      <div className="sm:w-52 shrink-0">
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-slate-500 text-xs mt-0.5">{description}</p>
      </div>
      <StarPicker value={value} onChange={onChange} low={low} high={high} />
    </div>
  );
}

// ─── Main form (uses useSearchParams — must be in Suspense) ───────────────────

function FeedbackForm() {
  const params = useSearchParams();
  const router = useRouter();

  const [professorName, setProfessorName] = useState(params.get('professor') ?? '');
  const [courseCode, setCourseCode] = useState(params.get('course') ?? '');
  const [universityId, setUniversityId] = useState('');
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [teachingClarity, setTeachingClarity] = useState<number | null>(null);
  const [workload, setWorkload] = useState<number | null>(null);
  const [attendanceStrictness, setAttendanceStrictness] = useState<number | null>(null);
  const [wouldTakeAgain, setWouldTakeAgain] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill university from sessionStorage if student logged in
  useEffect(() => {
    const stored = sessionStorage.getItem('scheduleai_student');
    if (stored) {
      try {
        const profile = JSON.parse(stored);
        if (profile.universityId) setUniversityId(profile.universityId);
      } catch {
        // ignore
      }
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!professorName.trim()) { setError('Professor name is required.'); return; }
    if (!courseCode.trim()) { setError('Course code is required.'); return; }
    if (!universityId) { setError('Please select your university.'); return; }
    if (overallRating === null) { setError('Please give an overall rating.'); return; }

    setSubmitting(true);
    try {
      const storedRaw = sessionStorage.getItem('scheduleai_student');
      const studentEmail = storedRaw ? (JSON.parse(storedRaw)?.email ?? null) : null;

      await saveProfessorFeedback({
        professorName: professorName.trim(),
        courseName: courseCode.trim().toUpperCase(),
        universityId,
        rating: overallRating,
        difficulty: difficulty ?? undefined,
        teachingClarity: teachingClarity ?? undefined,
        workload: workload ?? undefined,
        attendanceStrictness: attendanceStrictness ?? undefined,
        wouldTakeAgain: wouldTakeAgain ?? undefined,
        comment: comment.trim() || undefined,
        studentEmail: studentEmail ?? undefined,
      });
      setDone(true);
    } catch (err) {
      console.error('[Feedback] Save failed:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-white text-2xl font-bold mb-2">Thanks for your feedback!</h2>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-8">
          Your review of <span className="text-white font-medium">{professorName}</span> has been saved and will help other students make better decisions.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setProfessorName(''); setCourseCode(''); setOverallRating(null);
              setDifficulty(null); setTeachingClarity(null); setWorkload(null);
              setAttendanceStrictness(null); setWouldTakeAgain(null); setComment('');
              setDone(false);
            }}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm hover:border-white/20 hover:text-white transition-colors"
          >
            Rate another professor
          </button>
          <Link
            href="/professors"
            className="px-5 py-2.5 rounded-xl bg-sky/10 border border-sky/20 text-sky text-sm hover:bg-sky/20 transition-colors"
          >
            View professor ratings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-1">Rate a Professor</h1>
      <p className="text-slate-400 text-sm mb-8 leading-relaxed">
        Your feedback is anonymous and helps students choose courses and professors that fit their learning style.
      </p>

      {/* Section: Who are you reviewing? */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Who are you reviewing?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 text-sm mb-1.5">Professor name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={professorName}
              onChange={(e) => setProfessorName(e.target.value)}
              placeholder="e.g. Professor Smith"
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-sky/40 transition-colors"
            />
          </div>
          <div>
            <label className="block text-slate-300 text-sm mb-1.5">Course code <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CSIT 313"
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-sky/40 transition-colors"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-slate-300 text-sm mb-1.5">University <span className="text-red-400">*</span></label>
          <select
            value={universityId}
            onChange={(e) => setUniversityId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-300 text-sm focus:outline-none focus:border-sky/40 transition-colors cursor-pointer"
          >
            <option value="">Select your university</option>
            {UNIVERSITIES.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Section: Ratings */}
      <section className="mb-8 p-6 rounded-2xl border border-white/8 bg-slate-900/40">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Ratings</h2>

        <RatingRow
          label="Overall rating"
          description="Your general impression"
          low="Poor"
          high="Excellent"
          value={overallRating}
          onChange={setOverallRating}
        />
        <RatingRow
          label="Teaching clarity"
          description="How clearly concepts are explained"
          low="Unclear"
          high="Very clear"
          value={teachingClarity}
          onChange={setTeachingClarity}
        />
        <RatingRow
          label="Course difficulty"
          description="How challenging the course is"
          low="Very easy"
          high="Very hard"
          value={difficulty}
          onChange={setDifficulty}
        />
        <RatingRow
          label="Workload"
          description="Amount of assignments and homework"
          low="Light"
          high="Heavy"
          value={workload}
          onChange={setWorkload}
        />
        <RatingRow
          label="Attendance strictness"
          description="How strictly attendance is enforced"
          low="Flexible"
          high="Very strict"
          value={attendanceStrictness}
          onChange={setAttendanceStrictness}
        />
      </section>

      {/* Would take again */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Would you take this professor again?</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setWouldTakeAgain(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all ${
              wouldTakeAgain === true
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Yes
          </button>
          <button
            type="button"
            onClick={() => setWouldTakeAgain(false)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all ${
              wouldTakeAgain === false
                ? 'border-red-500/40 bg-red-500/10 text-red-400'
                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            No
          </button>
        </div>
      </section>

      {/* Written feedback */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Written feedback <span className="text-slate-700 normal-case font-normal">(optional)</span></h2>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience — what was the class like? What did you learn? Any tips for future students?"
          rows={5}
          maxLength={800}
          className="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-sky/40 transition-colors resize-none leading-relaxed"
        />
        <p className="text-slate-600 text-xs mt-1.5 text-right">{comment.length}/800</p>
      </section>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky text-white font-semibold text-sm hover:bg-sky/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {submitting ? (
          <>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Submitting…
          </>
        ) : (
          'Submit feedback'
        )}
      </button>

      <p className="text-slate-600 text-xs text-center mt-4">
        Your feedback is kept anonymous. Individual responses are never shown to professors.
      </p>
    </form>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-slate-600 text-sm">/</span>
          <span className="text-slate-400 text-sm font-medium">Feedback</span>
        </div>
        <Link
          href="/professors"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to professors
        </Link>
      </header>

      <main className="flex-1">
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-sky/30 border-t-sky rounded-full animate-spin" />
          </div>
        }>
          <FeedbackForm />
        </Suspense>
      </main>
    </div>
  );
}
