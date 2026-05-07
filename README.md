# ScheduleAI

ScheduleAI is an AI-powered scheduling and university demand platform. It helps users create smarter schedules through a chatbot, connect their schedules with Google Calendar, and view their timetable inside the website. For university students, ScheduleAI also collects course, professor, and time preferences so university admins can understand student scheduling demand anonymously.

ScheduleAI is designed for both general users and university users.

---

## Project Overview

ScheduleAI is built around a chatbot-first scheduling experience. A user can open the website, choose whether they are a normal user or a student, and then start chatting with the AI assistant.

Normal users can use ScheduleAI to organize work, study, personal tasks, meetings, and daily routines. They can also connect Google Calendar and view their schedule in the website calendar.

University students can use ScheduleAI to share course preferences, professor preferences, available times, unavailable times, and work schedule conflicts. The system converts these conversations into structured data that can help university admins understand class demand, professor demand, and preferred time slots.

University admins can use a separate dashboard to view anonymous scheduling trends and improve course planning.

---

## Main Interfaces

ScheduleAI has three main interfaces:

### 1. Public Landing Page

The public landing page is for both normal users and students.

From the landing page, users can choose:

- Continue as a normal user
- Continue as a student
- Admin login

Normal users can start the chatbot and use ScheduleAI as a personal scheduling assistant.

Students can select their university, enter basic student information, and then use the chatbot for university schedule planning.

The landing page should include:

- ScheduleAI logo
- Short product explanation
- Option to continue as normal user
- Option to continue as student
- University selector for students
- Admin login button in the top-right corner

---

### 2. User / Student Chatbot Interface

The chatbot is the main part of ScheduleAI.

For normal users, the chatbot can help with:

- Daily planning
- Work schedules
- Study plans
- Personal tasks
- Meeting planning
- Calendar organization
- Google Calendar syncing
- Website timetable view

For students, the chatbot can also collect:

- Name
- University email
- University ID
- Selected university
- Courses they want to take
- Preferred professors
- Preferred days and times
- Times they are unavailable
- Work schedule conflicts
- Online, hybrid, or in-person preferences

The chatbot should understand the user’s message and automatically add the information into the timetable or schedule request. The user should not need a separate “Generate” button. When the user submits a prompt, the system should understand it, structure it, save it, and update the timetable.

---

### 3. University Admin Dashboard

The admin dashboard is for university staff or approved admins.

Admins should not focus on personal student names. Instead, they should see anonymous scheduling demand data.

The admin dashboard can show:

- Most requested courses
- Most requested professors
- Popular time slots
- Student availability trends
- Courses that may need more sections
- Time conflicts students commonly report
- Professor feedback summaries
- Exportable reports

Example:

```text
Course: CSIT 313
Total Student Requests: 82
Most Requested Professor: Professor Brown
Most Preferred Time: Tuesday/Thursday after 2 PM
Students Avoiding Morning Classes: 61%
```
---

### Current Features
Modern ScheduleAI landing page
Normal user and student user concept
Student university selection concept
Chatbot-based scheduling concept
Website timetable/calendar concept
Admin login concept
Responsive UI using Tailwind CSS
Next.js App Router setup
TypeScript support
Reusable component structure
Starter UI for future development
---

## Google Calendar and Website Calendar

ScheduleAI will include two calendar options: an internal website calendar and Google Calendar sync.

### Website Calendar

Users can view their schedule directly inside ScheduleAI. This calendar can show classes, work, study time, meetings, and personal tasks in one place.

### Google Calendar Sync

Users will be able to connect their Google Calendar so ScheduleAI can sync events with their existing calendar.

Future Google Calendar features may include:

- Adding ScheduleAI events to Google Calendar
- Importing existing Google Calendar events
- Detecting time conflicts
- Suggesting better available times
- Updating or deleting synced events

---

## Professor Search and Feedback System

ScheduleAI will include a professor search and feedback system for student users.

Students will be able to search for a professor by name and view professor-related information such as rating, difficulty, course experience, and student feedback.

In future versions, students will also be able to submit feedback about professors after taking a course. This feedback can help future students make better decisions and help ScheduleAI recommend better professor and course options.

Possible feedback fields include:

- Overall professor rating
- Course difficulty
- Teaching clarity
- Workload
- Attendance strictness
- Would take again
- Written feedback

---

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint
- Node.js
- npm

---

## Future Backend and Database Plan

The current version is a frontend prototype. Future versions may include a backend and database to store user schedules, student preferences, professor data, calendar events, and admin analytics.

Possible backend tools:

- Next.js API Routes
- Firebase Authentication
- Firestore Database
- Supabase / PostgreSQL
- OpenAI API for chatbot understanding
- Google Calendar API for calendar sync

Possible database collections or tables:

```text
users
universities
scheduleRequests
calendarEvents
professors
professorFeedback
adminAccounts
```

---

## Project Structure

```text
ScheduleAI/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── components/
│       ├── FeatureCard.tsx
│       └── SchedulerDemo.tsx
├── public/
├── package.json
├── package-lock.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
└── README.md
```

---

## Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

### 3. Open the project

Open your browser and go to:

```text
http://localhost:3000
```

---

## Build for Production

To create a production build:

```bash
npm run build
```

To run the production version locally:

```bash
npm run start
```

---

## Deployment Plan

This project can be deployed using Vercel.

Basic deployment steps:

1. Push the project to GitHub.
2. Connect the GitHub repository to Vercel.
3. Let Vercel detect the Next.js project.
4. Add environment variables if API keys or database connections are used.
5. Deploy the production version.

Recommended environment variables for future versions:

```env
OPENAI_API_KEY=
DATABASE_URL=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
```

API keys should never be committed directly to GitHub.

---

## Development Roadmap

### Phase 1: Frontend Prototype

- Landing page
- Normal user and student selection
- University selector for students
- Student chatbot UI
- Website calendar/timetable UI
- Admin login button
- Basic responsive design

### Phase 2: Chatbot Logic

- Create chatbot input flow
- Extract events, courses, professors, and time preferences
- Convert user messages into structured data
- Update the website timetable after prompt submission
- Show user preference summary

### Phase 3: Database Integration

- Add user records
- Save schedule requests
- Store calendar events
- Store professor preferences
- Store university-specific data

### Phase 4: Admin Dashboard

- Show anonymous student demand
- Display course demand
- Display professor demand
- Display preferred time slots
- Add charts and reports

### Phase 5: Professor Feedback System

- Add professor search
- Add student professor feedback
- Calculate professor ratings
- Show professor summaries

### Phase 6: Calendar and Startup Features

- Add Google Calendar sync
- Add authentication
- Add university admin accounts
- Add exportable reports
- Prepare for real university testing

---

## Team / Contributors

```text
Harshvardhan Kumar Nimesh - Founder / Developer / Product Lead
Team Member Name - Frontend Developer
Team Member Name - Backend Developer
Team Member Name - UI/UX Designer
```

---

## Resources Used

This project may use online documentation, AI coding assistance, and developer tools during the development process.

Resources may include:

- Next.js documentation
- React documentation
- Tailwind CSS documentation
- Firebase documentation
- OpenAI API documentation
- ChatGPT and Claude for brainstorming, debugging, and documentation support

All final code should be reviewed, tested, and understood by the development team before deployment.

---

## Project Goal

The goal of ScheduleAI is to make scheduling smarter for both individuals and universities.

For normal users, ScheduleAI acts as an AI scheduling assistant that can understand natural language, create a timetable, and sync with Google Calendar.

For students, ScheduleAI helps collect course, professor, and time preferences through a chatbot.

For universities, ScheduleAI provides anonymous demand insights that can help improve course scheduling, professor planning, and class availability.
