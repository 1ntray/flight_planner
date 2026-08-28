import { describe, expect, it } from 'vitest';

import {
  calculateGeodesicMidpoint,
  calculateInverseGeodesic,
  calculateNearestPointOnGeodesicSegment,
  EFFECTIVELY_IDENTICAL_DISTANCE_METERS,
  METERS_PER_NAUTICAL_MILE,
  normalizeTrackDeg,
} from './geodesy';

describe('normalizeTrackDeg', () => {
  it.each([
    { input: -90, expected: 270 },
    { input: 0, expected: 0 },
    { input: 360, expected: 0 },
    { input: 721.5, expected: 1.5 },
  ])('normalizes $input° to $expected°', ({ input, expected }) => {
    expect(normalizeTrackDeg(input)).toBe(expected);
  });
});

describe('calculateGeodesicMidpoint', () => {
  it('returns the halfway point by distance along a WGS84 geodesic', () => {
    const midpoint = calculateGeodesicMidpoint(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
    );

    expect(midpoint.latitude).toBeCloseTo(0, 12);
    expect(midpoint.longitude).toBeCloseTo(1, 12);
  });

  it('takes the short geodesic across the antimeridian', () => {
    const midpoint = calculateGeodesicMidpoint(
      { latitude: 10, longitude: 179 },
      { latitude: 10, longitude: -179 },
    );

    expect(midpoint.latitude).toBeGreaterThan(10);
    expect(Math.abs(midpoint.longitude)).toBeCloseTo(180, 10);
  });

  it('returns a copy of an effectively identical starting position', () => {
    const position = { latitude: 69.35, longitude: 18.75 };
    const midpoint = calculateGeodesicMidpoint(position, position);

    expect(midpoint).toEqual(position);
    expect(midpoint).not.toBe(position);
  });
});

describe('calculateInverseGeodesic', () => {
  it('uses the WGS84 inverse solution and converts metres to nautical miles', () => {
    const result = calculateInverseGeodesic(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );

    const expectedDistanceMeters = 111_319.490_793_273_57;

    expect(result.distanceNm).toBeCloseTo(
      expectedDistanceMeters / METERS_PER_NAUTICAL_MILE,
      10,
    );
    expect(result.trueTrackDeg).toBeCloseTo(90, 10);
  });

  it('normalizes a westbound initial track to [0, 360)', () => {
    const result = calculateInverseGeodesic(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: -1 },
    );

    expect(result.trueTrackDeg).toBeCloseTo(270, 10);
  });

  it('returns zero distance and no track for identical positions', () => {
    const position = { latitude: 59.6519, longitude: 17.9186 };

    expect(calculateInverseGeodesic(position, position)).toEqual({
      distanceNm: 0,
      trueTrackDeg: null,
    });
  });

  it('treats positions within the coincidence tolerance as identical', () => {
    const latitudeOffsetWithinTolerance =
      EFFECTIVELY_IDENTICAL_DISTANCE_METERS / 111_320 / 2;

    const result = calculateInverseGeodesic(
      { latitude: 0, longitude: 0 },
      { latitude: latitudeOffsetWithinTolerance, longitude: 0 },
    );

    expect(result).toEqual({ distanceNm: 0, trueTrackDeg: null });
  });
});

describe('calculateNearestPointOnGeodesicSegment', () => {
  it('snaps to the nearest point on a WGS84 geodesic segment', () => {
    const result = calculateNearestPointOnGeodesicSegment(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
      { latitude: 1, longitude: 1 },
    );

    expect(result.position.latitude).toBeCloseTo(0, 8);
    expect(result.position.longitude).toBeCloseTo(1, 8);
    expect(result.distanceAlongSegmentMeters).toBeCloseTo(
      result.segmentLengthMeters / 2,
      3,
    );
    expect(result.distanceFromQueryMeters).toBeCloseTo(110_574.389, 2);
  });

  it('clamps a nearest point outside the bounded segment to an endpoint', () => {
    const result = calculateNearestPointOnGeodesicSegment(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 0, longitude: 2 },
    );

    expect(result.position.latitude).toBeCloseTo(0, 12);
    expect(result.position.longitude).toBeCloseTo(1, 12);
    expect(result.distanceAlongSegmentMeters).toBeCloseTo(
      result.segmentLengthMeters,
      8,
    );
  });

  it('takes the short WGS84 segment across the antimeridian', () => {
    const result = calculateNearestPointOnGeodesicSegment(
      { latitude: 10, longitude: 179 },
      { latitude: 10, longitude: -179 },
      { latitude: 11, longitude: 180 },
    );

    expect(Math.abs(result.position.longitude)).toBeCloseTo(180, 7);
    expect(result.distanceAlongSegmentMeters).toBeCloseTo(
      result.segmentLengthMeters / 2,
      2,
    );
  });

  it('returns the start for an effectively zero-length segment', () => {
    const start = { latitude: 69.35, longitude: 18.75 };
    const result = calculateNearestPointOnGeodesicSegment(
      start,
      start,
      { latitude: 69.4, longitude: 18.8 },
    );

    expect(result.position).toEqual(start);
    expect(result.position).not.toBe(start);
    expect(result.distanceAlongSegmentMeters).toBe(0);
    expect(result.segmentLengthMeters).toBe(0);
    expect(result.distanceFromQueryMeters).toBeGreaterThan(0);
  });
});
