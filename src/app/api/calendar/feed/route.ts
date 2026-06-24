import { NextRequest } from 'next/server';
import { getCalendarEventsBySession } from '@/lib/db';

// ── iCal helpers ────────────────────────────────────────────────────────────

// Day name → offset from Monday (0=Mon … 6=Sun)
const DAY_OFFSET: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
};

// Anchor: 2026-01-05 is a Monday — used as the DTSTART base for RRULE events.
const ANCHOR = new Date(2026, 0, 5); // month is 0-indexed

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function toIcalDate(d: Date, minutes: number): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${y}${mo}${dy}T${h}${m}00`;
}

// RFC 5545: escape TEXT values
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545: fold lines longer than 75 octets with CRLF + space
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  let result = '';
  let pos = 0;
  let limit = 75;
  while (pos < line.length) {
    const chunk = line.slice(pos, pos + limit);
    result += (pos === 0 ? '' : '\r\n ') + chunk;
    pos += limit;
    limit = 74; // continuation lines have 1 byte taken by the leading space
  }
  return result;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const sessionId = req.nextUrl.searchParams.get('session');
  if (!sessionId) {
    return new Response('Missing ?session= parameter', { status: 400 });
  }

  const events = await getCalendarEventsBySession(sessionId);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScheduleAI//ScheduleAI Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:My ScheduleAI Schedule',
    'X-WR-CALDESC:Auto-generated weekly schedule from ScheduleAI',
  ];

  for (const ev of events) {
    const offset = DAY_OFFSET[ev.day] ?? 0;
    const startDate = addDays(ANCHOR, offset);
    // If event crosses midnight, end date is the next day
    const endDate = ev.endMinutes < ev.startMinutes
      ? addDays(startDate, 1)
      : startDate;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@scheduleai.app`,
      `SUMMARY:${esc(ev.title)}`,
      `DTSTART:${toIcalDate(startDate, ev.startMinutes)}`,
      `DTEND:${toIcalDate(endDate, ev.endMinutes)}`,
      'RRULE:FREQ=WEEKLY',
      `CATEGORIES:${esc(ev.category)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  const body = lines.map(fold).join('\r\n') + '\r\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="schedule.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
