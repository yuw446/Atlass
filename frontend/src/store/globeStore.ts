import { create } from 'zustand';
import type { GlobeFeature } from '../types';
import { reduce, initialState, type SnapState, type SnapEvent } from '../lib/snapshotState.ts';

interface GlobeState {
  // Geometry: set once when the GeoJSON loads; identity never changes afterwards (the colour tween depends on that)
  features: GlobeFeature[];
  names: Map<string, string>;          // code -> display name from the GeoJSON

  // Live data
  snap: SnapState;
  lensFilter: number | null;           // index into LENSES, or null for all lenses

  // Interaction
  hoveredCountry: string | null;
  selectedCountry: string | null;
  isPanelOpen: boolean;
  autoRotate: boolean;

  setFeatures: (features: GlobeFeature[], names: Map<string, string>) => void;
  dispatchSnap: (ev: SnapEvent) => void;
  toggleLens: (i: number) => void;
  setHoveredCountry: (code: string | null) => void;
  selectCountry: (code: string | null) => void;
  closePanel: () => void;
}

export const useGlobeStore = create<GlobeState>((set) => ({
  features: [],
  names: new Map(),
  snap: initialState,
  lensFilter: null,
  hoveredCountry: null,
  selectedCountry: null,
  isPanelOpen: false,
  autoRotate: true,

  setFeatures: (features, names) => set({ features, names }),
  dispatchSnap: (ev) => set(s => ({ snap: reduce(s.snap, ev) })),
  toggleLens: (i) => set(s => ({ lensFilter: s.lensFilter === i ? null : i })),
  setHoveredCountry: (code) => set({ hoveredCountry: code }),
  // Auto-rotate stops on selection and resumes on close. No mouse enter/leave handlers on the globe div:
  // they fired on the panel-open resize and re-enabled rotation through a stale closure last cycle.
  selectCountry: (code) => set({ selectedCountry: code, isPanelOpen: code !== null, autoRotate: false }),
  closePanel: () => set({ selectedCountry: null, isPanelOpen: false, autoRotate: true }),
}));
