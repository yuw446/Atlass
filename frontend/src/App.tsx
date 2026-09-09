import { lazy, Suspense, useEffect, useState } from 'react';
import './index.css';
import StoryPanel from './components/StoryPanel/StoryPanel';
import { useGlobeStore } from './store/globeStore';
import { useSnapshot } from './lib/useSnapshot.ts';
import { useGlobeData } from './components/Globe/useGlobeData';
import { ageMinutes } from './lib/snapshotState.ts';
import { tickClock, agePhrase, formatInt } from './lib/text.ts';
import { LENSES } from '../../shared/lenses.ts';

// The globe (Three.js, ~550 KB gzipped) loads in its own chunk; the header and legend paint first.
const GlobeContainer = lazy(() => import('./components/Globe/GlobeContainer'));

const MONO = "'Space Mono', monospace";
const AMBER = '#F0A340';

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return (
    <div className="hide-mobile" style={{ position: 'absolute', top: 24, right: 28, zIndex: 10, fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', color: 'rgba(232,236,244,0.45)', userSelect: 'none', pointerEvents: 'none', textAlign: 'right', lineHeight: 1.6 }}>
      <div>{pad(now.getUTCDate())} {MONTHS[now.getUTCMonth()]} {now.getUTCFullYear()}</div>
      <div style={{ fontSize: 14, color: 'rgba(232,236,244,0.65)', letterSpacing: '0.18em' }}>
        {pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())} <span style={{ fontSize: 9, opacity: 0.6 }}>UTC</span>
      </div>
    </div>
  );
}

function FeedStatus() {
  const snap = useGlobeStore(s => s.snap);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const s = snap.snapshot;
  const age = s ? ageMinutes(s, now) : 0;
  const warn = snap.status === 'stale' || snap.status === 'error' || snap.status === 'nodata';
  let line: string;
  if (snap.status === 'loading') line = 'loading feed…';
  else if (snap.status === 'nodata') line = 'no data yet · the feed has not published its first batch';
  else if (!s) line = `feed unavailable · ${snap.message ?? ''}`;
  else {
    const base = `${tickClock(s.tick)} · ${formatInt(s.totals.articles)} stories read · ${formatInt(s.totals.lensed)} placed by lens · last tick ${agePhrase(age)}`;
    line = snap.status === 'error' ? `feed unavailable, showing ${base}` : snap.status === 'stale' ? `feed is late · ${base}` : base;
  }
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: warn ? AMBER : 'rgba(232,236,244,0.45)', marginTop: 6, textTransform: 'uppercase' }} aria-live="polite">
      {line}
    </div>
  );
}

function Legend() {
  const lensFilter = useGlobeStore(s => s.lensFilter);
  const toggleLens = useGlobeStore(s => s.toggleLens);
  return (
    <div style={{ position: 'absolute', bottom: 28, left: 28, zIndex: 10, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: 'rgba(232,236,244,0.55)', userSelect: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {LENSES.map((lens, i) => {
        const active = lensFilter === i, dimmed = lensFilter !== null && !active;
        return (
          <button
            key={lens.id}
            onClick={() => toggleLens(i)}
            aria-pressed={active}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', letterSpacing: 'inherit', opacity: dimmed ? 0.4 : 1, textTransform: 'uppercase' }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 2, background: lens.color, boxShadow: active ? `0 0 0 2px ${lens.color}` : 'none', flexShrink: 0 }} />
            <span>{lens.label}</span>
          </button>
        );
      })}
      <div style={{ marginTop: 6, color: 'rgba(232,236,244,0.3)', maxWidth: 300, lineHeight: 1.6, letterSpacing: '0.06em' }}>
        brightness = attention vs this country's usual · source: GDELT, English-language media · trade and policy are not shown
      </div>
    </div>
  );
}

export default function App() {
  useGlobeData();
  useSnapshot();
  const isPanelOpen = useGlobeStore(s => s.isPanelOpen);
  const PANEL_WIDTH = isPanelOpen ? 380 : 0;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#04060C' }}>
      <div style={{ position: 'absolute', top: 24, left: 28, zIndex: 10, userSelect: 'none', pointerEvents: 'none' }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(232,236,244,0.5)' }}>ATLAS</div>
        <FeedStatus />
      </div>
      <UtcClock />
      <Legend />
      <div className="hide-mobile" style={{ position: 'absolute', bottom: 28, right: isPanelOpen ? 408 : 28, zIndex: 10, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: 'rgba(232,236,244,0.35)', userSelect: 'none', pointerEvents: 'none', transition: 'right 420ms cubic-bezier(0.16,1,0.3,1)' }}>
        CLICK ANY COUNTRY
      </div>
      <Suspense fallback={<div className="globe-container w-full h-full" />}>
        <GlobeContainer panelWidth={PANEL_WIDTH} />
      </Suspense>
      <StoryPanel />
    </div>
  );
}
