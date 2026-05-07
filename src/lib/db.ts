import {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Collection names ─────────────────────────────────────────────────────────

const COL = {
  users: 'users',
  universities: 'universities',
  scheduleRequests: 'scheduleRequests',
  calendarEvents: 'calendarEvents',
  professors: 'professors',
  professorFeedback: 'professorFeedback',
  adminAccounts: 'adminAccounts',
} as const;

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface CoursePreference {
  course: string;
  preferredProfessor?: string;
  preferredDays: string[];
  avoidDays: string[];
  preferredTimes: string[];
  avoidTimes: string[];
  modality?: string;
}

export interface ScheduleConstraint {
  type: 'work' | 'unavailable';
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Sanitized email used as Firestore doc ID so re-submitting upserts the same doc.
function emailToDocId(email: string) {
  return email.toLowerCase().replace(/[@.]/g, '_');
}

// ─── users ────────────────────────────────────────────────────────────────────

export async function saveUser(profile: {
  name: string;
  email: string;
  studentId: string;
  universityId: string;
  universityName: string;
  domain: string;
}) {
  const docId = emailToDocId(profile.email);
  const ref = doc(db, COL.users, docId);
  await setDoc(
    ref,
    {
      name: profile.name,
      email: profile.email.toLowerCase(),
      studentId: profile.studentId.toUpperCase(),
      universityId: profile.universityId,
      universityName: profile.universityName,
      domain: profile.domain,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  await incrementUniversityStudentCount(
    profile.universityId,
    profile.universityName,
    profile.domain
  );
}

// ─── universities ─────────────────────────────────────────────────────────────

async function incrementUniversityStudentCount(
  universityId: string,
  name: string,
  domain: string
) {
  const ref = doc(db, COL.universities, universityId);
  await setDoc(
    ref,
    {
      name,
      domain,
      studentCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ─── scheduleRequests ─────────────────────────────────────────────────────────

export async function saveScheduleRequest(
  studentEmail: string,
  studentName: string,
  universityId: string,
  universityName: string,
  preferences: {
    courses: CoursePreference[];
    constraints: ScheduleConstraint[];
    generalPreferTimes: string[];
    generalAvoidTimes: string[];
    generalPreferDays: string[];
    generalAvoidDays: string[];
    defaultModality?: string;
  }
): Promise<string> {
  const payload = {
    studentEmail: studentEmail.toLowerCase(),
    studentName,
    universityId,
    universityName,
    courses: preferences.courses,
    constraints: preferences.constraints,
    generalPreferTimes: preferences.generalPreferTimes,
    generalAvoidTimes: preferences.generalAvoidTimes,
    generalPreferDays: preferences.generalPreferDays,
    generalAvoidDays: preferences.generalAvoidDays,
    defaultModality: preferences.defaultModality ?? null,
    status: 'pending',
    submittedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COL.scheduleRequests), payload);
  return ref.id;
}

// ─── calendarEvents ───────────────────────────────────────────────────────────

export async function saveCalendarEvents(
  sessionId: string,
  events: Array<{
    id: string;
    day: string;
    startMinutes: number;
    endMinutes: number;
    title: string;
    category: string;
  }>
) {
  if (events.length === 0) return;
  const batch = writeBatch(db);
  for (const ev of events) {
    const ref = doc(db, COL.calendarEvents, ev.id);
    batch.set(ref, {
      sessionId,
      day: ev.day,
      startMinutes: ev.startMinutes,
      endMinutes: ev.endMinutes,
      title: ev.title,
      category: ev.category,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function deleteCalendarEventsBySession(sessionId: string) {
  const q = query(
    collection(db, COL.calendarEvents),
    where('sessionId', '==', sessionId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function deleteCalendarEvent(eventId: string) {
  await deleteDoc(doc(db, COL.calendarEvents, eventId));
}

// ─── professors ───────────────────────────────────────────────────────────────

export async function saveProfessor(professor: {
  name: string;
  universityId: string;
  universityName: string;
  courses?: string[];
}) {
  const docId = `${professor.universityId}_${professor.name.toLowerCase().replace(/\s+/g, '_')}`;
  await setDoc(
    doc(db, COL.professors, docId),
    {
      name: professor.name,
      universityId: professor.universityId,
      universityName: professor.universityName,
      courses: professor.courses ?? [],
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ─── professorFeedback ────────────────────────────────────────────────────────

export async function saveProfessorFeedback(feedback: {
  professorName: string;
  courseName: string;
  universityId: string;
  rating?: number;
  comment?: string;
  studentEmail?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COL.professorFeedback), {
    professorName: feedback.professorName,
    courseName: feedback.courseName,
    universityId: feedback.universityId,
    rating: feedback.rating ?? null,
    comment: feedback.comment ?? null,
    studentEmail: feedback.studentEmail ?? null,
    submittedAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── Session ID helpers ───────────────────────────────────────────────────────

// Normal users have no auth yet — generate a stable ID stored in sessionStorage.
export function getOrCreateSessionId(): string {
  const key = 'scheduleai_session';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, id);
  }
  return id;
}
