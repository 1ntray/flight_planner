import { describe, expect, it } from 'vitest';

import { calculateInverseGeodesic } from './geodesy';
import {
  calculateNearestPointOnGeometry,
  calculatePositionAlongGeometry,
} from './routeProgress';

describe('calculatePositionAlongGeometry', () => {
  const geometry = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 1 },
  ];

  it('advances over WGS84 geometry segments by cumulative distance', () => {
    const firstDistance = calculateInverseGeodesic(
      geometry[0]!,
      geometry[1]!,
    ).distanceNm;
    const result = calculatePositionAlongGeometry(
      geometry,
      firstDistance + 10,
    );

    expect(result.segmentIndex).toBe(1);
    expect(result.distanceFromStartNm).toBeCloseTo(firstDistance + 10, 12);
    expect(result.position.longitude).toBeCloseTo(1, 10);
    expect(result.position.latitude).toBeGreaterThan(0);
  });

  it('clamps a display lookup to the geometry end', () => {
    const result = calculatePositionAlongGeometry(geometry, 10_000);

    expect(result.position.latitude).toBeCloseTo(1, 12);
    expect(result.position.longitude).toBeCloseTo(1, 12);
    expect(result.fractionAlongSegment).toBe(1);
  });
});

describe('calculateNearestPointOnGeometry', () => {
  it('snaps to the nearest shaped WGS84 segment and reports cumulative distance', () => {
    const geometry = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 1 },
    ];
    const firstDistanceNm = calculateInverseGeodesic(
      geometry[0]!,
      geometry[1]!,
    ).distanceNm;
    const result = calculateNearestPointOnGeometry(
      geometry,
      { latitude: 0.4, longitude: 1.05 },
    );

    expect(result.segmentIndex).toBe(1);
    expect(result.position.longitude).toBeCloseTo(1, 3);
    expect(result.distanceFromStartNm).toBeGreaterThan(firstDistanceNm);
    expect(result.distanceFromQueryMeters).toBeGreaterThan(0);
  });
});
