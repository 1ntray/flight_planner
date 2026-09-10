import {
  calculateInverseGeodesic,
  calculatePositionAtDistanceAndTrack,
} from '../../calculations';
import type { Position } from '../../domain';

const CIRCLE_SEGMENT_COUNT = 72;

export interface CirclingMeasurement {
  readonly center: Position;
  readonly edge: Position;
  readonly radiusNm: number;
  /** Closed WGS84 ring used solely for map presentation. */
  readonly ring: readonly Position[];
}

/**
 * Builds a geodesic measurement ring. It is deliberately derived from the
 * cursor only and is never part of the flight-plan state.
 */
export function buildCirclingMeasurement(
  center: Position,
  edge: Position,
): CirclingMeasurement {
  const radiusNm = calculateInverseGeodesic(center, edge).distanceNm;
  const ring = Array.from({ length: CIRCLE_SEGMENT_COUNT + 1 }, (_, index) =>
    calculatePositionAtDistanceAndTrack(
      center,
      index / CIRCLE_SEGMENT_COUNT * 360,
      radiusNm,
    ),
  );

  return { center, edge, radiusNm, ring };
}
