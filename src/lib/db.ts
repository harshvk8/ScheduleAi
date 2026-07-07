import {
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs,
  increment,
  arrayUnion,
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
  professorDemand: 'professorDemand',
  bugReports: 'bugReports',
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

  // Best-effort: bump the public, name/email-free professor-demand aggregate.
  // This is what public/unauthenticated surfaces (the professors page, the
  // student chatbot's recommender) read from instead of raw scheduleRequests.
  await Promise.allSettled(
    preferences.courses
      .filter((c) => c.preferredProfessor?.trim())
      .map((c) =>
        bumpProfessorDemand(universityId, universityName, c.preferredProfessor!.trim(), c.course)
      )
  );

  return ref.id;
}

async function bumpProfessorDemand(
  universityId: string,
  universityName: string,
  professorName: string,
  course: string
) {
  const key = professorName.toLowerCase().replace(/\s+/g, '_');
  const ref = doc(db, COL.professorDemand, `${universityId}__${key}`);
  await setDoc(
    ref,
    {
      universityId,
      universityName,
      professorName,
      courses: arrayUnion(course.toUpperCase().trim()),
      requestCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export interface ProfessorDemandDoc {
  id: string;
  universityId: string;
  universityName: string;
  professorName: string;
  courses: string[];
  requestCount: number;
}

// Public-safe: no student name/email ever lives in this collection.
export async function getAllProfessorDemand(): Promise<ProfessorDemandDoc[]> {
  const snap = await getDocs(collection(db, COL.professorDemand));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessorDemandDoc));
}

export async function getProfessorDemandByUniversity(universityId: string): Promise<ProfessorDemandDoc[]> {
  const q = query(collection(db, COL.professorDemand), where('universityId', '==', universityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessorDemandDoc));
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

export async function getCalendarEventsBySession(sessionId: string): Promise<Array<{
  id: string;
  day: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  category: string;
}>> {
  const q = query(
    collection(db, COL.calendarEvents),
    where('sessionId', '==', sessionId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string;
    day: string;
    startMinutes: number;
    endMinutes: number;
    title: string;
    category: string;
  }>;
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

// This collection is intentionally public-readable (it powers the /professors
// ratings page), so it must never carry student name/email — no field for it.
export async function saveProfessorFeedback(feedback: {
  professorName: string;
  courseName: string;
  universityId: string;
  rating?: number;
  difficulty?: number;
  teachingClarity?: number;
  workload?: number;
  attendanceStrictness?: number;
  wouldTakeAgain?: boolean;
  comment?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COL.professorFeedback), {
    professorName: feedback.professorName,
    courseName: feedback.courseName,
    universityId: feedback.universityId,
    rating: feedback.rating ?? null,
    difficulty: feedback.difficulty ?? null,
    teachingClarity: feedback.teachingClarity ?? null,
    workload: feedback.workload ?? null,
    attendanceStrictness: feedback.attendanceStrictness ?? null,
    wouldTakeAgain: feedback.wouldTakeAgain ?? null,
    comment: feedback.comment ?? null,
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

// ─── Admin query types ────────────────────────────────────────────────────────

export interface ScheduleRequestDoc {
  id: string;
  studentEmail: string;
  studentName: string;
  universityId: string;
  universityName: string;
  courses: CoursePreference[];
  constraints: ScheduleConstraint[];
  generalPreferTimes: string[];
  generalAvoidTimes: string[];
  generalPreferDays: string[];
  generalAvoidDays: string[];
  defaultModality: string | null;
  status: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submittedAt: any;
}

// ─── Admin queries ────────────────────────────────────────────────────────────
//
// These carry raw student names/emails, so they are ONLY ever called from the
// admin dashboard — and only scoped to the signed-in admin's own university.
// Firestore security rules enforce this server-side too (see firestore.rules);
// there is no unscoped "get everything" query left in this file on purpose.

export async function getScheduleRequestsByUniversity(universityId: string): Promise<ScheduleRequestDoc[]> {
  const q = query(collection(db, COL.scheduleRequests), where('universityId', '==', universityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScheduleRequestDoc));
}

export interface ProfessorFeedbackDoc {
  id: string;
  professorName: string;
  courseName: string;
  universityId: string;
  rating: number | null;
  difficulty: number | null;
  teachingClarity: number | null;
  workload: number | null;
  attendanceStrictness: number | null;
  wouldTakeAgain: boolean | null;
  comment: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submittedAt: any;
}

// Public-safe (no student identity in this collection) — used by /professors.
export async function getAllProfessorFeedback(): Promise<ProfessorFeedbackDoc[]> {
  const snap = await getDocs(collection(db, COL.professorFeedback));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessorFeedbackDoc));
}

export async function getProfessorFeedbackByUniversity(universityId: string): Promise<ProfessorFeedbackDoc[]> {
  const q = query(collection(db, COL.professorFeedback), where('universityId', '==', universityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessorFeedbackDoc));
}

// ─── User profiles (Firebase Auth UID-keyed) ─────────────────────────────────

export type UserRole = 'student' | 'admin' | 'normal_user';

export interface UserProfileDoc {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  universityId?: string;
  universityName?: string;
  studentId?: string;
  domain?: string;
}

export async function saveUserProfile(
  uid: string,
  data: Omit<UserProfileDoc, 'uid'>
): Promise<void> {
  await setDoc(
    doc(db, COL.users, uid),
    { ...data, updatedAt: serverTimestamp(), createdAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getUserProfile(uid: string): Promise<UserProfileDoc | null> {
  const snap = await getDoc(doc(db, COL.users, uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as UserProfileDoc;
}

// ─── bugReports ───────────────────────────────────────────────────────────────

export interface BugReportDoc {
  id: string;
  sessionId: string;
  timestamp: string;
  errorMessage: string;
  stackTrace: string;
  componentStack: string;
  lastUserAction: string;
  eventsSnapshot: string;
  url: string;
  aiSummary: string;
  severity: 'low' | 'medium' | 'high';
  suggestedFix: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
}

export async function saveBugReport(
  report: Omit<BugReportDoc, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL.bugReports), {
    ...report,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getBugReports(): Promise<BugReportDoc[]> {
  const snap = await getDocs(collection(db, COL.bugReports));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BugReportDoc));
}
