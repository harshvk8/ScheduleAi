# Firebase Setup Notes

Project: `scheduleai-85ca6`

---

## One-time setup steps (do these if Firestore writes are not working)

### 1. Create the Firestore database

Go to [Firebase Console](https://console.firebase.google.com) → Select project `scheduleai-85ca6` → Firestore Database → **Create database**.

- Choose **Start in test mode** (rules are handled in step 2)
- Select region **nam5 (Central US)** to match `firebase.json`

### 2. Deploy Firestore security rules

The rules in `firestore.rules` allow all reads/writes until June 6, 2026, but they must be deployed to take effect. Run:

```bash
firebase deploy --only firestore:rules
```

Without this, the default locked rules block all writes and every save silently fails.

### 3. Deploy Firestore indexes (optional now, needed later)

```bash
firebase deploy --only firestore:indexes
```

---

## How to debug write failures

All Firestore errors are now printed to the **browser console** (`console.error`).

Open DevTools → Console tab → look for red errors like:
- `FirebaseError: Missing or insufficient permissions` → rules not deployed (step 2)
- `FirebaseError: NOT_FOUND` → database doesn't exist yet (step 1)
- `FirebaseError: invalid-argument` → a field value is `undefined` (use `null` instead)

---

## What gets saved where

| User action | Firestore collection | Document ID |
|---|---|---|
| Student submits info form | `users` | sanitized email (`john_doe_gmail_com`) |
| Student says "done" in chatbot | `scheduleRequests` | auto-generated |
| Normal user adds calendar event | `calendarEvents` | event ID (from local state) |
| Normal user clears timetable | `calendarEvents` | all docs with matching `sessionId` deleted |
| Student signs up | `universities` | university ID (studentCount incremented) |

---

## Firestore rules (current)

```
allow read, write: if request.time < timestamp.date(2026, 6, 6);
```

Expires June 6, 2026. Before then, write proper rules per collection (Phase 10).
