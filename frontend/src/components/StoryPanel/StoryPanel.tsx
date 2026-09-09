import { useState } from 'react';
import { useGlobeStore } from '../../store/globeStore';
import { LENSES } from '../../../../shared/lenses.ts';
import { flagEmoji } from '../../../../shared/codes.ts';
import type { Story } from '../../../../shared/snapshot.ts';
import { attentionWords, trimTitle, tickClock } from '../../lib/text.ts';

// The shell (slide-in, mobile bottom sheet, skeleton, close) is the old digest panel's; only the body is new.

function SkeletonBlock({ height = 14, width = '100%' }: { height?: number; width?: string | number }) {
  return <div style={{ height, width, borderRadius: 3, background: 'rgba(255,255,255,0.06)', animation: 'skeleton-pulse 1.6s ease-in-out infinite' }} />;
}

function StoryImage({ story, color }: { story: Story; color: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: '100%', height: 110, borderRadius: 3, marginBottom: 10 } as const;
  if (!story.i || failed) {
    return <div style={{ ...box, background: `linear-gradient(135deg, ${color}22 0%, ${color}55 100%)`, border: `1px solid ${color}44` }} />;
  }
  return (
    <img
      src={story.i}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: 'cover', display: 'block', background: 'rgba(255,255,255,0.04)' }}
    />
  );
}

function StoryCard({ story }: { story: Story }) {
  const lens = LENSES[story.l];
  const color = lens?.color ?? '#aaa';
  return (
    <div style={{ borderLeft: `2px solid ${color}88`, paddingLeft: 12 }}>
      <StoryImage story={story} color={color} />
      <a
        href={story.u}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        style={{ display: 'block', color: 'rgba(232,236,244,0.9)', textDecoration: 'none', fontSize: 13, lineHeight: 1.45, marginBottom: 6 }}
      >
        {trimTitle(story.t)}
      </a>
      <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 10 }}>
        <span>{story.d}</span>
        <span>{tickClock(story.at)}</span>
      </div>
    </div>
  );
}

export default function StoryPanel() {
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const isPanelOpen     = useGlobeStore(s => s.isPanelOpen);
  const names           = useGlobeStore(s => s.names);
  const snap            = useGlobeStore(s => s.snap);
  const closePanel      = useGlobeStore(s => s.closePanel);

  // Keep showing the last country while the panel slides out, so closing does not blank the content mid-animation.
  const [shownCode, setShownCode] = useState<string | null>(null);
  if (selectedCountry && selectedCountry !== shownCode) setShownCode(selectedCountry);

  if (!shownCode) return null;

  const code = shownCode;
  const country = snap.snapshot?.countries[code];
  const loading = snap.status === 'loading';
  const name = names.get(code) ?? code;
  const total = country?.n ?? 0;
  const byLens = LENSES.map((lens, i) => ({ lens, i, stories: (country?.top ?? []).filter(s => s.l === i) })).filter(g => g.stories.length > 0);
  // The story ring keeps up to ten headlines across batches, so it can hold stories older than the two-hour window
  // that `n` counts. Say so rather than let the count and the list disagree.
  const windowStart = snap.snapshot ? Date.parse(snap.snapshot.tick) - snap.snapshot.window * 15 * 60_000 : 0;
  const older = (country?.top ?? []).filter(s => Date.parse(s.at) < windowStart).length;

  return (
    <>
      <style>{`@keyframes skeleton-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.65; } }`}</style>
      <div className={`story-panel ${isPanelOpen ? 'story-panel--open' : ''}`} aria-label="Stories from this place">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs tracking-widest uppercase text-muted mb-1">THE NEWS, BY PLACE</div>
            <h2 className="text-xl font-mono font-semibold text-text tracking-tight">{flagEmoji(code)} {name}</h2>
          </div>
          <button onClick={closePanel} className="text-muted hover:text-text transition-colors text-xl leading-none mt-0.5" aria-label="Close panel">×</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><SkeletonBlock height={26} width={200} /><SkeletonBlock height={110} /><SkeletonBlock height={11} width="80%" /></div>
        ) : !country || (total === 0 && older === 0) ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', lineHeight: 1.7 }}>
            No stories under a lens in the last two hours.
            <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.25)' }}>Lenses: conflict, disaster & climate, unrest, displacement. Trade and policy are not shown.</div>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(232,236,244,0.6)', marginBottom: 8 }}>
              attention {attentionWords(country.z)} · {total} {total === 1 ? 'story' : 'stories'} in 2 h{older > 0 ? ` · ${older} older` : ''}
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 20, background: 'rgba(255,255,255,0.06)' }} aria-hidden="true">
              {total > 0 && LENSES.map((lens, i) => country.lens[i] > 0 && (
                <div key={lens.id} title={`${lens.label}: ${country.lens[i]}`} style={{ width: `${(100 * country.lens[i]) / total}%`, background: lens.color }} />
              ))}
            </div>
            <div className="space-y-6">
              {byLens.map(({ lens, stories }) => (
                <section key={lens.id}>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: lens.color, marginBottom: 10 }}>
                    {lens.label} · {country.lens[LENSES.indexOf(lens)]}
                  </div>
                  <div className="space-y-5">{stories.map(s => <StoryCard key={s.u} story={s} />)}</div>
                </section>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-border/40 text-xs font-mono text-muted/30 text-center">
          ATLAS · GDELT GKG · English-language media · 2 h window
        </div>
      </div>
    </>
  );
}
