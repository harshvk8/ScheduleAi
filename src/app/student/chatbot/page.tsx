'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
  name: string;
  email: string;
  studentId: string;
  universityName: string;
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
  days?: string[];
  timeLabel?: TimeLabel;
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

// ─── NLP Helpers ──────────────────────────────────────────────────────────────

const COURSE_RE = /\b([A-Z]{2,6}\s*\d{3,4}[A-Z]?)\b/g;

const TIME_KEYWORDS: Record<string, TimeLabel> = {
  morning: 'Morning',
  mornings: 'Morning',
  'early morning': 'Morning',
  'early classes': 'Morning',
  afternoon: 'Afternoon',
  afternoons: 'Afternoon',
  midday: 'Afternoon',
  'mid-day': 'Afternoon',
  evening: 'Evening',
  evenings: 'Evening',
  'evening class': 'Evening',
  night: 'Night',
  nights: 'Night',
  late: 'Night',
  'late night': 'Night',
};

const DAY_KEYWORDS: Record<string, string[]> = {
  monday: ['Monday'],
  mon: ['Monday'],
  tuesday: ['Tuesday'],
  tue: ['Tuesday'],
  tues: ['Tuesday'],
  wednesday: ['Wednesday'],
  wed: ['Wednesday'],
  thursday: ['Thursday'],
  thu: ['Thursday'],
  thurs: ['Thursday'],
  friday: ['Friday'],
  fri: ['Friday'],
  saturday: ['Saturday'],
  sat: ['Saturday'],
  sunday: ['Sunday'],
  sun: ['Sunday'],
  mwf: ['Monday', 'Wednesday', 'Friday'],
  tth: ['Tuesday', 'Thursday'],
  tuth: ['Tuesday', 'Thursday'],
  'tuesday thursday': ['Tuesday', 'Thursday'],
  'monday wednesday friday': ['Monday', 'Wednesday', 'Friday'],
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  weekends: ['Saturday', 'Sunday'],
};

const MODALITY_KEYWORDS: Record<string, Modality> = {
  online: 'online',
  remote: 'online',
  virtual: 'online',
  'in-person': 'in-person',
  'in person': 'in-person',
  'face-to-face': 'in-person',
  'on campus': 'in-person',
  'on-campus': 'in-person',
  campus: 'in-person',
  hybrid: 'hybrid',
  blended: 'hybrid',
};

const AVOID_RE =
  /\b(cannot|can't|cant|avoid|don't want|wont|won't|unable|never|no\s+(?:class|morning|afternoon|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const NEGATE_RE = /\b(not|no|never|cannot|can't|cant|avoid|don't|won't)\b/i;
const WORK_RE = /\b(work|job|shift|employed|working)\b/i;

interface Extracted {
  courses: string[];
  professors: string[];
  preferTimes: TimeLabel[];
  avoidTimes: TimeLabel[];
  preferDays: string[];
  avoidDays: string[];
  modality?: Modality;
  isWork: boolean;
  workDesc?: string;
}

function extractCourses(text: string): string[] {
  const upper = text.toUpperCase();
  return [...new Set(Array.from(upper.matchAll(COURSE_RE)).map((m) => m[1].replace(/\s+/, ' ')))];
}

function extractProfessors(text: string): string[] {
  const re =
    /(?:professor|prof\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)|with\s+(?:professor|prof\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = (m[1] || m[2] || '').trim();
    if (name) names.push('Professor ' + name);
  }
  return [...new Set(names)];
}

function isNegatedAt(text: string, idx: number): boolean {
  const window = text.slice(Math.max(0, idx - 35), idx);
  return NEGATE_RE.test(window);
}

function extractTimes(text: string): { prefer: TimeLabel[]; avoid: TimeLabel[] } {
  const prefer: TimeLabel[] = [];
  const avoid: TimeLabel[] = [];
  const lower = text.toLowerCase();
  const sortedKeys = Object.keys(TIME_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const idx = lower.indexOf(key);
    if (idx === -1) continue;
    const label = TIME_KEYWORDS[key];
    if (isNegatedAt(lower, idx) || AVOID_RE.test(lower.slice(Math.max(0, idx - 30), idx + key.length))) {
      if (!avoid.includes(label)) avoid.push(label);
    } else {
      if (!prefer.includes(label)) prefer.push(label);
    }
  }
  // Remove from prefer if also in avoid
  return { prefer: prefer.filter((t) => !avoid.includes(t)), avoid };
}

function extractDays(text: string): { prefer: string[]; avoid: string[] } {
  const prefer: string[] = [];
  const avoid: string[] = [];
  const lower = text.toLowerCase();
  const sortedKeys = Object.keys(DAY_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const idx = lower.indexOf(key);
    if (idx === -1) continue;
    const days = DAY_KEYWORDS[key];
    if (isNegatedAt(lower, idx)) {
      days.forEach((d) => { if (!avoid.includes(d)) avoid.push(d); });
    } else {
      days.forEach((d) => { if (!prefer.includes(d)) prefer.push(d); });
    }
  }
  return {
    prefer: [...new Set(prefer.filter((d) => !avoid.includes(d)))],
    avoid: [...new Set(avoid)],
  };
}

function extractModality(text: string): Modality | undefined {
  const lower = text.toLowerCase();
  const sortedKeys = Object.keys(MODALITY_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return MODALITY_KEYWORDS[key];
  }
  return undefined;
}

function extractAll(text: string): Extracted {
  const courses = extractCourses(text);
  const professors = extractProfessors(text);
  const times = extractTimes(text);
  const days = extractDays(text);
  const modality = extractModality(text);
  const isWork = WORK_RE.test(text);
  let workDesc: string | undefined;
  if (isWork) {
    const m = text.match(/(?:i\s+)?work\s+.{5,60}?(?:\.|,|$)/i);
    workDesc = m ? m[0].trim() : 'Has work commitments';
  }
  return { courses, professors, preferTimes: times.prefer, avoidTimes: times.avoid, preferDays: days.prefer, avoidDays: days.avoid, modality, isWork, workDesc };
}

function applyExtracted(prefs: StudentPreferences, data: Extracted): StudentPreferences {
  const p: StudentPreferences = JSON.parse(JSON.stringify(prefs));

  if (data.courses.length > 0) {
    for (const courseName of data.courses) {
      let c = p.courses.find((x) => x.course === courseName);
      if (!c) {
        c = { course: courseName, preferredDays: [], avoidDays: [], preferredTimes: [], avoidTimes: [] };
        p.courses.push(c);
      }
      if (data.professors[0]) c.preferredProfessor = data.professors[0];
      if (data.preferTimes.length) c.preferredTimes = [...new Set([...c.preferredTimes, ...data.preferTimes])];
      if (data.avoidTimes.length) c.avoidTimes = [...new Set([...c.avoidTimes, ...data.avoidTimes])];
      if (data.preferDays.length) c.preferredDays = [...new Set([...c.preferredDays, ...data.preferDays])];
      if (data.avoidDays.length) c.avoidDays = [...new Set([...c.avoidDays, ...data.avoidDays])];
      if (data.modality) c.modality = data.modality;
    }
  } else {
    // Apply to global prefs
    data.preferTimes.forEach((t) => { if (!p.generalPreferTimes.includes(t)) p.generalPreferTimes.push(t); });
    data.avoidTimes.forEach((t) => { if (!p.generalAvoidTimes.includes(t)) p.generalAvoidTimes.push(t); });
    data.preferDays.forEach((d) => { if (!p.generalPreferDays.includes(d)) p.generalPreferDays.push(d); });
    data.avoidDays.forEach((d) => { if (!p.generalAvoidDays.includes(d)) p.generalAvoidDays.push(d); });
    if (data.modality) p.defaultModality = data.modality;
  }

  if (data.isWork) {
    const alreadyHasWork = p.constraints.some((c) => c.type === 'work');
    if (!alreadyHasWork) {
      p.constraints.push({ type: 'work', description: data.workDesc ?? 'Work commitments' });
    }
  }

  return p;
}

// ─── Guided Questions ─────────────────────────────────────────────────────────

const STEPS = [
  (name: string) =>
    `Hi ${name}! I'm your scheduling assistant.\n\nWhat courses are you planning to take this semester? You can list them like: *CSIT 313, MATH 201, CS 101*`,
  () =>
    `Do you have any preferred professors? For example: *"Professor Brown for CSIT 313"* — or just say "no preference" if you're flexible.`,
  () =>
    `Which days work best for you? Or are there days you'd like to avoid?\n\nYou can say things like *"MWF"*, *"no Fridays"*, or *"Tuesday and Thursday only"*.`,
  () =>
    `What time of day do you prefer? Morning, afternoon, or evening — and are there any times you absolutely cannot make?`,
  () =>
    `Do you have a work schedule or other commitments that might conflict with classes? (e.g., *"I work Monday through Friday 9 to 5"*)`,
  () =>
    `Do you prefer **online**, **in-person**, or **hybrid** classes? Or does it depend on the course?`,
  () =>
    `Anything else I should know about your schedule? Type *"done"* when you're finished and I'll show you a summary.`,
];

function buildBotReply(data: Extracted, currentStep: number): string {
  const parts: string[] = [];

  if (data.courses.length > 0)
    parts.push(`Noted — **${data.courses.join(', ')}**${data.professors.length ? ` with ${data.professors[0]}` : ''}.`);
  if (data.avoidTimes.length)
    parts.push(`I'll block out **${data.avoidTimes.join(' and ')}** hours.`);
  else if (data.preferTimes.length)
    parts.push(`Prioritizing **${data.preferTimes.join(' and ')}** slots.`);
  if (data.avoidDays.length)
    parts.push(`No classes on **${data.avoidDays.join(', ')}** — got it.`);
  else if (data.preferDays.length)
    parts.push(`Preferring **${data.preferDays.join(', ')}**.`);
  if (data.modality)
    parts.push(`You prefer **${data.modality}** format.`);
  if (data.isWork)
    parts.push(`Work schedule noted — I'll keep those times clear.`);
  if (parts.length === 0)
    parts.push(`Got it, thanks!`);

  const nextStep = Math.min(currentStep + 1, STEPS.length - 1);
  const nextQ = STEPS[nextStep]('');
  if (nextQ && currentStep < STEPS.length - 1) {
    parts.push(`\n\n${nextQ}`);
  }

  return parts.join(' ');
}

// ─── Visual Helpers ───────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ALL_TIMES: TimeLabel[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

type CellStatus = 'neutral' | 'preferred' | 'avoided' | 'work';

function getCellStatus(day: string, time: TimeLabel, prefs: StudentPreferences): CellStatus {
  if (prefs.generalAvoidTimes.includes(time) || prefs.generalAvoidDays.includes(day)) return 'avoided';
  const hasWork = prefs.constraints.some((c) => c.type === 'work');
  if (hasWork && (time === 'Morning' || time === 'Afternoon') && !['Saturday', 'Sunday'].includes(day))
    return 'work';
  const timeMatch =
    prefs.generalPreferTimes.length === 0 || prefs.generalPreferTimes.includes(time);
  const dayMatch =
    prefs.generalPreferDays.length === 0 || prefs.generalPreferDays.includes(day);
  if (prefs.generalPreferTimes.length > 0 || prefs.generalPreferDays.length > 0) {
    if (timeMatch && dayMatch) return 'preferred';
  }
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
            <strong key={j} className="font-semibold text-white">
              {part}
            </strong>
          ) : (
            <span key={j}>{part.replace(/\*(.*?)\*/g, '$1')}</span>
          )
        )}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const EMPTY_PREFS: StudentPreferences = {
  courses: [],
  constraints: [],
  generalPreferTimes: [],
  generalAvoidTimes: [],
  generalPreferDays: [],
  generalAvoidDays: [],
};

export default function StudentChatbotPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prefs, setPrefs] = useState<StudentPreferences>(EMPTY_PREFS);
  const [input, setInput] = useState('');
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput('');

    setMessages((prev) => [...prev, { role: 'user', text }]);

    if (/^done$/i.test(text) || /^finish(ed)?$/i.test(text)) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          { role: 'bot', text: `Perfect! Here's everything I've captured — take a look at your preferences on the right. Your profile is ready to match against available sections.` },
        ]);
        setIsDone(true);
      }, 700);
      return;
    }

    const data = extractAll(text);
    const updated = applyExtracted(prefs, data);
    setPrefs(updated);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const reply = buildBotReply(data, step);
      setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      inputRef.current?.focus();
    }, 750);
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
    prefs.defaultModality;

  if (!profile) return null;

  const progressPercent = Math.round(((step + (isDone ? 1 : 0)) / STEPS.length) * 100);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <Logo />
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
        {/* ══════════════════════════════════════════
            LEFT PANEL — Chat
        ══════════════════════════════════════════ */}
        <div className="w-[42%] flex flex-col border-r border-white/5">
          {/* Progress bar */}
          <div className="px-5 pt-4 pb-3 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                {isDone ? 'Complete' : `Question ${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`}
              </span>
              <span className="text-xs text-slate-500">{progressPercent}%</span>
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex gap-1 mt-2.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-0.5 rounded-full transition-colors duration-300 ${
                    i <= step ? 'bg-sky-500' : 'bg-gray-700'
                  }`}
                />
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
                <div
                  className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-sky-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                  }`}
                >
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
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/5 shrink-0">
            {isDone ? (
              <button
                onClick={() => router.push('/')}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
              >
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
              Try: &ldquo;CSIT 313 with Prof Brown, no morning classes, I work weekdays&rdquo;
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            RIGHT PANEL — Live Preferences
        ══════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto bg-gray-900/40">
          {!hasAnyPrefs ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-10">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-white/8 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm font-medium mb-1">Your preferences will appear here</p>
              <p className="text-gray-600 text-xs max-w-xs">
                As you answer questions on the left, I&apos;ll build your scheduling profile in real time.
              </p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* ─ Course Cards ─ */}
              {prefs.courses.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
                    Courses
                  </h2>
                  <div className="space-y-2.5">
                    {prefs.courses.map((c) => (
                      <div
                        key={c.course}
                        className="bg-gray-800/70 border border-white/5 rounded-2xl px-4 py-3.5"
                      >
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
                            <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TIME_BADGE[t]}`}>
                              ✓ {t}
                            </span>
                          ))}
                          {c.avoidTimes.map((t) => (
                            <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">
                              ✕ {t}
                            </span>
                          ))}
                          {c.preferredDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 ring-1 ring-emerald-800/40">
                              {d.slice(0, 3)}
                            </span>
                          ))}
                          {c.avoidDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">
                              no {d.slice(0, 3)}
                            </span>
                          ))}
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
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
                    General Preferences
                  </h2>
                  <div className="bg-gray-800/70 border border-white/5 rounded-2xl px-4 py-3.5 space-y-3">
                    {(prefs.generalPreferTimes.length > 0 || prefs.generalAvoidTimes.length > 0) && (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Time of Day</p>
                        <div className="flex flex-wrap gap-1.5">
                          {prefs.generalPreferTimes.map((t) => (
                            <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TIME_BADGE[t]}`}>
                              ✓ {t}
                            </span>
                          ))}
                          {prefs.generalAvoidTimes.map((t) => (
                            <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">
                              ✕ {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(prefs.generalPreferDays.length > 0 || prefs.generalAvoidDays.length > 0) && (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Days</p>
                        <div className="flex flex-wrap gap-1.5">
                          {prefs.generalPreferDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 ring-1 ring-emerald-800/40">
                              ✓ {d.slice(0, 3)}
                            </span>
                          ))}
                          {prefs.generalAvoidDays.map((d) => (
                            <span key={d} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 ring-1 ring-red-800/40">
                              ✕ {d.slice(0, 3)}
                            </span>
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

              {/* ─ Availability Grid ─ */}
              {hasAnyPrefs && (
                <section>
                  <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
                    Availability Overview
                  </h2>
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
                      <tbody className="space-y-1">
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
                    {/* Legend */}
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

              {/* ─ JSON Preview (for devs) ─ */}
              {prefs.courses.length > 0 && (
                <section>
                  <details className="group">
                    <summary className="cursor-pointer text-[11px] font-semibold text-gray-600 uppercase tracking-widest hover:text-gray-400 transition-colors select-none">
                      Extracted JSON
                    </summary>
                    <pre className="mt-2 bg-gray-900 border border-white/5 rounded-xl p-3 text-[10px] text-gray-400 overflow-x-auto leading-relaxed">
                      {JSON.stringify(
                        prefs.courses.map((c) => ({
                          course: c.course,
                          ...(c.preferredProfessor ? { preferredProfessor: c.preferredProfessor } : {}),
                          ...(c.preferredDays.length ? { preferredDays: c.preferredDays } : {}),
                          ...(c.avoidDays.length ? { avoidDays: c.avoidDays } : {}),
                          ...(c.preferredTimes.length ? { preferredTimes: c.preferredTimes } : {}),
                          ...(c.avoidTimes.length ? { avoidTimes: c.avoidTimes } : {}),
                          ...(c.modality ? { modality: c.modality } : {}),
                          ...(prefs.constraints.length
                            ? { constraints: prefs.constraints.map((x) => x.type) }
                            : {}),
                        })),
                        null,
                        2
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
