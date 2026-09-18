'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { saveScheduleRequest, type CoursePreference, type ScheduleConstraint } from '@/lib/db';
import type { CalendarChatResponse } from '@/app/api/calendar-chat/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
  name: string;
  email: string;
  studentId: string;
  universityName: string;
  universityId?: string;
}

// ─── My Schedule tab — types, constants, helpers ──────────────────────────────

type SchedEventCategory = 'work' | 'study' | 'personal' | 'class' | 'routine';

interface SchedEvent {
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  category: SchedEventCategory;
  hasConflict?: boolean;
}

const SCHED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SCHED_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCHED_GRID_START = 6;
const SCHED_GRID_END = 23;
const SCHED_HOUR_PX = 56;
const SCHED_HOURS = Array.from({ length: SCHED_GRID_END - SCHED_GRID_START }, (_, i) => SCHED_GRID_START + i);

const SCHED_CAT_STYLE: Record<SchedEventCategory, { bg: string; border: string; text: string }> = {
  work:     { bg: 'bg-sky-500/25',     border: 'border-sky-400/50',     text: 'text-sky-300'     },
  study:    { bg: 'bg-violet-500/25',  border: 'border-violet-400/50',  text: 'text-violet-300'  },
  personal: { bg: 'bg-emerald-500/25', border: 'border-emerald-400/50', text: 'text-emerald-300' },
  class:    { bg: 'bg-amber-500/25',   border: 'border-amber-400/50',   text: 'text-amber-300'   },
  routine:  { bg: 'bg-slate-500/25',   border: 'border-slate-400/50',   text: 'text-slate-600 dark:text-slate-300' },
};

const SCHED_CAT_LEGEND: { label: string; cat: SchedEventCategory }[] = [
  { label: 'Class', cat: 'class' },
  { label: 'Study', cat: 'study' },
  { label: 'Work', cat: 'work' },
  { label: 'Routine', cat: 'routine' },
  { label: 'Personal', cat: 'personal' },
];

function schedUid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function schedFmt(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

function schedDetectCategory(title: string): SchedEventCategory {
  const t = title.toLowerCase();
  if (/\b(work|job|shift|office|meeting)\b/.test(t)) return 'work';
  if (/\b(study|learn|homework|java|python|coding|review|read|course)\b/.test(t)) return 'study';
  if (/\b(class|lecture|lab|seminar|school)\b/.test(t)) return 'class';
  if (/\b(gym|workout|run|yoga|exercise|breakfast|lunch|dinner|sleep|cook)\b/.test(t)) return 'routine';
  return 'personal';
}

function schedMinsToTimeInput(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function detectScheduleConflicts(evs: SchedEvent[]): SchedEvent[] {
  return evs.map((ev) => ({
    ...ev,
    hasConflict: evs.some(
      (other) =>
        other.id !== ev.id &&
        other.day === ev.day &&
        ev.startMinutes < other.endMinutes &&
        ev.endMinutes > other.startMinutes
    ),
  }));
}

function SchedEventBlock({ event, onEdit }: { event: SchedEvent; onEdit: (ev: SchedEvent) => void }) {
  const s = SCHED_CAT_STYLE[event.category];
  const top = (event.startMinutes / 60 - SCHED_GRID_START) * SCHED_HOUR_PX;
  const height = Math.max(((event.endMinutes - event.startMinutes) / 60) * SCHED_HOUR_PX - 2, 18);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onEdit(event); }}
      className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 overflow-hidden cursor-pointer select-none
        ${s.bg} ${s.border}
        ${event.hasConflict ? 'ring-1 ring-orange-400/70 hover:ring-orange-400' : 'hover:brightness-110'}`}
      style={{ top, height }}
      title={[
        event.title,
        `${schedFmt(event.startMinutes)} – ${schedFmt(event.endMinutes)}`,
        event.hasConflict ? '⚠ Click to fix conflict' : 'Click to edit',
      ].join(' · ')}
    >
      <div className="flex items-start gap-0.5 min-w-0">
        <p className={`text-xs font-semibold leading-tight truncate flex-1 ${s.text}`}>{event.title}</p>
        {event.hasConflict && <span className="shrink-0 text-orange-400 text-[10px] leading-none ml-0.5">⚠</span>}
      </div>
      {height > 32 && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5">
          {schedFmt(event.startMinutes)} – {schedFmt(event.endMinutes)}
        </p>
      )}
    </div>
  );
}

// ─── Sync to admin: only class time/course info ever leaves the browser ───────
//
// Class-category events sync as course + day/time-of-day so the university's
// course-demand dashboard can see what's in demand. Every other category
// (study/work/routine/personal) is private — it's collapsed into a single
// generic "busy" marker with no title, so a student's personal activities
// never reach an admin.

function schedTimeLabel(startMinutes: number): string {
  const h = Math.floor(startMinutes / 60) % 24;
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

function buildScheduleSyncPayload(events: SchedEvent[]): {
  courses: CoursePreference[];
  constraints: ScheduleConstraint[];
  generalPreferTimes: string[];
  generalAvoidTimes: string[];
  generalPreferDays: string[];
  generalAvoidDays: string[];
} {
  const courseMap = new Map<string, CoursePreference>();
  let hasOtherCommitments = false;

  for (const ev of events) {
    if (ev.category !== 'class') {
      hasOtherCommitments = true;
      continue;
    }
    const key = ev.title.trim().toUpperCase();
    if (!key) continue;
    let course = courseMap.get(key);
    if (!course) {
      course = { course: key, preferredDays: [], avoidDays: [], preferredTimes: [], avoidTimes: [] };
      courseMap.set(key, course);
    }
    if (!course.preferredDays.includes(ev.day)) course.preferredDays.push(ev.day);
    const label = schedTimeLabel(ev.startMinutes);
    if (!course.preferredTimes.includes(label)) course.preferredTimes.push(label);
  }

  return {
    courses: Array.from(courseMap.values()),
    constraints: hasOtherCommitments ? [{ type: 'unavailable', description: 'Student is busy at other times' }] : [],
    generalPreferTimes: [], generalAvoidTimes: [],
    generalPreferDays: [], generalAvoidDays: [],
  };
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function StudentChatbotPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  // ── Schedule chat (calendar assistant) state ──────────────────────────────────
  const [schedChatMessages, setSchedChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: "Hi! I'm your AI schedule assistant. Tell me what to add — for example:\n\n\"I work Monday to Friday 9 AM to 5 PM.\"\n\"Add gym Tuesday and Thursday at 7 AM for 1 hour.\"\n\"What's on my schedule this week?\"\n\nI'll update your timetable and suggest what's next.",
    },
  ]);
  const [schedChatInput, setSchedChatInput] = useState('');
  const [schedTyping, setSchedTyping] = useState(false);
  const [schedSuggestions, setSchedSuggestions] = useState<string[]>([]);
  const [schedApiHistory, setSchedApiHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const schedChatEndRef = useRef<HTMLDivElement>(null);
  const schedInputRef = useRef<HTMLTextAreaElement>(null);

  // ── My Schedule state ──────────────────────────────────────────────────────
  // Mobile only: which full-height pane is showing (chat vs. the schedule panel)
  const [mobileView, setMobileView] = useState<'chat' | 'panel'>('chat');
  const [scheduleEvents, setScheduleEvents] = useState<SchedEvent[]>([]);
  const [editingSchedEvent, setEditingSchedEvent] = useState<SchedEvent | null>(null);
  const [editSchedForm, setEditSchedForm] = useState({
    title: '', day: SCHED_DAYS[0], startTime: '09:00', endTime: '10:00',
  });

  // Load student profile
  useEffect(() => {
    const raw = sessionStorage.getItem('studentProfile');
    if (!raw) { router.replace('/student'); return; }
    try {
      setProfile(JSON.parse(raw) as StudentProfile);
    } catch {
      router.replace('/student');
    }
  }, [router]);

  useEffect(() => {
    schedChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [schedChatMessages, schedTyping]);

  // Sync class events (course + day/time-of-day only) to the university once the
  // schedule settles. Everything else — study/work/routine/personal — never
  // leaves this device beyond a generic "busy" marker. See buildScheduleSyncPayload.
  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(() => {
      const payload = buildScheduleSyncPayload(scheduleEvents);
      if (payload.courses.length === 0 && payload.constraints.length === 0) return;
      saveScheduleRequest(profile.email, profile.name, profile.universityId ?? '', profile.universityName, payload).catch(console.error);
    }, 2000);
    return () => clearTimeout(timer);
  }, [scheduleEvents, profile]);

  // ── My Schedule callbacks ─────────────────────────────────────────────────────

  const openSchedEdit = useCallback((ev: SchedEvent) => {
    setEditingSchedEvent(ev);
    setEditSchedForm({
      title: ev.title,
      day: ev.day,
      startTime: schedMinsToTimeInput(ev.startMinutes),
      endTime: schedMinsToTimeInput(ev.endMinutes),
    });
  }, []);

  const saveSchedEdit = useCallback(() => {
    const startParts = editSchedForm.startTime.split(':').map(Number);
    const endParts = editSchedForm.endTime.split(':').map(Number);
    if (startParts.length < 2 || endParts.length < 2) return;
    const startMinutes = startParts[0] * 60 + startParts[1];
    const endMinutes = endParts[0] * 60 + endParts[1];
    if (isNaN(startMinutes) || isNaN(endMinutes) || endMinutes <= startMinutes) return;

    const isNew = editingSchedEvent?.id === '__new__';
    if (isNew) {
      const newEv: SchedEvent = {
        id: schedUid(),
        title: editSchedForm.title.trim() || 'New Event',
        day: editSchedForm.day,
        startMinutes,
        endMinutes,
        category: schedDetectCategory(editSchedForm.title),
      };
      setScheduleEvents((prev) => detectScheduleConflicts([...prev, newEv]));
    } else if (editingSchedEvent) {
      setScheduleEvents((prev) =>
        detectScheduleConflicts(
          prev.map((e) =>
            e.id === editingSchedEvent.id
              ? { ...e, title: editSchedForm.title.trim() || e.title, day: editSchedForm.day, startMinutes, endMinutes, category: schedDetectCategory(editSchedForm.title) }
              : e
          )
        )
      );
    }
    setEditingSchedEvent(null);
  }, [editingSchedEvent, editSchedForm]);

  const removeSchedEvent = useCallback((id: string) => {
    setScheduleEvents((prev) => detectScheduleConflicts(prev.filter((e) => e.id !== id)));
    setEditingSchedEvent(null);
  }, []);

  const handleGridClick = useCallback((day: string, clickY: number) => {
    const rawMinutes = (clickY / SCHED_HOUR_PX) * 60 + SCHED_GRID_START * 60;
    const snapped = Math.round(rawMinutes / 15) * 15;
    const startMinutes = Math.max(SCHED_GRID_START * 60, Math.min(snapped, (SCHED_GRID_END - 1) * 60));
    const endMinutes = Math.min(startMinutes + 60, SCHED_GRID_END * 60);
    setEditingSchedEvent({ id: '__new__', day, startMinutes, endMinutes, title: '', category: 'personal' });
    setEditSchedForm({
      title: '',
      day,
      startTime: schedMinsToTimeInput(startMinutes),
      endTime: schedMinsToTimeInput(endMinutes),
    });
  }, []);

  const sendScheduleMessage = useCallback(async (text: string) => {
    if (schedTyping || !text.trim()) return;
    const userMsg = { role: 'user' as const, text };
    setSchedChatMessages((prev) => [...prev, userMsg]);
    setSchedTyping(true);
    setSchedSuggestions([]);

    try {
      const history = [...schedApiHistory, { role: 'user' as const, content: text }];
      const res = await fetch('/api/calendar-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          currentEvents: scheduleEvents.map((e) => ({
            id: e.id, day: e.day, startMinutes: e.startMinutes,
            endMinutes: e.endMinutes, title: e.title, category: e.category,
          })),
          googleConnected: false,
        }),
      });

      if (!res.ok) throw new Error(`API_${res.status}`);
      const data: CalendarChatResponse = await res.json();

      setScheduleEvents((prev) => {
        let updated = [...prev];
        updated = updated.filter((e) => !data.deletedIds.includes(e.id));
        for (const edit of data.editedEvents) {
          updated = updated.map((e) => (e.id === edit.id ? { ...e, ...edit.changes } : e));
        }
        updated = [...updated, ...data.addedEvents.map((e) => ({
          ...e,
          hasConflict: false,
        }))];
        return detectScheduleConflicts(updated);
      });

      const assistantMsg = { role: 'assistant' as const, text: data.reply };
      setSchedChatMessages((prev) => [...prev, assistantMsg]);
      setSchedApiHistory((h) => [...h, { role: 'user', content: text }, { role: 'assistant', content: data.reply }]);
      setSchedSuggestions(data.suggestions ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const errText = msg.includes('API_429')
        ? "You're sending messages too quickly — give it a moment and try again."
        : 'Assistant is temporarily unavailable. Please try again in a moment.';
      setSchedChatMessages((prev) => [...prev, { role: 'assistant', text: errText }]);
    } finally {
      setSchedTyping(false);
    }
  }, [schedTyping, schedApiHistory, scheduleEvents]);

  if (!profile) return null;

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-slate-900 dark:text-gray-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Logo />
        </div>
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/8 bg-white/90 dark:bg-slate-900/60 min-w-0">
            <div className="w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 font-bold text-xs shrink-0">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{profile.name.split(' ')[0]}</span>
            <span className="hidden sm:inline text-slate-500 dark:text-slate-600 text-xs">·</span>
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 truncate max-w-[140px]">{profile.universityName}</span>
          </div>
          <button
            onClick={() => router.push('/student/info')}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>
        </div>
      </header>

      {/* Mobile tab switcher — one full-height pane at a time below lg */}
      <div className="lg:hidden shrink-0 flex gap-1.5 p-2 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-gray-950">
        <button
          onClick={() => setMobileView('chat')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            mobileView === 'chat' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileView('panel')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            mobileView === 'panel' ? 'bg-sky-600 text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5'
          }`}
        >
          My Schedule
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
        {/* ════════════════════════ LEFT — Chat ════════════════════════ */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} lg:flex flex-1 lg:flex-none lg:w-[42%] flex-col border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-white/5 min-h-0`}>
              {/* Schedule chat header */}
              <div className="shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI Schedule Assistant</h2>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Add, edit, or ask about your schedule</p>
                </div>
                {scheduleEvents.length > 0 && (
                  <button
                    onClick={() => {
                      setScheduleEvents([]);
                      setSchedChatMessages((prev) => [...prev, { role: 'assistant', text: 'Done — timetable cleared. Start fresh!' }]);
                    }}
                    className="text-[11px] text-slate-500 dark:text-slate-600 hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Schedule chat messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 min-h-0">
                {schedChatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-sky-600 text-white rounded-br-sm'
                        : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-bl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {schedTyping && (
                  <div className="flex justify-start">
                    <div className="px-3.5 py-3 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800/70">
                      <div className="flex gap-1 items-center">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={schedChatEndRef} />
              </div>

              {/* Suggestions */}
              {schedSuggestions.length > 0 && !schedTyping && (
                <div className="shrink-0 px-4 pb-2">
                  <p className="text-[10px] text-slate-500 dark:text-slate-600 mb-1.5">Suggested next:</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {schedSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendScheduleMessage(s)}
                        className="px-2.5 py-1 rounded-full text-[11px] bg-sky-950/60 text-sky-400 border border-sky-800/40 hover:border-sky-600/60 hover:text-sky-300 transition-all leading-tight"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick examples */}
              {scheduleEvents.length === 0 && !schedTyping && schedSuggestions.length === 0 && (
                <div className="shrink-0 px-4 pb-2 space-y-1">
                  <p className="text-[10px] text-slate-500 dark:text-slate-600 px-1 mb-1.5">Try an example:</p>
                  {[
                    'I work Monday to Friday 9 AM to 5 PM',
                    'Add gym Tuesday and Thursday at 7 AM for 1 hour',
                    'Study Python Wednesday from 6 PM to 8 PM',
                  ].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setSchedChatInput(ex)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-200 dark:border-white/15 hover:text-slate-700 dark:hover:text-slate-200 transition-all truncate"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}

              {/* Schedule chat input */}
              <div className="shrink-0 px-4 py-3 border-t border-slate-100 dark:border-white/5">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={schedInputRef}
                    value={schedChatInput}
                    onChange={(e) => setSchedChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const text = schedChatInput.trim();
                        if (text) { setSchedChatInput(''); sendScheduleMessage(text); }
                      }
                    }}
                    placeholder="e.g. I work Monday 9 AM to 5 PM…"
                    rows={2}
                    className="flex-1 resize-none px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/70 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all leading-snug"
                  />
                  <button
                    onClick={() => {
                      const text = schedChatInput.trim();
                      if (text) { setSchedChatInput(''); sendScheduleMessage(text); }
                    }}
                    disabled={!schedChatInput.trim() || schedTyping}
                    className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 mb-0.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-gray-600 mt-1.5">Enter to send · Shift+Enter for new line</p>
              </div>
        </div>

        {/* ════════════════════════ RIGHT — My Schedule ════════════════════════ */}
        <div className={`${mobileView === 'panel' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col bg-slate-50 dark:bg-gray-900/40 overflow-hidden min-h-0`}>
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Day headers */}
              <div className="shrink-0 flex border-b border-slate-100 dark:border-white/5 bg-slate-100 dark:bg-slate-950/60">
                <div className="w-12 shrink-0" />
                {SCHED_DAYS.map((day, i) => {
                  const count = scheduleEvents.filter((e) => e.day === day).length;
                  return (
                    <div key={day} className="flex-1 py-2.5 text-center">
                      <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{SCHED_DAY_SHORT[i]}</p>
                      {count > 0 && <p className="text-[9px] text-sky-400 mt-0.5">{count}</p>}
                    </div>
                  );
                })}
              </div>

              {/* Edit / Add event panel */}
              {editingSchedEvent && (
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/90 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-2.5">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white flex-1">
                      {editingSchedEvent.id === '__new__' ? 'Add Event' : 'Edit Event'}
                    </p>
                    {editingSchedEvent.hasConflict && (
                      <span className="text-[10px] text-orange-400 font-medium">⚠ Conflict</span>
                    )}
                    <button onClick={() => setEditingSchedEvent(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm leading-none">✕</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      value={editSchedForm.title}
                      onChange={(e) => setEditSchedForm((f) => ({ ...f, title: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveSchedEdit(); }}
                      placeholder="Event title (e.g. CS 101 Lecture)"
                      autoFocus
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500/40"
                    />
                    <div className="flex gap-2">
                      <select
                        value={editSchedForm.day}
                        onChange={(e) => setEditSchedForm((f) => ({ ...f, day: e.target.value }))}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none"
                      >
                        {SCHED_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input type="time" value={editSchedForm.startTime}
                        onChange={(e) => setEditSchedForm((f) => ({ ...f, startTime: e.target.value }))}
                        className="w-20 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                      <input type="time" value={editSchedForm.endTime}
                        onChange={(e) => setEditSchedForm((f) => ({ ...f, endTime: e.target.value }))}
                        className="w-20 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveSchedEdit} className="flex-1 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 transition-colors">Save</button>
                      {editingSchedEvent.id !== '__new__' && (
                        <button onClick={() => removeSchedEvent(editingSchedEvent.id)} className="py-1.5 px-3 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">Remove</button>
                      )}
                      <button onClick={() => setEditingSchedEvent(null)} className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-xs hover:text-slate-900 dark:hover:text-white transition-colors">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scrollable timetable grid */}
              <div className="flex-1 overflow-auto min-h-0 relative">
                <div className="flex min-w-[560px]" style={{ height: (SCHED_GRID_END - SCHED_GRID_START) * SCHED_HOUR_PX }}>
                  {/* Hour labels */}
                  <div className="w-12 shrink-0 relative select-none">
                    {SCHED_HOURS.map((h) => (
                      <div key={h} className="absolute right-2 text-[10px] text-slate-500 dark:text-slate-600 leading-none" style={{ top: (h - SCHED_GRID_START) * SCHED_HOUR_PX - 6 }}>
                        {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
                      </div>
                    ))}
                  </div>
                  {/* Day columns */}
                  {SCHED_DAYS.map((day) => (
                    <div
                      key={day}
                      className="flex-1 relative border-l border-slate-100 dark:border-white/5 min-w-0 cursor-crosshair"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleGridClick(day, e.clientY - rect.top);
                      }}
                    >
                      {SCHED_HOURS.map((h) => (
                        <div key={h} className={`absolute left-0 right-0 border-t ${h % 6 === 0 ? 'border-slate-200 dark:border-white/10' : 'border-slate-100 dark:border-white/[0.04]'}`} style={{ top: (h - SCHED_GRID_START) * SCHED_HOUR_PX }} />
                      ))}
                      {scheduleEvents.filter((e) => e.day === day).map((ev) => (
                        <SchedEventBlock key={ev.id} event={ev} onEdit={openSchedEdit} />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Empty state hint overlay */}
                {scheduleEvents.length === 0 && !editingSchedEvent && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center px-6">
                      <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </div>
                      <p className="text-slate-400 dark:text-gray-500 text-xs">Click any time slot to add an event</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="shrink-0 flex flex-wrap gap-3 px-4 py-2.5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/10">
                {SCHED_CAT_LEGEND.map(({ label, cat }) => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-sm border ${SCHED_CAT_STYLE[cat].bg} ${SCHED_CAT_STYLE[cat].border}`} />
                    <span className="text-[9px] text-slate-500 dark:text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
