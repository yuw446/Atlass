import './index.css';
import GlobeContainer from './components/Globe/GlobeContainer';
import DigestPanel from './components/DigestPanel/DigestPanel';
import { useGlobeStore } from './store/globeStore';

function App() {
  const isPanelOpen = useGlobeStore(s => s.isPanelOpen);
  const PANEL_WIDTH = isPanelOpen ? 380 : 0;

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
          gap: 8,
        }}
      >
        {/* Fill states */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: 'rgba(110,12,12,0.88)', border: '1px solid rgba(200,40,40,0.5)' }} />
          <span>ACTIVE CONFLICT</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: 'rgba(8,18,40,0.85)', border: '1px solid rgba(40,80,160,0.4)' }} />
          <span>PEACEFUL</span>
        </div>
        {/* Arc types */}
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 3, background: '#C0392B', borderRadius: 2 }} />
          <span>CONFLICT</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 3, background: '#D4821A', borderRadius: 2 }} />
          <span>DIPLOMACY</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 3, background: '#0D9E8A', borderRadius: 2 }} />
          <span>TRADE</span>
        </div>
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
        }}
      >
        CLICK ANY COUNTRY
      </div>

      {/* Globe */}
      <GlobeContainer panelWidth={PANEL_WIDTH} />

      {/* Digest panel */}
      <DigestPanel />
    </div>
  );
}

export default App;
