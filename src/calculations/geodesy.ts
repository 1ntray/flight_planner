import { Geodesic } from 'geographiclib-geodesic';

import type { Position } from '../domain';

export const METERS_PER_NAUTICAL_MILE = 1852;
export const EFFECTIVELY_IDENTICAL_DISTANCE_METERS = 0.001;

export interface InverseGeodesicResult {
  distanceNm: number;
  trueTrackDeg: number | null;
}

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
