import { Geodesic } from 'geographiclib-geodesic';

import type { Position } from '../domain';

export const METERS_PER_NAUTICAL_MILE = 1852;
export const EFFECTIVELY_IDENTICAL_DISTANCE_METERS = 0.001;

export interface InverseGeodesicResult {
  distanceNm: number;
  trueTrackDeg: number | null;
}

export interface NearestPointOnGeodesicSegmentResult {
  position: Position;
  distanceAlongSegmentMeters: number;
  distanceFromQueryMeters: number;
  segmentLengthMeters: number;
}

const NEAREST_POINT_COARSE_INTERVALS = 32;
const NEAREST_POINT_MAX_REFINEMENT_ITERATIONS = 64;
const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2;

export function normalizeTrackDeg(trackDeg: number): number {
  if (!Number.isFinite(trackDeg)) {
    throw new RangeError('Track must be a finite number');
  }

  return ((trackDeg % 360) + 360) % 360;
}

export function calculateInverseGeodesic(
  from: Position,
  to: Position,
): InverseGeodesicResult {
  const result = Geodesic.WGS84.Inverse(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  const distanceMeters = result.s12;

  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    throw new RangeError('Geodesic calculation did not return a finite distance');
  }

  if (distanceMeters <= EFFECTIVELY_IDENTICAL_DISTANCE_METERS) {
    return {
      distanceNm: 0,
      trueTrackDeg: null,
    };
  }

  const initialAzimuthDeg = result.azi1;

  if (initialAzimuthDeg === undefined || !Number.isFinite(initialAzimuthDeg)) {
    throw new RangeError('Geodesic calculation did not return a finite track');
  }

  return {
    distanceNm: distanceMeters / METERS_PER_NAUTICAL_MILE,
    trueTrackDeg: normalizeTrackDeg(initialAzimuthDeg),
  };
}

export function calculateGeodesicMidpoint(
  from: Position,
  to: Position,
): Position {
  const line = Geodesic.WGS84.InverseLine(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  const distanceMeters = line.s13;

  if (!Number.isFinite(distanceMeters)) {
    throw new RangeError('Geodesic calculation did not return a finite distance');
  }

  if (distanceMeters <= EFFECTIVELY_IDENTICAL_DISTANCE_METERS) {
    return { ...from };
  }

  const midpoint = line.Position(distanceMeters / 2);
  const latitude = midpoint.lat2;
  const longitude = midpoint.lon2;

  if (
    latitude === undefined ||
    longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new RangeError('Geodesic calculation did not return a finite midpoint');
  }

  return { latitude, longitude };
}

export function calculatePositionAlongGeodesic(
  from: Position,
  to: Position,
  fraction: number,
): Position {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('Geodesic fraction must be between zero and one');
  }

  const line = Geodesic.WGS84.InverseLine(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  const distanceMeters = line.s13;

  if (!Number.isFinite(distanceMeters)) {
    throw new RangeError('Geodesic calculation did not return a finite distance');
  }

  return requireLinePosition(line, distanceMeters * fraction);
}

function requireLinePosition(
  line: ReturnType<typeof Geodesic.WGS84.InverseLine>,
  distanceMeters: number,
): Position {
  const point = line.Position(distanceMeters);
  const latitude = point.lat2;
  const longitude = point.lon2;

  if (
    latitude === undefined ||
    longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new RangeError('Geodesic calculation did not return a finite position');
  }

  return { latitude, longitude };
}

function requireDistanceMeters(from: Position, to: Position): number {
  const result = Geodesic.WGS84.Inverse(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  const distanceMeters = result.s12;

  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    throw new RangeError('Geodesic calculation did not return a finite distance');
  }

  return distanceMeters;
}

/**
 * Finds the closest WGS84 point on the bounded shortest geodesic from
 * `segmentStart` to `segmentEnd`. The result is clamped to the segment ends.
 *
 * This is intentionally independent of Leaflet and map projection. A coarse
 * search brackets the nearest part of the geodesic before a bounded
 * golden-section refinement.
 */
export function calculateNearestPointOnGeodesicSegment(
  segmentStart: Position,
  segmentEnd: Position,
  query: Position,
): NearestPointOnGeodesicSegmentResult {
  const line = Geodesic.WGS84.InverseLine(
    segmentStart.latitude,
    segmentStart.longitude,
    segmentEnd.latitude,
    segmentEnd.longitude,
  );
  const segmentLengthMeters = line.s13;

  if (!Number.isFinite(segmentLengthMeters)) {
    throw new RangeError('Geodesic calculation did not return a finite distance');
  }

  if (segmentLengthMeters <= EFFECTIVELY_IDENTICAL_DISTANCE_METERS) {
    return {
      position: { ...segmentStart },
      distanceAlongSegmentMeters: 0,
      distanceFromQueryMeters: requireDistanceMeters(segmentStart, query),
      segmentLengthMeters,
    };
  }

  const distanceAt = (distanceAlongSegmentMeters: number) =>
    requireDistanceMeters(
      requireLinePosition(line, distanceAlongSegmentMeters),
      query,
    );
  let bestDistanceAlongMeters = 0;
  let bestDistanceFromQueryMeters = distanceAt(0);
  let bestCoarseIndex = 0;

  for (let index = 1; index <= NEAREST_POINT_COARSE_INTERVALS; index += 1) {
    const distanceAlongMeters =
      (segmentLengthMeters * index) / NEAREST_POINT_COARSE_INTERVALS;
    const distanceFromQueryMeters = distanceAt(distanceAlongMeters);

    if (distanceFromQueryMeters < bestDistanceFromQueryMeters) {
      bestDistanceAlongMeters = distanceAlongMeters;
      bestDistanceFromQueryMeters = distanceFromQueryMeters;
      bestCoarseIndex = index;
    }
  }

  let lowerBound =
    (segmentLengthMeters * Math.max(0, bestCoarseIndex - 1)) /
    NEAREST_POINT_COARSE_INTERVALS;
  let upperBound =
    (segmentLengthMeters * Math.min(
      NEAREST_POINT_COARSE_INTERVALS,
      bestCoarseIndex + 1,
    )) /
    NEAREST_POINT_COARSE_INTERVALS;
  let leftProbe =
    upperBound - GOLDEN_RATIO_CONJUGATE * (upperBound - lowerBound);
  let rightProbe =
    lowerBound + GOLDEN_RATIO_CONJUGATE * (upperBound - lowerBound);
  let leftDistance = distanceAt(leftProbe);
  let rightDistance = distanceAt(rightProbe);

  for (
    let iteration = 0;
    iteration < NEAREST_POINT_MAX_REFINEMENT_ITERATIONS &&
    upperBound - lowerBound > EFFECTIVELY_IDENTICAL_DISTANCE_METERS;
    iteration += 1
  ) {
    if (leftDistance <= rightDistance) {
      upperBound = rightProbe;
      rightProbe = leftProbe;
      rightDistance = leftDistance;
      leftProbe =
        upperBound - GOLDEN_RATIO_CONJUGATE * (upperBound - lowerBound);
      leftDistance = distanceAt(leftProbe);
    } else {
      lowerBound = leftProbe;
      leftProbe = rightProbe;
      leftDistance = rightDistance;
      rightProbe =
        lowerBound + GOLDEN_RATIO_CONJUGATE * (upperBound - lowerBound);
      rightDistance = distanceAt(rightProbe);
    }
  }

  const refinedDistanceAlongMeters = (lowerBound + upperBound) / 2;
  const refinedDistanceFromQueryMeters = distanceAt(
    refinedDistanceAlongMeters,
  );

  if (refinedDistanceFromQueryMeters < bestDistanceFromQueryMeters) {
    bestDistanceAlongMeters = refinedDistanceAlongMeters;
    bestDistanceFromQueryMeters = refinedDistanceFromQueryMeters;
  }

  return {
    position: requireLinePosition(line, bestDistanceAlongMeters),
    distanceAlongSegmentMeters: bestDistanceAlongMeters,
    distanceFromQueryMeters: bestDistanceFromQueryMeters,
    segmentLengthMeters,
  };
}
