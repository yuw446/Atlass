import { useEffect, useState, useCallback } from 'react';
import './index.css';
import GlobeContainer from './components/Globe/GlobeContainer';
import DigestPanel from './components/DigestPanel/DigestPanel';
import TimeScrubber from './components/Scrubber/TimeScrubber';
import { useGlobeStore } from './store/globeStore';
import { useReplayParam } from './hooks/useReplayParam';
import type { GdeltEvent } from './types';

// ---------------------------------------------------------------------------
// UTC clock
// ---------------------------------------------------------------------------
function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad  = (n: number) => String(n).padStart(2, '0');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const date = `${pad(now.getUTCDate())} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        right: 28,
        zIndex: 10,
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.12em',
        color: 'rgba(232,236,244,0.45)',
        userSelect: 'none',
        pointerEvents: 'none',
        textAlign: 'right',
        lineHeight: 1.6,
      }}
    >
      <div>{date}</div>
      <div style={{ fontSize: 14, color: 'rgba(232,236,244,0.65)', letterSpacing: '0.18em' }}>
        {time} <span style={{ fontSize: 9, opacity: 0.6 }}>UTC</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer toggle button
// ---------------------------------------------------------------------------
interface LayerToggleProps {
  activeLayer: 'gdelt-hex' | null;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
}

function LayerToggle({ activeLayer, loading, error, onToggle }: LayerToggleProps) {
  const FONT = "'Space Mono', monospace";
  return (
    <button
      onClick={onToggle}
      title={error ?? undefined}
      style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        fontFamily: FONT,
        fontSize: 9,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        padding: '6px 14px',
        borderRadius: 4,
        border: `1px solid ${activeLayer ? 'rgba(168,220,255,0.45)' : 'rgba(232,236,244,0.15)'}`,
        background: activeLayer ? 'rgba(168,220,255,0.1)' : 'rgba(8,11,20,0.7)',
        color: activeLayer ? 'rgba(168,220,255,0.9)' : 'rgba(232,236,244,0.45)',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 250ms',
      }}
    >
      {loading ? 'LOADING GDELT…' : error ? '⚠ GDELT ERROR' : activeLayer ? '⬡ EVENTS ON' : '⬡ EVENTS'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  const isPanelOpen     = useGlobeStore(s => s.isPanelOpen);
  const activeLayer     = useGlobeStore(s => s.activeLayer);
  const gdeltEvents     = useGlobeStore(s => s.gdeltEvents);
  const hexCurrentTime  = useGlobeStore(s => s.hexCurrentTime);
  const gdeltLoading    = useGlobeStore(s => s.gdeltLoading);
  const gdeltError      = useGlobeStore(s => s.gdeltError);

  const setActiveLayer    = useGlobeStore(s => s.setActiveLayer);
  const setGdeltEvents    = useGlobeStore(s => s.setGdeltEvents);
  const setHexCurrentTime = useGlobeStore(s => s.setHexCurrentTime);
  const setGdeltLoading   = useGlobeStore(s => s.setGdeltLoading);
  const setGdeltError     = useGlobeStore(s => s.setGdeltError);

  const PANEL_WIDTH = isPanelOpen ? 380 : 0;

  // -- Fetch GDELT events when layer is activated --
  useEffect(() => {
    if (activeLayer !== 'gdelt-hex') return;
    if (gdeltEvents.length > 0) return; // already loaded

    let cancelled = false;
    setGdeltLoading(true);
    setGdeltError(null);

    fetch('/api/events?hours=24')
      .then(r => r.json())
      .then((data: { events?: GdeltEvent[]; error?: string }) => {
        if (cancelled) return;
        if (data.events) setGdeltEvents(data.events);
        if (data.error) setGdeltError(data.error);
      })
      .catch(() => {
        if (!cancelled) setGdeltError('GDELT_UNAVAILABLE');
      })
      .finally(() => {
        if (!cancelled) setGdeltLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeLayer, gdeltEvents.length, setGdeltEvents, setGdeltLoading, setGdeltError]);

  // -- Handle hex click from GlobeRenderer (custom DOM event) --
  useEffect(() => {
    const handler = (e: Event) => {
      const { lat, lon } = (e as CustomEvent<{ lat: number; lon: number; pointCount: number }>).detail;
      console.log('[Atlas] Hex click at', lat, lon);
      // TODO: open a hex digest panel (future: reuse DigestPanel with hex data)
    };
    window.addEventListener('atlas:hex-click', handler);
    return () => window.removeEventListener('atlas:hex-click', handler);
  }, []);

  // -- Toggle layer --
  const toggleLayer = useCallback(() => {
    setActiveLayer(activeLayer === 'gdelt-hex' ? null : 'gdelt-hex');
  }, [activeLayer, setActiveLayer]);

  // -- URL replay params --
  useReplayParam();

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Wordmark */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 28,
          zIndex: 10,
          fontFamily: "'Space Mono', monospace",
          fontSize: 13,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(232,236,244,0.5)',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        ATLAS
      </div>

      {/* UTC clock */}
      <UtcClock />

      {/* Layer toggle */}
      <LayerToggle
        activeLayer={activeLayer}
        loading={gdeltLoading}
        error={gdeltError}
        onToggle={toggleLayer}
      />

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 28,
          zIndex: 10,
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.1em',
          color: 'rgba(232,236,244,0.45)',
          userSelect: 'none',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        {([
          { bg: 'rgba(110,12,12,0.88)',   border: 'rgba(200,40,40,0.5)',    label: 'ACTIVE CONFLICT'     },
          { bg: 'rgba(140,55,10,0.87)',   border: 'rgba(200,80,20,0.5)',    label: 'MILITARY OPERATION'  },
          { bg: 'rgba(110,70,8,0.86)',    border: 'rgba(190,130,20,0.4)',   label: 'CONFLICT IMPACTED'   },
          { bg: 'rgba(80,20,70,0.86)',    border: 'rgba(150,40,150,0.4)',   label: 'CIVIL UNREST'        },
          { bg: 'rgba(25,45,75,0.87)',    border: 'rgba(40,100,160,0.4)',   label: 'CEASEFIRE'           },
          { bg: 'rgba(8,18,40,0.85)',     border: 'rgba(40,80,160,0.4)',    label: 'NO ACTIVE CONFLICT'  },
        ] as const).map(({ bg, border, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: bg, border: `1px solid ${border}`, flexShrink: 0 }} />
            <span>{label}</span>
          </div>
        ))}
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 22, height: 3, background: '#C0392B', borderRadius: 2 }} />
          <span>CONFLICT ARC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 22, height: 3, background: '#D4821A', borderRadius: 2 }} />
          <span>DIPLOMACY ARC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 22, height: 3, background: '#0D9E8A', borderRadius: 2 }} />
          <span>TRADE ARC</span>
        </div>
        {activeLayer === 'gdelt-hex' && (
          <>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(192,57,43,0.85)', border: '1px solid rgba(220,80,60,0.4)', flexShrink: 0 }} />
              <span>ASSAULT / VIOLENCE</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(230,126,34,0.85)', border: '1px solid rgba(240,150,50,0.4)', flexShrink: 0 }} />
              <span>THREAT / PROTEST</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(142,68,173,0.85)', border: '1px solid rgba(170,90,200,0.4)', flexShrink: 0 }} />
              <span>DEMAND / COERCE</span>
            </div>
          </>
        )}
      </div>

      {/* Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          right: isPanelOpen ? 408 : 28,
          zIndex: 10,
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.1em',
          color: 'rgba(232,236,244,0.35)',
          userSelect: 'none',
          pointerEvents: 'none',
          transition: 'right 420ms cubic-bezier(0.16,1,0.3,1)',
          textAlign: 'right',
        }}
      >
        {activeLayer === 'gdelt-hex' ? 'CLICK HEX FOR DIGEST' : 'CLICK ANY COUNTRY'}
      </div>

      <GlobeContainer panelWidth={PANEL_WIDTH} />
      <DigestPanel />

      {/* Time scrubber — only when hex layer is active */}
      <TimeScrubber
        events={gdeltEvents}
        currentTime={hexCurrentTime}
        onTimeChange={setHexCurrentTime}
        isVisible={activeLayer === 'gdelt-hex' && !gdeltLoading}
      />
    </div>
  );
}

export default App;
