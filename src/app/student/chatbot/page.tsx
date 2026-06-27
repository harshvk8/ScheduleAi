'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { saveScheduleRequest, getAllProfessorFeedback, getAllScheduleRequests } from '@/lib/db';
import type { ChatApiResponse } from '@/app/api/chat/route';
import type { CalendarChatResponse } from '@/app/api/calendar-chat/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
  name: string;
  email: string;
  studentId: string;
  universityName: string;
  universityId?: string;
}

type Modality = 'online' | 'hybrid' | 'in-person';
type TimeLabel = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

interface CoursePreference {
  course: string;
  preferredProfessor?: string;
  preferredDays: string[];
  avoidDays: string[];
  preferredTimes: TimeLabel[];
  avoidTimes: TimeLabel[];
  modality?: Modality;
}

interface ScheduleConstraint {
  type: 'work' | 'unavailable';
  description: string;
  avoidTimes?: TimeLabel[];
  avoidDays?: string[];
}

interface StudentPreferences {
  courses: CoursePreference[];
  constraints: ScheduleConstraint[];
  generalPreferTimes: TimeLabel[];
  generalAvoidTimes: TimeLabel[];
  generalPreferDays: string[];
  generalAvoidDays: string[];
  defaultModality?: Modality;
}

interface ChatMessage {
  role: 'bot' | 'user';
  text: string;
}

interface ProfRec {
  course: string;
  professor: string;
  reason: string;
}

interface SlotSuggestion {
  day: string;
  time: TimeLabel;
  score: number;
}

interface AvailableProfessor {
  name: string;
  courses: string[];
  avgRating: number | null;
  wouldTakeAgainPct: number | null;
}

// ─── Regex fallback NLP ────────────────────────────────────────────────────────

const COURSE_RE = /\b([A-Z]{2,6}\s*\d{3,4}[A-Z]?)\b/g;

const TIME_KEYWORDS: Record<string, TimeLabel> = {
  morning: 'Morning', mornings: 'Morning', 'early morning': 'Morning',
  afternoon: 'Afternoon', afternoons: 'Afternoon', midday: 'Afternoon',
  evening: 'Evening', evenings: 'Evening',
  night: 'Night', nights: 'Night', late: 'Night',
};

const DAY_KEYWORDS: Record<string, string[]> = {
  monday: ['Monday'], mon: ['Monday'],
  tuesday: ['Tuesday'], tue: ['Tuesday'], tues: ['Tuesday'],
  wednesday: ['Wednesday'], wed: ['Wednesday'],
  thursday: ['Thursday'], thu: ['Thursday'], thurs: ['Thursday'],
  friday: ['Friday'], fri: ['Friday'],
  saturday: ['Saturday'], sat: ['Saturday'],
  sunday: ['Sunday'], sun: ['Sunday'],
  mwf: ['Monday', 'Wednesday', 'Friday'],
  tth: ['Tuesday', 'Thursday'], tuth: ['Tuesday', 'Thursday'],
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  weekends: ['Saturday', 'Sunday'],
};

const MODALITY_KEYWORDS: Record<string, Modality> = {
  online: 'online', remote: 'online', virtual: 'online',
  'in-person': 'in-person', 'in person': 'in-person', campus: 'in-person',
  hybrid: 'hybrid', blended: 'hybrid',
};

const AVOID_RE = /\b(cannot|can't|cant|avoid|don't want|wont|won't|unable|never)\b/i;
const NEGATE_RE = /\b(not|no|never|cannot|can't|cant|avoid|don't|won't)\b/i;
const WORK_RE = /\b(work|job|shift|employed|working)\b/i;

function isNegatedAt(text: string, idx: number) {
  return NEGATE_RE.test(text.slice(Math.max(0, idx - 35), idx));
}

function regexExtract(text: string) {
  const upper = text.toUpperCase();
  const courses = [...new Set(Array.from(upper.matchAll(COURSE_RE)).map((m) => m[1].replace(/\s+/, ' ')))];

  const profRe = /(?:professor|prof\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)|with\s+(?:professor|prof\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
  const professors: string[] = [];
  let pm: RegExpExecArray | null;
  while ((pm = profRe.exec(text)) !== null) {
    const n = (pm[1] || pm[2] || '').trim();
    if (n) professors.push('Professor ' + n);
  }

  const lower = text.toLowerCase();
  const preferTimes: TimeLabel[] = [];
  const avoidTimes: TimeLabel[] = [];
  for (const key of Object.keys(TIME_KEYWORDS).sort((a, b) => b.length - a.length)) {
    const idx = lower.indexOf(key);
    if (idx === -1) continue;
    const label = TIME_KEYWORDS[key];
    if (isNegatedAt(lower, idx) || AVOID_RE.test(lower.slice(Math.max(0, idx - 30), idx + key.length))) {
      if (!avoidTimes.includes(label)) avoidTimes.push(label);
    } else {
      if (!preferTimes.includes(label)) preferTimes.push(label);
    }
  }

  const preferDays: string[] = [];
  const avoidDays: string[] = [];
  for (const key of Object.keys(DAY_KEYWORDS).sort((a, b) => b.length - a.length)) {
    const idx = lower.indexOf(key);
    if (idx === -1) continue;
    const days = DAY_KEYWORDS[key];
    if (isNegatedAt(lower, idx)) {
      days.forEach((d) => { if (!avoidDays.includes(d)) avoidDays.push(d); });
    } else {
      days.forEach((d) => { if (!preferDays.includes(d)) preferDays.push(d); });
    }
  }

  let modality: Modality | undefined;
  for (const key of Object.keys(MODALITY_KEYWORDS).sort((a, b) => b.length - a.length)) {
    if (lower.includes(key)) { modality = MODALITY_KEYWORDS[key]; break; }
  }

  const isWork = WORK_RE.test(text);
  let workDesc: string | undefined;
  if (isWork) {
    const wm = text.match(/(?:i\s+)?work\s+.{5,60}?(?:\.|,|$)/i);
    workDesc = wm ? wm[0].trim() : 'Has work commitments';
  }

  // When work is mentioned, any times found (without negation) are work hours, not class preferences.
  // Move them to workAvoidTimes so the grid shows amber instead of green.
  const cleanPreferTimes = isWork ? [] : preferTimes.filter((t) => !avoidTimes.includes(t));
  const workAvoidTimes: TimeLabel[] = isWork ? preferTimes.filter((t) => !avoidTimes.includes(t)) : [];
  const workAvoidDays: string[] = isWork ? [...new Set(preferDays.filter((d) => !avoidDays.includes(d)))] : [];
  const cleanPreferDays = isWork ? [] : [...new Set(preferDays.filter((d) => !avoidDays.includes(d)))];

  return {
    courses, professors,
    preferTimes: cleanPreferTimes,
    avoidTimes,
    preferDays: cleanPreferDays,
    avoidDays: [...new Set(avoidDays)],
    modality, isWork, workDesc,
    workAvoidTimes,
    workAvoidDays,
  };
}

// ─── Apply extracted to prefs ─────────────────────────────────────────────────

function applyExtracted(
  prefs: StudentPreferences,
  data: {
    courses: string[];
    professors: string[];
    preferTimes: string[];
    avoidTimes: string[];
    preferDays: string[];
    avoidDays: string[];
    modality?: string | null;
    isWork: boolean;
    workDesc?: string | null;
    workAvoidTimes?: string[];
    workAvoidDays?: string[];
  }
): StudentPreferences {
  const p: StudentPreferences = JSON.parse(JSON.stringify(prefs));

  const preferTimes = (data.preferTimes ?? []) as TimeLabel[];
  const avoidTimes = (data.avoidTimes ?? []) as TimeLabel[];
  const workAvoidTimes = (data.workAvoidTimes ?? []) as TimeLabel[];
  const workAvoidDays = (data.workAvoidDays ?? []) as string[];

  if (data.courses.length > 0) {
    for (const courseName of data.courses) {
      let c = p.courses.find((x) => x.course === courseName);
      if (!c) {
        c = { course: courseName, preferredDays: [], avoidDays: [], preferredTimes: [], avoidTimes: [] };
        p.courses.push(c);
      }
      if (data.professors[0]) c.preferredProfessor = data.professors[0];
      if (preferTimes.length) c.preferredTimes = [...new Set([...c.preferredTimes, ...preferTimes])];
      if (avoidTimes.length) c.avoidTimes = [...new Set([...c.avoidTimes, ...avoidTimes])];
      if (data.preferDays.length) c.preferredDays = [...new Set([...c.preferredDays, ...data.preferDays])];
      if (data.avoidDays.length) c.avoidDays = [...new Set([...c.avoidDays, ...data.avoidDays])];
      if (data.modality) c.modality = data.modality as Modality;
    }
  } else {
    preferTimes.forEach((t) => { if (!p.generalPreferTimes.includes(t)) p.generalPreferTimes.push(t); });
    // avoidTimes here are NON-work avoids → go to generalAvoidTimes (red)
    avoidTimes.forEach((t) => { if (!p.generalAvoidTimes.includes(t)) p.generalAvoidTimes.push(t); });
    data.preferDays.forEach((d) => { if (!p.generalPreferDays.includes(d)) p.generalPreferDays.push(d); });
    data.avoidDays.forEach((d) => { if (!p.generalAvoidDays.includes(d)) p.generalAvoidDays.push(d); });
    if (data.modality) p.defaultModality = data.modality as Modality;
  }

  if (data.isWork) {
    // workAvoidTimes go ONLY into the work constraint — never into generalAvoidTimes.
    // This keeps them amber in the grid instead of red.
    const existing = p.constraints.find((c) => c.type === 'work');
    if (existing) {
      if (workAvoidTimes.length)
        existing.avoidTimes = [...new Set([...(existing.avoidTimes ?? []), ...workAvoidTimes])];
      if (workAvoidDays.length)
        existing.avoidDays = [...new Set([...(existing.avoidDays ?? []), ...workAvoidDays])];
      if (data.workDesc) existing.description = data.workDesc;
    } else {
      p.constraints.push({
        type: 'work',
        description: data.workDesc ?? 'Work commitments',
        ...(workAvoidTimes.length ? { avoidTimes: workAvoidTimes } : {}),
        ...(workAvoidDays.length ? { avoidDays: workAvoidDays } : {}),
      });
    }
  }

  return p;
}

// ─── Schedule suggestion engine ───────────────────────────────────────────────

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const ALL_TIMES: TimeLabel[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

function computeSuggestions(prefs: StudentPreferences): SlotSuggestion[] {
  const workConstraints = prefs.constraints.filter((c) => c.type === 'work');
  const slots: SlotSuggestion[] = [];

  for (const day of ALL_DAYS) {
    for (const time of ALL_TIMES) {
      let score = 0;
      if (prefs.generalAvoidDays.includes(day) || prefs.generalAvoidTimes.includes(time)) continue;
      // Only penalise times we actually know conflict with work
      for (const wc of workConstraints) {
        const timeBlocked = wc.avoidTimes?.includes(time) ?? false;
        const dayBlocked = wc.avoidDays?.length ? wc.avoidDays.includes(day) : true; // if no days specified, assume all weekdays
        if (timeBlocked && dayBlocked) { score -= 3; }
      }
      if (prefs.generalPreferTimes.includes(time)) score += 3;
      if (prefs.generalPreferDays.includes(day)) score += 2;
      if (['Tuesday', 'Thursday'].includes(day)) score += 1;
      if (score < 0) continue;
      slots.push({ day, time, score });
    }
  }

  return slots.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ─── Visual helpers ────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type CellStatus = 'neutral' | 'preferred' | 'avoided' | 'work';

function getCellStatus(day: string, time: TimeLabel, prefs: StudentPreferences): CellStatus {
  if (prefs.generalAvoidTimes.includes(time) || prefs.generalAvoidDays.includes(day)) return 'avoided';
  // Mark as 'work' only for times/days the student actually told us they work
  for (const wc of prefs.constraints) {
    if (wc.type !== 'work' || !wc.avoidTimes?.length) continue;
    const timeBlocked = wc.avoidTimes.includes(time);
    const dayBlocked = wc.avoidDays?.length ? wc.avoidDays.includes(day) : !['Saturday', 'Sunday'].includes(day);
    if (timeBlocked && dayBlocked) return 'work';
  }
  const timeMatch = prefs.generalPreferTimes.length === 0 || prefs.generalPreferTimes.includes(time);
  const dayMatch = prefs.generalPreferDays.length === 0 || prefs.generalPreferDays.includes(day);
  if ((prefs.generalPreferTimes.length > 0 || prefs.generalPreferDays.length > 0) && timeMatch && dayMatch) return 'preferred';
  return 'neutral';
}

const CELL_STYLE: Record<CellStatus, string> = {
  neutral: 'bg-slate-200/80 dark:bg-gray-800/60',
  preferred: 'bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-400/50 dark:border-emerald-700/50',
  avoided: 'bg-red-100 dark:bg-red-950/70 border border-red-300/60 dark:border-red-800/40',
  work: 'bg-amber-100 dark:bg-amber-950/70 border border-amber-300/60 dark:border-amber-800/40',
};

const TIME_BADGE: Record<TimeLabel, string> = {
  Morning: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30',
  Afternoon: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/30',
  Evening: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30',
  Night: 'bg-slate-600/40 text-slate-600 dark:text-slate-300 ring-1 ring-slate-500/30',
};

const MODALITY_BADGE: Record<Modality, string> = {
  online: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
  hybrid: 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/30',
  'in-person': 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30',
};

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

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="font-semibold text-slate-900 dark:text-white">{part}</strong>
          ) : (
            <span key={j}>{part.replace(/\*(.*?)\*/g, '$1')}</span>
          )
        )}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

// ─── Initial steps (fallback prompts) ─────────────────────────────────────────

const STEPS = [
  (name: string) =>
    `Hi ${name}! I'm your scheduling assistant.\n\nWhat courses are you planning to take this semester? You can list them like: *CSIT 313, MATH 201, CS 101*`,
  () => `Do you have any preferred professors? Say *"Professor Brown for CSIT 313"* or *"no preference"*.`,
  () => `Which days work best for you — or any you'd like to avoid? Try *"MWF"*, *"no Fridays"*, or *"Tuesday and Thursday only"*.`,
  () => `What time of day works best — morning, afternoon, or evening? Any times you absolutely can't make?`,
  () => `Do you have a work schedule or other commitments? (e.g. *"I work Mon–Fri 9 to 1"*)`,
  () => `Do you prefer **online**, **in-person**, or **hybrid** classes?`,
  () => `Anything else I should know? Type *"done"* when you're finished.`,
];

// ─── Empty prefs ───────────────────────────────────────────────────────────────

const EMPTY_PREFS: StudentPreferences = {
  courses: [], constraints: [],
  generalPreferTimes: [], generalAvoidTimes: [],
  generalPreferDays: [], generalAvoidDays: [],
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function StudentChatbotPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // API message history (only user/assistant turns, no bot preamble)
  const [apiHistory, setApiHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [prefs, setPrefs] = useState<StudentPreferences>(EMPTY_PREFS);
  const [input, setInput] = useState('');
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [profRecs, setProfRecs] = useState<ProfRec[]>([]);
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([]);
  const [availableProfs, setAvailableProfs] = useState<AvailableProfessor[]>([]);
  const [aiEnabled, setAiEnabled] = useState(true); // flips false if API returns 503
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ── Right panel tab + My Schedule state ──────────────────────────────────────
  const [activeRightTab, setActiveRightTab] = useState<'preferences' | 'schedule'>('preferences');
  const [scheduleEvents, setScheduleEvents] = useState<SchedEvent[]>([]);
  const [editingSchedEvent, setEditingSchedEvent] = useState<SchedEvent | null>(null);
  const [editSchedForm, setEditSchedForm] = useState({
    title: '', day: SCHED_DAYS[0], startTime: '09:00', endTime: '10:00',
  });

  // Load student profile + pre-fetch professor data
  useEffect(() => {
    const raw = sessionStorage.getItem('studentProfile');
    if (!raw) { router.replace('/student'); return; }
    try {
      const p = JSON.parse(raw) as StudentProfile;
      setProfile(p);
      const firstName = p.name.split(' ')[0];
      setTimeout(() => {
        setMessages([{ role: 'bot', text: STEPS[0](firstName) }]);
      }, 300);
    } catch {
      router.replace('/student');
    }

    // Pre-fetch professor feedback so we can recommend
    Promise.all([getAllScheduleRequests(), getAllProfessorFeedback()])
      .then(([reqs, feedback]) => {
        const map = new Map<string, AvailableProfessor>();
        for (const req of reqs) {
          for (const c of req.courses ?? []) {
            const name = c.preferredProfessor?.trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (!map.has(key)) map.set(key, { name, courses: [], avgRating: null, wouldTakeAgainPct: null });
            const cn = c.course?.toUpperCase();
            if (cn && !map.get(key)!.courses.includes(cn)) map.get(key)!.courses.push(cn);
          }
        }
        const fbByProf = new Map<string, typeof feedback>();
        for (const fb of feedback) {
          const key = fb.professorName.trim().toLowerCase();
          if (!fbByProf.has(key)) fbByProf.set(key, []);
          fbByProf.get(key)!.push(fb);
        }
        for (const [key, p] of map) {
          const fbs = fbByProf.get(key) ?? [];
          const ratings = fbs.filter((f) => f.rating != null).map((f) => f.rating!);
          p.avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
          const wtaVotes = fbs.filter((f) => f.wouldTakeAgain != null);
          p.wouldTakeAgainPct = wtaVotes.length
            ? (wtaVotes.filter((f) => f.wouldTakeAgain).length / wtaVotes.length) * 100
            : null;
          for (const fb of fbs) {
            const cn = fb.courseName?.toUpperCase().trim();
            if (cn && !p.courses.includes(cn)) p.courses.push(cn);
          }
        }
        setAvailableProfs(Array.from(map.values()).filter((p) => p.avgRating != null));
      })
      .catch(() => {/* non-critical */});
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    schedChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [schedChatMessages, schedTyping]);

  // Recompute schedule suggestions whenever prefs change
  useEffect(() => {
    const newSuggestions = computeSuggestions(prefs);
    setSuggestions(newSuggestions);
  }, [prefs]);

  const callAI = useCallback(
    async (
      userText: string,
      currentPrefs: StudentPreferences,
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    ): Promise<ChatApiResponse | null> => {
      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...history, { role: 'user', content: userText }],
            currentPrefs: {
              courses: currentPrefs.courses,
              constraints: currentPrefs.constraints,
              generalPreferTimes: currentPrefs.generalPreferTimes,
              generalAvoidTimes: currentPrefs.generalAvoidTimes,
              generalPreferDays: currentPrefs.generalPreferDays,
              generalAvoidDays: currentPrefs.generalAvoidDays,
              defaultModality: currentPrefs.defaultModality,
            },
            studentName: profile?.name ?? '',
            availableProfessors: availableProfs.slice(0, 20),
          }),
        });
        if (resp.status === 503) { setAiEnabled(false); return null; }
        if (!resp.ok) return null;
        return await resp.json();
      } catch {
        return null;
      }
    },
    [profile, availableProfs]
  );

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

  function send() {
    const text = input.trim();
    if (!text || isDone) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);

    if (/^done$/i.test(text) || /^finish(ed)?$/i.test(text)) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          { role: 'bot', text: `Perfect! Your preferences have been submitted to **${profile?.universityName ?? 'your university'}**. You can now plan your week in the **My Schedule** tab on the right.` },
        ]);
        setIsDone(true);
        if (profile) {
          const sp = sessionStorage.getItem('studentProfile');
          const stored = sp ? JSON.parse(sp) : {};
          saveScheduleRequest(
            profile.email, profile.name,
            stored.universityId ?? profile.universityId ?? '',
            profile.universityName,
            {
              courses: prefs.courses, constraints: prefs.constraints,
              generalPreferTimes: prefs.generalPreferTimes, generalAvoidTimes: prefs.generalAvoidTimes,
              generalPreferDays: prefs.generalPreferDays, generalAvoidDays: prefs.generalAvoidDays,
              defaultModality: prefs.defaultModality,
            }
          ).catch(console.error);
        }
      }, 700);
      return;
    }

    setTyping(true);

    if (aiEnabled) {
      callAI(text, prefs, apiHistory).then((result) => {
        setTyping(false);
        if (!result) {
          // AI unavailable — fall back to regex
          const data = regexExtract(text);
          const updated = applyExtracted(prefs, data);
          setPrefs(updated);
          const nextQ = STEPS[Math.min(step + 1, STEPS.length - 1)]('');
          setMessages((prev) => [...prev, { role: 'bot', text: `Got it! ${nextQ}` }]);
          setStep((s) => Math.min(s + 1, STEPS.length - 1));
          return;
        }
        // Use regex to find courses actually written in THIS message — Claude can echo
        // courses from conversation history, which would wrongly route general preferences
        // (days, times) into course-specific slots instead of generalPreferDays/Times.
        const coursesInMessage = regexExtract(text).courses;
        // Apply AI-extracted data
        const updated = applyExtracted(prefs, {
          courses: coursesInMessage,
          professors: result.professors,
          preferTimes: result.preferTimes,
          avoidTimes: result.avoidTimes,
          preferDays: result.preferDays,
          avoidDays: result.avoidDays,
          modality: result.modality,
          isWork: result.isWork,
          workDesc: result.workDesc,
          workAvoidTimes: result.workAvoidTimes ?? [],
          workAvoidDays: result.workAvoidDays ?? [],
        });
        setPrefs(updated);
        if (result.conflicts.length) setConflicts((prev) => [...new Set([...prev, ...result.conflicts])]);
        if (result.profRecommendations.length) {
          setProfRecs((prev) => {
            const merged = [...prev];
            for (const rec of result.profRecommendations) {
              if (!merged.find((r) => r.course === rec.course && r.professor === rec.professor)) {
                merged.push(rec);
              }
            }
            return merged;
          });
        }
        setMessages((prev) => [...prev, { role: 'bot', text: result.reply }]);
        setApiHistory((h) => [
          ...h,
          { role: 'user', content: text },
          { role: 'assistant', content: result.reply },
        ]);
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
        inputRef.current?.focus();
      });
    } else {
      // Pure regex fallback
      setTimeout(() => {
        setTyping(false);
        const data = regexExtract(text);
        const updated = applyExtracted(prefs, data);
        setPrefs(updated);
        const nextQ = STEPS[Math.min(step + 1, STEPS.length - 1)]('');
        setMessages((prev) => [...prev, { role: 'bot', text: nextQ }]);
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
        inputRef.current?.focus();
      }, 600);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const hasAnyPrefs =
    prefs.courses.length > 0 ||
    prefs.generalPreferTimes.length > 0 ||
    prefs.generalAvoidTimes.length > 0 ||
    prefs.generalPreferDays.length > 0 ||
    prefs.generalAvoidDays.length > 0 ||
    prefs.constraints.length > 0 ||
    !!prefs.defaultModality;

  if (!profile) return null;

  const progressPercent = Math.round(((step + (isDone ? 1 : 0)) / STEPS.length) * 100);

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-slate-900 dark:text-gray-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <Logo />
          {!aiEnabled && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
              Regex mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/8 bg-white/90 dark:bg-slate-900/60">
            <div className="w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 font-bold text-xs">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{profile.name.split(' ')[0]}</span>
            <span className="text-slate-500 dark:text-slate-600 text-xs">·</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{profile.universityName}</span>
          </div>
          <button
            onClick={() => router.push('/student/info')}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ════════════════════════ LEFT — Chat ════════════════════════ */}
        <div className="w-[42%] flex flex-col border-r border-slate-100 dark:border-white/5">
          {activeRightTab === 'preferences' ? (
            <>
              {/* Progress */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/5 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {isDone ? 'Complete' : `Step ${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{progressPercent}%</span>
                </div>
                <div className="h-1 bg-slate-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="flex gap-1 mt-2.5">
                  {STEPS.map((_, i) => (
                    <div key={i} className={`flex-1 h-0.5 rounded-full transition-colors duration-300 ${i <= step ? 'bg-sky-500' : 'bg-slate-300 dark:bg-gray-700'}`} />
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'bot' && (
                      <div className="w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/20 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
                        </svg>
                      </div>
                    )}
                    <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 rounded-bl-sm'}`}>
                      {renderMarkdown(msg.text)}
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/20 flex items-center justify-center mr-2 shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
                      </svg>
                    </div>
                    <div className="bg-slate-100 dark:bg-gray-800 px-3.5 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-slate-100 dark:border-white/5 shrink-0">
                {isDone ? (
                  <button onClick={() => router.push('/')} className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors">
                    Return to Home
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder='Type your answer, or "done" to finish…'
                      className="flex-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition"
                    />
                    <button
                      onClick={send}
                      disabled={!input.trim()}
                      className="w-10 h-10 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 dark:text-gray-600 text-center mt-1.5">
                  Try: &ldquo;CSIT 313 with Prof Brown, no morning classes, I work Mon–Fri 9 to 1&rdquo;
                </p>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* ════════════════════════ RIGHT — Tab panel ════════════════════════ */}
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-gray-900/40 overflow-hidden">

          {/* Tab switcher */}
          <div className="shrink-0 p-3 border-b border-slate-100 dark:border-white/5">
            <div className="flex rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-1">
              {(['preferences', 'schedule'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveRightTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeRightTab === tab
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {tab === 'preferences' ? 'Preferences' : 'My Schedule'}
                </button>
              ))}
            </div>
          </div>

          {activeRightTab === 'preferences' ? (
            /* ── PREFERENCES TAB ── */
            <div className="flex-1 overflow-y-auto">
              {!hasAnyPrefs && conflicts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-10">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-white/8 flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                  </div>
                  <p className="text-slate-500 dark:text-gray-500 text-sm font-medium mb-1">Your preferences will appear here</p>
                  <p className="text-slate-400 dark:text-gray-600 text-xs max-w-xs">As you chat on the left, I&apos;ll build your scheduling profile in real time.</p>
                </div>
              ) : (
            <div className="p-5 space-y-5">

              {/* ─ Conflict Warnings ─ */}
              {conflicts.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
                    </svg>
                    Conflicts Detected
                  </h2>
                  <div className="space-y-2">
                    {conflicts.map((c, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-950/50 border border-red-800/40">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        <span className="text-xs text-red-300 leading-relaxed">{c}</span>
                        <button
                          onClick={() => setConflicts((prev) => prev.filter((_, j) => j !== i))}
                          className="ml-auto text-red-700 hover:text-red-400 transition-colors shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─ Courses ─ */}
              {prefs.courses.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-widest mb-3">Courses</h2>
                  <div className="space-y-2.5">
                    {prefs.courses.map((c) => (
                      <div key={c.course} className="bg-white dark:bg-gray-800/70 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div>
                            <span className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">{c.course}</span>
                            {c.preferredProfessor && (
                              <p className="text-xs text-sky-400 mt-0.5">{c.preferredProfessor}</p>
                            )}
                          </div>
                          {c.modality && (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${MODALITY_BADGE[c.modality]}`}>
                              {c.modality}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {c.preferredTimes.map((t) => (
                            <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TIME_BADGE[t as TimeLabel]}`}>✓ {t}</span>
                          ))}
                          {c.avoidTimes.map((t) => (
                            <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">✕ {t}</span>
                          ))}
                          {c.preferredDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 ring-1 ring-emerald-800/40">{d.slice(0, 3)}</span>
                          ))}
                          {c.avoidDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">no {d.slice(0, 3)}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─ Professor Recommendations ─ */}
              {profRecs.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Professor Suggestions
                  </h2>
                  <div className="space-y-2">
                    {profRecs.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-sky-950/40 border border-sky-800/30">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 text-sky-400 text-[10px] font-bold">
                          {rec.professor.split(' ').pop()?.charAt(0) ?? 'P'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-sky-300">{rec.professor}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-600">for</span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{rec.course}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">{rec.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─ General Preferences ─ */}
              {(prefs.generalPreferTimes.length > 0 ||
                prefs.generalAvoidTimes.length > 0 ||
                prefs.generalPreferDays.length > 0 ||
                prefs.generalAvoidDays.length > 0 ||
                prefs.defaultModality ||
                prefs.constraints.length > 0) && (
                <section>
                  <h2 className="text-[11px] font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-widest mb-3">General Preferences</h2>
                  <div className="bg-white dark:bg-gray-800/70 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3.5 space-y-3">
                    {(prefs.generalPreferTimes.length > 0 || prefs.generalAvoidTimes.length > 0) && (
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-gray-500 uppercase tracking-wider mb-1.5">Time of Day</p>
                        <div className="flex flex-wrap gap-1.5">
                          {prefs.generalPreferTimes.map((t) => (
                            <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TIME_BADGE[t as TimeLabel]}`}>✓ {t}</span>
                          ))}
                          {prefs.generalAvoidTimes.map((t) => (
                            <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">✕ {t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(prefs.generalPreferDays.length > 0 || prefs.generalAvoidDays.length > 0) && (
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-gray-500 uppercase tracking-wider mb-1.5">Days</p>
                        <div className="flex flex-wrap gap-1.5">
                          {prefs.generalPreferDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 ring-1 ring-emerald-800/40">✓ {d.slice(0, 3)}</span>
                          ))}
                          {prefs.generalAvoidDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">✕ {d.slice(0, 3)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {prefs.defaultModality && (
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-gray-500 uppercase tracking-wider mb-1.5">Format</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${MODALITY_BADGE[prefs.defaultModality]}`}>
                          {prefs.defaultModality}
                        </span>
                      </div>
                    )}
                    {prefs.constraints.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-gray-500 uppercase tracking-wider mb-1.5">Constraints</p>
                        <div className="space-y-1">
                          {prefs.constraints.map((c, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.type === 'work' ? 'bg-amber-400' : 'bg-red-400'}`} />
                              <span className="text-xs text-slate-500 dark:text-gray-400">{c.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ─ Availability Overview (timetable style) ─ */}
              {hasAnyPrefs && (
                <section>
                  <h2 className="text-[11px] font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    Availability Overview
                    {suggestions.length > 0 && (
                      <span className="ml-auto text-[9px] font-normal text-violet-400/70 normal-case tracking-normal">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400/80 mr-1 mb-px" />
                        best slots
                      </span>
                    )}
                  </h2>
                  <div className="rounded-2xl border border-slate-200 dark:border-white/8 overflow-hidden">
                    {/* Day header row — matching normal-user timetable style */}
                    <div className="flex border-b border-slate-100 dark:border-white/5 bg-slate-100 dark:bg-slate-950/60">
                      <div className="w-[4.5rem] shrink-0" />
                      {DAYS_SHORT.map((d) => (
                        <div key={d} className="flex-1 py-2.5 text-center">
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{d}</p>
                        </div>
                      ))}
                    </div>
                    {/* Time slot rows */}
                    {ALL_TIMES.map((time, idx) => (
                      <div
                        key={time}
                        className={`flex bg-white dark:bg-gray-800/50 ${idx < ALL_TIMES.length - 1 ? 'border-b border-slate-100 dark:border-white/[0.04]' : ''}`}
                      >
                        <div className="w-[4.5rem] shrink-0 py-3 flex items-center pl-3 border-r border-slate-100 dark:border-white/5">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{time}</span>
                        </div>
                        {DAYS_FULL.map((day) => {
                          const status = getCellStatus(day, time, prefs);
                          const isBest = suggestions.some((s) => s.day === day && s.time === time);
                          return (
                            <div key={day} className="flex-1 p-1.5 border-r border-slate-100 dark:border-white/[0.04] last:border-r-0">
                              <div className={`h-9 rounded-md transition-colors relative ${CELL_STYLE[status]}`}>
                                {isBest && status !== 'avoided' && status !== 'work' && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 px-4 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/10">
                      {[
                        { label: 'Available', cls: 'bg-slate-300 dark:bg-gray-700' },
                        { label: 'Preferred', cls: 'bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-400/50 dark:border-emerald-700/50' },
                        { label: 'Blocked', cls: 'bg-red-100 dark:bg-red-950/70 border border-red-300/60 dark:border-red-800/40' },
                        { label: 'Work', cls: 'bg-amber-100 dark:bg-amber-950/70 border border-amber-300/60 dark:border-amber-800/40' },
                      ].map(({ label, cls }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`w-3 h-3 rounded-sm ${cls}`} />
                          <span className="text-[9px] text-slate-500 dark:text-gray-500">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

            </div>
          )}
            </div>
          ) : (
            /* ── MY SCHEDULE TAB ── */
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
          )}
        </div>
      </div>
    </div>
  );
}
