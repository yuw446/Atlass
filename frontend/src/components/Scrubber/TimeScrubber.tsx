import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { GdeltEvent } from '../../types';

interface TimeScrubberProps {
  events: GdeltEvent[];
  currentTime: Date | null;
  onTimeChange: (t: Date | null) => void;
  isVisible: boolean;
}

const FONT = "'Space Mono', monospace";
const TRACK_COLOR = 'rgba(232,236,244,0.08)';
const PLAYHEAD_COLOR = '#A8DCFF';

/** GDELT SQLDATE YYYYMMDD → epoch ms at noon UTC */
function gdeltToMs(sqldate: string): number {
  const y = parseInt(sqldate.slice(0, 4), 10);
  const m = parseInt(sqldate.slice(4, 6), 10) - 1;
  const d = parseInt(sqldate.slice(6, 8), 10);
  return Date.UTC(y, m, d, 12, 0, 0);
}

/** Format epoch ms as "DD MMM HH:mm UTC" */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// Color by event code (matches GlobeRenderer)
function barColor(code: number): string {
  if (code >= 18) return 'rgba(192,57,43,0.9)';
  if (code >= 14) return 'rgba(230,126,34,0.9)';
  if (code >= 10) return 'rgba(142,68,173,0.9)';
  if (code >= 2 && code <= 5) return 'rgba(26,82,118,0.9)';
  return 'rgba(60,80,120,0.6)';
}

export default function TimeScrubber({ events, currentTime, onTimeChange, isVisible }: TimeScrubberProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const playRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Compute time range from events
  const { minMs, maxMs } = useMemo(() => {
    if (events.length === 0) {
      const now = Date.now();
      return { minMs: now - 24 * 3600 * 1000, maxMs: now };
    }
    let min = Infinity, max = -Infinity;
    for (const e of events) {
      const ms = gdeltToMs(e.timestamp);
      if (ms < min) min = ms;
      if (ms > max) max = ms;
    }
    // Expand range by a little for visual breathing room
    const pad = Math.max((max - min) * 0.02, 30 * 60 * 1000);
    return { minMs: min - pad, maxMs: max + pad };
  }, [events]);

  const rangeMs = maxMs - minMs;

  // Bucket events into 24 buckets for the density bar chart
  const BUCKETS = 24;
  const bucketData = useMemo(() => {
    const buckets = Array.from({ length: BUCKETS }, () => ({ count: 0, peakCode: 0 }));
    for (const e of events) {
      const ms = gdeltToMs(e.timestamp);
      const idx = Math.min(Math.floor(((ms - minMs) / rangeMs) * BUCKETS), BUCKETS - 1);
      if (idx >= 0) {
        buckets[idx].count++;
        if (e.eventCode > buckets[idx].peakCode) buckets[idx].peakCode = e.eventCode;
      }
    }
    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    return buckets.map(b => ({ ...b, frac: b.count / maxCount }));
  }, [events, minMs, rangeMs]);

  const currentMs = currentTime?.getTime() ?? maxMs;
  const playheadFrac = rangeMs > 0 ? Math.max(0, Math.min(1, (currentMs - minMs) / rangeMs)) : 0;

  // --- Playback ---
  const tick = useCallback(() => {
    if (!isPlaying) return;
    const STEP_MS = (rangeMs / 200) * playSpeed;  // traverse range in ~200 frames at 1x
    const next = new Date(Math.min(currentMs + STEP_MS, maxMs));
    onTimeChange(next);
    if (next.getTime() >= maxMs) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentMs, maxMs, rangeMs, playSpeed, onTimeChange]);

  useEffect(() => {
    if (isPlaying) {
      playRef.current = requestAnimationFrame(tick);
    } else if (playRef.current) {
      cancelAnimationFrame(playRef.current);
    }
    return () => { if (playRef.current) cancelAnimationFrame(playRef.current); };
  }, [isPlaying, tick]);

  // --- Drag on track ---
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onTimeChange(new Date(minMs + frac * rangeMs));
    setIsPlaying(false);
  }, [minMs, rangeMs, onTimeChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    handleTrackClick(e);
  }, [handleTrackClick]);

  // --- Share replay ---
  const shareReplay = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('replay', 'true');
    url.searchParams.set('t', new Date(currentMs).toISOString());
    navigator.clipboard.writeText(url.toString()).catch(() => {});
  }, [currentMs]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(640px, calc(100vw - 80px))',
        background: 'rgba(8,11,20,0.92)',
        border: '1px solid rgba(168,220,255,0.18)',
        borderRadius: 8,
        padding: '14px 18px 16px',
        fontFamily: FONT,
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(168,220,255,0.7)', textTransform: 'uppercase' }}>
          GDELT EVENT REPLAY · {events.length.toLocaleString()} EVENTS
        </div>
        <div style={{ fontSize: 10, color: 'rgba(232,236,244,0.55)', letterSpacing: '0.08em' }}>
          {fmtTime(currentMs)}
        </div>
      </div>

      {/* Density bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 28, gap: 1, marginBottom: 6 }}>
        {bucketData.map((b, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(b.frac * 100, 4)}%`,
              background: barColor(b.peakCode),
              borderRadius: 1,
              opacity: 0.75,
            }}
          />
        ))}
      </div>

      {/* Scrubber track */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        onMouseMove={handleMouseMove}
        style={{
          position: 'relative',
          height: 6,
          background: TRACK_COLOR,
          borderRadius: 3,
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        {/* Progress fill */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${playheadFrac * 100}%`,
          height: '100%',
          background: 'rgba(168,220,255,0.3)',
          borderRadius: 3,
        }} />
        {/* Playhead */}
        <div style={{
          position: 'absolute',
          left: `${playheadFrac * 100}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: PLAYHEAD_COLOR,
          border: '2px solid rgba(8,11,20,0.9)',
          boxShadow: '0 0 6px rgba(168,220,255,0.6)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Play/Pause */}
        <button
          onClick={() => {
            if (currentMs >= maxMs) onTimeChange(new Date(minMs));
            setIsPlaying(v => !v);
          }}
          style={{
            background: 'rgba(168,220,255,0.12)',
            border: '1px solid rgba(168,220,255,0.3)',
            borderRadius: 4,
            color: PLAYHEAD_COLOR,
            fontFamily: FONT,
            fontSize: 10,
            letterSpacing: '0.1em',
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? '■ PAUSE' : '▶ PLAY'}
        </button>

        {/* Speed selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([1, 2, 4] as const).map(s => (
            <button
              key={s}
              onClick={() => setPlaySpeed(s)}
              style={{
                background: playSpeed === s ? 'rgba(168,220,255,0.2)' : 'transparent',
                border: `1px solid rgba(168,220,255,${playSpeed === s ? '0.5' : '0.15'})`,
                borderRadius: 4,
                color: playSpeed === s ? PLAYHEAD_COLOR : 'rgba(232,236,244,0.4)',
                fontFamily: FONT,
                fontSize: 9,
                padding: '3px 7px',
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Reset */}
        <button
          onClick={() => { onTimeChange(null); setIsPlaying(false); }}
          style={{
            background: 'transparent',
            border: '1px solid rgba(232,236,244,0.12)',
            borderRadius: 4,
            color: 'rgba(232,236,244,0.4)',
            fontFamily: FONT,
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          RESET
        </button>

        <div style={{ flex: 1 }} />

        {/* Share */}
        <button
          onClick={shareReplay}
          style={{
            background: 'transparent',
            border: '1px solid rgba(168,220,255,0.2)',
            borderRadius: 4,
            color: 'rgba(168,220,255,0.6)',
            fontFamily: FONT,
            fontSize: 9,
            letterSpacing: '0.1em',
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          SHARE REPLAY
        </button>
      </div>
    </div>
  );
}
