'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { saveScheduleRequest, getAllProfessorFeedback, getAllScheduleRequests } from '@/lib/db';
import type { ChatApiResponse } from '@/app/api/chat/route';

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
  neutral: 'bg-gray-800/60',
  preferred: 'bg-emerald-900/60 border border-emerald-700/50',
  avoided: 'bg-red-950/70 border border-red-800/40',
  work: 'bg-amber-950/70 border border-amber-800/40',
};

const TIME_BADGE: Record<TimeLabel, string> = {
  Morning: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30',
  Afternoon: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/30',
  Evening: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30',
  Night: 'bg-slate-600/40 text-slate-300 ring-1 ring-slate-500/30',
};

const MODALITY_BADGE: Record<Modality, string> = {
  online: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
  hybrid: 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/30',
  'in-person': 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30',
};

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="font-semibold text-white">{part}</strong>
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
          { role: 'bot', text: `Perfect! Your preferences are saved on the right. Hit **Submit** to send them to your university.` },
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
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <Logo />
          {!aiEnabled && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
              Regex mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/8 bg-slate-900/60">
            <div className="w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 font-bold text-xs">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-400 font-medium">{profile.name.split(' ')[0]}</span>
            <span className="text-slate-600 text-xs">·</span>
            <span className="text-xs text-slate-500">{profile.universityName}</span>
          </div>
          <button
            onClick={() => router.push('/student/info')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
        <div className="w-[42%] flex flex-col border-r border-white/5">
          {/* Progress */}
          <div className="px-5 pt-4 pb-3 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                {isDone ? 'Complete' : `Step ${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`}
              </span>
              <span className="text-xs text-slate-500">{progressPercent}%</span>
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flex gap-1 mt-2.5">
              {STEPS.map((_, i) => (
                <div key={i} className={`flex-1 h-0.5 rounded-full transition-colors duration-300 ${i <= step ? 'bg-sky-500' : 'bg-gray-700'}`} />
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
                <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 rounded-bl-sm'}`}>
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
                <div className="bg-gray-800 px-3.5 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/5 shrink-0">
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
                  className="flex-1 bg-gray-800 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition"
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
            <p className="text-[10px] text-gray-600 text-center mt-1.5">
              Try: &ldquo;CSIT 313 with Prof Brown, no morning classes, I work Mon–Fri 9 to 1&rdquo;
            </p>
          </div>
        </div>

        {/* ════════════════════════ RIGHT — Preferences ════════════════════════ */}
        <div className="flex-1 overflow-y-auto bg-gray-900/40">
          {!hasAnyPrefs && conflicts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-10">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-white/8 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm font-medium mb-1">Your preferences will appear here</p>
              <p className="text-gray-600 text-xs max-w-xs">As you chat on the left, I&apos;ll build your scheduling profile in real time.</p>
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
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Courses</h2>
                  <div className="space-y-2.5">
                    {prefs.courses.map((c) => (
                      <div key={c.course} className="bg-gray-800/70 border border-white/5 rounded-2xl px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div>
                            <span className="text-sm font-bold text-white tracking-wide">{c.course}</span>
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
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
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
                            <span className="text-[10px] text-slate-600">for</span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">{rec.course}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{rec.reason}</p>
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
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">General Preferences</h2>
                  <div className="bg-gray-800/70 border border-white/5 rounded-2xl px-4 py-3.5 space-y-3">
                    {(prefs.generalPreferTimes.length > 0 || prefs.generalAvoidTimes.length > 0) && (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Time of Day</p>
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
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Days</p>
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
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Format</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${MODALITY_BADGE[prefs.defaultModality]}`}>
                          {prefs.defaultModality}
                        </span>
                      </div>
                    )}
                    {prefs.constraints.length > 0 && (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Constraints</p>
                        <div className="space-y-1">
                          {prefs.constraints.map((c, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.type === 'work' ? 'bg-amber-400' : 'bg-red-400'}`} />
                              <span className="text-xs text-gray-400">{c.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ─ Schedule Suggestions ─ */}
              {suggestions.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    Best Time Slots for You
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    {suggestions.map((s, i) => (
                      <div key={i} className="flex flex-col px-3 py-2.5 rounded-xl bg-violet-950/30 border border-violet-800/25">
                        <span className="text-xs font-semibold text-violet-300">{s.day.slice(0, 3)}</span>
                        <span className={`text-[10px] font-medium mt-0.5 ${TIME_BADGE[s.time].split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>{s.time}</span>
                        <div className="flex gap-0.5 mt-1.5">
                          {[...Array(Math.min(s.score, 5))].map((_, j) => (
                            <div key={j} className="w-1 h-1 rounded-full bg-violet-400/60" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─ Availability Grid ─ */}
              {hasAnyPrefs && (
                <section>
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Availability Overview</h2>
                  <div className="bg-gray-800/70 border border-white/5 rounded-2xl p-4 overflow-x-auto">
                    <table className="w-full text-center" style={{ minWidth: 340 }}>
                      <thead>
                        <tr>
                          <th className="text-[10px] text-gray-600 font-medium pb-2 text-left pr-2 w-20">Time</th>
                          {DAYS_SHORT.map((d) => (
                            <th key={d} className="text-[10px] text-gray-500 font-medium pb-2">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ALL_TIMES.map((time) => (
                          <tr key={time}>
                            <td className="text-[10px] text-gray-500 py-1 pr-2 text-left font-medium">{time}</td>
                            {DAYS_FULL.map((day) => {
                              const status = getCellStatus(day, time, prefs);
                              return (
                                <td key={day} className="py-0.5 px-0.5">
                                  <div className={`h-6 rounded-md transition-colors ${CELL_STYLE[status]}`} />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-white/5">
                      {[
                        { label: 'Available', cls: 'bg-gray-700' },
                        { label: 'Preferred', cls: 'bg-emerald-900/60 border border-emerald-700/50' },
                        { label: 'Blocked', cls: 'bg-red-950/70 border border-red-800/40' },
                        { label: 'Work', cls: 'bg-amber-950/70 border border-amber-800/40' },
                      ].map(({ label, cls }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`w-3 h-3 rounded-sm ${cls}`} />
                          <span className="text-[9px] text-gray-500">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* ─ Structured JSON output ─ */}
              {prefs.courses.length > 0 && (
                <section>
                  <details className="group">
                    <summary className="cursor-pointer text-[11px] font-semibold text-gray-600 uppercase tracking-widest hover:text-gray-400 transition-colors select-none">
                      Extracted JSON
                    </summary>
                    <pre className="mt-2 bg-gray-900 border border-white/5 rounded-xl p-3 text-[10px] text-gray-400 overflow-x-auto leading-relaxed">
                      {JSON.stringify(
                        {
                          studentName: profile.name,
                          university: profile.universityName,
                          courses: prefs.courses.map((c) => ({
                            course: c.course,
                            ...(c.preferredProfessor ? { preferredProfessor: c.preferredProfessor } : {}),
                            ...(c.preferredDays.length ? { preferredDays: c.preferredDays } : {}),
                            ...(c.avoidDays.length ? { avoidDays: c.avoidDays } : {}),
                            ...(c.preferredTimes.length ? { preferredTimes: c.preferredTimes } : {}),
                            ...(c.avoidTimes.length ? { avoidTimes: c.avoidTimes } : {}),
                            ...(c.modality ? { modality: c.modality } : {}),
                          })),
                          ...(prefs.generalPreferTimes.length ? { globalPreferTimes: prefs.generalPreferTimes } : {}),
                          ...(prefs.generalAvoidTimes.length ? { globalAvoidTimes: prefs.generalAvoidTimes } : {}),
                          ...(prefs.generalPreferDays.length ? { globalPreferDays: prefs.generalPreferDays } : {}),
                          ...(prefs.generalAvoidDays.length ? { globalAvoidDays: prefs.generalAvoidDays } : {}),
                          ...(prefs.defaultModality ? { defaultModality: prefs.defaultModality } : {}),
                          ...(prefs.constraints.length ? { constraints: prefs.constraints } : {}),
                        },
                        null, 2
                      )}
                    </pre>
                  </details>
                </section>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
