import type { CountryData, ArcData } from '../types';

// Phase 1 test dataset: G20 + active conflict zones
// flag_color: dominant hex from national flag, used for border stroke
// in_conflict: active armed conflict as of data date
export const HARDCODED_COUNTRIES: CountryData[] = [
  // Stable tier
  { code: 'NO', name: 'Norway',      stability_score: 94, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#EF2B2D', centroid: [60.5, 8.5],     flag: '🇳🇴' },
  { code: 'CH', name: 'Switzerland', stability_score: 91, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#FF0000', centroid: [46.8, 8.2],     flag: '🇨🇭' },
  { code: 'NZ', name: 'New Zealand', stability_score: 90, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#00247D', centroid: [-40.9, 174.9],  flag: '🇳🇿' },
  { code: 'FI', name: 'Finland',     stability_score: 89, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#003580', centroid: [61.9, 25.7],    flag: '🇫🇮' },
  { code: 'CA', name: 'Canada',      stability_score: 85, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#FF0000', centroid: [56.1, -106.3],  flag: '🇨🇦' },
  { code: 'AU', name: 'Australia',   stability_score: 83, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#00008B', centroid: [-25.3, 133.8],  flag: '🇦🇺' },
  { code: 'JP', name: 'Japan',       stability_score: 82, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#BC002D', centroid: [36.2, 138.2],   flag: '🇯🇵' },
  { code: 'DE', name: 'Germany',     stability_score: 79, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#DD0000', centroid: [51.2, 10.4],    flag: '🇩🇪' },
  { code: 'GB', name: 'UK',          stability_score: 76, unrest_level: 0, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#012169', centroid: [55.4, -3.4],    flag: '🇬🇧' },
  { code: 'FR', name: 'France',      stability_score: 75, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#002395', centroid: [46.2, 2.2],     flag: '🇫🇷' },
  { code: 'US', name: 'USA',         stability_score: 72, unrest_level: 1, in_conflict: true,  conflict_status: 'military_operation', flag_color: '#3C3B6E', centroid: [37.1, -95.7],   flag: '🇺🇸' },
  { code: 'KR', name: 'South Korea', stability_score: 74, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',           flag_color: '#003478', centroid: [35.9, 127.8],   flag: '🇰🇷' },

  // Mid tier
  { code: 'IT', name: 'Italy',         stability_score: 68, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#009246', centroid: [41.9, 12.6],  flag: '🇮🇹' },
  { code: 'CN', name: 'China',         stability_score: 62, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#DE2910', centroid: [35.9, 104.2], flag: '🇨🇳' },
  { code: 'BR', name: 'Brazil',        stability_score: 60, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#009C3B', centroid: [-14.2, -51.9],flag: '🇧🇷' },
  { code: 'IN', name: 'India',         stability_score: 57, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#FF9933', centroid: [20.6, 78.9],  flag: '🇮🇳' },
  { code: 'ZA', name: 'South Africa',  stability_score: 52, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#007A4D', centroid: [-30.6, 22.9], flag: '🇿🇦' },
  { code: 'AR', name: 'Argentina',     stability_score: 49, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#74ACDF', centroid: [-38.4, -63.6],flag: '🇦🇷' },
  { code: 'MX', name: 'Mexico',        stability_score: 47, unrest_level: 2, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#006847', centroid: [23.6, -102.5],flag: '🇲🇽' },
  { code: 'EG', name: 'Egypt',         stability_score: 43, unrest_level: 2, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#CE1126', centroid: [26.8, 30.8],  flag: '🇪🇬' },
  { code: 'TR', name: 'Turkey',        stability_score: 42, unrest_level: 2, in_conflict: false, conflict_status: 'peaceful',        flag_color: '#E30A17', centroid: [38.9, 35.2],  flag: '🇹🇷' },
  { code: 'PK', name: 'Pakistan',      stability_score: 38, unrest_level: 2, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#01411C', centroid: [30.4, 69.3],  flag: '🇵🇰' },
  { code: 'NG', name: 'Nigeria',       stability_score: 35, unrest_level: 2, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#008751', centroid: [9.1, 8.7],    flag: '🇳🇬' },
  { code: 'VE', name: 'Venezuela',     stability_score: 32, unrest_level: 3, in_conflict: false, conflict_status: 'impacted',        flag_color: '#CF142B', centroid: [6.4, -66.6],  flag: '🇻🇪' },

  { code: 'AE',    name: 'UAE',          stability_score: 58, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',     flag_color: '#00732F', centroid: [23.4,  53.8],  flag: '🇦🇪' },
  { code: 'KP',    name: 'North Korea',  stability_score: 28, unrest_level: 2, in_conflict: false, conflict_status: 'civil_unrest', flag_color: '#024FA2', centroid: [40.3, 127.5],  flag: '🇰🇵' },
  { code: 'CN-TW', name: 'Taiwan',       stability_score: 68, unrest_level: 1, in_conflict: false, conflict_status: 'peaceful',     flag_color: '#FE0000', centroid: [23.7, 121.0],  flag: '🇹🇼' },

  // Active conflict zone tier
  { code: 'IR', name: 'Iran',         stability_score: 22, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#239F40', centroid: [32.4, 53.7],   flag: '🇮🇷' },
  { code: 'LB', name: 'Lebanon',      stability_score: 18, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#00A651', centroid: [33.9, 35.5],   flag: '🇱🇧' },
  { code: 'SA', name: 'Saudi Arabia', stability_score: 26, unrest_level: 2, in_conflict: false, conflict_status: 'impacted',        flag_color: '#006C35', centroid: [23.9,  45.1],  flag: '🇸🇦' },
  { code: 'IQ', name: 'Iraq',         stability_score: 24, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#007A3D', centroid: [33.2,  43.7],  flag: '🇮🇶' },
  { code: 'PS', name: 'Palestine',    stability_score: 4,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#000000', centroid: [31.9,  35.2],  flag: '🇵🇸' },
  { code: 'LY', name: 'Libya',        stability_score: 14, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#239E46', centroid: [26.3,  17.2],  flag: '🇱🇾' },
  { code: 'SO', name: 'Somalia',      stability_score: 7,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#4189DD', centroid: [5.2,   46.2],  flag: '🇸🇴' },
  { code: 'CD', name: 'DR Congo',     stability_score: 8,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#007FFF', centroid: [-4.0,  21.8],  flag: '🇨🇩' },
  { code: 'ML', name: 'Mali',         stability_score: 10, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#009A00', centroid: [17.6,  -4.0],  flag: '🇲🇱' },
  { code: 'BF', name: 'Burkina Faso', stability_score: 10, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#EF2B2D', centroid: [12.3,  -1.6],  flag: '🇧🇫' },
  { code: 'NE', name: 'Niger',        stability_score: 11, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#E05206', centroid: [17.6,   8.1],  flag: '🇳🇪' },
  { code: 'TD', name: 'Chad',         stability_score: 13, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#002664', centroid: [15.5,  18.7],  flag: '🇹🇩' },
  { code: 'MZ', name: 'Mozambique',   stability_score: 19, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict', flag_color: '#009A44', centroid: [-18.7, 35.5],  flag: '🇲🇿' },
  { code: 'RU', name: 'Russia',      stability_score: 30, unrest_level: 2, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#003399', centroid: [61.5, 105.3],  flag: '🇷🇺' },
  { code: 'IL', name: 'Israel',      stability_score: 28, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#0038B8', centroid: [31.0, 34.9],   flag: '🇮🇱' },
  { code: 'ET', name: 'Ethiopia',    stability_score: 25, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#078930', centroid: [9.1, 40.5],    flag: '🇪🇹' },
  { code: 'UA', name: 'Ukraine',     stability_score: 20, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#005BBB', centroid: [48.4, 31.2],   flag: '🇺🇦' },
  { code: 'MM', name: 'Myanmar',     stability_score: 15, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#FECB00', centroid: [21.9, 95.9],   flag: '🇲🇲' },
  { code: 'SD', name: 'Sudan',       stability_score: 12, unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#D21034', centroid: [12.9, 30.2],   flag: '🇸🇩' },
  { code: 'HT', name: 'Haiti',       stability_score: 9,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#00209F', centroid: [18.9, -72.3],  flag: '🇭🇹' },
  { code: 'SY', name: 'Syria',       stability_score: 8,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#CE1126', centroid: [34.8, 38.9],   flag: '🇸🇾' },
  { code: 'YE', name: 'Yemen',       stability_score: 6,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#CE1126', centroid: [15.6, 48.5],   flag: '🇾🇪' },
  { code: 'AF', name: 'Afghanistan', stability_score: 5,  unrest_level: 3, in_conflict: true,  conflict_status: 'active_conflict',  flag_color: '#007A3D', centroid: [33.9, 67.7],   flag: '🇦🇫' },
];

// Build lookup map for O(1) access
export const COUNTRY_MAP: Map<string, CountryData> = new Map(
  HARDCODED_COUNTRIES.map(c => [c.code, c])
);

// Phase 1 hardcoded arcs — validates arc rendering and color coding
export const HARDCODED_ARCS: ArcData[] = [
  // Trade arcs (teal)
  { startLat: 37.1, startLng: -95.7,  endLat: 35.9,  endLng: 104.2,  type: 'trade',    intensity: 0.9, label: 'US–China Trade' },
  { startLat: 56.1, startLng: -106.3, endLat: 51.2,  endLng: 10.4,   type: 'trade',    intensity: 0.7, label: 'Canada–Germany Trade' },
  { startLat: 36.2, startLng: 138.2,  endLat: 20.6,  endLng: 78.9,   type: 'trade',    intensity: 0.6, label: 'Japan–India Trade' },
  { startLat: -25.3,startLng: 133.8,  endLat: 35.9,  endLng: 104.2,  type: 'trade',    intensity: 0.5, label: 'Australia–China Trade' },

  // Conflict arcs (red)
  { startLat: 61.5, startLng: 105.3,  endLat: 48.4,  endLng: 31.2,   type: 'conflict', intensity: 1.0, label: 'Russia–Ukraine' },
  { startLat: 37.1, startLng: -95.7,  endLat: 32.4,  endLng: 53.7,   type: 'conflict', intensity: 1.0, label: 'US–Iran (Op. Epic Fury)' },
  { startLat: 31.0, startLng: 34.9,   endLat: 32.4,  endLng: 53.7,   type: 'conflict', intensity: 1.0, label: 'Israel–Iran' },
  { startLat: 31.0, startLng: 34.9,   endLat: 33.9,  endLng: 35.5,   type: 'conflict', intensity: 0.95,label: 'Israel–Lebanon' },
  { startLat: 33.9, startLng: 67.7,   endLat: 30.4,  endLng: 69.3,   type: 'conflict', intensity: 0.85,label: 'Afghanistan–Pakistan' },
  { startLat: 12.9, startLng: 30.2,   endLat: 9.1,   endLng: 40.5,   type: 'conflict', intensity: 0.6, label: 'Sudan–Ethiopia' },
  { startLat: 32.4, startLng: 53.7,   endLat: 23.9,  endLng: 45.1,   type: 'conflict', intensity: 0.9, label: 'Iran–Saudi Arabia' },
  { startLat: 32.4, startLng: 53.7,   endLat: 23.4,  endLng: 53.8,   type: 'conflict', intensity: 0.75,label: 'Iran–UAE' },

  // Diplomacy arcs (amber)
  { startLat: 37.1, startLng: -95.7,  endLat: 48.4,  endLng: 31.2,   type: 'diplomacy',intensity: 0.75,label: 'US–Ukraine Peace Talks' },
  { startLat: 51.2, startLng: 10.4,   endLat: 55.4,  endLng: -3.4,   type: 'diplomacy',intensity: 0.5, label: 'EU–UK Relations' },
  { startLat: 35.9, startLng: 127.8,  endLat: 36.2,  endLng: 138.2,  type: 'diplomacy',intensity: 0.6, label: 'Korea–Japan Diplomacy' },

  // Trade arcs (teal) — keep existing
  { startLat: 35.9, startLng: 104.2,  endLat: 32.4,  endLng: 53.7,   type: 'trade',    intensity: 0.6, label: 'China–Iran Trade' },
];

// ISO2 code mapping for known GeoJSON mismatches
export const CODE_FIXES: Record<string, string> = {
  'FR': 'FR',
  'NO': 'NO',
  '-99': '',
};
