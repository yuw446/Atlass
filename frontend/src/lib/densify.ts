// Edge densification for Globe.gl polygons. Long edges become straight chords through the sphere, so any edge
// longer than MAX_EDGE_DEG gets intermediate points. Survived a reverted winding-order fix last cycle; kept as is.
export const MAX_EDGE_DEG = 3;

export function densifyRing(ring: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    out.push(ring[i]);
    const dLng = ring[i + 1][0] - ring[i][0];
    const dLat = ring[i + 1][1] - ring[i][1];
    const dist = Math.sqrt(dLng * dLng + dLat * dLat);
    if (dist > MAX_EDGE_DEG) {
      const steps = Math.ceil(dist / MAX_EDGE_DEG);
      for (let s = 1; s < steps; s++) out.push([ring[i][0] + dLng * (s / steps), ring[i][1] + dLat * (s / steps)]);
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

export interface Geometry { type: string; coordinates: unknown }

export function densifyGeometry(g: Geometry): Geometry {
  if (g.type === 'Polygon') return { ...g, coordinates: (g.coordinates as number[][][]).map(densifyRing) };
  if (g.type === 'MultiPolygon') return { ...g, coordinates: (g.coordinates as number[][][][]).map(poly => poly.map(densifyRing)) };
  return g;
}
