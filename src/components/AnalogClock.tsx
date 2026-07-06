'use client';

import { useEffect, useState } from 'react';

type T = { h: number; m: number; s: number; ms: number; date: Date; tz: string };

function now(): T {
  const d = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { h: d.getHours() % 12, m: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(), date: d, tz };
}

export default function AnalogClock({ introSpin }: { introSpin?: boolean } = {}) {
  const [t, setT] = useState<T | null>(null);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    setIsDark(html.classList.contains('dark'));
    const observer = new MutationObserver(() => setIsDark(html.classList.contains('dark')));
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let raf: number;
    const tick = () => { setT(now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!t) return <div style={{ width: 360, height: 440 }} />;

  const { h, m, s, ms, date, tz } = t;
  const secF = s + ms / 1000;

  const hourAngle   = h * 30 + m * 0.5;
  const minuteAngle = m * 6  + secF * 0.1;
  const secondAngle = secF * 6;

  const cx = 200, cy = 200;
  const R  = 178;

  const hourLen    = R * 0.50;
  const minuteLen  = R * 0.75;
  const secondLen  = R * 0.88;
  const secondTail = R * 0.12;

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const rad = (i * 6 * Math.PI) / 180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    const isCardinal = i % 15 === 0;
    const isHour     = i % 5  === 0;
    const outerR = 177;
    let innerR: number, sw: number, stroke: string;
    if (isCardinal) {
      innerR = 160; sw = 1.2; stroke = isDark ? '#cbd5e1' : '#64748b';
    } else if (isHour) {
      innerR = 169; sw = 1;   stroke = isDark ? '#64748b' : '#475569';
    } else {
      innerR = 173; sw = 0.5; stroke = isDark ? '#1e293b' : '#94a3b8';
    }
    return (
      <line
        key={i}
        x1={cx + outerR * sin} y1={cy - outerR * cos}
        x2={cx + innerR * sin} y2={cy - innerR * cos}
        stroke={stroke} strokeWidth={sw}
      />
    );
  });

  const hourLabels = Array.from({ length: 12 }, (_, i) => {
    const label = i === 0 ? 12 : i;
    const rad = (i * 30 * Math.PI) / 180;
    return {
      v: String(label),
      x: cx + 145 * Math.sin(rad),
      y: cy - 145 * Math.cos(rad),
    };
  });

  return (
    <div className="flex flex-col items-center select-none">
      <svg width="360" height="360" viewBox="0 0 400 400">
        {introSpin && (
          <defs>
            <style>{`
              @keyframes faceSpin {
                0%   { transform: rotate(0deg); }
                100% { transform: rotate(720deg); }
              }
              .clock-face-intro {
                transform-origin: 200px 200px;
                animation: faceSpin 2s cubic-bezier(0.15, 0, 0.05, 1) forwards;
              }
            `}</style>
          </defs>
        )}

        {/* Face group — spins during intro, hands are outside */}
        <g className={introSpin ? 'clock-face-intro' : ''}>
          <circle cx={cx} cy={cy} r={192} fill="none" stroke="#334155" strokeWidth={1} className="animate-breathe" />
          <circle cx={cx} cy={cy} r={180} fill="none" stroke="#1e293b" strokeWidth={1} />

          {[148, 112, 76].map(r => (
            <circle
              key={r} cx={cx} cy={cy} r={r}
              fill="none" stroke="#64748b" strokeWidth={0.5}
              strokeDasharray="1.5 9" opacity={0.06}
            />
          ))}

          {ticks}

          {hourLabels.map(({ v, x, y }) => (
            <text
              key={v} x={x} y={y}
              textAnchor="middle" dominantBaseline="middle"
              fill={isDark ? 'white' : 'black'}
              fontSize={11}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="400"
            >
              {v}
            </text>
          ))}

          <line
            x1={cx - 7} y1={cy - 192}
            x2={cx + 7} y2={cy - 192}
            stroke="#38bdf8" strokeWidth={1.5}
          />
        </g>

        {/* Hands — never rotate with the face */}
        <polygon
          points={`${cx-1.5},${cy+6} ${cx+1.5},${cy+6} ${cx+0.75},${cy-hourLen} ${cx-0.75},${cy-hourLen}`}
          fill={isDark ? 'white' : '#1e293b'}
          transform={`rotate(${hourAngle}, ${cx}, ${cy})`}
        />
        <polygon
          points={`${cx-1.25},${cy+6} ${cx+1.25},${cy+6} ${cx+0.5},${cy-minuteLen} ${cx-0.5},${cy-minuteLen}`}
          fill={isDark ? 'white' : '#1e293b'}
          transform={`rotate(${minuteAngle}, ${cx}, ${cy})`}
        />
        <g transform={`rotate(${secondAngle}, ${cx}, ${cy})`}>
          <line x1={cx} y1={cy + secondTail} x2={cx} y2={cy - secondLen} stroke="#38bdf8" strokeWidth={1} />
          <circle cx={cx} cy={cy - secondLen * 0.7} r={2} fill="none" stroke="#38bdf8" strokeWidth={1} />
          <circle cx={cx} cy={cy + secondTail} r={2.5} fill="#38bdf8" />
        </g>

        {/* Center pin */}
        <circle cx={cx} cy={cy} r={4}   fill="none" stroke={isDark ? '#cbd5e1' : '#475569'} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={1.5} fill={isDark ? 'black' : '#1e293b'} />
      </svg>

      <div className="mt-1 text-center">
        <p
          className="text-[56px] font-bold leading-none tracking-widest tabular-nums text-slate-900 dark:text-white"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          {hh}:{mm}:{ss}
        </p>
        <p className="text-slate-500 text-sm mt-2 tracking-wider">{dateStr}</p>
        <p className="text-slate-600 text-[11px] mt-1 tracking-wide" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {tz}&nbsp;·&nbsp;detected from your browser
        </p>
      </div>
    </div>
  );
}
