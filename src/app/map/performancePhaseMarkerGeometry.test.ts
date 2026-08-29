import { describe, expect, it } from 'vitest';

import { calculatePerformanceTickAngleDeg } from './performancePhaseMarkerGeometry';

const identityProjection = (position: { latitude: number; longitude: number }) => ({
  x: position.longitude,
  y: position.latitude,
});

describe('performance phase marker geometry', () => {
  it('is perpendicular to the selected rendered route segment', () => {
    const geometry = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 10 },
      { latitude: 10, longitude: 10 },
    ];

    expect(
      calculatePerformanceTickAngleDeg(geometry, 0, identityProjection),
    ).toBeCloseTo(90, 12);
    expect(
      calculatePerformanceTickAngleDeg(geometry, 1, identityProjection),
    ).toBeCloseTo(180, 12);
  });

  it('does not lose orientation when projected coordinates are subpixel-small', () => {
    const geometry = [
      { latitude: 100.000_001, longitude: 200.000_001 },
      { latitude: 100.000_002, longitude: 200.000_004 },
    ];

    expect(
      calculatePerformanceTickAngleDeg(geometry, 0, identityProjection),
    ).toBeCloseTo(108.4349488, 6);
  });

  it('falls back to the nearest visible segment when one is degenerate', () => {
    const geometry = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 5, longitude: 0 },
    ];

    expect(
      calculatePerformanceTickAngleDeg(geometry, 0, identityProjection),
    ).toBeCloseTo(180, 12);
  });
});
