'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ErrorBoundary from '@/components/ErrorBoundary';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { saveCalendarEvents, deleteCalendarEventsBySession, getOrCreateSessionId } from '@/lib/db';
import { fetchWeekEvents, gcalToInternal, createGCalEvent, updateGCalEvent } from '@/lib/googleCalendar';
import type { CalendarChatResponse } from '@/app/api/calendar-chat/route';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventCategory = 'work' | 'study' | 'personal' | 'class' | 'routine';

interface ScheduleEvent {
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  category: EventCategory;
  source?: 'google';
  googleEventId?: string;
  hasConflict?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GRID_START = 6;
const GRID_END = 23;
const HOUR_PX = 56;

const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

const CAT_STYLE: Record<EventCategory, { bg: string; border: string; text: string }> = {
  work:     { bg: 'bg-sky-500/25',     border: 'border-sky-400/50',     text: 'text-sky-300'     },
  study:    { bg: 'bg-violet-500/25',  border: 'border-violet-400/50',  text: 'text-violet-300'  },
  personal: { bg: 'bg-emerald-500/25', border: 'border-emerald-400/50', text: 'text-emerald-300' },
  class:    { bg: 'bg-amber-500/25',   border: 'border-amber-400/50',   text: 'text-amber-300'   },
  routine:  { bg: 'bg-slate-500/25',   border: 'border-slate-400/50',   text: 'text-slate-600 dark:text-slate-300'   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

function minsToTimeInput(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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

// ─── Event block ──────────────────────────────────────────────────────────────

function EventBlock({ event, onEdit }: { event: ScheduleEvent; onEdit: (ev: ScheduleEvent) => void }) {
  const s = CAT_STYLE[event.category];
  const top = (event.startMinutes / 60 - GRID_START) * HOUR_PX;
  const height = Math.max(((event.endMinutes - event.startMinutes) / 60) * HOUR_PX - 2, 18);

  return (
    <div
      onClick={() => onEdit(event)}
      className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 overflow-hidden cursor-pointer select-none
        ${s.bg} ${s.border}
        ${event.hasConflict ? 'ring-1 ring-orange-400/70 hover:ring-orange-400' : 'hover:brightness-110'}
        ${event.source === 'google' ? 'border-dashed' : ''}
      `}
      style={{ top, height }}
      title={[
        event.title,
        `${fmt(event.startMinutes)} – ${fmt(event.endMinutes)}`,
        event.source === 'google' ? 'From Google Calendar' : '',
        event.hasConflict ? '⚠ Click to fix conflict' : 'Click to edit',
      ].filter(Boolean).join(' · ')}
    >
      <div className="flex items-start gap-0.5 min-w-0">
        <p className={`text-xs font-semibold leading-tight truncate flex-1 ${s.text}`}>{event.title}</p>
        {event.hasConflict && (
          <span className="shrink-0 text-orange-400 text-[10px] leading-none ml-0.5">⚠</span>
        )}
        {event.source === 'google' && (
          <span className="shrink-0 text-[9px] font-bold text-slate-400 dark:text-slate-500 leading-none ml-0.5 mt-px">G</span>
        )}
      </div>
      {height > 32 && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5">
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
      text: "Hi! I'm your AI scheduling assistant. Tell me what to add — for example:\n\n\"I work Monday to Friday 9 AM to 5 PM.\"\n\"Add gym Tuesday and Thursday at 7 AM for 1 hour.\"\n\"What's on my schedule this week?\"\n\nI'll update your timetable and suggest what's next.",
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [webcalCopied, setWebcalCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [editForm, setEditForm] = useState({ title: '', day: '', startTime: '', endTime: '' });

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
        .map((e) => ({ id: uid(), ...e, category: detectCategory(e.title), source: 'google' as const }));

      setEvents((prev) => {
        const internal = prev.filter((e) => e.source !== 'google');
        const merged = detectConflicts([...internal, ...mapped]);
        const conflictCount = merged.filter((e) => e.hasConflict).length;
        setMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            text: mapped.length === 0
              ? 'No timed events found in Google Calendar for this week.'
              : `Imported ${mapped.length} event${mapped.length !== 1 ? 's' : ''} from Google Calendar.${
                  conflictCount > 0
                    ? ` ⚠ ${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} detected — highlighted in orange.`
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
      const candidates = events.filter((e) => e.source !== 'google');
      const conflicted = candidates.filter((e) => e.hasConflict);
      const clean = candidates.filter((e) => !e.hasConflict);
      const toCreate = clean.filter((e) => !e.googleEventId);
      const toUpdate = clean.filter((e) => !!e.googleEventId);

      if (clean.length === 0 && conflicted.length === 0) {
        setMessages((prev) => [...prev, { role: 'assistant', text: 'Nothing to export — add some events first.' }]);
        setSyncing(false);
        return;
      }
      if (clean.length === 0) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `All ${conflicted.length} event${conflicted.length !== 1 ? 's have' : ' has'} conflicts — fix them first.` },
        ]);
        setSyncing(false);
        return;
      }

      const createResults = await Promise.allSettled(
        toCreate.map(async (e) => ({ id: e.id, googleEventId: await createGCalEvent(googleToken, e) }))
      );
      const updateResults = await Promise.allSettled(
        toUpdate.map(async (e) => { await updateGCalEvent(googleToken, e.googleEventId!, e); return { id: e.id }; })
      );

      const idMap: Record<string, string> = {};
      for (const r of createResults) if (r.status === 'fulfilled') idMap[r.value.id] = r.value.googleEventId;
      setEvents((prev) => prev.map((e) => idMap[e.id] ? { ...e, googleEventId: idMap[e.id] } : e));

      const created = createResults.filter((r) => r.status === 'fulfilled').length;
      const updated = updateResults.filter((r) => r.status === 'fulfilled').length;
      const failed = [...createResults, ...updateResults].filter((r) => r.status === 'rejected').length;
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} event${created !== 1 ? 's' : ''} exported`);
      if (updated > 0) parts.push(`${updated} event${updated !== 1 ? 's' : ''} updated`);
      if (conflicted.length > 0) parts.push(`${conflicted.length} conflicting — fix first`);
      if (failed > 0) parts.push(`${failed} failed`);
      setMessages((prev) => [...prev, { role: 'assistant', text: parts.join(', ') + '.' }]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      let detail = raw;
      if (raw.includes('403')) detail = 'Google Calendar API not enabled. Enable it in Google Cloud Console → APIs & Services.';
      else if (raw.includes('401')) detail = 'Session expired — disconnect and reconnect Google Calendar.';
      else if (raw.toLowerCase().includes('failed to fetch')) detail = 'Network error — check your internet connection.';
      setMessages((prev) => [...prev, { role: 'assistant', text: `Export failed: ${detail}` }]);
    } finally {
      setSyncing(false);
    }
  }, [googleToken, events]);

  // ── Apple Calendar / iCal export ──────────────────────────────────────────

  const handleSubscribeApple = useCallback(() => {
    const sessionId = getOrCreateSessionId();
    window.location.href = `webcal://${window.location.host}/api/calendar/feed?session=${sessionId}`;
  }, []);

  const handleCopyWebcal = useCallback(async () => {
    const sessionId = getOrCreateSessionId();
    const url = `webcal://${window.location.host}/api/calendar/feed?session=${sessionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setWebcalCopied(true);
      setTimeout(() => setWebcalCopied(false), 2500);
    } catch {
      prompt('Copy this URL to subscribe in any calendar app:', url);
    }
  }, []);

  const handleDownloadIcs = useCallback(() => {
    const sessionId = getOrCreateSessionId();
    const a = document.createElement('a');
    a.href = `/api/calendar/feed?session=${sessionId}`;
    a.download = 'schedule.ics';
    a.click();
  }, []);

  const disconnect = useCallback(() => {
    setGoogleToken(null);
    setEvents((prev) => detectConflicts(prev.filter((e) => e.source !== 'google')));
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: 'Disconnected from Google Calendar. Google events removed from view.' },
    ]);
  }, []);

  // ── Edit event ────────────────────────────────────────────────────────────

  const openEdit = useCallback((ev: ScheduleEvent) => {
    setEditingEvent(ev);
    setEditForm({
      title: ev.title,
      day: ev.day,
      startTime: minsToTimeInput(ev.startMinutes),
      endTime: minsToTimeInput(ev.endMinutes),
    });
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingEvent) return;
    const startParts = editForm.startTime.split(':').map(Number);
    const endParts = editForm.endTime.split(':').map(Number);
    if (startParts.length < 2 || endParts.length < 2) return;
    const startMinutes = startParts[0] * 60 + startParts[1];
    const endMinutes = endParts[0] * 60 + endParts[1];
    if (isNaN(startMinutes) || isNaN(endMinutes) || endMinutes <= startMinutes) return;
    setEvents((prev) =>
      detectConflicts(
        prev.map((e) =>
          e.id === editingEvent.id
            ? { ...e, title: editForm.title.trim() || e.title, day: editForm.day, startMinutes, endMinutes, category: detectCategory(editForm.title) }
            : e
        )
      )
    );
    setEditingEvent(null);
  }, [editingEvent, editForm]);

  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => detectConflicts(prev.filter((e) => e.id !== id)));
    setEditingEvent(null);
  }, []);

  // ── Chat core ─────────────────────────────────────────────────────────────

  const sendText = useCallback(async (text: string) => {
    if (typing) return;

    // Persist for bug reporting
    sessionStorage.setItem('scheduleai_last_action', text);

    const newUserMsg: ChatMessage = { role: 'user', text };
    setMessages((prev) => [...prev, newUserMsg]);
    setTyping(true);
    setSuggestions([]);

    // Snapshot events for bug reporting
    setEvents((prev) => {
      sessionStorage.setItem('scheduleai_events_snapshot', JSON.stringify(prev.slice(0, 20)));
      return prev;
    });

    try {
      // Build history for API (include the new user message)
      const history = [...messages, newUserMsg].map((m) => ({ role: m.role, content: m.text }));

      const res = await fetch('/api/calendar-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          currentEvents: events.map((e) => ({
            id: e.id,
            day: e.day,
            startMinutes: e.startMinutes,
            endMinutes: e.endMinutes,
            title: e.title,
            category: e.category,
          })),
          googleConnected: !!googleToken,
        }),
      });

      if (!res.ok) throw new Error(`API_${res.status}`);
      const data: CalendarChatResponse = await res.json();

      setEvents((prev) => {
        let updated = [...prev];

        // Apply deletes
        updated = updated.filter((e) => !data.deletedIds.includes(e.id));

        // Apply edits
        for (const edit of data.editedEvents) {
          updated = updated.map((e) => (e.id === edit.id ? { ...e, ...edit.changes } : e));
        }

        // Apply adds
        updated = [...updated, ...data.addedEvents];

        // Auto-sync new events to Google Calendar if connected
        if (googleToken && data.addedEvents.length > 0) {
          for (const ev of data.addedEvents) {
            createGCalEvent(googleToken, ev).catch(console.error);
          }
        }

        // Persist new events to Firestore
        if (data.addedEvents.length > 0) {
          const sessionId = getOrCreateSessionId();
          saveCalendarEvents(sessionId, data.addedEvents).catch(console.error);
        }

        return detectConflicts(updated);
      });

      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply }]);
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const assistantError = msg.includes('API_429')
        ? "You're sending messages too quickly — give it a moment and try again."
        : "Assistant is temporarily unavailable. Please try again in a moment.";
      setMessages((prev) => [...prev, { role: 'assistant', text: assistantError }]);
    } finally {
      setTyping(false);
    }
  }, [typing, messages, events, googleToken]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || typing) return;
    setInput('');
    sendText(text);
  }, [input, typing, sendText]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearAll = () => {
    setEvents([]);
    setSuggestions([]);
    setMessages((prev) => [...prev, { role: 'assistant', text: 'Done — timetable cleared. Start fresh!' }]);
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
      <header className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-slate-100 dark:border-white/5 bg-midnight/90 backdrop-blur-sm">
        <Logo />
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3">
            {LEGEND.map(({ label, cat }) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${CAT_STYLE[cat].bg.replace('/25', '')} border ${CAT_STYLE[cat].border}`} />
                <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
              </div>
            ))}
            {googleCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-dashed border-slate-500 bg-slate-700/50" />
                <span className="text-xs text-slate-400 dark:text-slate-500">Google</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs border-l border-slate-100 dark:border-white/5 pl-4">
            <span className="text-slate-500 dark:text-slate-600">{events.length} event{events.length !== 1 ? 's' : ''}</span>
            {conflictCount > 0 && (
              <span className="text-orange-400 font-medium">⚠ {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}</span>
            )}
          </div>

          <Link href="/" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            ← Home
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* ══ TIMETABLE ══ */}
        <div className="flex-1 flex flex-col min-h-0 border-r border-slate-100 dark:border-white/5">
          {/* Day header */}
          <div className="shrink-0 flex border-b border-slate-100 dark:border-white/5 bg-slate-950/60">
            <div className="w-12 shrink-0" />
            {DAYS.map((day, i) => {
              const count = events.filter((e) => e.day === day).length;
              return (
                <div key={day} className="flex-1 py-2.5 text-center">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{DAY_SHORT[i]}</p>
                  {count > 0 && <p className="text-[10px] text-sky mt-0.5">{count}</p>}
                </div>
              );
            })}
          </div>

          {/* Edit panel */}
          {editingEvent && (
            <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-900/90 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2.5">
                <p className="text-xs font-semibold text-white flex-1">Edit Event</p>
                {editingEvent.hasConflict && (
                  <span className="text-[10px] text-orange-400 font-medium">⚠ Conflict — adjust time or day</span>
                )}
                <button onClick={() => setEditingEvent(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm leading-none">✕</button>
              </div>
              <div className="flex flex-col gap-2">
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Event title"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-white focus:outline-none focus:border-sky/40"
                />
                <div className="flex gap-2">
                  <select
                    value={editForm.day}
                    onChange={(e) => setEditForm((f) => ({ ...f, day: e.target.value }))}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-white focus:outline-none focus:border-sky/40"
                  >
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input
                    type="time"
                    value={editForm.startTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-24 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-white focus:outline-none focus:border-sky/40"
                  />
                  <input
                    type="time"
                    value={editForm.endTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="w-24 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs text-white focus:outline-none focus:border-sky/40"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex-1 py-1.5 rounded-lg bg-sky text-white text-xs font-medium hover:bg-sky/90 transition-colors">Save</button>
                  <button onClick={() => removeEvent(editingEvent.id)} className="py-1.5 px-3 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">Remove</button>
                  <button onClick={() => setEditingEvent(null)} className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-xs hover:text-slate-900 dark:hover:text-white transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Scrollable grid */}
          <div className="flex-1 overflow-auto min-h-0">
            <div className="flex min-w-[560px]" style={{ height: totalHeight }}>
              <div className="w-12 shrink-0 relative select-none">
                {HOURS.map((h) => (
                  <div key={h} className="absolute right-2 text-[10px] text-slate-500 dark:text-slate-600 leading-none" style={{ top: (h - GRID_START) * HOUR_PX - 6 }}>
                    {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
                  </div>
                ))}
              </div>
              {DAYS.map((day) => (
                <div key={day} className="flex-1 relative border-l border-slate-100 dark:border-white/5 min-w-0">
                  {HOURS.map((h) => (
                    <div key={h} className={`absolute left-0 right-0 border-t ${h % 6 === 0 ? 'border-slate-200 dark:border-white/10' : 'border-white/[0.04]'}`} style={{ top: (h - GRID_START) * HOUR_PX }} />
                  ))}
                  {events.filter((e) => e.day === day).map((ev) => (
                    <EventBlock key={ev.id} event={ev} onEdit={openEdit} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ CHAT PANEL ══ */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col min-h-0 bg-slate-950/40">
          {/* Chat header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-white">AI Schedule Assistant</h2>
            </div>
            {internalCount > 0 && (
              <button onClick={clearAll} className="text-[11px] text-slate-500 dark:text-slate-600 hover:text-red-400 transition-colors">Clear all</button>
            )}
          </div>

          {/* Google Calendar sync */}
          <div className="shrink-0 px-3 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-950/30">
            {!googleToken ? (
              <button
                onClick={() => googleLogin()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs hover:border-sky/30 hover:text-sky transition-all"
              >
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
                  <button onClick={disconnect} className="text-[10px] text-slate-500 dark:text-slate-600 hover:text-red-400 transition-colors">Disconnect</button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={importFromGoogle}
                    disabled={syncing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[11px] hover:border-sky/30 hover:text-sky disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {syncing ? (
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    Import this week
                  </button>
                  <button
                    onClick={exportToGoogle}
                    disabled={syncing || internalCount === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[11px] hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Export to Google
                  </button>
                </div>
                {googleCount > 0 && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-600 text-center">{googleCount} Google event{googleCount !== 1 ? 's' : ''} shown (dashed border)</p>
                )}
              </div>
            )}
          </div>

          {/* Apple Calendar / iCal export */}
          <div className="shrink-0 px-3 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-950/30 space-y-2">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide">Export Schedule</p>
            <button
              onClick={handleSubscribeApple}
              disabled={internalCount === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs hover:border-sky/30 hover:text-sky disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Subscribe in Apple Calendar
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleCopyWebcal}
                disabled={internalCount === 0}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[11px] hover:border-sky/30 hover:text-sky disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {webcalCopied ? '✓ Copied!' : 'Copy webcal URL'}
              </button>
              <button
                onClick={handleDownloadIcs}
                disabled={internalCount === 0}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[11px] hover:border-sky/30 hover:text-sky disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Download .ics
              </button>
            </div>
            {internalCount === 0 && (
              <p className="text-[10px] text-slate-500 dark:text-slate-600 text-center">Add events to enable export</p>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-2.5">
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
                      <span key={delay} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions strip */}
          {suggestions.length > 0 && !typing && (
            <div className="shrink-0 px-3 pb-2">
              <p className="text-[10px] text-slate-500 dark:text-slate-600 mb-1.5 px-0.5">Suggested next:</p>
              <div className="flex gap-1.5 flex-wrap">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendText(s)}
                    className="px-2.5 py-1 rounded-full text-[11px] bg-sky-950/60 text-sky-400 border border-sky-800/40 hover:border-sky-600/60 hover:text-sky-300 transition-all leading-tight"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick examples (shown when no events yet) */}
          {events.length === 0 && !typing && suggestions.length === 0 && (
            <div className="shrink-0 px-3 pb-2 space-y-1">
              <p className="text-[10px] text-slate-500 dark:text-slate-600 px-1 mb-1.5">Try an example:</p>
              {[
                'I work Monday to Friday 9 AM to 5 PM',
                'Add gym Tuesday and Thursday at 7 AM for 1 hour',
                'Study Python Wednesday from 6 PM to 8 PM',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-200 dark:border-white/15 hover:text-slate-700 dark:hover:text-slate-200 transition-all truncate"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 px-3 py-3 border-t border-slate-100 dark:border-white/5">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="e.g. I work Monday 9 AM to 5 PM…"
                rows={2}
                className="flex-1 resize-none px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/70 text-sm text-white placeholder:text-slate-500 dark:text-slate-600 focus:outline-none focus:border-sky/40 focus:ring-1 focus:ring-sky/20 transition-all leading-snug"
              />
              <button
                onClick={send}
                disabled={!input.trim() || typing}
                className="w-8 h-8 rounded-xl bg-sky flex items-center justify-center hover:bg-sky/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 mb-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
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

// ─── Wrapper ─────────────────────────────────────────────────────────────────

export default function NormalUserPageWrapper() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <ErrorBoundary>
        <NormalUserPage />
      </ErrorBoundary>
    </GoogleOAuthProvider>
  );
}
