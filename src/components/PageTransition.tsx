'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type Phase = 'idle' | 'closing' | 'covered' | 'opening';

const SWEEP_MS = 420;
const COVERED_TIMEOUT_MS = 4000;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const pendingHref = useRef<string | null>(null);
  const prevPathname = useRef(pathname);

  // Reveal once the destination route has actually mounted behind the cover.
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      setPhase((p) => (p === 'covered' ? 'opening' : p));
    }
  }, [pathname]);

  // Drive the phase machine on fixed timers matched to the CSS animation
  // duration, rather than relying on animationend (more resilient).
  useEffect(() => {
    if (phase === 'closing') {
      const t = setTimeout(() => {
        if (pendingHref.current) {
          router.push(pendingHref.current);
          pendingHref.current = null;
        }
        setPhase('covered');
      }, SWEEP_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'covered') {
      // Safety net: if navigation stalls, don't stay covered forever.
      const t = setTimeout(() => setPhase('opening'), COVERED_TIMEOUT_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'opening') {
      const t = setTimeout(() => setPhase('idle'), SWEEP_MS);
      return () => clearTimeout(t);
    }
  }, [phase, router]);

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
      <span className="page-sweep-dot" />
    </div>
  );
}
