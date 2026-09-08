import { describe, expect, it } from 'vitest';

import { getConfiguredAeronauticalRepository } from './configuredRepository';

describe('aeronautical repository configuration', () => {
  it('uses normalized Avinor eAIP data unless synthetic data is explicit', async () => {
    const approvedMetadata = await getConfiguredAeronauticalRepository('')
      .getDatasetMetadata();
    expect(approvedMetadata).toMatchObject({
      providerId: 'avinor',
      sourceName: 'eAIP',
    });
    if (approvedMetadata === null) {
      throw new Error('Configured Avinor repository returned no metadata');
    }
    expect(approvedMetadata.datasetId).toMatch(/^avinor-eaip-\d{4}-\d{2}-\d{2}$/);
    expect(approvedMetadata.effectiveFromUtc).toMatch(
      /^\d{4}-\d{2}-\d{2}T00:00:00Z$/,
    );

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
        latitude: expect.any(Number),
        longitude: expect.any(Number),
      },
    });
    if (feature === undefined) {
      throw new Error('ENDU feature was not returned');
    }
    await expect(repository.getFeatureDetails(feature.ref)).resolves.toMatchObject({
      detailKind: 'aerodrome',
      icaoIdentifier: 'ENDU',
      elevationFt: expect.any(Number),
      runways: expect.any(Array),
    });
  });

  it('loads every AD 2 aerodrome in the configured local dataset', async () => {
    const features = await getConfiguredAeronauticalRepository('').queryFeatures({
      bounds: { south: 50, west: -20, north: 85, east: 45 },
      featureKinds: ['aerodrome'],
    });

    expect(features.length).toBeGreaterThan(0);
    expect(features.map((feature) => feature.identifier)).toContain('ENDU');
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
    ).length).toBeGreaterThan(0);
    expect(airspaces.filter(
      (feature) => feature.geometryType === 'area' && feature.areaKind === 'cta',
    ).length).toBeGreaterThan(0);

    const serviceAreas = await repository.queryAtsServiceAreas({
      bounds: { south: 55, west: -10, north: 82, east: 35 },
    });
    const resolvedPolarisSector = serviceAreas.find(
      ({ publishedName, geometryStatus }) =>
        publishedName.startsWith('Polaris ACC Sector') &&
        geometryStatus === 'resolved',
    );
    expect(serviceAreas.length).toBeGreaterThan(0);
    expect(serviceAreas.some(({ geometryStatus }) => geometryStatus === 'resolved')).toBe(true);
    expect(resolvedPolarisSector).toMatchObject({
      geometryStatus: 'resolved',
      sectorIdentifier: expect.any(String),
    });
    await expect(
      repository.getCommunicationService(
        resolvedPolarisSector?.communicationServiceId ?? '',
      ),
    ).resolves.toMatchObject({
      frequencies: expect.arrayContaining([expect.objectContaining({
        valueMHz: expect.stringMatching(/^\d{3}\.\d{3}$/),
      })]),
    });
  });

  it('lists only services that the route communication planner can select', async () => {
    const services = await getConfiguredAeronauticalRepository('')
      .listPlanningCommunicationServices();
    expect(services.length).toBeGreaterThan(0);
    expect(services.every(({ frequencies }) => frequencies.length > 0)).toBe(true);
    expect(services.some(
      ({ id }) => id === 'communication:enr21:polaris-cta:area-control:polaris-control',
    )).toBe(false);
  });
});
