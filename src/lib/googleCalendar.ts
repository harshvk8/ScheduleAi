const BASE = 'https://www.googleapis.com/calendar/v3';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GCalEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export interface MappedGCalEvent {
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  googleEventId: string;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchWeekEvents(accessToken: string): Promise<GCalEvent[]> {
  const { timeMin, timeMax } = currentWeekRange();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });

  const res = await fetch(`${BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.items ?? []) as GCalEvent[];
}

// Convert a Google event to internal timetable fields.
// Returns null for all-day events (no dateTime) or events outside 0–23h bounds.
export function gcalToInternal(ev: GCalEvent): MappedGCalEvent | null {
  const startDT = ev.start.dateTime;
  const endDT = ev.end.dateTime;
  if (!startDT || !endDT) return null;

  const start = new Date(startDT);
  const end = new Date(endDT);
  const day = WEEKDAYS[start.getDay()];
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  if (endMinutes <= startMinutes) return null;

  return {
    day,
    startMinutes,
    endMinutes,
    title: ev.summary?.trim() || 'Untitled',
    googleEventId: ev.id,
  };
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createGCalEvent(
  accessToken: string,
  event: { title: string; day: string; startMinutes: number; endMinutes: number }
): Promise<string> {
  const date = thisWeekDate(event.day);
  if (!date) throw new Error(`Unknown day: ${event.day}`);

  const toISO = (minutes: number) => {
    const dt = new Date(date);
    dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return dt.toISOString();
  };

  const res = await fetch(`${BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      start: { dateTime: toISO(event.startMinutes) },
      end: { dateTime: toISO(event.endMinutes) },
    }),
  });

  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  const data = await res.json();
  return data.id as string;
}

export async function deleteGCalEvent(accessToken: string, googleEventId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  // 404/410 = already gone, which is fine
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function currentWeekRange(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const dow = now.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return { timeMin: monday.toISOString(), timeMax: nextMonday.toISOString() };
}

function thisWeekDate(dayName: string): Date | null {
  const idx = WEEKDAYS.indexOf(dayName);
  if (idx === -1) return null;

  const now = new Date();
  const diff = idx - now.getDay();
  const date = new Date(now);
  date.setDate(now.getDate() + diff);
  return date;
}
