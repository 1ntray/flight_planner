import { describe, expect, it } from 'vitest';

import type {
  AeronauticalDatasetRef,
  AeronauticalFeature,
} from '../domain';
import { InMemoryAeronauticalRepository } from './inMemoryRepository';

const dataset: AeronauticalDatasetRef = {
  datasetId: 'test-dataset',
  providerId: 'test-provider',
  sourceName: 'Test source',
  airacCycle: '2608',
  effectiveFromUtc: '2026-08-06T00:00:00Z',
  effectiveToUtc: '2026-09-03T00:00:00Z',
};

const features: readonly AeronauticalFeature[] = [
  {
    geometryType: 'point',
    pointKind: 'reporting-point',
    ref: {
      dataset,
      featureId: 'inside-point',
      featureKind: 'reporting-point',
    },
    identifier: 'INSIDE',
    suggestedWaypointName: 'INSIDE',
    position: { latitude: 69.3, longitude: 18.8 },
  },
  {
    geometryType: 'point',
    pointKind: 'navaid',
    ref: {
      dataset,
      featureId: 'outside-point',
      featureKind: 'navaid',
    },
    identifier: 'OUTSIDE',
    suggestedWaypointName: 'OUTSIDE',
    position: { latitude: 60, longitude: 10 },
  },
  {
    geometryType: 'area',
    areaKind: 'ctr',
    ref: { dataset, featureId: 'intersecting-area', featureKind: 'ctr' },
    name: 'Intersecting area',
    polygons: [
      {
        outerRing: [
          { latitude: 69, longitude: 18 },
          { latitude: 69, longitude: 19 },
          { latitude: 70, longitude: 19 },
          { latitude: 70, longitude: 18 },
        ],
        holes: [],
      },
    ],
  },
];

describe('InMemoryAeronauticalRepository', () => {
  const repository = new InMemoryAeronauticalRepository(dataset, features);
  const bounds = { south: 69.2, west: 18.5, north: 69.6, east: 19.1 };

  it('returns exact dataset provenance', async () => {
    await expect(repository.getDatasetMetadata()).resolves.toBe(dataset);
  });

  it('filters by WGS84 viewport and semantic feature kind', async () => {
    await expect(
      repository.queryFeatures({
        bounds,
        featureKinds: ['reporting-point', 'navaid', 'ctr'],
      }),
    ).resolves.toEqual([features[0], features[2]]);

    await expect(
      repository.queryFeatures({
        bounds,
        featureKinds: ['navaid'],
      }),
    ).resolves.toEqual([]);
  });

  it('resolves only an exact provider, dataset, feature, and version reference', async () => {
    await expect(repository.getFeature(features[0]!.ref)).resolves.toBe(
      features[0],
    );
    await expect(
      repository.getFeature({
        ...features[0]!.ref,
        dataset: { ...dataset, datasetId: 'newer-dataset' },
      }),
    ).resolves.toBeNull();
  });

  it('honours an aborted query without returning stale features', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      repository.queryFeatures(
        { bounds, featureKinds: ['reporting-point'] },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

