import { create } from 'zustand';
import type { CountryData, ArcData, GlobeFeature, GdeltEvent } from '../types';

interface GlobeState {
  // Data
  features: GlobeFeature[];           // GeoJSON features enriched with country data
  arcs: ArcData[];
  countryMap: Map<string, CountryData>;

  // Interaction state
  hoveredCountry: string | null;      // ISO2 code
  selectedCountry: string | null;     // ISO2 code
  isPanelOpen: boolean;

  // Globe UI
  autoRotate: boolean;

  // GDELT hex layer
  activeLayer: 'gdelt-hex' | null;
  gdeltEvents: GdeltEvent[];
  hexCurrentTime: Date | null;        // null = show all events (no time filter)
  gdeltLoading: boolean;
  gdeltError: string | null;

  // Actions — all stable references (no closures over state)
  setFeatures: (features: GlobeFeature[]) => void;
  setArcs: (arcs: ArcData[]) => void;
  setCountryMap: (map: Map<string, CountryData>) => void;
  setHoveredCountry: (code: string | null) => void;
  selectCountry: (code: string | null) => void;
  closePanel: () => void;
  setAutoRotate: (val: boolean) => void;

  // GDELT actions
  setActiveLayer: (layer: 'gdelt-hex' | null) => void;
  setGdeltEvents: (events: GdeltEvent[]) => void;
  setHexCurrentTime: (t: Date | null) => void;
  setGdeltLoading: (loading: boolean) => void;
  setGdeltError: (err: string | null) => void;
}

export const useGlobeStore = create<GlobeState>((set) => ({
  features: [],
  arcs: [],
  countryMap: new Map(),
  hoveredCountry: null,
  selectedCountry: null,
  isPanelOpen: false,
  autoRotate: true,

  activeLayer: null,
  gdeltEvents: [],
  hexCurrentTime: null,
  gdeltLoading: false,
  gdeltError: null,

  setFeatures: (features) => set({ features }),
  setArcs: (arcs) => set({ arcs }),
  setCountryMap: (map) => set({ countryMap: map }),
  setHoveredCountry: (code) => set({ hoveredCountry: code }),
  selectCountry: (code) =>
    set({ selectedCountry: code, isPanelOpen: code !== null, autoRotate: false }),
  closePanel: () => set({ selectedCountry: null, isPanelOpen: false, autoRotate: true }),
  setAutoRotate: (val) => set({ autoRotate: val }),

  setActiveLayer: (layer) => set({ activeLayer: layer }),
  setGdeltEvents: (events) => set({ gdeltEvents: events }),
  setHexCurrentTime: (t) => set({ hexCurrentTime: t }),
  setGdeltLoading: (loading) => set({ gdeltLoading: loading }),
  setGdeltError: (err) => set({ gdeltError: err }),
}));
