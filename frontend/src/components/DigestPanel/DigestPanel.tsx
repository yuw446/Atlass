import { useEffect, useState } from 'react';
import { useGlobeStore } from '../../store/globeStore';
import type { DigestData } from '../../types';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function SkeletonBlock({ height = 14, width = '100%' }: { height?: number; width?: string | number }) {
  return (
    <div style={{
      height,
      width,
      borderRadius: 3,
      background: 'rgba(255,255,255,0.06)',
      animation: 'skeleton-pulse 1.6s ease-in-out infinite',
    }} />
  );
}

function CardSkeleton() {
  return (
    <div style={{ borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
      {/* Image placeholder */}
      <div style={{
        height: 110,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.04)',
        marginBottom: 10,
        animation: 'skeleton-pulse 1.6s ease-in-out infinite',
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBlock height={11} width="95%" />
        <SkeletonBlock height={11} width="88%" />
        <SkeletonBlock height={11} width="72%" />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatEventDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active_conflict:    { label: 'ACTIVE CONFLICT',     color: '#e05050', bg: 'rgba(150,15,15,0.3)',  border: 'rgba(200,40,40,0.4)'   },
  military_operation: { label: 'MILITARY OPERATION',  color: '#e07030', bg: 'rgba(130,45,10,0.3)',  border: 'rgba(200,80,20,0.4)'   },
  impacted:           { label: 'CONFLICT IMPACTED',   color: '#d4a030', bg: 'rgba(110,70,8,0.3)',   border: 'rgba(190,130,20,0.4)'  },
  civil_unrest:       { label: 'CIVIL UNREST',        color: '#c060c0', bg: 'rgba(75,18,75,0.3)',   border: 'rgba(150,40,150,0.4)'  },
  ceasefire:          { label: 'CEASEFIRE',           color: '#60a0d0', bg: 'rgba(20,55,95,0.3)',   border: 'rgba(40,100,160,0.4)'  },
  peaceful:           { label: 'NO ACTIVE CONFLICT',  color: '#4ab870', bg: 'rgba(15,80,40,0.25)',  border: 'rgba(40,160,80,0.35)'  },
};
const DEFAULT_STATUS_DISPLAY = STATUS_DISPLAY.peaceful;

// ---------------------------------------------------------------------------
// Event type badge
// ---------------------------------------------------------------------------
const EVENT_TYPE_COLORS: Record<string, string> = {
  military:    'rgba(180,30,30,0.35)',
  diplomatic:  'rgba(30,90,160,0.35)',
  economic:    'rgba(140,100,20,0.35)',
  humanitarian:'rgba(20,120,80,0.35)',
  political:   'rgba(100,40,140,0.35)',
};
const EVENT_TYPE_TEXT: Record<string, string> = {
  military:    '#e05050',
  diplomatic:  '#5090e0',
  economic:    '#d4a020',
  humanitarian:'#40c080',
  political:   '#b060e0',
};

function EventTypeBadge({ type }: { type?: string }) {
  if (!type || type === 'unknown') return null;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 2,
      fontSize: 9,
      fontFamily: 'monospace',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      fontWeight: 600,
      background: EVENT_TYPE_COLORS[type] ?? 'rgba(100,100,100,0.25)',
      color: EVENT_TYPE_TEXT[type] ?? '#aaa',
      marginBottom: 8,
    }}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Image placeholder (shown while no real image is available)
// ---------------------------------------------------------------------------
function ImagePlaceholder() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a1020 0%, #111c30 50%, #0a1020 100%)',
      height: 110,
      borderRadius: 3,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.12)',
      fontSize: 10,
      fontFamily: 'monospace',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: 10,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      IMAGE PENDING
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function DigestPanel() {
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const isPanelOpen     = useGlobeStore(s => s.isPanelOpen);
  const countryMap      = useGlobeStore(s => s.countryMap);
  const closePanel      = useGlobeStore(s => s.closePanel);

  const [visible,      setVisible]      = useState(false);
  const [digestData,   setDigestData]   = useState<DigestData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Panel visibility (exit animation)
  useEffect(() => {
    if (isPanelOpen) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 450);
      return () => clearTimeout(t);
    }
  }, [isPanelOpen]);

  // Fetch digest when country changes
  useEffect(() => {
    if (!selectedCountry) return;
    const country = countryMap.get(selectedCountry);

    setDigestData(null);
    setError(null);
    setLoading(true);

    fetch('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country_code:    selectedCountry,
        country_name:    country?.name ?? selectedCountry,
        in_conflict:     country?.in_conflict ?? false,
        stability_score: country?.stability_score ?? 50,
      }),
    })
      .then(r => r.json())
      .then((data: DigestData) => { setDigestData(data); setLoading(false); })
      .catch(() => { setError('Could not load digest'); setLoading(false); });
  }, [selectedCountry, countryMap]);

  const country    = selectedCountry ? countryMap.get(selectedCountry) : null;
  const inConflict = digestData?.in_conflict ?? country?.in_conflict ?? false;

  const conflictStatus = country?.conflict_status ?? (inConflict ? 'active_conflict' : 'peaceful');
  const statusDisplay  = STATUS_DISPLAY[conflictStatus] ?? DEFAULT_STATUS_DISPLAY;

  // Sort newest first; events without a date fall to the bottom
  const events = (digestData?.events ?? []).slice().sort((a, b) => {
    if (!a.published_at && !b.published_at) return 0;
    if (!a.published_at) return 1;
    if (!b.published_at) return -1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  if (!visible) return null;

  const conflictBg     = statusDisplay.bg;
  const conflictBorder = statusDisplay.border;
  const conflictColor  = statusDisplay.color;
  const cardBorder     = inConflict ? 'rgba(180,30,30,0.45)' : 'rgba(40,100,180,0.35)';

  return (
    <>
      {/* Skeleton pulse keyframe */}
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.65; }
        }
      `}</style>

      <div
        className={`digest-panel ${isPanelOpen ? 'digest-panel--open' : ''}`}
        aria-label="Country digest panel"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs tracking-widest uppercase text-muted mb-1">
              SITUATION REPORT
            </div>
            <h2 className="text-xl font-mono font-semibold text-text tracking-tight">
              {country?.flag} {country?.name ?? selectedCountry}
            </h2>
          </div>
          <button
            onClick={closePanel}
            className="text-muted hover:text-text transition-colors text-xl leading-none mt-0.5"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Conflict status badge */}
        <div className="mb-6">
          {loading ? (
            <SkeletonBlock height={26} width={160} />
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 3,
              fontSize: 11,
              fontFamily: 'monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              background: conflictBg,
              border: `1px solid ${conflictBorder}`,
              color: conflictColor,
            }}>
              <span style={{ fontSize: 8 }}>●</span>
              {statusDisplay.label}
            </div>
          )}
        </div>

        {/* Event cards */}
        {loading && <LoadingSkeleton />}

        {error && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 4,
            background: 'rgba(150,20,20,0.2)',
            border: '1px solid rgba(180,30,30,0.3)',
            color: '#c05050',
            fontSize: 12,
            fontFamily: 'monospace',
          }}>
            {error} — backend may be offline
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'monospace' }}>
            No event data available for this country.
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="space-y-5">
            {events.map((event, i) => (
              <div
                key={i}
                style={{ borderLeft: `2px solid ${cardBorder}`, paddingLeft: 12 }}
              >
                <EventTypeBadge type={event.event_type} />
                {formatEventDate(event.published_at) && (
                  <div style={{
                    fontSize: 9,
                    fontFamily: 'monospace',
                    letterSpacing: '0.08em',
                    color: 'rgba(255,255,255,0.3)',
                    marginBottom: 8,
                  }}>
                    {formatEventDate(event.published_at)}
                  </div>
                )}
                {event.image_url ? (
                  <img
                    src={event.image_url}
                    alt=""
                    style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 3, marginBottom: 10 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <ImagePlaceholder />
                )}
                <p className="text-xs leading-relaxed text-text/75 mb-2">
                  {event.summary}
                </p>
                {event.source_url && (
                  <a
                    href={event.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={event.source_url}
                    style={{
                      fontSize: 9,
                      fontFamily: 'monospace',
                      letterSpacing: '0.06em',
                      color: 'rgba(255,255,255,0.28)',
                      textDecoration: 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { (e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.55)'; }}
                    onMouseLeave={e => { (e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.28)'; }}
                  >
                    ↗ {event.source_url.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Stability — supplementary, deemphasized */}
        <div className="mt-6 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-muted/50">
              Stability Index
            </span>
            <span className="text-xs font-mono text-muted/50">
              {country?.stability_score ?? '—'} / 100
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4">
          <div className="text-xs font-mono text-muted/30 text-center">
            ATLAS {digestData ? `· ${(digestData as DigestData & { source?: string }).source === 'perplexity' ? 'PERPLEXITY' : 'CLAUDE'}` : ''}
          </div>
        </div>
      </div>
    </>
  );
}
