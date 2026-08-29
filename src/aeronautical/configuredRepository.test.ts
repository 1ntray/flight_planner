import { describe, expect, it } from 'vitest';

import { getConfiguredAeronauticalRepository } from './configuredRepository';

describe('aeronautical repository configuration', () => {
  it('uses normalized Avinor eAIP data unless synthetic data is explicit', async () => {
    await expect(
      getConfiguredAeronauticalRepository('').getDatasetMetadata(),
    ).resolves.toMatchObject({
      datasetId: 'avinor-eaip-2026-06-11',
      providerId: 'avinor',
      sourceName: 'eAIP',
      effectiveFromUtc: '2026-06-11T00:00:00Z',
    });

    await expect(
      getConfiguredAeronauticalRepository('?aeroDemo=1').getDatasetMetadata(),
    ).resolves.toMatchObject({
      datasetId: 'synthetic-demo-1',
      airacCycle: null,
      sourceName: 'Synthetic development data — not for navigation',
    });
  });

  it('provides ENDU as a lightweight map feature with separate details', async () => {
    const repository = getConfiguredAeronauticalRepository('');
    const features = await repository.queryFeatures({
      bounds: { south: 68.9, west: 18.3, north: 69.2, east: 18.8 },
      featureKinds: ['aerodrome'],
    });
    const feature = features[0];

    expect(feature).toMatchObject({
      geometryType: 'point',
      identifier: 'ENDU',
      position: {
        latitude: 69.05583333333333,
        longitude: 18.540277777777778,
      },
    });
    if (feature === undefined) {
      throw new Error('ENDU feature was not returned');
    }
    await expect(repository.getFeatureDetails(feature.ref)).resolves.toMatchObject({
      detailKind: 'aerodrome',
      icaoIdentifier: 'ENDU',
      elevationFt: 254,
      runways: [{ identifier: '10/28', lengthM: 2995 }],
    });
  });
});
