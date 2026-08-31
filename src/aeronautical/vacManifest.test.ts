import { describe, expect, it } from 'vitest';
import type { VacChartManifest } from '../domain';
import { validateVacChartManifest } from './vacManifest';

const manifest: VacChartManifest = {
  id: 'endu-vac-2026-06-11', aerodromeFeatureId: 'aerodrome:ENDU', title: 'Bardufoss VAC',
  chartDate: '2026-06-11', tileUrlTemplate: '/vac/endu/{z}/{x}/{y}.png', targetCrs: 'EPSG:3857',
  bounds: { south: 68.8, west: 17.6, north: 69.4, east: 19.2 }, minimumZoom: 9, maximumZoom: 14,
  defaultOpacity: 0.75,
  groundControlPoints: [
    { pixelX: 0, pixelY: 0, latitude: 69.4, longitude: 17.6 },
    { pixelX: 1000, pixelY: 0, latitude: 69.4, longitude: 19.2 },
    { pixelX: 1000, pixelY: 1000, latitude: 68.8, longitude: 19.2 },
    { pixelX: 0, pixelY: 1000, latitude: 68.8, longitude: 17.6 },
  ], sourceReferences: [],
};

describe('VAC chart manifest validation', () => {
  it('accepts a prepared Web Mercator tile manifest with retained control points', () => {
    expect(validateVacChartManifest(manifest)).toEqual([]);
  });

  it('rejects an untraceable or malformed runtime tile definition', () => {
    expect(validateVacChartManifest({
      ...manifest, tileUrlTemplate: '/vac/endu.png', defaultOpacity: 2, groundControlPoints: [],
    })).toEqual([
      'VAC defaultOpacity must be between 0 and 1',
      'VAC tile URL must contain {z}, {x}, and {y}',
      'VAC preparation must retain at least four ground-control points',
    ]);
  });
});
