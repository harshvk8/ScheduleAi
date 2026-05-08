'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { saveCalendarEvents, deleteCalendarEventsBySession, getOrCreateSessionId } from '@/lib/db';
import { fetchWeekEvents, gcalToInternal, createGCalEvent, deleteGCalEvent } from '@/lib/googleCalendar';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventCategory = 'work' | 'study' | 'personal' | 'class' | 'routine';

interface ScheduleEvent {
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  category: EventCategory;
  source?: 'google';       // undefined = manually added
  googleEventId?: string;  // present when source === 'google'
  hasConflict?: boolean;   // overlaps with another event on the same day
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GRID_START = 6;  // 6 AM
const GRID_END = 23;   // 11 PM
const HOUR_PX = 56;

const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

const CAT_STYLE: Record<EventCategory, { bg: string; border: string; text: string }> = {
  work:     { bg: 'bg-sky-500/25',     border: 'border-sky-400/50',     text: 'text-sky-300'     },
  study:    { bg: 'bg-violet-500/25',  border: 'border-violet-400/50',  text: 'text-violet-300'  },
  personal: { bg: 'bg-emerald-500/25', border: 'border-emerald-400/50', text: 'text-emerald-300' },
  class:    { bg: 'bg-amber-500/25',   border: 'border-amber-400/50',   text: 'text-amber-300'   },
  routine:  { bg: 'bg-slate-500/25',   border: 'border-slate-400/50',   text: 'text-slate-300'   },
};

const DAY_MAP: Record<string, string> = {
  monday: 'Monday', mon: 'Monday',
  tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday',
  wednesday: 'Wednesday', wed: 'Wednesday',
  thursday: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday',
  friday: 'Friday', fri: 'Friday',
  saturday: 'Saturday', sat: 'Saturday',
  sunday: 'Sunday', sun: 'Sunday',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseTimeStr(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (s === 'noon') return 12 * 60;
  if (s === 'midnight') return 0;

  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;

  let h = parseInt(m[1]);
  const min = m[2] ? parseInt(m[2]) : 0;
  const mer = m[3];

  if (mer === 'pm' && h !== 12) h += 12;
  else if (mer === 'am' && h === 12) h = 0;

  return h * 60 + min;
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

function detectCategory(title: string): EventCategory {
  const t = title.toLowerCase();
  if (/\b(work|job|shift|office|meeting)\b/.test(t)) return 'work';
  if (/\b(study|learn|homework|java|python|coding|review|read|course)\b/.test(t)) return 'study';
  if (/\b(class|lecture|lab|seminar|school)\b/.test(t)) return 'class';
  if (/\b(gym|workout|run|yoga|exercise|breakfast|lunch|dinner|sleep|cook)\b/.test(t)) return 'routine';
  return 'personal';
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Conflict detection ───────────────────────────────────────────────────────

function detectConflicts(evs: ScheduleEvent[]): ScheduleEvent[] {
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

// ─── Natural Language Parser ──────────────────────────────────────────────────

function parseMessage(
  msg: string,
  existing: ScheduleEvent[]
): { events: ScheduleEvent[]; response: string } {
  const lower = msg.toLowerCase();

  const days = Object.entries(DAY_MAP)
    .filter(([alias]) => new RegExp(`\\b${alias}\\b`).test(lower))
    .map(([, day]) => day)
    .filter((d, i, arr) => arr.indexOf(d) === i);

  if (days.length === 0) {
    return {
      events: [],
      response: 'Which day is this for? Try something like "I work Monday from 9 AM to 5 PM".',
    };
  }

  const created: ScheduleEvent[] = [];
  const descriptions: string[] = [];

  const addEvent = (title: string, start: number, end: number, forDays = days) => {
    const category = detectCategory(title);
    for (const day of forDays) {
      created.push({ id: uid(), day, startMinutes: start, endMinutes: end, title, category });
      descriptions.push(`${title} from ${fmt(start)} to ${fmt(end)} on ${day}`);
    }
  };

  // Pattern A: "X from HH to HH"
  const rangeRe = /([a-zA-Z][a-zA-Z\s]*?)\s+from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi;
  let rm: RegExpExecArray | null;

  while ((rm = rangeRe.exec(msg)) !== null) {
    let rawTitle = rm[1].trim()
      .replace(/\b(i|i'm|going to|want to|need to)\s+/gi, '')
      .replace(/\b(work|study|do|have|a)\s+$/i, (w) => {
        const v = w.trim().toLowerCase();
        return v === 'work' ? 'Work' : v === 'study' ? 'Study ' : '';
      })
      .trim();

    if (!rawTitle || Object.keys(DAY_MAP).includes(rawTitle.toLowerCase())) continue;

    const start = parseTimeStr(rm[2]);
    const end = parseTimeStr(rm[3]);
    if (start === null || end === null) continue;

    const title = capitalize(rawTitle.replace(/^(i\s+)?(work(ing)?)\b/i, 'Work').trim());
    addEvent(title || 'Event', start, end);
  }

  // Pattern B: "study/do X after work"
  const afterWorkRe = /\b(?:study|learn|do|work on|practice|code)\s+([a-zA-Z][a-zA-Z0-9\s]*?)(?=\s+after\s+work|\s+afterwards)/i;
  const afterWorkMatch = afterWorkRe.exec(msg);

  if (afterWorkMatch) {
    const subject = capitalize(afterWorkMatch[1].trim());
    const allSoFar = [...existing, ...created];
    const workEnd = allSoFar
      .filter((e) => e.category === 'work' && days.includes(e.day))
      .sort((a, b) => b.endMinutes - a.endMinutes)[0]?.endMinutes;

    if (workEnd !== undefined) {
      const start = workEnd + 60;
      const end = start + 120;
      const title = subject.toLowerCase().startsWith('study') ? subject : `Study ${subject}`;
      const alreadyCovered = created.some((e) => e.title === title);
      if (!alreadyCovered) addEvent(title, start, end);
    }
  }

  // Pattern C: "X at HH [for N hours]"
  if (created.length === 0) {
    const atRe = /([a-zA-Z][a-zA-Z\s]*?)\s+(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+for\s+(\d+(?:\.\d+)?)\s*(?:hour|hr)s?)?/gi;
    let am: RegExpExecArray | null;

    while ((am = atRe.exec(msg)) !== null) {
      let rawTitle = am[1]
        .trim()
        .replace(/\b(i|i'm|going to|want to|need to|have\s+a?)\s*/gi, '')
        .trim();

      if (!rawTitle || DAYS.map((d) => d.toLowerCase()).includes(rawTitle.toLowerCase())) continue;
      if (Object.keys(DAY_MAP).some((k) => rawTitle.toLowerCase().endsWith(k))) continue;

      const start = parseTimeStr(am[2]);
      if (start === null) continue;

      const durationMins = am[3] ? Math.round(parseFloat(am[3]) * 60) : 60;
      const end = start + durationMins;

      addEvent(capitalize(rawTitle), start, end);
    }
  }

  if (descriptions.length === 0) {
    return {
      events: [],
      response: 'I need a specific time for that. Try: "I work Monday from 9 AM to 5 PM" or "Add gym Tuesday at 7 AM for 1 hour".',
    };
  }

  return {
    events: created,
    response: `Got it. I added ${descriptions.join(' and ')}.`,
  };
}

// ─── Event block ──────────────────────────────────────────────────────────────

function EventBlock({ event }: { event: ScheduleEvent }) {
  const s = CAT_STYLE[event.category];
  const top = (event.startMinutes / 60 - GRID_START) * HOUR_PX;
  const height = Math.max(((event.endMinutes - event.startMinutes) / 60) * HOUR_PX - 2, 18);

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 overflow-hidden cursor-default select-none
        ${s.bg} ${s.border}
        ${event.hasConflict ? 'ring-1 ring-orange-400/70' : ''}
        ${event.source === 'google' ? 'border-dashed' : ''}
      `}
      style={{ top, height }}
      title={[
        `${event.title}`,
        `${fmt(event.startMinutes)} – ${fmt(event.endMinutes)}`,
        event.source === 'google' ? 'From Google Calendar' : '',
        event.hasConflict ? '⚠ Scheduling conflict' : '',
      ].filter(Boolean).join(' · ')}
    >
      <div className="flex items-start gap-0.5 min-w-0">
        <p className={`text-xs font-semibold leading-tight truncate flex-1 ${s.text}`}>
          {event.title}
        </p>
        {event.hasConflict && (
          <span className="shrink-0 text-orange-400 text-[10px] leading-none ml-0.5" title="Conflict">⚠</span>
        )}
        {event.source === 'google' && (
          <span className="shrink-0 text-[9px] font-bold text-slate-500 leading-none ml-0.5 mt-px" title="Google Calendar">G</span>
        )}
      </div>
      {height > 32 && (
        <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
          {fmt(event.startMinutes)} – {fmt(event.endMinutes)}
        </p>
      )}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND: { label: string; cat: EventCategory }[] = [
  { label: 'Work', cat: 'work' },
  { label: 'Study', cat: 'study' },
  { label: 'Class', cat: 'class' },
  { label: 'Routine', cat: 'routine' },
  { label: 'Personal', cat: 'personal' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

function NormalUserPage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: "Hi! I'm your scheduling assistant. Tell me what to add — for example:\n\n\"I work Monday from 9 AM to 5 PM and want to study Java after work.\"\n\nI'll add it straight to your timetable.",
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  // ── Google OAuth ──────────────────────────────────────────────────────────

  const googleLogin = useGoogleLogin({
    onSuccess: (res) => {
      setGoogleToken(res.access_token);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Connected to Google Calendar. Click "Import this week" to pull in your events, or "Export" to push your timetable to Google.',
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Google Calendar connection failed. Please try again and allow calendar access.' },
      ]);
    },
    scope: 'https://www.googleapis.com/auth/calendar',
  });

  const importFromGoogle = useCallback(async () => {
    if (!googleToken) return;
    setSyncing(true);
    try {
      const gcalEvents = await fetchWeekEvents(googleToken);
      const mapped = gcalEvents
        .map(gcalToInternal)
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map((e) => ({
          id: uid(),
          ...e,
          category: detectCategory(e.title),
          source: 'google' as const,
        }));

      setEvents((prev) => {
        const internal = prev.filter((e) => e.source !== 'google');
        const merged = detectConflicts([...internal, ...mapped]);
        const conflictCount = merged.filter((e) => e.hasConflict).length;

        setMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            text:
              mapped.length === 0
                ? 'No timed events found in Google Calendar for this week.'
                : `Imported ${mapped.length} event${mapped.length !== 1 ? 's' : ''} from Google Calendar.${
                    conflictCount > 0
                      ? ` ⚠ ${conflictCount} scheduling conflict${conflictCount !== 1 ? 's' : ''} detected — highlighted in orange.`
                      : ' No conflicts.'
                  }`,
          },
        ]);

        return merged;
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Import failed. Your Google session may have expired — please reconnect.' },
      ]);
    } finally {
      setSyncing(false);
    }
  }, [googleToken]);

  const exportToGoogle = useCallback(async () => {
    if (!googleToken) return;
    setSyncing(true);
    try {
      const toExport = events.filter((e) => e.source !== 'google');
      if (toExport.length === 0) {
        setMessages((prev) => [...prev, { role: 'assistant', text: 'Nothing to export — add some events first.' }]);
        setSyncing(false);
        return;
      }
      await Promise.all(toExport.map((e) => createGCalEvent(googleToken, e)));
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Exported ${toExport.length} event${toExport.length !== 1 ? 's' : ''} to your Google Calendar.`,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Export failed. Your Google session may have expired — please reconnect.' },
      ]);
    } finally {
      setSyncing(false);
    }
  }, [googleToken, events]);

  const disconnect = useCallback(() => {
    setGoogleToken(null);
    setEvents((prev) => detectConflicts(prev.filter((e) => e.source !== 'google')));
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: 'Disconnected from Google Calendar. Google events removed from view.' },
    ]);
  }, []);

  // ── Chat ──────────────────────────────────────────────────────────────────

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || typing) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      setEvents((prev) => {
        const { events: newEvts, response } = parseMessage(text, prev);
        setMessages((msgs) => [...msgs, { role: 'assistant', text: response }]);
        setTyping(false);
        if (newEvts.length > 0) {
          const sessionId = getOrCreateSessionId();
          saveCalendarEvents(sessionId, newEvts).catch(console.error);
        }
        return detectConflicts([...prev, ...newEvts]);
      });
    }, 500);
  }, [input, typing]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearAll = () => {
    setEvents([]);
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: 'Done — timetable cleared. Start fresh!' },
    ]);
    const sessionId = getOrCreateSessionId();
    deleteCalendarEventsBySession(sessionId).catch(console.error);
  };

  const internalCount = events.filter((e) => e.source !== 'google').length;
  const googleCount = events.filter((e) => e.source === 'google').length;
  const conflictCount = events.filter((e) => e.hasConflict).length;
  const totalHeight = (GRID_END - GRID_START) * HOUR_PX;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-midnight">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-white/5 bg-midnight/90 backdrop-blur-sm">
        <Logo />
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3">
            {LEGEND.map(({ label, cat }) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${CAT_STYLE[cat].bg.replace('/25', '')} border ${CAT_STYLE[cat].border}`} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
            ))}
            {googleCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-dashed border-slate-500 bg-slate-700/50" />
                <span className="text-xs text-slate-500">Google</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs border-l border-white/5 pl-4">
            <span className="text-slate-600">{events.length} event{events.length !== 1 ? 's' : ''}</span>
            {conflictCount > 0 && (
              <span className="text-orange-400 font-medium">⚠ {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}</span>
            )}
          </div>

          <Link href="/" className="text-xs text-slate-500 hover:text-white transition-colors">
            ← Home
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* ══ TIMETABLE ══ */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5 min-w-0">
          {/* Day header */}
          <div className="shrink-0 flex border-b border-white/5 bg-slate-950/60">
            <div className="w-12 shrink-0" />
            {DAYS.map((day, i) => {
              const count = events.filter((e) => e.day === day).length;
              return (
                <div key={day} className="flex-1 py-2.5 text-center">
                  <p className="text-xs font-medium text-slate-400">{DAY_SHORT[i]}</p>
                  {count > 0 && <p className="text-[10px] text-sky mt-0.5">{count}</p>}
                </div>
              );
            })}
          </div>

          {/* Scrollable grid */}
          <div className="flex-1 overflow-y-auto overflow-x-auto">
            <div className="flex min-w-[560px]" style={{ height: totalHeight }}>
              {/* Time labels */}
              <div className="w-12 shrink-0 relative select-none">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 text-[10px] text-slate-600 leading-none"
                    style={{ top: (h - GRID_START) * HOUR_PX - 6 }}
                  >
                    {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map((day) => (
                <div key={day} className="flex-1 relative border-l border-white/5 min-w-0">
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className={`absolute left-0 right-0 border-t ${h % 6 === 0 ? 'border-white/10' : 'border-white/[0.04]'}`}
                      style={{ top: (h - GRID_START) * HOUR_PX }}
                    />
                  ))}
                  {events
                    .filter((e) => e.day === day)
                    .map((ev) => (
                      <EventBlock key={ev.id} event={ev} />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ CHAT PANEL ══ */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col bg-slate-950/40">
          {/* Chat header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-white">Schedule Assistant</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Describe your schedule in plain English</p>
            </div>
            {internalCount > 0 && (
              <button onClick={clearAll} className="text-[11px] text-slate-600 hover:text-red-400 transition-colors">
                Clear all
              </button>
            )}
          </div>

          {/* Google Calendar sync section */}
          <div className="shrink-0 px-3 py-3 border-b border-white/5 bg-slate-950/30">
            {!googleToken ? (
              <button
                onClick={() => googleLogin()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-300 text-xs hover:border-sky/30 hover:text-sky transition-all"
              >
                {/* Google "G" icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Calendar
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-[11px] text-emerald-400 font-medium">Google Connected</span>
                  </div>
                  <button
                    onClick={disconnect}
                    className="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={importFromGoogle}
                    disabled={syncing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/10 text-slate-300 text-[11px] hover:border-sky/30 hover:text-sky disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {syncing ? (
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    Import this week
                  </button>
                  <button
                    onClick={exportToGoogle}
                    disabled={syncing || internalCount === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/10 text-slate-300 text-[11px] hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Export to Google
                  </button>
                </div>
                {googleCount > 0 && (
                  <p className="text-[10px] text-slate-600 text-center">
                    {googleCount} Google event{googleCount !== 1 ? 's' : ''} shown (dashed border)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-sky text-white rounded-tr-sm'
                      : 'bg-slate-800/70 text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-slate-800/70">
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick examples */}
          {events.length === 0 && !typing && (
            <div className="shrink-0 px-3 pb-2 space-y-1">
              <p className="text-[10px] text-slate-600 px-1 mb-1.5">Try an example:</p>
              {[
                'I work Monday from 9 AM to 5 PM',
                'Add gym Tuesday at 7 AM for 1 hour',
                'Study Python Wednesday from 6 PM to 8 PM',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-white/5 bg-slate-900/40 hover:border-white/15 hover:text-slate-200 transition-all truncate"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 px-3 py-3 border-t border-white/5">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="e.g. I work Monday 9 AM to 5 PM…"
                rows={2}
                className="flex-1 resize-none px-3 py-2 rounded-xl border border-white/10 bg-slate-900/70 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky/40 focus:ring-1 focus:ring-sky/20 transition-all leading-snug"
              />
              <button
                onClick={send}
                disabled={!input.trim() || typing}
                className="w-8 h-8 rounded-xl bg-sky flex items-center justify-center hover:bg-sky/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 mb-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-slate-700 mt-1.5 px-0.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper — provides GoogleOAuthProvider ───────────────────────────────────

export default function NormalUserPageWrapper() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <NormalUserPage />
    </GoogleOAuthProvider>
  );
}
