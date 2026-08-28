import type { Position } from '../domain';
import {
  calculateInverseGeodesic,
  calculateNearestPointOnGeodesicSegment,
  calculatePositionAlongGeodesic,
  METERS_PER_NAUTICAL_MILE,
} from './geodesy';

export interface PositionAlongGeometry {
  readonly position: Position;
  readonly distanceFromStartNm: number;
  readonly segmentIndex: number;
  readonly fractionAlongSegment: number;
}

export interface NearestPointOnGeometry extends PositionAlongGeometry {
  readonly distanceFromQueryMeters: number;
}

export function calculatePositionAlongGeometry(
  geometry: readonly Position[],
  requestedDistanceFromStartNm: number,
): PositionAlongGeometry {
  if (geometry.length === 0) {
    throw new RangeError('Route geometry must contain at least one position');
  }

  if (
    !Number.isFinite(requestedDistanceFromStartNm) ||
    requestedDistanceFromStartNm < 0
  ) {
    throw new RangeError('Distance along route geometry must not be negative');
  }

  const segmentDistancesNm = geometry.slice(1).map((position, index) =>
    calculateInverseGeodesic(geometry[index]!, position).distanceNm,
  );
  const totalDistanceNm = segmentDistancesNm.reduce(
    (total, distanceNm) => total + distanceNm,
    0,
  );
  const distanceFromStartNm = Math.min(
    requestedDistanceFromStartNm,
    totalDistanceNm,
  );

  if (geometry.length === 1 || totalDistanceNm === 0) {
    return {
      position: { ...geometry[0]! },
      distanceFromStartNm: 0,
      segmentIndex: 0,
      fractionAlongSegment: 0,
    };
  }

  let traversedNm = 0;

  for (
    let segmentIndex = 0;
    segmentIndex < segmentDistancesNm.length;
    segmentIndex += 1
  ) {
    const segmentDistanceNm = segmentDistancesNm[segmentIndex]!;
    const segmentEndNm = traversedNm + segmentDistanceNm;

    if (
      distanceFromStartNm <= segmentEndNm ||
      segmentIndex === segmentDistancesNm.length - 1
    ) {
      const fractionAlongSegment =
        segmentDistanceNm === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                (distanceFromStartNm - traversedNm) / segmentDistanceNm,
              ),
            );

      return {
        position: calculatePositionAlongGeodesic(
          geometry[segmentIndex]!,
          geometry[segmentIndex + 1]!,
          fractionAlongSegment,
        ),
        distanceFromStartNm,
        segmentIndex,
        fractionAlongSegment,
      };
    }

    traversedNm = segmentEndNm;
  }

  throw new Error('Route geometry position could not be resolved');
}

export function calculateNearestPointOnGeometry(
  geometry: readonly Position[],
  query: Position,
): NearestPointOnGeometry {
  if (geometry.length < 2) {
    throw new RangeError('Route geometry must contain at least two positions');
  }

  let traversedNm = 0;
  let best: NearestPointOnGeometry | null = null;

  for (let segmentIndex = 0; segmentIndex < geometry.length - 1; segmentIndex += 1) {
    const segment = calculateNearestPointOnGeodesicSegment(
      geometry[segmentIndex]!,
      geometry[segmentIndex + 1]!,
      query,
    );
    const segmentLengthNm = calculateInverseGeodesic(
      geometry[segmentIndex]!,
      geometry[segmentIndex + 1]!,
    ).distanceNm;
    const candidate: NearestPointOnGeometry = {
      position: segment.position,
      distanceFromStartNm:
        traversedNm +
          segment.distanceAlongSegmentMeters / METERS_PER_NAUTICAL_MILE,
      segmentIndex,
      fractionAlongSegment:
        segment.segmentLengthMeters === 0
          ? 0
          : segment.distanceAlongSegmentMeters / segment.segmentLengthMeters,
      distanceFromQueryMeters: segment.distanceFromQueryMeters,
    };

    if (
      best === null ||
      candidate.distanceFromQueryMeters < best.distanceFromQueryMeters
    ) {
      best = candidate;
    }

    traversedNm += segmentLengthNm;
  }

  if (best === null) {
    throw new Error('Nearest route geometry position could not be resolved');
  }

  return best;
}
