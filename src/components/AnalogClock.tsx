'use client';

import { useEffect, useState } from 'react';

type T = { h: number; m: number; s: number; ms: number; date: Date; tz: string };

function now(): T {
  const d = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { h: d.getHours() % 12, m: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(), date: d, tz };
}

export default function AnalogClock() {
  const [t, setT] = useState<T | null>(null);

  useEffect(() => {
    let raf: number;
    const tick = () => { setT(now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!t) return <div style={{ width: 360, height: 440 }} />;

  const { h, m, s, ms, date, tz } = t;
  const secF = s + ms / 1000;

  // Hand angles: 0° = 12 o'clock, clockwise
  const hourAngle   = h * 30 + m * 0.5;
  const minuteAngle = m * 6  + secF * 0.1;
  const secondAngle = secF * 6;

  const cx = 200, cy = 200;
  const R  = 178; // reference radius (inner ring)

  const hourLen   = R * 0.50;  // 89
  const minuteLen = R * 0.75;  // 133.5
  const secondLen = R * 0.88;  // ~156.6
  const secondTail = R * 0.12; // ~21.4

  // Digital display (24-hour)
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;

  // 60 tick marks: 12 hour + 48 minute
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const rad = (i * 6 * Math.PI) / 180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    const isCardinal = i % 15 === 0;
    const isHour     = i % 5  === 0;
    // All marks start just inside the inner ring (R=178)
    const outerR = 177;
    let innerR: number, sw: number, stroke: string;
    if (isCardinal) {
      innerR = 160; sw = 1.2; stroke = '#cbd5e1'; // slate-300
    } else if (isHour) {
      innerR = 169; sw = 1;   stroke = '#64748b'; // slate-500
    } else {
      innerR = 173; sw = 0.5; stroke = '#1e293b'; // slate-800
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

  // Cardinal labels (00, 15, 30, 45) inside the face near tick ends
  const labels = [
    { v: '00', x: cx,       y: cy - 150 },
    { v: '15', x: cx + 150, y: cy       },
    { v: '30', x: cx,       y: cy + 150 },
    { v: '45', x: cx - 150, y: cy       },
  ];

  return (
    <div className="flex flex-col items-center select-none">
      <svg width="360" height="360" viewBox="0 0 400 400">
        {/* Outer ring: slate-700, 1px */}
        <circle cx={cx} cy={cy} r={192} fill="none" stroke="#334155" strokeWidth={1} />
        {/* Inner ring: slate-800, 1px — 12px gap from outer */}
        <circle cx={cx} cy={cy} r={180} fill="none" stroke="#1e293b" strokeWidth={1} />

        {/* Dotted circular grid — instrument readout, 6% opacity */}
        {[148, 112, 76].map(r => (
          <circle
            key={r} cx={cx} cy={cy} r={r}
            fill="none" stroke="#64748b" strokeWidth={0.5}
            strokeDasharray="1.5 9" opacity={0.06}
          />
        ))}

        {/* Tick marks */}
        {ticks}

        {/* Cardinal labels: 9px Geist Mono, slate-500, ~13% opacity */}
        {labels.map(({ v, x, y }) => (
          <text
            key={v} x={x} y={y}
            textAnchor="middle" dominantBaseline="middle"
            fill="#64748b" fontSize={9}
            fontFamily="'Geist Mono', 'JetBrains Mono', ui-monospace, monospace"
            letterSpacing="0.08em"
            opacity={0.13}
          >
            {v}
          </text>
        ))}

        {/* Sky-400 index mark at 12 — horizontal crosshair on outer ring */}
        <line
          x1={cx - 7} y1={cy - 192}
          x2={cx + 7} y2={cy - 192}
          stroke="#38bdf8" strokeWidth={1.5}
        />

        {/* Hour hand — tapered 3px base → 1.5px tip, white, flat ends */}
        <polygon
          points={`${cx-1.5},${cy+6} ${cx+1.5},${cy+6} ${cx+0.75},${cy-hourLen} ${cx-0.75},${cy-hourLen}`}
          fill="white"
          transform={`rotate(${hourAngle}, ${cx}, ${cy})`}
        />

        {/* Minute hand — tapered 2.5px base → 1px tip, white, flat ends */}
        <polygon
          points={`${cx-1.25},${cy+6} ${cx+1.25},${cy+6} ${cx+0.5},${cy-minuteLen} ${cx-0.5},${cy-minuteLen}`}
          fill="white"
          transform={`rotate(${minuteAngle}, ${cx}, ${cy})`}
        />

        {/* Second hand — 1px sky-400, with scope circle + counterweight tail */}
        <g transform={`rotate(${secondAngle}, ${cx}, ${cy})`}>
          {/* Shaft */}
          <line
            x1={cx} y1={cy + secondTail}
            x2={cx} y2={cy - secondLen}
            stroke="#38bdf8" strokeWidth={1}
          />
          {/* Scope circle at 70% — 4px diam, hollow */}
          <circle
            cx={cx} cy={cy - secondLen * 0.7}
            r={2} fill="none" stroke="#38bdf8" strokeWidth={1}
          />
          {/* Counterweight: solid sky-400 dot at tail end */}
          <circle cx={cx} cy={cy + secondTail} r={2.5} fill="#38bdf8" />
        </g>

        {/* Center pin — 8px outer ring slate-300, 3px inner dot black */}
        <circle cx={cx} cy={cy} r={4}   fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={1.5} fill="black" />
      </svg>

      {/* Digital readout */}
      <div className="mt-1 text-center">
        <p
          className="text-[56px] font-bold text-white leading-none tracking-widest tabular-nums"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          {hh}:{mm}:{ss}
        </p>
        <p className="text-slate-500 text-sm mt-2 tracking-wider">
          {dateStr}
        </p>
        <p className="text-slate-600 text-[11px] mt-1 tracking-wide" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {tz}&nbsp;·&nbsp;detected from your browser
        </p>
      </div>
    </div>
  );
}
