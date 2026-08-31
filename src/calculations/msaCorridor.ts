import type { Position } from '../domain';

import {
  calculateInverseGeodesic,
  calculatePositionAtDistanceAndTrack,
} from './geodesy';

/** The required obstacle-assessment distance on either side of the route. */
export const MSA_CORRIDOR_RADIUS_NM = 1;

const VERTEX_DISC_SIDES = 16;

/**
 * A WGS84 approximation of the one-NM-each-side route corridor. The polygons
 * are intentionally overlapping: Leaflet renders their visual union, while
 * all offsets remain geodesic rather than screen- or Mercator-based.
 */
export interface MsaCorridorGeometry {
  readonly polygons: readonly (readonly Position[])[];
}

function createVertexDisc(position: Position): readonly Position[] {
  return Array.from({ length: VERTEX_DISC_SIDES }, (_, index) =>
    calculatePositionAtDistanceAndTrack(
      position,
      (index * 360) / VERTEX_DISC_SIDES,
      MSA_CORRIDOR_RADIUS_NM,
    ),
  );
}

/**
 * Builds a corridor around every segment of the actual (possibly shaped)
 * route geometry. Vertex discs retain the full one-NM radius through bends.
 */
export function buildMsaCorridorGeometry(
  geometry: readonly Position[],
): MsaCorridorGeometry {
  if (geometry.length === 0) return { polygons: [] };

  const polygons: Position[][] = geometry.map((position) => [
    ...createVertexDisc(position),
  ]);

  for (let index = 1; index < geometry.length; index += 1) {
    const start = geometry[index - 1]!;
    const end = geometry[index]!;
    const inverse = calculateInverseGeodesic(start, end);

    if (inverse.trueTrackDeg === null) continue;

    const leftTrackDeg = inverse.trueTrackDeg - 90;
    const rightTrackDeg = inverse.trueTrackDeg + 90;
    polygons.push([
      calculatePositionAtDistanceAndTrack(start, leftTrackDeg, MSA_CORRIDOR_RADIUS_NM),
      calculatePositionAtDistanceAndTrack(end, leftTrackDeg, MSA_CORRIDOR_RADIUS_NM),
      calculatePositionAtDistanceAndTrack(end, rightTrackDeg, MSA_CORRIDOR_RADIUS_NM),
      calculatePositionAtDistanceAndTrack(start, rightTrackDeg, MSA_CORRIDOR_RADIUS_NM),
    ]);
  }

  return { polygons };
}
