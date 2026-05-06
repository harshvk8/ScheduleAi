# ScheduleAI

ScheduleAI is an AI-powered university scheduling platform that helps students share their course, professor, and time preferences through a chatbot. The system converts student conversations into structured scheduling demand data so university admins can better understand what classes, professors, and time slots students actually want.

This project is not only a personal timetable generator. The main goal is to help universities make smarter scheduling decisions while giving students a simple way to communicate their needs.

---

## Project Overview

Many students struggle to find classes that fit their work schedule, commute, professors' preferences, and academic plan. At the same time, universities may not always have a clear view of how many students want a specific course, professor, or time slot before schedules are finalized.

ScheduleAI solves this problem by using a chatbot-based interface. Students select their university, enter basic information, and tell the chatbot what courses they want, which professors they prefer, and what times work best for them. The system then organizes that information into useful data for the university.

Admins can view anonymous demand trends through a separate dashboard. Instead of focusing on individual student names, the admin dashboard shows useful patterns, including popular courses, requested professors, preferred time slots, and scheduling conflicts.

---

## Main Interfaces

ScheduleAI is designed around three main interfaces:

### 1. Public Landing Page

The landing page introduces ScheduleAI and allows students to select their university. It also includes an admin login option in the top-right corner.

### 2. Student Chatbot Interface

The student chatbot collects basic student information and scheduling preferences.

Students provide:

- Name
- University email
- University ID

Then the chatbot asks about:

- Courses they want to take
- Preferred professors
- Preferred days and times
- Times they are unavailable
- Work schedule conflicts
- Online, hybrid, or in-person preferences

### 3. University Admin Dashboard

The admin dashboard shows anonymous student demand data. Admins can use this information to understand which courses, professors, and time slots are most requested.

Example admin insights:

- How many students want a specific course
- Which professors are most requested
- Which time slots students prefer
- Which courses may need more sections
- Which times have the most student conflicts

---

## Current Features

- Modern ScheduleAI landing page
- University selection concept
- Student scheduling chatbot concept
- Admin login concept
- Responsive UI using Tailwind CSS
- Next.js App Router setup
- TypeScript support
- Reusable component structure
- Starter UI for future development

---

## Planned Features

- AI-powered chatbot for collecting student schedule preferences
- Student information form with name, university email, and university ID
- Course preference collection
- Professor preference collection
- Preferred time and unavailable time tracking
- Anonymous admin dashboard for schedule demand insights
- Professor search feature
- Professor feedback and rating system
- Course demand analytics
- University-specific dashboards
- User authentication
- Saved student preference history
- Google Calendar or timetable sync
- Exportable reports for university admins

---

## Professor Search and Feedback System

ScheduleAI will also include a professor search and feedback system. Students will be able to search for a professor by name and view information about the professor, including ratings, difficulty, course experience, and student feedback.

In future versions, students will also be able to submit feedback about professors after taking a course. This feedback can help future students make better decisions and help the system recommend better professor and course options.

Possible feedback fields include:

- Overall professor rating
- Course difficulty
- Teaching clarity
- Workload
- Attendance strictness
- Would take again
- Written feedback

---

## Example Chatbot Flow

Example student conversation:

```text
Bot: Welcome to ScheduleAI. What courses are you planning to take next semester?

Student: I want to take CSIT 230, CSIT 313, and STAT 230.

Bot: Do you have any preferred professors?

Student: I want Professor Brown for CSIT 313.

Bot: What times work best for you?

Student: Afternoon or evening. I work in the morning.

Bot: Got it. I saved your preferences.
