'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY_THEME = 'theme';
const STORAGE_KEY_POS = 'theme-toggle-pos';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [pos, setPos] = useState({ x: -1, y: -1 }); // -1 = not yet loaded
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Load theme + saved position
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    const dark = stored !== 'light';
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);

    const savedPos = localStorage.getItem(STORAGE_KEY_POS);
    if (savedPos) {
      try {
        const { x, y } = JSON.parse(savedPos);
        const maxX = window.innerWidth - 48;
        const maxY = window.innerHeight - 48;
        setPos({ x: Math.min(x, maxX), y: Math.min(y, maxY) });
        return;
      } catch { /* ignore */ }
    }
    setPos({ x: window.innerWidth - 68, y: window.innerHeight - 68 });
  }, []);

  const toggle = () => {
    if (dragging) return;
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(STORAGE_KEY_THEME, next ? 'dark' : 'light');
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    btnRef.current?.setPointerCapture(e.pointerId);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!btnRef.current?.hasPointerCapture(e.pointerId)) return;
    setDragging(true);
    const x = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - 48));
    const y = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 48));
    setPos({ x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!btnRef.current?.hasPointerCapture(e.pointerId)) return;
    btnRef.current.releasePointerCapture(e.pointerId);
    if (dragging) {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));
      setDragging(false);
    }
  };

  if (pos.x === -1) return null;

  return (
    <button
      ref={btnRef}
      onClick={toggle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Toggle theme"
      style={{ left: pos.x, top: pos.y }}
      className={`fixed z-50 w-10 h-10 rounded-full border flex items-center justify-center shadow-md select-none
        bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900
        dark:bg-slate-800 dark:border-white/10 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white
        ${dragging ? 'cursor-grabbing scale-110 shadow-lg' : 'cursor-grab transition-shadow duration-200'}`}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
