'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type Phase = 'idle' | 'closing' | 'covered' | 'opening';

const SWEEP_MS = 420;
const COVERED_TIMEOUT_MS = 4000;
// Floor on how long the cover stays fully shut, so the letter-drop label
// always has room to finish its animation even on fast client-side navs.
const MIN_COVERED_MS = 620;

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/admin': 'Admin',
  '/admin/dashboard': 'Dashboard',
  '/professors': 'Professors',
  '/feedback': 'Feedback',
  '/normal-user': 'Scheduler',
  '/student': 'Student',
  '/student/info': 'Student Setup',
  '/student/chatbot': 'Assistant',
};

function labelForPath(path: string): string {
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return 'ScheduleAI';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const [label, setLabel] = useState('');
  const pendingHref = useRef<string | null>(null);
  const prevPathname = useRef(pathname);
  const coveredAt = useRef(0);
  const routeReady = useRef(false);

  const revealWhenReady = useCallback(() => {
    if (!routeReady.current) return;
    const remaining = Math.max(0, MIN_COVERED_MS - (Date.now() - coveredAt.current));
    setTimeout(() => setPhase((p) => (p === 'covered' ? 'opening' : p)), remaining);
  }, []);

  // The destination route has actually mounted behind the cover.
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      routeReady.current = true;
      revealWhenReady();
    }
  }, [pathname, revealWhenReady]);

  // Drive the phase machine on fixed timers matched to the CSS animation
  // duration, rather than relying on animationend (more resilient).
  useEffect(() => {
    if (phase === 'closing') {
      const t = setTimeout(() => {
        if (pendingHref.current) {
          router.push(pendingHref.current);
          pendingHref.current = null;
        }
        routeReady.current = false;
        coveredAt.current = Date.now();
        setPhase('covered');
      }, SWEEP_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'covered') {
      revealWhenReady(); // in case the route already changed synchronously
      const t = setTimeout(() => setPhase('opening'), COVERED_TIMEOUT_MS); // stall safety net
      return () => clearTimeout(t);
    }
    if (phase === 'opening') {
      const t = setTimeout(() => setPhase('idle'), SWEEP_MS);
      return () => clearTimeout(t);
    }
  }, [phase, router, revealWhenReady]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (prefersReducedMotion()) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      if (phase !== 'idle') return;

      pendingHref.current = url.pathname + url.search + url.hash;
      setLabel(labelForPath(url.pathname));
      setPhase('closing');
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [phase]);

  if (phase === 'idle') return null;

  const phaseClass =
    phase === 'closing' ? 'page-sweep-closing' :
    phase === 'covered' ? 'page-sweep-covered' :
    'page-sweep-opening';

  return (
    <div className={`page-sweep ${phaseClass}`} aria-hidden>
      {phase === 'covered' && (
        <span className="page-sweep-label">
          {label.split('').map((ch, i) => (
            <span key={i} className="page-sweep-letter" style={{ animationDelay: `${i * 34}ms` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
