import { useEffect, useState } from 'react';
import { useGlobeStore } from '../../store/globeStore';
import { stabilityToHex } from '../Globe/colorUtils';

// Phase 1: hardcoded placeholder digest content
// Phase 3: replace with Claude API call
const PLACEHOLDER_DIGEST: Record<string, string> = {
  UA: "Ukraine remains the epicenter of Europe's most acute security crisis since the Cold War. Russian forces continue offensive operations across the eastern front while Kyiv sustains defensive lines with Western material support. The war has reshaped European defense spending, accelerated NATO's eastward orientation, and created a humanitarian displacement of historic scale. Reconstruction costs are estimated in the hundreds of billions, with international donors increasingly debating conditionality and governance benchmarks.",
  RU: "Russia's economy has proven more resilient than initial Western forecasts but is increasingly operating on a war footing, with defense spending crowding out civilian investment. The ruble's managed stability masks structural vulnerabilities in energy revenue diversification. Diplomatic isolation from Western institutions has deepened dependency on China and redirected trade flows accordingly. Domestic political dissent remains suppressed but elite consensus around the conflict shows strain at the margins.",
  SY: "Syria's conflict has entered a frozen phase, with the Assad government nominally controlling most population centers but exercising limited sovereignty over the northwest, northeast, and contested peripheries. The country has been effectively partitioned between competing external patrons with incompatible interests. Economic collapse, cholera outbreaks, and chronic fuel shortages define daily life for most Syrians. International reintegration discussions have stalled on accountability questions that no regional actor is currently positioned to resolve.",
  YE: "Yemen's multi-front war has produced one of the world's worst humanitarian emergencies, with acute food insecurity affecting the majority of the population. The UN-brokered truce has held imperfectly, creating space for limited fuel imports and detainee exchanges while core political questions remain unresolved. Houthi forces have demonstrated strategic reach beyond their territorial base, complicating regional security calculations. A negotiated settlement faces the structural obstacle of reconciling Iranian and Saudi equities with Yemeni political legitimacy.",
};

const PLACEHOLDER_EVENTS = [
  { headline: 'Frontline situation update', url: '#' },
  { headline: 'Economic pressure mounts amid continued isolation', url: '#' },
  { headline: 'Diplomatic talks stall over preconditions', url: '#' },
];

export default function DigestPanel() {
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const isPanelOpen     = useGlobeStore(s => s.isPanelOpen);
  const countryMap      = useGlobeStore(s => s.countryMap);
  const closePanel      = useGlobeStore(s => s.closePanel);

  const [visible, setVisible] = useState(false);

  // Delay visibility toggle for exit animation to play
  useEffect(() => {
    if (isPanelOpen) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 450);
      return () => clearTimeout(t);
    }
  }, [isPanelOpen]);

  const country = selectedCountry ? countryMap.get(selectedCountry) : null;

  if (!visible) return null;

  const stabilityScore = country?.stability_score ?? 50;
  const unrestLevel    = country?.unrest_level ?? 0;
  const digestText     = selectedCountry ? (PLACEHOLDER_DIGEST[selectedCountry] ?? "This region sits at the intersection of competing geopolitical currents that will shape the next decade of global order. Internal governance pressures intersect with external relationships to produce a dynamic that resists simple categorization. Economic trajectories, alliance commitments, and domestic political constraints are all in play simultaneously. Observers with skin in the game are watching closely for signals that the current equilibrium is approaching a decision point.") : '';

  const stabilityColor = stabilityToHex(stabilityScore);
  const unrestDots = Array.from({ length: 3 }, (_, i) => i < unrestLevel);

  return (
    <div
      className={`digest-panel ${isPanelOpen ? 'digest-panel--open' : ''}`}
      aria-label="Country digest panel"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs tracking-widest uppercase text-muted mb-1">
            {country?.flag} INTELLIGENCE BRIEF
          </div>
          <h2 className="text-xl font-mono font-semibold text-text tracking-tight">
            {country?.name ?? selectedCountry}
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

      {/* Stability meter */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-mono uppercase tracking-widest text-muted">Stability Index</span>
          <span
            className="text-sm font-mono font-bold"
            style={{ color: stabilityColor }}
          >
            {stabilityScore} / 100
          </span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${stabilityScore}%`,
              backgroundColor: stabilityColor,
            }}
          />
        </div>
      </div>

      {/* Unrest level */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-mono uppercase tracking-widest text-muted">Unrest</span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: unrestDots[i]
                  ? i === 2 ? '#C0392B' : i === 1 ? '#D4821A' : '#8B6914'
                  : '#1A2540',
              }}
            />
          ))}
        </div>
        <span className="text-xs text-muted ml-1">
          {['None', 'Low', 'Elevated', 'Critical'][unrestLevel]}
        </span>
      </div>

      {/* Digest text */}
      <div className="mb-6">
        <div className="text-xs font-mono uppercase tracking-widest text-muted mb-3">Analysis</div>
        <p className="digest-text text-sm leading-relaxed text-text/80">
          {digestText}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border mb-5" />

      {/* News events */}
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-muted mb-3">Key Developments</div>
        <ol className="space-y-2.5">
          {PLACEHOLDER_EVENTS.map((ev, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-xs font-mono text-muted mt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <a
                href={ev.url}
                className="text-xs text-text/70 hover:text-text transition-colors leading-relaxed"
              >
                {ev.headline} →
              </a>
            </li>
          ))}
        </ol>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6 border-t border-border/50">
        <div className="text-xs font-mono text-muted/50 text-center">
          ATLAS • Phase 1 Prototype
        </div>
      </div>
    </div>
  );
}
