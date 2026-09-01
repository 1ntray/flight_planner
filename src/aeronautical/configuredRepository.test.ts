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
      runways: [{
        identifier: '10/28',
        directions: [
          {
            designator: '10',
            declaredDistances: { todaM: 2443, ldaM: 2001 },
          },
          {
            designator: '28',
            declaredDistances: { todaM: 2443, ldaM: 2443 },
          },
        ],
      }],
    });
  });

  it('loads every AD 2 aerodrome in the configured local dataset', async () => {
    const features = await getConfiguredAeronauticalRepository('').queryFeatures({
      bounds: { south: 50, west: -20, north: 85, east: 45 },
      featureKinds: ['aerodrome'],
    });

    expect(features).toHaveLength(53);
    expect(features.map((feature) => feature.identifier)).toContain('ENTC');
    expect(features.map((feature) => feature.identifier)).toContain('ENVA');
  });

  it('resolves alternate aerodromes by ICAO code without a map viewport', async () => {
    await expect(
      getConfiguredAeronauticalRepository('').findAerodromeByIdentifier(' entc '),
    ).resolves.toMatchObject({
      pointKind: 'aerodrome',
      identifier: 'ENTC',
    });
  });

  it('provides ENR 2.2 TIA and resolved Polaris service coverage locally', async () => {
    const repository = getConfiguredAeronauticalRepository('');
    const airspaces = await repository.queryFeatures({
      bounds: { south: 55, west: -10, north: 82, east: 35 },
      featureKinds: ['tia', 'cta'],
    });
    expect(airspaces.filter(
      (feature) => feature.geometryType === 'area' && feature.areaKind === 'tia',
    )).toHaveLength(19);
    expect(airspaces.filter(
      (feature) => feature.geometryType === 'area' && feature.areaKind === 'cta',
    )).toHaveLength(24);

    const serviceAreas = await repository.queryAtsServiceAreas({
      bounds: { south: 55, west: -10, north: 82, east: 35 },
    });
    const sector10 = serviceAreas.find(
      ({ publishedName }) => publishedName === 'Polaris ACC Sector 10',
    );
    expect(sector10).toMatchObject({
      geometryStatus: 'resolved',
      sectorIdentifier: '10',
    });
    await expect(
      repository.getCommunicationService(sector10?.communicationServiceId ?? ''),
    ).resolves.toMatchObject({
      frequencies: [{ valueMHz: '136.280', remarks: 'Sector 10/11' }],
    });
  });
});
