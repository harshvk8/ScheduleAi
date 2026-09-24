import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { minuteLimiter, dayLimiter, getIp } from '@/lib/ratelimit';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventCategory = 'work' | 'study' | 'personal' | 'class' | 'routine';

interface CurrentEvent {
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  category: string;
}

export interface CalendarChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentEvents: CurrentEvent[];
  googleConnected: boolean;
}

export interface AddedEvent {
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  category: EventCategory;
}

export interface CalendarChatResponse {
  reply: string;
  addedEvents: AddedEvent[];
  editedEvents: Array<{ id: string; changes: Partial<Omit<AddedEvent, 'id'>> }>;
  deletedIds: string[];
  suggestions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

function buildEventsContext(events: CurrentEvent[]): string {
  if (events.length === 0) return 'No events yet.';
  return events
    .map((e) => `- ID:${e.id} | ${e.day} ${fmt(e.startMinutes)}–${fmt(e.endMinutes)} | "${e.title}" [${e.category}]`)
    .join('\n');
}

// ─── Deterministic schedule analysis ───────────────────────────────────────────
//
// The LLM is unreliable at precise time arithmetic (e.g. it once described a
// class ending exactly when work starts as leaving "an hour before work" —
// there is zero gap, not an hour). Conflict/adjacency wording is therefore
// computed here, not left to the model. See SYSTEM prompt rule below.

interface MiniEvent {
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
}

interface ScheduleFlag {
  kind: 'conflict' | 'back-to-back';
  subject: string;
  other: string;
  atMinutes: number;
  otherStart: number;
  otherEnd: number;
  day: string;
}

function findScheduleFlags(changed: MiniEvent[], final: MiniEvent[]): ScheduleFlag[] {
  const flags: ScheduleFlag[] = [];
  const seenPairs = new Set<string>();

  for (const ev of changed) {
    for (const other of final) {
      if (other.id === ev.id || other.day !== ev.day) continue;

      const overlaps = ev.startMinutes < other.endMinutes && ev.endMinutes > other.startMinutes;
      const endsWhenOtherStarts = ev.endMinutes === other.startMinutes;
      const startsWhenOtherEnds = other.endMinutes === ev.startMinutes;

      if (!overlaps && !endsWhenOtherStarts && !startsWhenOtherEnds) continue;

      const pairKey = `${[ev.id, other.id].sort().join('~')}:${overlaps ? 'conflict' : 'touch'}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      flags.push({
        kind: overlaps ? 'conflict' : 'back-to-back',
        subject: ev.title,
        other: other.title,
        atMinutes: overlaps ? 0 : endsWhenOtherStarts ? other.startMinutes : other.endMinutes,
        otherStart: other.startMinutes,
        otherEnd: other.endMinutes,
        day: ev.day,
      });
    }
  }
  return flags;
}

function formatDayList(days: string[]): string {
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')}, and ${days[days.length - 1]}`;
}

function summarizeScheduleFlags(flags: ScheduleFlag[]): string {
  if (flags.length === 0) return '';

  interface Group {
    kind: ScheduleFlag['kind'];
    subject: string;
    other: string;
    atMinutes: number;
    otherStart: number;
    otherEnd: number;
    days: string[];
  }
  const groups = new Map<string, Group>();

  for (const f of flags) {
    const key = `${f.kind}|${f.subject}|${f.other}|${f.atMinutes}|${f.otherStart}|${f.otherEnd}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.days.includes(f.day)) existing.days.push(f.day);
    } else {
      groups.set(key, { ...f, days: [f.day] });
    }
  }

  // Conflicts (double-booking) are more urgent than back-to-back — surface first.
  const ordered = [...groups.values()].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'conflict' ? -1 : 1
  );

  return ordered
    .slice(0, 2)
    .map((g) => {
      const dayList = formatDayList(g.days);
      return g.kind === 'conflict'
        ? `Heads up: "${g.subject}" overlaps with "${g.other}" (${fmt(g.otherStart)}–${fmt(g.otherEnd)}) on ${dayList}.`
        : `Heads up: "${g.subject}" and "${g.other}" are back-to-back at ${fmt(g.atMinutes)} on ${dayList} — no buffer between them.`;
    })
    .join(' ');
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const MANAGE_TOOL: Anthropic.Tool = {
  name: 'manage_calendar',
  description: 'Manage the user calendar — add, edit, or delete events. Always call this tool.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reply: {
        type: 'string',
        description:
          'Friendly conversational reply (1-3 sentences). Confirm what was done or ask for clarification. ' +
          'Do NOT state gap, buffer, or back-to-back timing yourself (e.g. never say things like ' +
          '"you\'ll have an hour before X" or "that leaves a gap") — a separate system computes and appends ' +
          'accurate conflict/adjacency notices after your reply. Just confirm the action in plain terms.',
      },
      operations: {
        type: 'array',
        description: 'Calendar operations to perform. Empty array for info-only replies.',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['add', 'edit', 'delete'] },
            days: {
              type: 'array',
              items: { type: 'string' },
              description: 'Days for this event (op=add only). Use full names: Monday, Tuesday, etc.',
            },
            startTime: {
              type: 'string',
              description: 'Start time in HH:MM 24-hour format (op=add or edit). E.g. "09:00", "17:30".',
            },
            endTime: {
              type: 'string',
              description: 'End time in HH:MM 24-hour format (op=add or edit).',
            },
            title: { type: 'string', description: 'Event title (op=add or edit).' },
            category: {
              type: 'string',
              enum: ['work', 'study', 'personal', 'class', 'routine'],
              description:
                'Event category. Auto-detect: work/job/shift→work, gym/yoga/run/exercise→routine, ' +
                'study/homework/review→study, class/lecture/lab→class, else→personal.',
            },
            eventId: {
              type: 'string',
              description: 'ID of existing event to edit or delete (op=edit or delete).',
            },
          },
          required: ['op'],
        },
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description:
          '1-3 short follow-up actions the user might want next, shown as clickable chips. ' +
          'Keep each under 50 characters. Examples: "Add lunch break 12–1 PM each day", ' +
          '"Block study time Thursday 6–8 PM", "Export to Google Calendar".',
      },
    },
    required: ['reply', 'operations', 'suggestions'],
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `You are ScheduleAI, a friendly personal schedule assistant. \
You help users manage their weekly timetable through natural conversation.

Always call manage_calendar — never reply without it.

Capabilities:
- ADD events: "I work Monday 9-5", "Add gym Tue+Thu at 7am for 1hr", "Mon-Fri lunch 12-1"
- EDIT events: "Move gym to Wednesday", "Change work to end at 4pm", "Rename study to Python study"
- DELETE events: "Remove Tuesday gym", "Clear all work events", "Delete everything Friday"
- ANSWER: "What's on Thursday?", "Do I have conflicts?" → operations:[] with a descriptive reply

Rules:
1. For recurring patterns ("Mon–Fri", "every weekday", "Tue and Thu"), add ALL matching days.
2. Times are 24h HH:MM — convert: "9 AM"→"09:00", "5 PM"→"17:00", "noon"→"12:00", "7:30 am"→"07:30".
3. Auto-detect category from title keywords (see tool description).
4. When editing/deleting, match events by their ID from the current schedule context below.
5. If multiple events match a vague description, pick the most likely one and mention it.
6. Never compute or describe gaps, buffers, or back-to-back timing yourself — you are unreliable at exact \
minute math. A separate deterministic system appends accurate conflict/adjacency notices after your reply. \
Just confirm what was added/changed/deleted.
7. Keep replies concise (1-3 sentences). Confirm what was done.
8. Suggest 1-3 smart follow-up chips based on what the user might want next.`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const ip = getIp(req);
  if (minuteLimiter) {
    const { success } = await minuteLimiter.limit(ip);
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  if (dayLimiter) {
    const { success } = await dayLimiter.limit(ip);
    if (!success) return NextResponse.json({ error: 'Daily limit reached' }, { status: 429 });
  }

  let body: CalendarChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, currentEvents, googleConnected } = body;

  // Reject oversized messages
  const lastMsg = messages[messages.length - 1]?.content ?? '';
  if (lastMsg.length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  // Short messages ("done", "yes", "add gym") rarely need Sonnet-level
  // reasoning — route them to Haiku and save cost/latency.
  const model = lastMsg.trim().length > 20 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  // Keep only the last 10 turns to cap per-call token cost
  const trimmedMessages = messages.slice(-10);

  const contextMessages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `[CURRENT SCHEDULE]\n${buildEventsContext(currentEvents)}\n` +
        `Google Calendar: ${googleConnected ? 'Connected' : 'Not connected'}\n[/CURRENT SCHEDULE]\n\nReady.`,
    },
    { role: 'assistant', content: 'Ready to help manage your schedule.' },
    ...trimmedMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [MANAGE_TOOL],
      tool_choice: { type: 'any' },
      messages: contextMessages,
    });

    const toolBlock = response.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use'
    );

    if (!toolBlock) {
      const textBlock = response.content.find((c): c is Anthropic.TextBlock => c.type === 'text');
      return NextResponse.json({
        reply: textBlock?.text ?? "I didn't catch that. Could you rephrase?",
        addedEvents: [],
        editedEvents: [],
        deletedIds: [],
        suggestions: [],
      } satisfies CalendarChatResponse);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = toolBlock.input as any;
    const operations: any[] = result.operations ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any

    const addedEvents: AddedEvent[] = [];
    const editedEvents: Array<{ id: string; changes: Partial<Omit<AddedEvent, 'id'>> }> = [];
    const deletedIds: string[] = [];

    for (const op of operations) {
      if (op.op === 'add') {
        const days: string[] = Array.isArray(op.days) ? op.days : [];
        const startMinutes = timeToMinutes(op.startTime ?? '09:00');
        const endMinutes = timeToMinutes(op.endTime ?? '10:00');
        const category = (op.category as EventCategory) ?? 'personal';
        for (const day of days) {
          addedEvents.push({
            id: uid(),
            day,
            startMinutes,
            endMinutes,
            title: op.title ?? 'Event',
            category,
          });
        }
      } else if (op.op === 'edit' && op.eventId) {
        const changes: Partial<Omit<AddedEvent, 'id'>> = {};
        if (op.day) changes.day = op.day;
        if (op.startTime) changes.startMinutes = timeToMinutes(op.startTime);
        if (op.endTime) changes.endMinutes = timeToMinutes(op.endTime);
        if (op.title) changes.title = op.title;
        if (op.category) changes.category = op.category as EventCategory;
        editedEvents.push({ id: op.eventId, changes });
      } else if (op.op === 'delete' && op.eventId) {
        deletedIds.push(op.eventId);
      }
    }

    // Resolve the post-operation schedule so conflict/adjacency wording reflects
    // reality instead of whatever the model guessed.
    const finalExisting: MiniEvent[] = currentEvents
      .filter((e) => !deletedIds.includes(e.id))
      .map((e) => {
        const edit = editedEvents.find((ed) => ed.id === e.id);
        return edit
          ? {
              id: e.id,
              day: edit.changes.day ?? e.day,
              startMinutes: edit.changes.startMinutes ?? e.startMinutes,
              endMinutes: edit.changes.endMinutes ?? e.endMinutes,
              title: edit.changes.title ?? e.title,
            }
          : { id: e.id, day: e.day, startMinutes: e.startMinutes, endMinutes: e.endMinutes, title: e.title };
      });

    const finalAll: MiniEvent[] = [
      ...finalExisting,
      ...addedEvents.map((e) => ({ id: e.id, day: e.day, startMinutes: e.startMinutes, endMinutes: e.endMinutes, title: e.title })),
    ];

    const changedEvents: MiniEvent[] = [
      ...addedEvents.map((e) => ({ id: e.id, day: e.day, startMinutes: e.startMinutes, endMinutes: e.endMinutes, title: e.title })),
      ...finalExisting.filter((e) => editedEvents.some((ed) => ed.id === e.id)),
    ];

    const scheduleFlags = findScheduleFlags(changedEvents, finalAll);
    const flagNotice = summarizeScheduleFlags(scheduleFlags);

    const baseReply = (result.reply ?? '').trim();
    const reply = flagNotice ? `${baseReply} ${flagNotice}`.trim() : baseReply;

    const suggestions: string[] = Array.isArray(result.suggestions) ? [...result.suggestions] : [];
    const backToBack = scheduleFlags.find((f) => f.kind === 'back-to-back');
    if (backToBack && suggestions.length < 3) {
      suggestions.push(`Add a buffer before "${backToBack.other}"`);
    }

    return NextResponse.json({
      reply,
      addedEvents,
      editedEvents,
      deletedIds,
      suggestions,
    } satisfies CalendarChatResponse);
  } catch (err) {
    console.error('[/api/calendar-chat] Claude error:', err);
    return NextResponse.json({ error: 'Claude API call failed' }, { status: 502 });
  }
}
