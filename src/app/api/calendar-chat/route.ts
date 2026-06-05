import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

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
          'If there are conflicts, mention them.',
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
6. Warn about time conflicts with existing events when adding.
7. Keep replies concise (1-3 sentences). Confirm what was done.
8. Suggest 1-3 smart follow-up chips based on what the user might want next.`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body: CalendarChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, currentEvents, googleConnected } = body;
  const client = new Anthropic({ apiKey });

  const contextMessages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `[CURRENT SCHEDULE]\n${buildEventsContext(currentEvents)}\n` +
        `Google Calendar: ${googleConnected ? 'Connected' : 'Not connected'}\n[/CURRENT SCHEDULE]\n\nReady.`,
    },
    { role: 'assistant', content: 'Ready to help manage your schedule.' },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM,
          // @ts-expect-error cache_control is a valid beta field
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

    return NextResponse.json({
      reply: result.reply ?? '',
      addedEvents,
      editedEvents,
      deletedIds,
      suggestions: result.suggestions ?? [],
    } satisfies CalendarChatResponse);
  } catch (err) {
    console.error('[/api/calendar-chat] Claude error:', err);
    return NextResponse.json({ error: 'Claude API call failed' }, { status: 502 });
  }
}
