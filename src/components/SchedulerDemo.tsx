'use client';

import { useMemo, useState } from 'react';

type ScheduleItem = {
  time: string;
  title: string;
  description: string;
  category: 'Class' | 'Work' | 'Study' | 'Routine' | 'Free';
};

type Answers = {
  name: string;
  classes: string;
  work: string;
  commute: string;
  study: string;
  routine: string;
  mood: string;
};

const steps: Array<{ key: keyof Answers; title: string; prompt: string; placeholder: string }> = [
  { key: 'name', title: 'Welcome', prompt: 'What is your first name?', placeholder: 'Enter your first name' },
  { key: 'classes', title: 'Classes', prompt: 'List your main classes for the week.', placeholder: 'e.g. CSIT 111, ENG 201, Calc II' },
  { key: 'work', title: 'Work', prompt: 'What are your weekly work hours or shifts?', placeholder: 'e.g. Tue 1-5pm, Fri 10am-2pm' },
  { key: 'commute', title: 'Commute', prompt: 'How many minutes does your commute usually take?', placeholder: 'e.g. 25 minutes' },
  { key: 'study', title: 'Study goals', prompt: 'What are your study goals this week?', placeholder: 'e.g. review lectures, finish lab prep' },
  { key: 'routine', title: 'Routine', prompt: 'Any daily preferences or habits to keep?', placeholder: 'e.g. morning workouts, evening reading' },
  { key: 'mood', title: 'Mood check-in', prompt: 'How are you feeling today?', placeholder: 'e.g. energized, tired, balanced' },
];

const initialAnswers: Answers = {
  name: '',
  classes: '',
  work: '',
  commute: '',
  study: '',
  routine: '',
  mood: '',
};

const getDefaultSchedule = (answers: Answers): ScheduleItem[] => {
  const classItems = answers.classes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((item, index) => ({
      time: `${9 + index * 2}:00 AM`,
      title: item,
      description: 'Class session',
      category: 'Class' as const,
    }));

  const commuteText = answers.commute ? `Commute ${answers.commute}` : 'Commute buffer';
  const workItem = answers.work
    ? {
        time: '12:30 PM',
        title: 'Work shift',
        description: answers.work,
        category: 'Work' as const,
      }
    : null;

  const studyTime = /tired|low|slow|rest/i.test(answers.mood) ? '7:30 PM' : '5:30 PM';
  const studyItem = {
    time: studyTime,
    title: 'Study block',
    description: answers.study || 'Focused review session',
    category: 'Study' as const,
  };

  const routineItem = answers.routine
    ? {
        time: '8:30 PM',
        title: 'Routine check-in',
        description: answers.routine,
        category: 'Routine' as const,
      }
    : {
        time: '8:30 PM',
        title: 'Daily wrap-up',
        description: 'Review your day and plan tomorrow',
        category: 'Routine' as const,
      };

  return [
    ...classItems,
    workItem,
    { time: '11:00 AM', title: commuteText, description: 'Build in buffer time before campus.', category: 'Free' as const },
    studyItem,
    routineItem,
  ].filter(Boolean) as ScheduleItem[];
};

const adjustSchedule = (current: ScheduleItem[], command: string): { schedule: ScheduleItem[]; response: string } => {
  const lower = command.toLowerCase();
  let newSchedule = [...current];
  let response = 'I updated your schedule with a smoother flow for today.';

  if (/move.*study.*evening|study.*later|evening.*study/i.test(lower)) {
    newSchedule = newSchedule.map((item) =>
      item.category === 'Study'
        ? { ...item, time: '8:00 PM', description: 'Shifted to an easy evening study session' }
        : item,
    );
    response = 'Study time moved to the evening so your afternoon stays clear.';
  } else if (/work.*tomorrow|have work tomorrow/i.test(lower)) {
    newSchedule = newSchedule.map((item) =>
      item.category === 'Study'
        ? { ...item, time: '9:00 PM', description: 'Light review after work' }
        : item,
    );
    response = 'I shifted your study block later and kept your workday manageable for tomorrow.';
  } else if (/tired|light|easier|rest/i.test(lower)) {
    newSchedule = newSchedule.map((item) => {
      if (item.category === 'Study') {
        return { ...item, time: '8:30 PM', description: 'Shortened and lighter study session' };
      }
      if (item.category === 'Class') {
        return { ...item, description: `${item.description} (focus on attendance)` };
      }
      return item;
    });
    response = 'I made today lighter and kept the essential items intact.';
  } else if (/commute|drive|traffic|bus/i.test(lower)) {
    newSchedule = newSchedule.map((item) =>
      item.category === 'Free' ? { ...item, description: 'Additional commute buffer added' } : item,
    );
    response = 'Added a bigger commute buffer so your arrival stays stress-free.';
  } else {
    response = 'Great idea — I kept your schedule flexible and added a review block at the end of your day.';
    if (!newSchedule.some((item) => item.category === 'Routine')) {
      newSchedule.push({
        time: '9:30 PM',
        title: 'Evening review',
        description: 'Check how the day felt and adjust tomorrow.',
        category: 'Routine',
      });
    }
  }

  return { schedule: newSchedule, response };
};

export default function SchedulerDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'bot', text: 'Hi! I’m ScheduleAI — tell me a bit about your week so I can build a smarter routine.' },
  ] as { sender: 'bot' | 'user'; text: string }[]);

  const currentStep = steps[activeStep];

  const schedulePreview = useMemo(() => (hasGenerated ? schedule : getDefaultSchedule(answers)), [hasGenerated, schedule, answers]);

  const handleInputChange = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentStep.key]: value }));
  };

  const handleNext = () => {
    if (activeStep < steps.length - 1) {
      setActiveStep((step) => step + 1);
      setAnswers((prev) => ({ ...prev }));
      return;
    }
    const generatedSchedule = getDefaultSchedule(answers);
    setSchedule(generatedSchedule);
    setHasGenerated(true);
    setChatHistory((history) => [
      ...history,
      {
        sender: 'bot',
        text: `Great, ${answers.name || 'student'} — I created your first draft schedule. You can ask me to tweak it naturally in the chat below.`,
      },
    ]);
  };

  const handlePrev = () => {
    if (activeStep === 0) return;
    setActiveStep((step) => step - 1);
  };

  const handleChatSubmit = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const userMessage = { sender: 'user' as const, text: trimmed };
    const { schedule: updatedSchedule, response } = adjustSchedule(schedulePreview, trimmed);

    setSchedule(updatedSchedule);
    setHasGenerated(true);
    setChatHistory((history) => [...history, userMessage, { sender: 'bot', text: response }]);
    setChatInput('');
  };

  return (
    <section id="signup" className="mt-24 rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 shadow-glow backdrop-blur-xl">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-sky">Scheduler onboarding</p>
            <h2 className="mt-4 text-3xl font-bold">Build your week with a guided student planner.</h2>
            <p className="mt-3 text-slate-300">Enter your classes, work, commute, goals, and mood. The assistant will generate a balanced plan and let you adjust it with natural chat commands.</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Step {activeStep + 1} of {steps.length}</p>
            <h3 className="mt-3 text-xl font-semibold text-white">{currentStep.title}</h3>
            <p className="mt-2 text-slate-400">{currentStep.prompt}</p>
            <textarea
              value={answers[currentStep.key]}
              onChange={(event) => handleInputChange(event.target.value)}
              placeholder={currentStep.placeholder}
              className="mt-4 min-h-[140px] w-full rounded-3xl border border-slate-700 bg-slate-950 px-5 py-4 text-sm text-slate-100 outline-none transition focus:border-sky/60 focus:ring-2 focus:ring-sky/20"
            />
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={handleNext}
                className="inline-flex items-center justify-center rounded-2xl bg-sky px-6 py-3 text-sm font-semibold text-midnight transition hover:bg-sky/90"
              >
                {activeStep < steps.length - 1 ? 'Continue' : 'Generate schedule'}
              </button>
              <button
                onClick={handlePrev}
                disabled={activeStep === 0}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Input preview</p>
              <ul className="mt-4 space-y-3 text-slate-300 text-sm">
                <li><span className="font-semibold text-slate-100">Classes:</span> {answers.classes || 'Not entered'}</li>
                <li><span className="font-semibold text-slate-100">Work:</span> {answers.work || 'Not entered'}</li>
                <li><span className="font-semibold text-slate-100">Mood:</span> {answers.mood || 'Not entered'}</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Tip</p>
              <p className="mt-4 text-slate-300 text-sm">Use clear prompts like “Move my study time to evening” or “I have work tomorrow, lighten the day.” The assistant will keep the plan conflict-free and flexible.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/95 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Schedule preview</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Conflict-free plan</h3>
              </div>
              <span className="rounded-full bg-sky/10 px-3 py-1 text-xs font-semibold text-sky">{hasGenerated ? 'Draft created' : 'Draft preview'}</span>
            </div>
            <div className="mt-6 space-y-4">
              {schedulePreview.map((item) => (
                <div key={`${item.time}-${item.title}`} className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{item.time}</p>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">{item.category}</span>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold text-white">{item.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/95 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Live assistant</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Chat with ScheduleAI</h3>
            <div className="mt-6 space-y-3 rounded-3xl border border-slate-800 bg-slate-950 p-4">
              {chatHistory.map((entry, index) => (
                <div key={index} className={`rounded-3xl p-4 ${entry.sender === 'bot' ? 'bg-slate-900 text-slate-200' : 'bg-sky/10 text-slate-100 self-end'}`}>
                  <p className="text-sm leading-6">{entry.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleChatSubmit(); }}
                placeholder="Ask the assistant to adjust your day…"
                className="w-full rounded-3xl border border-slate-800 bg-slate-950 px-5 py-4 text-sm text-slate-100 outline-none focus:border-sky/50 focus:ring-2 focus:ring-sky/20"
              />
              <button
                onClick={handleChatSubmit}
                className="rounded-2xl bg-sky px-6 py-3 text-sm font-semibold text-midnight transition hover:bg-sky/90"
              >
                Send request
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
