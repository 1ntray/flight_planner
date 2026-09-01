import { describe, expect, it } from 'vitest';

import type {
  AeronauticalAreaFeature,
  AirspaceDetails,
  AtsServiceArea,
  CommunicationService,
} from '../domain';
import {
  allocateCommunicationChangesToLegs,
  selectCommunicationAtPosition,
} from './communicationPlanning';
import type { CalculatedPerformanceRouteSuccess } from './performanceRoute';

const dataset = {
  datasetId: 'fixture',
  providerId: 'test',
  sourceName: 'fixture',
  airacCycle: null,
  effectiveFromUtc: '2026-01-01T00:00:00Z',
  effectiveToUtc: null,
};
const square = (west: number, south: number, east: number, north: number) => [{
  outerRing: [
    { latitude: south, longitude: west },
    { latitude: south, longitude: east },
    { latitude: north, longitude: east },
    { latitude: north, longitude: west },
    { latitude: south, longitude: west },
  ],
  holes: [],
}];
const feature = (
  id: string,
  areaKind: 'ctr' | 'tma' | 'cta',
): AeronauticalAreaFeature => ({
  geometryType: 'area',
  ref: { dataset, featureId: id, featureKind: areaKind },
  areaKind,
  name: id,
  polygons: square(18, 68, 20, 70),
});
const details = (
  featureValue: AeronauticalAreaFeature,
  lower: AirspaceDetails['lowerLimit'],
  upper: AirspaceDetails['upperLimit'],
  serviceId: string,
): AirspaceDetails => ({
  detailKind: 'airspace',
  ref: featureValue.ref,
  identifier: featureValue.name,
  publishedName: featureValue.name,
  airspaceType: featureValue.areaKind as 'ctr' | 'tma' | 'cta',
  publishedType: featureValue.areaKind.toUpperCase(),
  airspaceClass: 'D',
  lowerLimit: lower,
  upperLimit: upper,
  sourceGeometry: { kind: 'polygon', rings: [] },
  communicationServiceIds: [serviceId],
  sourceReferences: [],
});
const service = (id: string, frequency: string): CommunicationService => ({
  id,
  serviceType: id.includes('polaris') ? 'area-control' : 'approach',
  publishedServiceType: id.includes('polaris') ? 'ACC' : 'APP',
  callsign: id,
  frequencies: [
    { valueMHz: frequency },
    { valueMHz: '121.500' },
    { valueMHz: '275.300' },
  ],
  associations: [],
  sourceReferences: [],
});

describe('communication planning', () => {
  it('selects the containing local service, then the closest TMA above', () => {
    const ctr = feature('ctr', 'ctr');
    const tma = feature('tma', 'tma');
    const data = {
      airspaces: [ctr, tma],
      featureDetails: [
        details(
          ctr,
          { kind: 'surface', value: 'SFC', publishedText: 'SFC' },
          { kind: 'distance', value: 2500, unit: 'FT', reference: 'AMSL', publishedText: '2500 FT AMSL' },
          'tower',
        ),
        details(
          tma,
          { kind: 'distance', value: 4500, unit: 'FT', reference: 'AMSL', publishedText: '4500 FT AMSL' },
          { kind: 'flight-level', level: 95, publishedText: 'FL 95' },
          'approach',
        ),
      ],
      serviceAreas: [],
      services: [service('tower', '118.100'), service('approach', '123.500')],
    };

    expect(selectCommunicationAtPosition(
      data,
      { latitude: 69, longitude: 19 },
      1500,
    )).toMatchObject({
      basis: 'inside-airspace',
      services: [{ serviceId: 'tower', frequencies: [{ valueMHz: '118.100' }] }],
    });
    expect(selectCommunicationAtPosition(
      data,
      { latitude: 69, longitude: 19 },
      3000,
    )).toMatchObject({
      basis: 'closest-airspace-above',
      services: [{ serviceId: 'approach', frequencies: [{ valueMHz: '123.500' }] }],
    });
  });

  it('uses only the closest geographically relevant Polaris service area above', () => {
    const polaris = service('polaris-24', '118.555');
    const upperPolaris = service('polaris-upper', '126.455');
    const area: AtsServiceArea = {
      ref: { dataset, serviceAreaId: 'sector-24' },
      publishedName: 'Polaris ACC Sector 24',
      sectorIdentifier: '24',
      communicationServiceId: polaris.id,
      geometryStatus: 'resolved',
      lowerLimit: { kind: 'flight-level', level: 95, publishedText: 'FL 95' },
      upperLimit: { kind: 'flight-level', level: 195, publishedText: 'FL 195' },
      polygons: square(18, 68, 20, 70),
      sourceGeometry: { kind: 'polygon', rings: [] },
      sourceReferences: [],
    };
    const upperArea: AtsServiceArea = {
      ...area,
      ref: { dataset, serviceAreaId: 'sector-upper' },
      publishedName: 'Polaris ACC Upper Sector',
      sectorIdentifier: 'upper',
      communicationServiceId: upperPolaris.id,
      lowerLimit: { kind: 'flight-level', level: 195, publishedText: 'FL 195' },
      upperLimit: { kind: 'unlimited', publishedText: 'UNL' },
    };
    const selected = selectCommunicationAtPosition(
      {
        airspaces: [],
        featureDetails: [],
        serviceAreas: [area, upperArea],
        services: [polaris, upperPolaris],
      },
      { latitude: 69, longitude: 19 },
      2500,
    );
    expect(selected).toMatchObject({
      basis: 'ats-service-area',
      serviceAreaIds: ['sector-24'],
      services: [{ frequencies: [{ valueMHz: '118.555' }] }],
    });
    expect(selected?.services).toHaveLength(1);
  });

  it('overflows multiple changes on one leg into succeeding navlog rows', () => {
    const legs = ['a', 'b', 'c', 'd'].slice(1).map((toId, index) => ({
      fromId: ['a', 'b', 'c'][index]!,
      toId,
      geometry: [],
      distanceNm: 10,
      trueTrackDeg: 0,
      targetAltitudeFtMsl: 2000,
      startAltitudeFtMsl: 2000,
      endAltitudeFtMsl: 2000,
      phases: [],
      steps: [],
      eetSeconds: 0,
      fuelLitres: 0,
      effectiveGroundSpeedKt: null,
      startTimeUtcMs: 0,
      endTimeUtcMs: 0,
    }));
    const route = {
      status: 'ok',
      environment: {} as CalculatedPerformanceRouteSuccess['environment'],
      legs,
      sectors: [],
      totalDistanceNm: 30,
      totalEetSeconds: 0,
      totalFuelLitres: 0,
      estimatedArrivalTimeUtcMs: 0,
      arrivalTargetAltitudeFtMsl: 2000,
    } satisfies CalculatedPerformanceRouteSuccess;
    const selection = {
      basis: 'ats-service-area' as const,
      services: [],
      airspaceFeatureIds: [],
      serviceAreaIds: [],
      key: 'service',
    };
    const changes = [0, 1, 2].map((index) => ({
      legFromId: 'a',
      legToId: 'b',
      distanceFromLegStartNm: index,
      position: { latitude: 69, longitude: 19 },
      selection: { ...selection, key: String(index) },
    }));
    const allocations = allocateCommunicationChangesToLegs(route, changes);
    expect(allocations.get('a\0b')).toHaveLength(1);
    expect(allocations.get('b\0c')).toHaveLength(1);
    expect(allocations.get('c\0d')).toHaveLength(1);
  });
});
