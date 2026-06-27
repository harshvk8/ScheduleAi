'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import {
  getAllScheduleRequests,
  getAllUniversities,
  getAllProfessorFeedback,
  getBugReports,
  ScheduleRequestDoc,
  UniversityDoc,
  ProfessorFeedbackDoc,
  BugReportDoc,
} from '@/lib/db';

// ─── Local types ──────────────────────────────────────────────────────────────

interface CourseStats {
  name: string;
  count: number;
  topProfessor: string | null;
  topProfessorCount: number;
  prefTimes: string[];
  prefDays: string[];
}

interface ProfessorStat {
  name: string;
  count: number;
  courses: string[];
}

interface TimeSlotStat {
  label: string;
  preferCount: number;
  avoidCount: number;
}

interface DayStat {
  label: string;
  short: string;
  count: number;
}

interface DashStats {
  totalRequests: number;
  uniqueStudents: number;
  uniqueUniversities: number;
  uniqueCourses: number;
  courseStats: CourseStats[];
  professorStats: ProfessorStat[];
  timeSlots: TimeSlotStat[];
  dayStats: DayStat[];
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

const TIME_SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

function computeStats(requests: ScheduleRequestDoc[]): DashStats {
  const totalRequests = requests.length;
  const uniqueStudents = new Set(requests.map((r) => r.studentEmail)).size;
  const uniqueUniversities = new Set(requests.map((r) => r.universityId)).size;

  const courseMap = new Map<string, {
    count: number;
    professors: Map<string, number>;
    prefTimes: Map<string, number>;
    prefDays: Map<string, number>;
  }>();

  const profMap = new Map<string, { count: number; courses: Set<string> }>();

  const globalTime = new Map<string, { prefer: number; avoid: number }>();
  TIME_SLOTS.forEach((t) => globalTime.set(t, { prefer: 0, avoid: 0 }));

  const globalDay = new Map<string, number>();
  DAYS.forEach((d) => globalDay.set(d, 0));

  for (const req of requests) {
    for (const t of req.generalPreferTimes ?? []) {
      const s = globalTime.get(t);
      if (s) s.prefer++;
    }
    for (const t of req.generalAvoidTimes ?? []) {
      const s = globalTime.get(t);
      if (s) s.avoid++;
    }
    for (const d of req.generalPreferDays ?? []) {
      globalDay.set(d, (globalDay.get(d) ?? 0) + 1);
    }

    for (const course of req.courses ?? []) {
      const key = course.course?.toUpperCase().trim();
      if (!key) continue;

      if (!courseMap.has(key)) {
        courseMap.set(key, { count: 0, professors: new Map(), prefTimes: new Map(), prefDays: new Map() });
      }
      const cs = courseMap.get(key)!;
      cs.count++;

      if (course.preferredProfessor) {
        const prof = course.preferredProfessor.trim();
        cs.professors.set(prof, (cs.professors.get(prof) ?? 0) + 1);
        if (!profMap.has(prof)) profMap.set(prof, { count: 0, courses: new Set() });
        const ps = profMap.get(prof)!;
        ps.count++;
        ps.courses.add(key);
      }

      const times = (course.preferredTimes?.length ?? 0) > 0
        ? course.preferredTimes
        : (req.generalPreferTimes ?? []);
      for (const t of times) {
        cs.prefTimes.set(t, (cs.prefTimes.get(t) ?? 0) + 1);
      }

      const days = (course.preferredDays?.length ?? 0) > 0
        ? course.preferredDays
        : (req.generalPreferDays ?? []);
      for (const d of days) {
        cs.prefDays.set(d, (cs.prefDays.get(d) ?? 0) + 1);
        globalDay.set(d, (globalDay.get(d) ?? 0) + 1);
      }
    }
  }

  const courseStats: CourseStats[] = Array.from(courseMap.entries())
    .map(([name, cs]) => {
      let topProfessor: string | null = null;
      let topProfessorCount = 0;
      cs.professors.forEach((cnt, prof) => {
        if (cnt > topProfessorCount) { topProfessorCount = cnt; topProfessor = prof; }
      });
      const prefTimes = Array.from(cs.prefTimes.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
      const prefDays = Array.from(cs.prefDays.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => DAY_SHORT[d] ?? d);
      return { name, count: cs.count, topProfessor, topProfessorCount, prefTimes, prefDays };
    })
    .sort((a, b) => b.count - a.count);

  const professorStats: ProfessorStat[] = Array.from(profMap.entries())
    .map(([name, ps]) => ({ name, count: ps.count, courses: Array.from(ps.courses) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const timeSlots: TimeSlotStat[] = TIME_SLOTS.map((label) => ({
    label,
    preferCount: globalTime.get(label)?.prefer ?? 0,
    avoidCount: globalTime.get(label)?.avoid ?? 0,
  }));

  const dayStats: DayStat[] = DAYS.map((label) => ({
    label,
    short: DAY_SHORT[label],
    count: globalDay.get(label) ?? 0,
  }));

  return { totalRequests, uniqueStudents, uniqueUniversities, uniqueCourses: courseStats.length, courseStats, professorStats, timeSlots, dayStats };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<ScheduleRequestDoc[]>([]);
  const [universities, setUniversities] = useState<UniversityDoc[]>([]);
  const [feedback, setFeedback] = useState<ProfessorFeedbackDoc[]>([]);
  const [bugReports, setBugReports] = useState<BugReportDoc[]>([]);
  const [activeTab, setActiveTab] = useState<'analytics' | 'bugs'>('analytics');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUnivId, setSelectedUnivId] = useState('all');

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) {
      router.replace('/admin');
    }
  }, [user, profile, authLoading, router]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [reqs, univs, fbs, bugs] = await Promise.all([
        getAllScheduleRequests(),
        getAllUniversities(),
        getAllProfessorFeedback(),
        getBugReports(),
      ]);
      setRequests(reqs);
      setUniversities(univs);
      setFeedback(fbs);
      setBugReports(bugs);
    } catch (err) {
      console.error(err);
      setError('Failed to load data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => selectedUnivId === 'all' ? requests : requests.filter((r) => r.universityId === selectedUnivId),
    [requests, selectedUnivId]
  );

  const filteredFeedback = useMemo(
    () => selectedUnivId === 'all' ? feedback : feedback.filter((f) => f.universityId === selectedUnivId),
    [feedback, selectedUnivId]
  );

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  async function logout() {
    await signOut(auth);
    router.push('/admin');
  }

  if (authLoading || loading) return <LoadingScreen />;
  if (!user || profile?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-white dark:bg-midnight text-slate-900 dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-slate-100 dark:border-white/5 bg-white/95 dark:bg-midnight/95 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-slate-500 dark:text-slate-600 text-sm">/</span>
          <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Admin Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedUnivId}
            onChange={(e) => setSelectedUnivId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-sm focus:outline-none focus:border-sky/40 cursor-pointer"
          >
            <option value="all">All Universities</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all"
            title="Refresh data"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-sm hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-midnight/60">
        <div className="px-8 max-w-7xl mx-auto flex gap-1 pt-2">
          {(['analytics', 'bugs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                activeTab === tab
                  ? 'text-slate-900 dark:text-white border-b-2 border-sky'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300'
              }`}
            >
              {tab === 'analytics' ? 'Schedule Analytics' : (
                <span className="flex items-center gap-2">
                  Bug Reports
                  {bugReports.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      bugReports.some(b => b.severity === 'high')
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {bugReports.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="px-8 py-8 max-w-7xl mx-auto">
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
            {error}
          </div>
        )}

        {activeTab === 'analytics' ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total Requests" value={stats.totalRequests} color="sky" />
              <StatCard label="Unique Students" value={stats.uniqueStudents} color="emerald" />
              <StatCard label="Universities" value={stats.uniqueUniversities} color="violet" />
              <StatCard label="Courses Tracked" value={stats.uniqueCourses} color="amber" />
            </div>

            {stats.totalRequests === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <CourseDemandTable courses={stats.courseStats} totalRequests={stats.totalRequests} />
                </div>
                <div className="space-y-5">
                  <ProfessorDemandPanel professors={stats.professorStats} />
                  <TimePreferencesPanel timeSlots={stats.timeSlots} totalRequests={stats.totalRequests} />
                  <DayPreferencesPanel days={stats.dayStats} />
                </div>
                {filteredFeedback.length > 0 && (
                  <div className="lg:col-span-3">
                    <ProfessorFeedbackPanel feedback={filteredFeedback} />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <BugReportsPanel reports={bugReports} />
        )}

        <p className="mt-12 text-center text-slate-700 text-xs">
          Student names and emails are not displayed to protect privacy · ScheduleAI Admin Dashboard
        </p>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type StatColor = 'sky' | 'emerald' | 'violet' | 'amber';

function StatCard({ label, value, color }: { label: string; value: number; color: StatColor }) {
  const styles: Record<StatColor, string> = {
    sky:     'bg-sky/10 border-sky/20 text-sky',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    violet:  'bg-violet-500/10 border-violet-500/20 text-violet-400',
    amber:   'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };

  const icons: Record<StatColor, React.ReactNode> = {
    sky: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    emerald: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
    violet: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
    amber: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    ),
  };

  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/8 bg-white/90 dark:bg-slate-900/60">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-4 ${styles[color]}`}>
        {icons[color]}
      </div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{value.toLocaleString()}</div>
      <div className="text-slate-500 dark:text-slate-400 text-sm">{label}</div>
    </div>
  );
}

function CourseDemandTable({ courses, totalRequests }: { courses: CourseStats[]; totalRequests: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/40 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5">
        <h2 className="text-slate-900 dark:text-white font-semibold">Course Demand</h2>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
          Ranked by student interest · {courses.length} {courses.length === 1 ? 'course' : 'courses'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5 bg-white/[0.02]">
              <th className="px-6 py-3 text-left text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Course</th>
              <th className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Students</th>
              <th className="px-4 py-3 text-left text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Top Professor</th>
              <th className="px-4 py-3 text-left text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Preferred Times</th>
              <th className="px-4 py-3 text-left text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Preferred Days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {courses.map((course) => (
              <tr key={course.name} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3.5">
                  <span className="font-mono font-bold text-sky">{course.name}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="text-slate-900 dark:text-white font-semibold">{course.count}</span>
                  <span className="text-slate-500 dark:text-slate-600 text-xs ml-1.5">
                    ({Math.round((course.count / totalRequests) * 100)}%)
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                  {course.topProfessor ? (
                    <span className="flex items-center gap-1">
                      <span className="truncate max-w-[120px] block">{course.topProfessor}</span>
                      <span className="text-slate-500 dark:text-slate-600 shrink-0">({course.topProfessorCount})</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-600">No preference</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {course.prefTimes.length > 0 ? (
                      course.prefTimes.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-sky/10 border border-sky/20 text-sky text-xs">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {course.prefDays.length > 0 ? (
                      course.prefDays.map((d) => (
                        <span key={d} className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-600 dark:text-slate-300 text-xs">
                          {d}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfessorDemandPanel({ professors }: { professors: ProfessorStat[] }) {
  const max = professors[0]?.count ?? 1;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/40 p-5">
      <h3 className="text-slate-900 dark:text-white font-semibold mb-0.5">Professor Demand</h3>
      <p className="text-slate-400 dark:text-slate-500 text-xs mb-5">Most requested by students</p>
      {professors.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-600 text-sm">No professor preferences recorded yet</p>
      ) : (
        <div className="space-y-3.5">
          {professors.map((prof) => (
            <div key={prof.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-slate-600 dark:text-slate-300 text-xs truncate max-w-[160px]">{prof.name}</span>
                <span className="text-slate-900 dark:text-white font-semibold text-sm ml-2 shrink-0">{prof.count}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky/60 rounded-full transition-all duration-500"
                  style={{ width: `${(prof.count / max) * 100}%` }}
                />
              </div>
              {prof.courses.length > 0 && (
                <p className="text-slate-500 dark:text-slate-600 text-xs mt-1 truncate">{prof.courses.join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimePreferencesPanel({ timeSlots, totalRequests }: { timeSlots: TimeSlotStat[]; totalRequests: number }) {
  const safeTotal = totalRequests || 1;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/40 p-5">
      <h3 className="text-slate-900 dark:text-white font-semibold mb-0.5">Time Preferences</h3>
      <p className="text-slate-400 dark:text-slate-500 text-xs mb-5">When students want classes</p>
      <div className="space-y-4">
        {timeSlots.map((slot) => (
          <div key={slot.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-600 dark:text-slate-300 text-sm">{slot.label}</span>
              <div className="flex gap-3 text-xs">
                {slot.preferCount > 0 && <span className="text-sky">{slot.preferCount} prefer</span>}
                {slot.avoidCount > 0 && <span className="text-red-400">{slot.avoidCount} avoid</span>}
                {slot.preferCount === 0 && slot.avoidCount === 0 && (
                  <span className="text-slate-500 dark:text-slate-600">no data</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky/60 rounded-full transition-all duration-500"
                  style={{ width: `${(slot.preferCount / safeTotal) * 100}%` }}
                />
              </div>
              {slot.avoidCount > 0 && (
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500/60 rounded-full transition-all duration-500"
                    style={{ width: `${(slot.avoidCount / safeTotal) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-slate-500 dark:text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky/60 inline-block" /> Prefer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500/60 inline-block" /> Avoid
        </span>
      </div>
    </div>
  );
}

function DayPreferencesPanel({ days }: { days: DayStat[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/40 p-5">
      <h3 className="text-slate-900 dark:text-white font-semibold mb-0.5">Day Preferences</h3>
      <p className="text-slate-400 dark:text-slate-500 text-xs mb-5">Most requested days</p>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const heightPct = (day.count / max) * 100;
          return (
            <div key={day.short} className="flex flex-col items-center gap-1">
              <div className="w-full h-14 flex items-end">
                <div
                  className="w-full rounded-t bg-sky/40 transition-all duration-500"
                  style={{ height: `${heightPct}%`, minHeight: day.count > 0 ? '4px' : '0px' }}
                />
              </div>
              <span className="text-slate-400 dark:text-slate-500 text-xs">{day.short}</span>
              <span className="text-slate-500 dark:text-slate-600 text-xs">{day.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ProfSummary {
  name: string;
  courses: string[];
  reviewCount: number;
  avgRating: number | null;
  avgDifficulty: number | null;
  avgClarity: number | null;
  wouldTakeAgainPct: number | null;
}

function ProfessorFeedbackPanel({ feedback }: { feedback: ProfessorFeedbackDoc[] }) {
  const profMap = new Map<string, ProfessorFeedbackDoc[]>();
  for (const f of feedback) {
    const key = f.professorName.trim().toLowerCase();
    if (!profMap.has(key)) profMap.set(key, []);
    profMap.get(key)!.push(f);
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const summaries: ProfSummary[] = Array.from(profMap.entries()).map(([, fbs]) => {
    const wtaVotes = fbs.filter((f) => f.wouldTakeAgain != null);
    const courses = [...new Set(fbs.map((f) => f.courseName?.toUpperCase().trim()).filter(Boolean))] as string[];
    return {
      name: fbs[0].professorName.trim(),
      courses,
      reviewCount: fbs.length,
      avgRating: avg(fbs.filter((f) => f.rating != null).map((f) => f.rating!)),
      avgDifficulty: avg(fbs.filter((f) => f.difficulty != null).map((f) => f.difficulty!)),
      avgClarity: avg(fbs.filter((f) => f.teachingClarity != null).map((f) => f.teachingClarity!)),
      wouldTakeAgainPct: wtaVotes.length > 0
        ? (wtaVotes.filter((f) => f.wouldTakeAgain).length / wtaVotes.length) * 100
        : null,
    };
  }).sort((a, b) => b.reviewCount - a.reviewCount);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/40 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-slate-900 dark:text-white font-semibold">Professor Feedback Analytics</h2>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
            Aggregated student ratings · {feedback.length} {feedback.length === 1 ? 'review' : 'reviews'} · {summaries.length} {summaries.length === 1 ? 'professor' : 'professors'}
          </p>
        </div>
        <Link
          href="/professors"
          className="text-sky text-xs hover:text-sky/80 transition-colors"
        >
          View professor page →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5 bg-white/[0.02]">
              <th className="px-6 py-3 text-left text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Professor</th>
              <th className="px-4 py-3 text-left text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Courses</th>
              <th className="px-4 py-3 text-center text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Reviews</th>
              <th className="px-4 py-3 text-center text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Overall</th>
              <th className="px-4 py-3 text-center text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Clarity</th>
              <th className="px-4 py-3 text-center text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Difficulty</th>
              <th className="px-4 py-3 text-center text-slate-400 dark:text-slate-500 font-medium text-xs uppercase tracking-wider">Take Again</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {summaries.map((p) => (
              <tr key={p.name} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3.5">
                  <span className="text-slate-900 dark:text-white font-medium text-sm">{p.name}</span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {p.courses.slice(0, 3).map((c) => (
                      <span key={c} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono">{c}</span>
                    ))}
                    {p.courses.length > 3 && (
                      <span className="text-slate-500 dark:text-slate-600 text-xs">+{p.courses.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="text-slate-600 dark:text-slate-300 text-sm">{p.reviewCount}</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  {p.avgRating != null ? (
                    <span className="text-slate-900 dark:text-white font-semibold">{p.avgRating.toFixed(1)}<span className="text-slate-500 dark:text-slate-600 font-normal text-xs">/5</span></span>
                  ) : <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-3.5 text-center">
                  {p.avgClarity != null ? (
                    <span className="text-sky text-sm">{p.avgClarity.toFixed(1)}</span>
                  ) : <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-3.5 text-center">
                  {p.avgDifficulty != null ? (
                    <span className="text-amber-400 text-sm">{p.avgDifficulty.toFixed(1)}</span>
                  ) : <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-3.5 text-center">
                  {p.wouldTakeAgainPct != null ? (
                    <span className={p.wouldTakeAgainPct >= 60 ? 'text-emerald-400 text-sm' : 'text-red-400 text-sm'}>
                      {Math.round(p.wouldTakeAgainPct)}%
                    </span>
                  ) : <span className="text-slate-500 dark:text-slate-600 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-16 h-16 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      </div>
      <h3 className="text-slate-900 dark:text-white font-semibold text-xl mb-2">No requests yet</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm leading-relaxed">
        Student schedule requests will appear here once students start submitting their course preferences through the chatbot.
      </p>
      <Link
        href="/student"
        className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky/10 border border-sky/20 text-sky text-sm hover:bg-sky/20 transition-colors"
      >
        View student portal
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
    </div>
  );
}

function BugReportsPanel({ reports }: { reports: BugReportDoc[] }) {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = [...reports].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const filtered = filter === 'all' ? sorted : sorted.filter((r) => r.severity === filter);

  const severityBadge: Record<string, string> = {
    high:   'bg-red-500/15 text-red-400 border border-red-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    low:    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  };

  const counts = {
    high:   reports.filter((r) => r.severity === 'high').length,
    medium: reports.filter((r) => r.severity === 'medium').length,
    low:    reports.filter((r) => r.severity === 'low').length,
  };

  return (
    <div>
      {/* Summary row */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          {(['all', 'high', 'medium', 'low'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-sky/10 text-sky dark:bg-white/10 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300'
              }`}
            >
              {f === 'all' ? `All (${reports.length})` : (
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    f === 'high' ? 'bg-red-400' : f === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3 className="text-slate-900 dark:text-white font-semibold mb-2">No bug reports</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {filter === 'all' ? 'No errors have been reported yet.' : `No ${filter}-severity reports.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-slate-900/40 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5">
            <h2 className="text-slate-900 dark:text-white font-semibold">Bug Reports</h2>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
              AI-analyzed crash reports from user sessions · {filtered.length} {filtered.length === 1 ? 'report' : 'reports'}
            </p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((report) => (
              <div key={report.id}>
                <button
                  onClick={() => setExpanded(expanded === report.id ? null : report.id)}
                  className="w-full px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${severityBadge[report.severity] ?? ''}`}>
                      {report.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm leading-snug line-clamp-2">{report.aiSummary}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-600">
                        <span>{new Date(report.timestamp).toLocaleString()}</span>
                        <span>·</span>
                        <span className="font-mono truncate max-w-[120px]">{report.sessionId}</span>
                        {report.lastUserAction && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">Last action: "{report.lastUserAction}"</span>
                          </>
                        )}
                      </div>
                    </div>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 text-slate-500 dark:text-slate-600 transition-transform mt-1 ${expanded === report.id ? 'rotate-180' : ''}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </button>

                {expanded === report.id && (
                  <div className="px-6 pb-5 space-y-4 bg-slate-950/40">
                    {/* Suggested fix */}
                    <div className="p-3.5 rounded-xl border border-sky/20 bg-sky/5">
                      <p className="text-[11px] font-semibold text-sky uppercase tracking-wider mb-1">Suggested Fix</p>
                      <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{report.suggestedFix}</p>
                    </div>

                    {/* Error message */}
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Error</p>
                      <pre className="text-xs text-red-300 bg-slate-950/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-slate-100 dark:border-white/5">
                        {report.errorMessage}
                      </pre>
                    </div>

                    {/* Stack trace */}
                    {report.stackTrace && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Stack Trace</p>
                        <pre className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-950/60 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap border border-slate-100 dark:border-white/5">
                          {report.stackTrace.slice(0, 2000)}
                        </pre>
                      </div>
                    )}

                    {/* URL */}
                    {report.url && (
                      <p className="text-xs text-slate-500 dark:text-slate-600">
                        Page: <span className="text-slate-500 dark:text-slate-400 font-mono">{report.url}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white dark:bg-midnight flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-sky/10 border border-sky/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Loading dashboard…</p>
      </div>
    </div>
  );
}
