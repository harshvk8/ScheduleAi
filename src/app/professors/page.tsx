'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import {
  getAllScheduleRequests,
  getAllProfessorFeedback,
  ScheduleRequestDoc,
  ProfessorFeedbackDoc,
} from '@/lib/db';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfessorProfile {
  name: string;
  universityName: string;
  universityId: string;
  courses: string[];
  requestCount: number;
  avgRating: number | null;
  avgDifficulty: number | null;
  avgClarity: number | null;
  avgWorkload: number | null;
  wouldTakeAgainPct: number | null;
  feedbackCount: number;
  recentComments: string[];
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function buildProfiles(
  requests: ScheduleRequestDoc[],
  feedback: ProfessorFeedbackDoc[]
): ProfessorProfile[] {
  const map = new Map<string, ProfessorProfile>();

  // Seed from schedule requests — this is where most professor names live
  for (const req of requests) {
    for (const course of req.courses ?? []) {
      const rawName = course.preferredProfessor?.trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          name: rawName,
          universityName: req.universityName,
          universityId: req.universityId,
          courses: [],
          requestCount: 0,
          avgRating: null,
          avgDifficulty: null,
          avgClarity: null,
          avgWorkload: null,
          wouldTakeAgainPct: null,
          feedbackCount: 0,
          recentComments: [],
        });
      }

      const p = map.get(key)!;
      p.requestCount++;
      const cn = course.course?.toUpperCase().trim();
      if (cn && !p.courses.includes(cn)) p.courses.push(cn);
    }
  }

  // Group feedback by professor name
  const fbByProf = new Map<string, ProfessorFeedbackDoc[]>();
  for (const fb of feedback) {
    const key = fb.professorName.trim().toLowerCase();
    if (!fbByProf.has(key)) fbByProf.set(key, []);
    fbByProf.get(key)!.push(fb);
  }

  // Add professors that appear only in feedback
  for (const [key, fbs] of fbByProf) {
    if (!map.has(key)) {
      map.set(key, {
        name: fbs[0].professorName.trim(),
        universityName: '',
        universityId: fbs[0].universityId,
        courses: [],
        requestCount: 0,
        avgRating: null,
        avgDifficulty: null,
        avgClarity: null,
        avgWorkload: null,
        wouldTakeAgainPct: null,
        feedbackCount: 0,
        recentComments: [],
      });
    }
  }

  // Enrich every profile with feedback stats
  for (const [key, p] of map) {
    const fbs = fbByProf.get(key) ?? [];
    p.feedbackCount = fbs.length;

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    p.avgRating = avg(fbs.filter((f) => f.rating != null).map((f) => f.rating!));
    p.avgDifficulty = avg(fbs.filter((f) => f.difficulty != null).map((f) => f.difficulty!));
    p.avgClarity = avg(fbs.filter((f) => f.teachingClarity != null).map((f) => f.teachingClarity!));
    p.avgWorkload = avg(fbs.filter((f) => f.workload != null).map((f) => f.workload!));

    const wtaVotes = fbs.filter((f) => f.wouldTakeAgain != null);
    p.wouldTakeAgainPct = wtaVotes.length > 0
      ? (wtaVotes.filter((f) => f.wouldTakeAgain).length / wtaVotes.length) * 100
      : null;

    p.recentComments = fbs
      .filter((f) => f.comment && f.comment.trim().length > 10)
      .slice(-3)
      .reverse()
      .map((f) => f.comment!.trim());

    for (const fb of fbs) {
      const cn = fb.courseName?.toUpperCase().trim();
      if (cn && !p.courses.includes(cn)) p.courses.push(cn);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Professors with ratings first, then by demand
    if (b.feedbackCount !== a.feedbackCount) return b.feedbackCount - a.feedbackCount;
    return b.requestCount - a.requestCount;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfessorsPage() {
  const [profiles, setProfiles] = useState<ProfessorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedUnivId, setSelectedUnivId] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const [requests, feedback] = await Promise.all([
          getAllScheduleRequests(),
          getAllProfessorFeedback(),
        ]);
        setProfiles(buildProfiles(requests, feedback));
      } catch (err) {
        console.error('[Professors] Firestore fetch failed:', err);
        setProfiles([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Unique universities from the data (no extra Firestore fetch needed)
  const universities = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; name: string }> = [];
    for (const p of profiles) {
      if (p.universityId && p.universityName && !seen.has(p.universityId)) {
        seen.add(p.universityId);
        list.push({ id: p.universityId, name: p.universityName });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const matchesQuery =
        !query || p.name.toLowerCase().includes(query.toLowerCase());
      const matchesUniv =
        selectedUnivId === 'all' || p.universityId === selectedUnivId;
      return matchesQuery && matchesUniv;
    });
  }, [profiles, query, selectedUnivId]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-slate-500 dark:text-slate-600 text-sm">/</span>
          <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Professors</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to home
        </Link>
      </header>

      {/* Search hero */}
      <div className="px-8 py-12 border-b border-slate-100 dark:border-white/5 bg-slate-900/20">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full border border-sky/30 bg-sky/10 text-sky text-xs font-medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Professor Search
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Find Professors</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
            Search professors at your university and view student ratings &amp; demand
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search professor name…"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/60 text-white placeholder:text-slate-400 dark:text-slate-500 text-sm focus:outline-none focus:border-sky/40 transition-colors"
              />
            </div>

            {/* University filter */}
            <select
              value={selectedUnivId}
              onChange={(e) => setSelectedUnivId(e.target.value)}
              className="px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-sm focus:outline-none focus:border-sky/40 cursor-pointer shrink-0"
            >
              <option value="all">All Universities</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <main className="flex-1 px-8 py-8 max-w-7xl mx-auto w-full">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {/* Count label */}
            {!loading && (
              <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">
                {filtered.length === 0
                  ? 'No professors found'
                  : `${filtered.length} professor${filtered.length === 1 ? '' : 's'} found`}
                {query && (
                  <span> for &ldquo;<span className="text-slate-600 dark:text-slate-300">{query}</span>&rdquo;</span>
                )}
              </p>
            )}

            {filtered.length === 0 ? (
              <EmptyState hasQuery={!!query} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((p) => (
                  <ProfessorCard key={p.name.toLowerCase()} professor={p} />
                ))}
              </div>
            )}

            {/* Rate a professor CTA */}
            <div className="mt-12 text-center px-6 py-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/30 max-w-lg mx-auto">
              <p className="text-white text-sm font-semibold mb-1">Taken a class recently?</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
                Share your experience and help other students choose the right professor.
              </p>
              <Link
                href="/feedback"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky/10 border border-sky/20 text-sky text-sm hover:bg-sky/20 transition-colors font-medium"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Rate a professor
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Professor card ───────────────────────────────────────────────────────────

function ProfessorCard({ professor: p }: { professor: ProfessorProfile }) {
  const initials = p.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col p-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white/95 dark:bg-slate-900/50 hover:border-slate-200 dark:border-white/15 hover:-translate-y-0.5 transition-all duration-200">
      {/* Top row: avatar + name + demand badge */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-sky/10 border border-sky/20 flex items-center justify-center shrink-0">
          <span className="text-sky font-bold text-sm">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold text-base leading-tight truncate">{p.name}</h3>
          {p.universityName && (
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 truncate">{p.universityName}</p>
          )}
        </div>
        {p.requestCount > 0 && (
          <span className="shrink-0 px-2 py-1 rounded-full bg-sky/10 border border-sky/20 text-sky text-xs font-medium whitespace-nowrap">
            {p.requestCount} {p.requestCount === 1 ? 'request' : 'requests'}
          </span>
        )}
      </div>

      {/* Courses */}
      {p.courses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {p.courses.slice(0, 5).map((c) => (
            <span
              key={c}
              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-white/5 text-slate-600 dark:text-slate-300 text-xs font-mono"
            >
              {c}
            </span>
          ))}
          {p.courses.length > 5 && (
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs">
              +{p.courses.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-white/5 mb-4" />

      {/* Rating section */}
      {p.feedbackCount > 0 && p.avgRating != null ? (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl font-bold text-white">{p.avgRating.toFixed(1)}</span>
            <div>
              <StarRow rating={p.avgRating} />
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                {p.feedbackCount} {p.feedbackCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
          {/* Breakdown bars */}
          <div className="space-y-1.5">
            {p.avgDifficulty != null && (
              <MiniBar label="Difficulty" value={p.avgDifficulty} max={5} />
            )}
            {p.avgClarity != null && (
              <MiniBar label="Clarity" value={p.avgClarity} max={5} green />
            )}
            {p.avgWorkload != null && (
              <MiniBar label="Workload" value={p.avgWorkload} max={5} />
            )}
          </div>
          {p.wouldTakeAgainPct != null && (
            <p className="text-xs mt-2.5">
              <span className={p.wouldTakeAgainPct >= 60 ? 'text-emerald-400' : 'text-red-400'}>
                {Math.round(p.wouldTakeAgainPct)}%
              </span>
              <span className="text-slate-400 dark:text-slate-500"> would take again</span>
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.02] border border-slate-100 dark:border-white/5">
          <p className="text-slate-500 dark:text-slate-600 text-xs">No ratings yet</p>
          <Link
            href={`/feedback?professor=${encodeURIComponent(p.name)}`}
            className="text-sky text-xs hover:text-sky/80 transition-colors"
          >
            Be first to rate
          </Link>
        </div>
      )}

      {/* Comments */}
      {p.recentComments.length > 0 && (
        <div className="space-y-2 mb-4">
          {p.recentComments.slice(0, 2).map((comment, i) => (
            <blockquote
              key={i}
              className="pl-3 border-l-2 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-xs italic leading-relaxed"
            >
              &ldquo;{comment.length > 110 ? comment.slice(0, 110) + '…' : comment}&rdquo;
            </blockquote>
          ))}
        </div>
      )}

      {/* Rate link */}
      <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/5">
        <Link
          href={`/feedback?professor=${encodeURIComponent(p.name)}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-slate-200 dark:border-white/8 text-slate-500 dark:text-slate-400 text-xs hover:border-sky/30 hover:text-sky transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Rate this professor
        </Link>
      </div>
    </div>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function StarRow({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="13" height="13" viewBox="0 0 24 24"
          fill={i <= rounded ? '#0ea5e9' : 'none'}
          stroke={i <= rounded ? '#0ea5e9' : '#334155'}
          strokeWidth="2"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

// ─── Mini stat bar ────────────────────────────────────────────────────────────

function MiniBar({ label, value, max, green }: { label: string; value: number; max: number; green?: boolean }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 dark:text-slate-600 text-xs w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${green ? 'bg-sky/50' : 'bg-slate-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-slate-400 dark:text-slate-500 text-xs w-6 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

// ─── Empty / Loading states ───────────────────────────────────────────────────

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-16 h-16 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </div>

      {hasQuery ? (
        <>
          <h3 className="text-white font-semibold text-xl mb-2">No professors found</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm leading-relaxed">
            No professors match your search. Try a different name or clear the filter.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-white font-semibold text-xl mb-2">No professors yet</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm leading-relaxed">
            Professors appear here when students mention them in the scheduling chatbot. Be the first to submit your preferences.
          </p>
          <Link
            href="/student"
            className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky/10 border border-sky/20 text-sky text-sm hover:bg-sky/20 transition-colors"
          >
            Go to student chatbot
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="p-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white/95 dark:bg-slate-900/50 animate-pulse">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/5 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 bg-white/5 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="h-5 bg-white/5 rounded w-16" />
            <div className="h-5 bg-white/5 rounded w-20" />
          </div>
          <div className="h-px bg-white/5 mb-4" />
          <div className="h-10 bg-white/5 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
