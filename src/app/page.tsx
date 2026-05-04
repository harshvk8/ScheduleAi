import FeatureCard from '@/components/FeatureCard';
import SchedulerDemo from '@/components/SchedulerDemo';

const features = [
  {
    title: 'Smart schedule generation',
    description: 'Build a conflict-free weekly plan from classes, work, commute, and personal routines.',
  },
  {
    title: 'AI chat edits',
    description: 'Adjust plans naturally using commands like “Move my study time to evening.”',
  },
  {
    title: 'Mood-aware scheduling',
    description: 'Daily check-ins let the assistant make lighter or deeper days based on how you feel.',
  },
  {
    title: 'Export and share',
    description: 'Download schedules, export to calendar formats, and keep productivity insights in one place.',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-midnight text-white">
      <div className="relative overflow-hidden py-24 px-6 sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-sky/25 to-transparent blur-3xl" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-[1.2fr_0.8fr] items-center">
            <section className="space-y-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky/30 bg-slate-900/80 px-4 py-2 text-sm text-sky">
                AI productivity for students
              </span>
              <div className="space-y-6">
                <h1 className="text-5xl font-black tracking-tight sm:text-6xl">ScheduleAI helps students plan smarter, not harder.</h1>
                <p className="max-w-xl text-lg leading-8 text-slate-300">
                  Capture class times, work hours, commute, routines, and mood. Then let AI generate a balanced, conflict-free schedule you can tweak with chat.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <a href="#features" className="inline-flex items-center justify-center rounded-2xl bg-sky px-6 py-4 text-sm font-semibold text-midnight transition hover:bg-sky/90">
                  See the experience
                </a>
                <a href="#signup" className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-6 py-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500">
                  Start planning
                </a>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 shadow-glow backdrop-blur-xl">
              <div className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <p className="text-xs uppercase tracking-[0.32em] text-sky">Demo scheduler</p>
                <h2 className="mt-4 text-2xl font-bold">Next-gen student planner</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Use the wizard to enter your classes, availability, and study goals. Then ask the assistant to make changes for any day.
                </p>
              </div>
              <div className="space-y-5">
                <div className="rounded-3xl bg-slate-900 p-5 text-slate-200">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Today</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <p>9:00 AM — CS lectures</p>
                    <p>12:30 PM — Work shift</p>
                    <p>4:00 PM — Study block (evening)</p>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">Try queries like:</p>
                  <ul className="mt-3 space-y-2 list-disc pl-5">
                    <li>“I have a meeting, move study later.”</li>
                    <li>“I’m tired today, make it lighter.”</li>
                    <li>“Add a commute buffer before class.”</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <SchedulerDemo />

          <section id="features" className="mt-24 grid gap-6 lg:grid-cols-2">
            {features.map((feature) => (
              <FeatureCard key={feature.title} title={feature.title} description={feature.description} />
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
