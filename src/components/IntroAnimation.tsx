'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const SEEN_KEY = 'scheduleai-intro-seen';

// ── Snapshot current time once (intro clock is frozen) ────────────────────────
function snapTime() {
  const d = new Date();
  const h = d.getHours() % 12;
  const m = d.getMinutes();
  const s = d.getSeconds();
  return { h: h * 30 + m * 0.5, m: m * 6 + s * 0.1, s: s * 6 };
}

// ── 6 life-moment cards ───────────────────────────────────────────────────────
const MOMENTS = [
  { emoji: '👨‍👩‍👧‍👦', label: 'Family Time', accent: '#f59e0b', bg: 'linear-gradient(145deg,#78350f,#92400e)', side: 'left',  yPct: 20, slideAt: 700,  zoomAt: 1750 },
  { emoji: '🏃‍♂️',   label: 'Outdoors',    accent: '#4ade80', bg: 'linear-gradient(145deg,#14532d,#166534)', side: 'right', yPct: 20, slideAt: 950,  zoomAt: 2000 },
  { emoji: '💪',    label: 'Gym',         accent: '#a78bfa', bg: 'linear-gradient(145deg,#3b0764,#4c1d95)', side: 'left',  yPct: 48, slideAt: 1150, zoomAt: 2200 },
  { emoji: '📚',    label: 'Studying',    accent: '#60a5fa', bg: 'linear-gradient(145deg,#1e3a5f,#1d4ed8)', side: 'right', yPct: 48, slideAt: 1350, zoomAt: 2400 },
  { emoji: '🎂',    label: 'Birthday',    accent: '#f472b6', bg: 'linear-gradient(145deg,#831843,#9d174d)', side: 'left',  yPct: 74, slideAt: 1550, zoomAt: 2600 },
  { emoji: '🎮',    label: 'Gaming',      accent: '#38bdf8', bg: 'linear-gradient(145deg,#0c4a6e,#075985)', side: 'right', yPct: 74, slideAt: 1700, zoomAt: 2800 },
] as const;

// ── Assembling + spinning clock ───────────────────────────────────────────────
function AssemblingClock() {
  const [ang] = useState(snapTime);

  const cx = 200, cy = 200, R = 178;
  const hourLen    = R * 0.50;
  const minuteLen  = R * 0.75;
  const secondLen  = R * 0.88;
  const secondTail = R * 0.12;

  const outerC = +(2 * Math.PI * 192).toFixed(1);
  const innerC = +(2 * Math.PI * 180).toFixed(1);
  const scanR  = 190;
  const scanC  = +(2 * Math.PI * scanR).toFixed(1);
  const arcLen = +(scanC * (45 / 360)).toFixed(1);
  const arcGap = +(scanC - arcLen).toFixed(1);

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const rad  = (i * 6 * Math.PI) / 180;
    const sin  = Math.sin(rad), cos = Math.cos(rad);
    const isCardinal = i % 15 === 0;
    const isHour     = i % 5  === 0;
    const outer = 177;
    const inner = isCardinal ? 160 : isHour ? 169 : 173;
    const sw    = isCardinal ? 1.2 : isHour ? 1   : 0.5;
    const col   = isCardinal ? '#38bdf8' : isHour ? '#475569' : '#1e293b';
    return (
      <line key={i}
        x1={cx + outer * sin} y1={cy - outer * cos}
        x2={cx + inner * sin} y2={cy - inner * cos}
        stroke={col} strokeWidth={sw}
        style={{ opacity: 0, animation: `tickIn .18s ease-out ${420 + i * 9}ms both` }}
      />
    );
  });

  const labels = Array.from({ length: 12 }, (_, i) => ({
    v:  String(i === 0 ? 12 : i),
    x:  cx + 145 * Math.sin((i * 30 * Math.PI) / 180),
    y:  cy - 145 * Math.cos((i * 30 * Math.PI) / 180),
    dl: 940 + i * 52,
  }));

  return (
    <svg width="360" height="360" viewBox="0 0 400 400" style={{ overflow: 'visible' }}>
      <defs>
        <style>{`
          @keyframes ringDraw  { 0%{stroke-dashoffset:1300;opacity:0} 4%{opacity:1} 100%{stroke-dashoffset:0;opacity:1} }
          @keyframes scanSpin  { 0%{transform:rotate(-90deg);opacity:0} 8%{opacity:1} 88%{opacity:1} 100%{transform:rotate(270deg);opacity:0} }
          @keyframes tickIn    { from{opacity:0} to{opacity:1} }
          @keyframes numIn     { 0%{opacity:0;filter:blur(8px)} 40%{filter:blur(2px)} 100%{opacity:1;filter:blur(0)} }
          @keyframes handsIn   { from{opacity:0} to{opacity:1} }
          @keyframes bracketDraw { from{stroke-dashoffset:64} to{stroke-dashoffset:0} }
          @keyframes pinPulse  { 0%{r:3;opacity:1} 100%{r:18;opacity:0} }
          @keyframes glowLoop  { 0%,100%{opacity:.10} 50%{opacity:.22} }
          @keyframes faceSpin  { from{transform:rotate(0deg)} to{transform:rotate(720deg)} }
        `}</style>
        <radialGradient id="ig" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#38bdf8" stopOpacity=".14" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0"   />
        </radialGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx={cx} cy={cy} r={210} fill="url(#ig)"
        style={{ animation: 'glowLoop 2.4s ease-in-out 2s infinite' }} />

      {/* Corner brackets */}
      {['M14 50 L14 14 L50 14','M386 50 L386 14 L350 14','M14 350 L14 386 L50 386','M386 350 L386 386 L350 386'].map((d,i)=>(
        <path key={i} d={d} fill="none" stroke="#38bdf8" strokeWidth={1.2} opacity={.5}
          strokeLinecap="round" strokeDasharray={64}
          style={{ strokeDashoffset:64, animation:`bracketDraw .5s cubic-bezier(.4,0,.2,1) ${80+i*55}ms forwards` }}
        />
      ))}

      {/* ── Face group: assembles then SPINS starting at 1750ms ── */}
      <g style={{ transformOrigin:`${cx}px ${cy}px`, animation:'faceSpin 2.6s cubic-bezier(.4,0,.05,1) 1750ms forwards' }}>
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={192} fill="none" stroke="#1e3a5f" strokeWidth={1}
          strokeDasharray={outerC}
          style={{ strokeDashoffset:outerC, animation:'ringDraw 1.1s cubic-bezier(.4,0,.2,1) 80ms both' }}
        />
        {/* Inner ring */}
        <circle cx={cx} cy={cy} r={180} fill="none" stroke="#0f2744" strokeWidth={1}
          strokeDasharray={innerC}
          style={{ strokeDashoffset:innerC, animation:'ringDraw .9s cubic-bezier(.4,0,.2,1) 200ms both' }}
        />
        {/* Inner grid */}
        {[148,112,76].map(r=>(
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#38bdf8" strokeWidth={.5}
            strokeDasharray="1.5 9" style={{ opacity:0, animation:'tickIn .4s ease-out 700ms both' }}
          />
        ))}
        {/* Scan arc */}
        <circle cx={cx} cy={cy} r={scanR} fill="none" stroke="#38bdf8" strokeWidth={1.5}
          strokeDasharray={`${arcLen} ${arcGap}`}
          style={{ transformOrigin:`${cx}px ${cy}px`, animation:'scanSpin 1.35s cubic-bezier(.4,0,.2,1) 280ms forwards' }}
        />
        {/* 12-o'clock mark */}
        <line x1={cx-8} y1={cy-192} x2={cx+8} y2={cy-192} stroke="#38bdf8" strokeWidth={1.5}
          style={{ opacity:0, animation:'handsIn .3s ease-out 750ms both' }}
        />
        {/* Ticks */}
        {ticks}
        {/* Numbers */}
        {labels.map(({v,x,y,dl})=>(
          <text key={v} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={11} fontFamily="ui-sans-serif, system-ui, sans-serif"
            style={{ opacity:0, animation:`numIn .45s ease-out ${dl}ms both` }}
          >{v}</text>
        ))}
      </g>

      {/* ── Hands: NOT in the spinning face group ── */}
      <g style={{ opacity:0, animation:'handsIn .55s ease-out 1580ms both' }}>
        <polygon
          points={`${cx-1.5},${cy+6} ${cx+1.5},${cy+6} ${cx+.75},${cy-hourLen} ${cx-.75},${cy-hourLen}`}
          fill="white" transform={`rotate(${ang.h},${cx},${cy})`}
        />
        <polygon
          points={`${cx-1.25},${cy+6} ${cx+1.25},${cy+6} ${cx+.5},${cy-minuteLen} ${cx-.5},${cy-minuteLen}`}
          fill="white" transform={`rotate(${ang.m},${cx},${cy})`}
        />
        <g transform={`rotate(${ang.s},${cx},${cy})`}>
          <line x1={cx} y1={cy+secondTail} x2={cx} y2={cy-secondLen} stroke="#38bdf8" strokeWidth={1} />
          <circle cx={cx} cy={cy-secondLen*.7} r={2} fill="none" stroke="#38bdf8" strokeWidth={1} />
          <circle cx={cx} cy={cy+secondTail}   r={2.5} fill="#38bdf8" />
        </g>
        <circle cx={cx} cy={cy} r={4}   fill="none" stroke="#94a3b8" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={1.5} fill="#030712" />
      </g>

      {/* Center pulse on hand reveal */}
      <circle cx={cx} cy={cy} r={3} fill="none" stroke="#38bdf8" strokeWidth={1.5}
        style={{ opacity:0, animation:'pinPulse .9s ease-out 1580ms both' }}
      />
    </svg>
  );
}

// ── Photo moment card ─────────────────────────────────────────────────────────
interface MomentCard {
  emoji: string;
  label: string;
  accent: string;
  bg: string;
  side: 'left' | 'right';
  yPct: number;
  slideAt: number;
  zoomAt: number;
}

function PhotoCard({ emoji, label, accent, bg, side, yPct, slideAt, zoomAt }: MomentCard) {
  // Distance from this card's resting position to the viewport center — the
  // zoom animation rides this vector so the card actually flies toward the
  // clock instead of just scaling up in place.
  const tx = side === 'left' ? 'calc(47.5vw - 59px)' : 'calc(-47.5vw + 59px)';
  const ty = `calc(${50 - yPct}vh)`;

  return (
    // OUTER wrapper: slides in from the side
    <div
      style={{
        position: 'absolute',
        [side]: '2.5vw',
        top: `${yPct}%`,
        transform: 'translateY(-50%)',
        animation: `${side === 'left' ? 'cardSlideL' : 'cardSlideR'} 500ms cubic-bezier(.16,1,.3,1) ${slideAt}ms both`,
        zIndex: 10,
      }}
    >
      {/* INNER: converges into the clock's center when absorbed */}
      <div
        style={{
          '--tx': tx,
          '--ty': ty,
          animation: `cardZoom 550ms cubic-bezier(.4,0,.6,1) ${zoomAt}ms both`,
        } as React.CSSProperties}
      >
        {/* Card shell — Polaroid-esque */}
        <div
          style={{
            width:  118,
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: `0 0 0 1px rgba(255,255,255,.08), 0 8px 32px rgba(0,0,0,.5), 0 0 20px ${accent}22`,
            background: '#0a0a0f',
          }}
        >
          {/* Photo area — gradient with emoji */}
          <div
            style={{
              height: 84,
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              position: 'relative',
            }}
          >
            {emoji}
            {/* subtle inner vignette */}
            <div style={{
              position:'absolute', inset:0,
              background:'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.35) 100%)',
            }} />
          </div>
          {/* Caption strip */}
          <div
            style={{
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <span style={{
              fontSize: 8.5, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#94a3b8',
            }}>
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function IntroAnimation({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setExiting(true);
    setTimeout(onDone, 700);
  }, [onDone]);

  // Skip entirely for repeat visits (same tab session) and for
  // prefers-reduced-motion — runs before paint so there's no flash.
  useLayoutEffect(() => {
    const seenBefore = sessionStorage.getItem(SEEN_KEY) === '1';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (seenBefore || reduceMotion) {
      finishedRef.current = true;
      onDone();
      return;
    }
    sessionStorage.setItem(SEEN_KEY, '1');
  }, [onDone]);

  useEffect(() => {
    if (finishedRef.current) return;
    const t = setTimeout(finish, 3700);
    return () => clearTimeout(t);
  }, [finish]);

  // Click or press any key to skip straight to the page.
  useEffect(() => {
    window.addEventListener('keydown', finish);
    return () => window.removeEventListener('keydown', finish);
  }, [finish]);

  return (
    <>
      <style>{`
        @keyframes cardSlideL { from{opacity:0;transform:translateX(-130%)} to{opacity:1;transform:translateX(0)} }
        @keyframes cardSlideR { from{opacity:0;transform:translateX(130%)}  to{opacity:1;transform:translateX(0)} }
        @keyframes cardZoom   {
          0%   { opacity:1;   transform:translate(0,0) scale(1);   filter:blur(0px) brightness(1); }
          55%  { opacity:0.6; transform:translate(calc(var(--tx) * .55), calc(var(--ty) * .55)) scale(2.4); filter:blur(1px) brightness(1.6); }
          100% { opacity:0;   transform:translate(var(--tx), var(--ty)) scale(5); filter:blur(8px) brightness(3); }
        }
        @keyframes statusReveal { from{opacity:0;letter-spacing:.55em} to{opacity:1;letter-spacing:.38em} }
        @keyframes statusLine   { from{transform:scaleX(0)} to{transform:scaleX(1)} }
      `}</style>

      <div
        onClick={finish}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden cursor-pointer"
        style={{
          background: 'radial-gradient(ellipse at 50% 42%, #0b1a2e 0%, #030712 65%)',
          opacity:    exiting ? 0 : 1,
          transition: 'opacity 680ms cubic-bezier(.4,0,.2,1)',
          pointerEvents: exiting ? 'none' : 'auto',
        }}
      >
        {/* Dot-grid backdrop */}
        <svg className="absolute inset-0 w-full h-full" aria-hidden>
          <defs>
            <pattern id="dg" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#38bdf8" opacity=".06" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dg)" />
        </svg>

        {/* ── Life-moment photo cards ── */}
        {MOMENTS.map((m) => (
          <PhotoCard key={m.label} {...m} />
        ))}

        {/* ── Clock: assembles, then face spins ── */}
        <div
          className={exiting
            ? 'scale-[.72] translate-x-[34%] -translate-y-[2%]'
            : 'scale-[.6] sm:scale-[.8] md:scale-100 lg:scale-125 xl:scale-[1.75]'
          }
          style={{
            transitionProperty: 'transform',
            transitionDuration: '700ms',
            transitionTimingFunction: 'cubic-bezier(.25,1,.5,1)',
            position: 'relative',
            zIndex: 5,
          }}
        >
          <AssemblingClock />
        </div>

        {/* ── Status strip (after all photos absorbed) ── */}
        <div
          className="absolute flex items-center gap-3 pointer-events-none bottom-[calc(50%-58px)] sm:bottom-[calc(50%-94px)] md:bottom-[calc(50%-130px)] lg:bottom-[calc(50%-175px)] xl:bottom-[calc(50%-265px)]"
        >
          <div className="h-px w-14 bg-sky-400/35 origin-right"
            style={{ animation: 'statusLine .5s ease-out 3100ms both' }} />
          <p className="text-[8.5px] font-mono text-sky-400/65 uppercase tracking-[.38em]"
            style={{ animation: 'statusReveal .5s ease-out 3100ms both', opacity: 0 }}>
            SYSTEM ONLINE
          </p>
          <div className="h-px w-14 bg-sky-400/35 origin-left"
            style={{ animation: 'statusLine .5s ease-out 3100ms both' }} />
        </div>

        {/* ── Skip hint ── */}
        <p
          className="absolute bottom-8 text-[9px] font-mono text-slate-500/50 uppercase tracking-[.3em] pointer-events-none"
          style={{ animation: 'statusReveal .5s ease-out 1000ms both', opacity: 0 }}
        >
          click or press any key to skip
        </p>
      </div>
    </>
  );
}
