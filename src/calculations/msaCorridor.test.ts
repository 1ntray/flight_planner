import { describe, expect, it } from 'vitest';

import { calculateInverseGeodesic } from './geodesy';
import { buildMsaCorridorGeometry, MSA_CORRIDOR_RADIUS_NM } from './msaCorridor';

describe('buildMsaCorridorGeometry', () => {
  it('uses WGS84 one-NM offsets, independent of map zoom or projection', () => {
    const start = { latitude: 69, longitude: 18 };
    const result = buildMsaCorridorGeometry([
      start,
      { latitude: 69, longitude: 18.2 },
    ]);

    // The first polygon is the cap at the FROM point. Every point on it is
    // exactly one nautical mile away on the WGS84 ellipsoid.
    expect(result.polygons[0]).toHaveLength(16);
    expect(
      calculateInverseGeodesic(start, result.polygons[0]![0]!).distanceNm,
    ).toBeCloseTo(MSA_CORRIDOR_RADIUS_NM, 10);
  });

  it('covers every shaped segment and preserves full width around bends', () => {
    const result = buildMsaCorridorGeometry([
      { latitude: 69, longitude: 18 },
      { latitude: 69.1, longitude: 18 },
      { latitude: 69.1, longitude: 18.1 },
    ]);

    // Three vertex discs plus a geodesic strip for each of the two segments.
    expect(result.polygons).toHaveLength(5);
    expect(result.polygons.slice(-2).every((polygon) => polygon.length === 4)).toBe(true);
  });

  it('does not create a strip for an identical geometry segment', () => {
    const result = buildMsaCorridorGeometry([
      { latitude: 69, longitude: 18 },
      { latitude: 69, longitude: 18 },
    ]);

    expect(result.polygons).toHaveLength(2);
  });
});
