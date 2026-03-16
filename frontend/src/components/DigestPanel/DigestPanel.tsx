import { useEffect, useState } from 'react';
import { useGlobeStore } from '../../store/globeStore';

interface EventCard {
  summary: string;
}

// Phase 1: hardcoded placeholder event cards per conflict country
// Phase 3: replace with POST /api/digest response
const PLACEHOLDER_EVENTS: Record<string, EventCard[]> = {
  UA: [
    { summary: "Russian forces intensified operations along the eastern front near Pokrovsk this week, with Ukrainian defensive lines holding at significant cost in materiel and personnel. International donors met in Brussels to discuss accelerated delivery of air defense systems ahead of the spring season." },
    { summary: "The EU finalized a new reconstruction finance framework committing €5 billion over 18 months, tied to anti-corruption benchmarks. Ukrainian officials accepted the conditions while calling publicly for faster disbursement timelines." },
  ],
  RU: [
    { summary: "Defense spending now accounts for roughly a third of Russia's federal budget, crowding out healthcare and infrastructure investment for the second consecutive year. The wartime economic model has proven more durable than Western analysts forecast, sustained by parallel trade networks through Turkey, the UAE, and Central Asia." },
    { summary: "A new package of Western sanctions targeted shadow fleet vessels carrying Russian oil above the G7 price cap. The measures drew sharp diplomatic pushback from Beijing and New Delhi, underscoring the fault lines in the secondary sanctions regime." },
  ],
  IL: [
    { summary: "Ceasefire negotiations in Doha stalled again over the sequencing of hostage releases and IDF withdrawal terms. Mediators from Qatar and Egypt proposed a phased framework, but both parties have yet to confirm acceptance of the core conditions." },
    { summary: "The International Court of Justice issued a provisional measures order calling for increased humanitarian access to Gaza. Israel acknowledged the ruling while disputing its scope; aid organizations continue to report obstruction at border crossings." },
  ],
  SY: [
    { summary: "HTS-led forces consolidated administrative control over former government ministries in Damascus following the regime collapse, establishing an interim governing council. Western governments are cautiously engaging while conditioning formal recognition on political inclusivity benchmarks." },
    { summary: "Reconstruction financing talks remain stalled as multilateral sanctions regimes from the US, EU, and Gulf states complicate investment. UN agencies warn of a looming food security crisis affecting over eight million people still within the country." },
  ],
  YE: [
    { summary: "Houthi forces continued drone and missile strikes on Red Sea commercial shipping, claiming attacks on over a dozen vessels in the past month. The US-led maritime protection coalition expanded its operational footprint but has not deterred the frequency of incidents." },
    { summary: "UN-brokered ceasefire discussions resumed in Geneva, with Saudi and Houthi negotiators meeting in indirect format. Core issues — Houthi disarmament and central government revenue sharing — remain unresolved after multiple rounds." },
  ],
  SD: [
    { summary: "The Rapid Support Forces and Sudanese Armed Forces continued fighting across Khartoum and Darfur with no sustainable ceasefire in force. The conflict has produced one of the world's largest active displacement crises, with over eight million people internally displaced." },
    { summary: "African Union-led mediation efforts remain blocked as both factions continue receiving external military support from competing regional actors. Humanitarian access to contested areas is severely restricted, with aid organizations reporting deliberate obstruction at checkpoints." },
  ],
  MM: [
    { summary: "Resistance forces allied with the National Unity Government claimed control of several additional townships in Shan and Kayah states, representing a significant territorial shift against the military junta. The SAC responded with airstrikes targeting civilian infrastructure in contested towns." },
    { summary: "ASEAN's five-point consensus mechanism has produced no measurable change in junta behavior since its adoption. Western governments have tightened arms embargo enforcement while covert support networks for resistance groups continue expanding through Thailand." },
  ],
  ET: [
    { summary: "Amhara regional forces and federal troops remain in active conflict following the collapse of a short-lived ceasefire, with the heaviest fighting concentrated around Gondar and the approaches to Lalibela. The Pretoria Agreement framework for Tigray has held but created new political fault lines with Amhara actors who felt excluded." },
    { summary: "UN OCHA reports deteriorating humanitarian conditions in active conflict zones, with access increasingly restricted for aid workers. The government disputes international casualty assessments and continues to deny reports of deliberate targeting of civilian populations." },
  ],
  HT: [
    { summary: "Gang coalitions under the Viv Ansanm umbrella now control an estimated 85% of Port-au-Prince, preventing a functioning civilian administration from operating in most of the capital. Gang leaders have moved to physically block government institution buildings including approaches to the presidential palace." },
    { summary: "The Kenya-led Multinational Security Support mission faces severe funding and logistical shortfalls limiting its operational capacity to a small perimeter. Haiti's elected institutions have largely ceased to function; no presidential election timeline has been established." },
  ],
  AF: [
    { summary: "Taliban authorities intensified enforcement of gender apartheid policies, banning women from virtually all remaining public spaces. The UN's special envoy described the systematic exclusion of women from public life as amounting to a crime against humanity under international law." },
    { summary: "A series of ISKP bombings in Kabul and Jalalabad killed dozens of civilians and security personnel, underscoring the Taliban's failure to neutralize the affiliate it publicly claims to have defeated. Western intelligence agencies assess ISKP's operational capacity as growing rather than diminishing." },
  ],
  PK: [
    { summary: "Tehrik-i-Taliban Pakistan claimed responsibility for a series of bombings across Khyber Pakhtunkhwa and Balochistan, killing over 30 security personnel in a single week. The military conducted retaliatory strikes inside Afghanistan, straining an already fragile relationship with the Taliban government in Kabul." },
    { summary: "The government's anti-terrorism financing measures face international scrutiny ahead of Pakistan's next FATF review, with questions raised about the independence of oversight mechanisms and the selective enforcement record." },
  ],
  NG: [
    { summary: "ISWAP forces carried out coordinated attacks on military positions in Lake Chad basin territories, killing dozens of soldiers in one of the largest single-incident losses in recent months. Army high command acknowledged the attack and pledged a counteroffensive in the affected corridors." },
    { summary: "Banditry in the Northwest continues to hold hundreds of civilians in extended captivity for ransom, with the government's official policy of non-negotiation creating a widening gap between stated position and local operational reality. Several state governors have independently engaged in unauthorized negotiations." },
  ],
};

const FALLBACK_EVENTS: EventCard[] = [
  { summary: "Domestic political dynamics are in flux as competing interest groups position ahead of the next electoral cycle. Economic pressures have sharpened social fault lines that were previously managed through informal redistribution mechanisms." },
  { summary: "The country's external relationships are being recalibrated as shifting great-power alignments create both new leverage and new vulnerabilities for mid-tier actors in the current multipolar environment." },
];

function ImagePlaceholder() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a1020 0%, #121e36 50%, #0a1020 100%)',
      height: '110px',
      borderRadius: '3px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.15)',
      fontSize: '10px',
      fontFamily: 'monospace',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: '10px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      IMAGE PENDING
    </div>
  );
}

export default function DigestPanel() {
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const isPanelOpen     = useGlobeStore(s => s.isPanelOpen);
  const countryMap      = useGlobeStore(s => s.countryMap);
  const closePanel      = useGlobeStore(s => s.closePanel);

  const [visible, setVisible] = useState(false);

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

  const inConflict = country?.in_conflict ?? false;
  const events = selectedCountry
    ? (PLACEHOLDER_EVENTS[selectedCountry] ?? FALLBACK_EVENTS)
    : FALLBACK_EVENTS;

  return (
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
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            background: inConflict ? 'rgba(150, 15, 15, 0.3)' : 'rgba(15, 80, 40, 0.25)',
            border: `1px solid ${inConflict ? 'rgba(200,40,40,0.4)' : 'rgba(40,160,80,0.35)'}`,
            color: inConflict ? '#e05050' : '#4ab870',
          }}
        >
          <span style={{ fontSize: '8px' }}>●</span>
          {inConflict ? 'ACTIVE CONFLICT' : 'NO ACTIVE CONFLICT'}
        </div>
      </div>

      {/* Event cards */}
      <div className="space-y-5">
        {events.map((event, i) => (
          <div
            key={i}
            style={{
              borderLeft: `2px solid ${inConflict ? 'rgba(180,30,30,0.5)' : 'rgba(40,100,180,0.4)'}`,
              paddingLeft: '12px',
            }}
          >
            <ImagePlaceholder />
            <p className="text-xs leading-relaxed text-text/75">
              {event.summary}
            </p>
          </div>
        ))}
      </div>

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
          ATLAS • Phase 1 Prototype
        </div>
      </div>
    </div>
  );
}
