import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatApiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentPrefs: {
    courses: Array<{
      course: string;
      preferredProfessor?: string;
      preferredDays: string[];
      avoidDays: string[];
      preferredTimes: string[];
      avoidTimes: string[];
      modality?: string;
    }>;
    constraints: Array<{ type: string; description: string }>;
    generalPreferTimes: string[];
    generalAvoidTimes: string[];
    generalPreferDays: string[];
    generalAvoidDays: string[];
    defaultModality?: string;
  };
  studentName: string;
  availableProfessors?: Array<{
    name: string;
    courses: string[];
    avgRating: number | null;
    wouldTakeAgainPct: number | null;
  }>;
}

export interface ChatApiResponse {
  reply: string;
  courses: string[];
  professors: string[];
  preferTimes: string[];
  avoidTimes: string[];
  preferDays: string[];
  avoidDays: string[];
  modality: string | null;
  isWork: boolean;
  workDesc: string | null;
  workAvoidTimes: string[];
  workAvoidDays: string[];
  conflicts: string[];
  profRecommendations: Array<{ course: string; professor: string; reason: string }>;
  needsFollowUp: boolean;
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_schedule_preferences',
  description:
    'Extract structured scheduling preferences from the student message and generate a contextual reply.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reply: {
        type: 'string',
        description:
          'Conversational reply to the student. Keep it short (1-3 sentences). ' +
          'If info is missing, embed ONE specific follow-up question at the end.',
      },
      courses: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Course codes explicitly written in the CURRENT student message only — ' +
          'do NOT carry over courses from previous turns. ' +
          'If the student does not mention a course code right now, return an empty array. ' +
          'Normalise to uppercase with a space between dept and number (e.g. ["CSIT 230", "MATH 201"]).',
      },
      professors: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Professor names mentioned. Always prefix with "Professor " even if student said only the last name.',
      },
      preferTimes: {
        type: 'array',
        items: { type: 'string', enum: ['Morning', 'Afternoon', 'Evening', 'Night'] },
        description: 'Time-of-day slots the student prefers FOR CLASS. Never put work hours here.',
      },
      avoidTimes: {
        type: 'array',
        items: { type: 'string', enum: ['Morning', 'Afternoon', 'Evening', 'Night'] },
        description: 'Non-work-related times the student cannot do (e.g. "I have a medical appointment in the morning"). Do NOT put work hours here — use workAvoidTimes instead.',
      },
      workAvoidTimes: {
        type: 'array',
        items: { type: 'string', enum: ['Morning', 'Afternoon', 'Evening', 'Night'] },
        description: 'Time slots when the student WORKS. Only set when isWork=true. Example: student says "I work evenings" or just replies "evening" to the work-schedule question → workAvoidTimes: ["Evening"]. These are shown differently in the UI (amber, not red).',
      },
      workAvoidDays: {
        type: 'array',
        items: { type: 'string' },
        description: 'Days when the student works (only when isWork=true, e.g. ["Monday","Tuesday","Wednesday","Thursday","Friday"] for a weekday job).',
      },
      preferDays: {
        type: 'array',
        items: { type: 'string' },
        description: 'Full day names the student prefers (e.g. "Tuesday", "Thursday").',
      },
      avoidDays: {
        type: 'array',
        items: { type: 'string' },
        description: 'Full day names the student wants to avoid.',
      },
      modality: {
        type: 'string',
        enum: ['online', 'hybrid', 'in-person'],
        description: 'Preferred class format, if stated.',
      },
      isWork: {
        type: 'boolean',
        description: 'True if the student mentioned a work schedule.',
      },
      workDesc: {
        type: 'string',
        description: 'Short description of the work schedule (e.g. "Works Mon-Fri 8 AM – 1 PM").',
      },
      conflicts: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Conflicts detected between stated preferences. ' +
          'Examples: "You prefer mornings but work mornings — these conflict.", ' +
          '"CSIT 230 and MATH 201 are both requested for Tuesday afternoon, which may clash."',
      },
      profRecommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            course: { type: 'string' },
            professor: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['course', 'professor', 'reason'],
        },
        description:
          'Professor recommendations for courses where no professor was specified. ' +
          'Only populate if availableProfessors context was provided.',
      },
      needsFollowUp: {
        type: 'boolean',
        description: 'True when the reply ends with a follow-up question asking for more info.',
      },
    },
    required: [
      'reply',
      'courses',
      'professors',
      'preferTimes',
      'avoidTimes',
      'preferDays',
      'avoidDays',
      'isWork',
      'workAvoidTimes',
      'workAvoidDays',
      'conflicts',
      'profRecommendations',
      'needsFollowUp',
    ],
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `You are ScheduleAI, a smart university scheduling assistant chatting with a student. \
Your goal is to collect their course, professor, time, and day preferences for next semester through friendly conversation.

Rules:
1. Be warm and concise — 1-3 sentences per reply. No bullet lists in replies.
2. After each message, call extract_schedule_preferences to return structured data.
3. Ask ONE targeted follow-up question when key info is still missing:
   - Student says "after work" but no work end-time → ask "What time do you usually finish work?"
   - Student names a course but no time preference → ask which time they'd prefer for that course
   - Student mentions professor but no days/times → ask when they'd like the class
4. Detect conflicts and include a plain-language warning (e.g. "You prefer mornings but work mornings").
5. When a course has no professor and availableProfessors data is provided, recommend the highest-rated matching professor.
6. Do NOT repeat questions already answered; use the "Current preferences" context.
7. When the student seems done, confirm their preferences and tell them to type "done" to finalise.

CRITICAL — work hours vs class preferences:
- When the student mentions WHEN THEY WORK (e.g. "I work evenings", "evening", "mornings" in response to the work question, "9 to 5"), put those times in workAvoidTimes — NEVER in preferTimes or avoidTimes.
- avoidTimes is ONLY for non-work avoidances (e.g. "I have a dentist appointment Tuesday morning").
- preferTimes is ONLY for times the student wants their CLASSES, not when they work.
- Example: "I work evenings" → isWork: true, workAvoidTimes: ["Evening"], preferTimes: [], avoidTimes: []
- Example: "evening" (said in response to work-schedule question) → isWork: true, workAvoidTimes: ["Evening"]
- Example: "I prefer afternoons" → isWork: false, preferTimes: ["Afternoon"], workAvoidTimes: []`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body: ChatApiRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, currentPrefs, studentName, availableProfessors } = body;

  const client = new Anthropic({ apiKey });

  const contextBlock =
    `Student: ${studentName}\n\n` +
    `Current preferences collected so far:\n${JSON.stringify(currentPrefs, null, 2)}\n\n` +
    (availableProfessors?.length
      ? `Highly-rated professors in the system (use for recommendations):\n${JSON.stringify(availableProfessors, null, 2)}\n\n`
      : '');

  // Prepend context as a system-style user turn before the real conversation
  const apiMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: `[CONTEXT]\n${contextBlock}[/CONTEXT]\n\nPlease greet the student or wait for their next message.` },
    { role: 'assistant', content: 'Ready. Waiting for the student.' },
    ...messages,
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'any' },
      messages: apiMessages,
    });

    // The model MUST use the tool (tool_choice: any), so find it
    const toolBlock = response.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    if (!toolBlock) {
      const textBlock = response.content.find((c): c is Anthropic.TextBlock => c.type === 'text');
      return NextResponse.json({
        reply: textBlock?.text ?? "I didn't catch that. Could you rephrase?",
        courses: [], professors: [], preferTimes: [], avoidTimes: [],
        preferDays: [], avoidDays: [], modality: null, isWork: false,
        workDesc: null, workAvoidTimes: [], workAvoidDays: [],
        conflicts: [], profRecommendations: [], needsFollowUp: false,
      } satisfies ChatApiResponse);
    }

    const result = toolBlock.input as ChatApiResponse;
    return NextResponse.json({
      reply: result.reply ?? '',
      courses: result.courses ?? [],
      professors: result.professors ?? [],
      preferTimes: result.preferTimes ?? [],
      avoidTimes: result.avoidTimes ?? [],
      preferDays: result.preferDays ?? [],
      avoidDays: result.avoidDays ?? [],
      modality: result.modality ?? null,
      isWork: result.isWork ?? false,
      workDesc: result.workDesc ?? null,
      workAvoidTimes: result.workAvoidTimes ?? [],
      workAvoidDays: result.workAvoidDays ?? [],
      conflicts: result.conflicts ?? [],
      profRecommendations: result.profRecommendations ?? [],
      needsFollowUp: result.needsFollowUp ?? false,
    } satisfies ChatApiResponse);
  } catch (err) {
    console.error('[/api/chat] Claude error:', err);
    return NextResponse.json({ error: 'Claude API call failed' }, { status: 502 });
  }
}
