import { describe, expect, it } from 'vitest';

import type { AeronauticalAreaFeature } from '../../domain';
import { airspacesAtPosition } from './airspacesAtPosition';

const dataset = {
  datasetId: 'test', providerId: 'test', sourceName: 'test', airacCycle: null,
  effectiveFromUtc: '2026-01-01T00:00:00Z', effectiveToUtc: null,
};

function area(
  featureId: string,
  areaKind: AeronauticalAreaFeature['areaKind'],
  south: number,
  west: number,
  north: number,
  east: number,
  holes: AeronauticalAreaFeature['polygons'][number]['holes'] = [],
): AeronauticalAreaFeature {
  return {
    geometryType: 'area', areaKind, name: featureId,
    ref: { dataset, featureId, featureKind: areaKind },
    polygons: [{
      outerRing: [
        { latitude: south, longitude: west },
        { latitude: south, longitude: east },
        { latitude: north, longitude: east },
        { latitude: north, longitude: west },
      ],
      holes,
    }],
  };
}

describe('airspacesAtPosition', () => {
  it('returns every stacked area with CTR/TIZ before TMA', () => {
    const result = airspacesAtPosition([
      area('TMA', 'tma', 68, 17, 70, 20),
      area('CTR', 'ctr', 68.5, 17.5, 69.5, 19),
      area('TIZ', 'tiz', 68.75, 17.75, 69.25, 18.75),
    ], { latitude: 69, longitude: 18 });

    expect(result.map(({ name }) => name)).toEqual(['CTR', 'TIZ', 'TMA']);
  });

  it('excludes areas outside the pointer and positions inside a polygon hole', () => {
    const hole = [[
      { latitude: 68.8, longitude: 17.8 },
      { latitude: 68.8, longitude: 18.2 },
      { latitude: 69.2, longitude: 18.2 },
      { latitude: 69.2, longitude: 17.8 },
    ]];
    expect(airspacesAtPosition([
      area('HOLE', 'tma', 68, 17, 70, 20, hole),
      area('AWAY', 'ctr', 60, 10, 61, 11),
    ], { latitude: 69, longitude: 18 })).toEqual([]);
  });

  it('treats a polygon boundary as part of the area', () => {
    expect(airspacesAtPosition([
      area('CTR', 'ctr', 68, 17, 70, 20),
    ], { latitude: 68, longitude: 18 })).toHaveLength(1);
  });
});
