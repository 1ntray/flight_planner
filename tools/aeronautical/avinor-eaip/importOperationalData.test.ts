import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AeronauticalDatasetRef } from '../../../src/domain';
import {
  importAd2OperationalData,
  importEnr21Airspace,
  importVacReportingPoints,
} from './importOperationalData';
import { parseVerticalLimit } from './parseVerticalLimit';
import { AvinorEaipImportError } from './types';

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    'utf8',
  );
}

const dataset: AeronauticalDatasetRef = {
  datasetId: 'avinor-eaip-2026-06-11',
  providerId: 'avinor',
  sourceName: 'eAIP',
  airacCycle: null,
  effectiveFromUtc: '2026-06-11T00:00:00.000Z',
  effectiveToUtc: null,
  revisionId: 'AIP AMDT 04/2026',
};

const enduConfig = {
  dataset,
  effectiveDate: '2026-06-11',
  sourceAerodrome: 'ENDU',
  sourceUrl: 'https://aim-prod.avinor.no/example/ENDU.html',
  aerodromeFeatureId: 'aerodrome:ENDU',
};

describe('Avinor operational-data importers', () => {
  it('preserves vertical-limit semantics and rejects malformed values', () => {
    expect(parseVerticalLimit('GND', 'fixture')).toMatchObject({ kind: 'surface', value: 'GND' });
    expect(parseVerticalLimit('4500 FT AMSL', 'fixture')).toMatchObject({ kind: 'distance', value: 4500, unit: 'FT', reference: 'AMSL' });
    expect(parseVerticalLimit('FL 105', 'fixture')).toMatchObject({ kind: 'flight-level', level: 105 });
    expect(parseVerticalLimit('UNL', 'fixture')).toMatchObject({ kind: 'unlimited' });
    expect(() => parseVerticalLimit('about 4500 feet', 'fixture')).toThrow(AvinorEaipImportError);
  });

  it('imports the ENDU CTR and AD 2.18 services without associating ATIS to the CTR', () => {
    const result = importAd2OperationalData(fixture('endu.html'), enduConfig);
    const details = result.featureDetails[0];
    expect(result.features[0]).toMatchObject({ areaKind: 'ctr', name: 'Bardufoss CTR' });
    expect(details).toMatchObject({
      detailKind: 'airspace', airspaceType: 'ctr', airspaceClass: 'D',
      lowerLimit: { kind: 'surface', value: 'GND' },
      upperLimit: { kind: 'distance', value: 4500, unit: 'FT', reference: 'AMSL' },
    });
    expect(result.features[0]?.polygons[0]?.outerRing).toHaveLength(5);
    const atis = result.communicationServices.find((service) => service.serviceType === 'atis');
    const tower = result.communicationServices.find((service) => service.serviceType === 'tower');
    expect(atis?.frequencies).toEqual([{ valueMHz: '129.730', hours: 'HO' }]);
    expect(atis?.associations).toEqual([
      { featureId: 'aerodrome:ENDU', featureKind: 'aerodrome', basis: 'explicit' },
    ]);
    expect(tower?.frequencies.map(({ valueMHz }) => valueMHz)).toEqual([
      '118.105', '121.500', '243.000', '280.700',
    ]);
    expect(tower?.associations).toContainEqual({
      featureId: 'airspace:ad2:endu:ctr', featureKind: 'airspace', basis: 'unique-source-callsign-match',
    });
  });

  it('supports the contrasting ENHF TIZ/AFIS source shape', () => {
    const result = importAd2OperationalData(fixture('enhf-operational.html'), {
      ...enduConfig, sourceAerodrome: 'ENHF', aerodromeFeatureId: 'aerodrome:ENHF',
    });
    expect(result.features[0]).toMatchObject({ areaKind: 'tiz', name: 'Hammerfest TIZ' });
    expect(result.featureDetails[0]).toMatchObject({ airspaceClass: 'G' });
    expect(result.communicationServices.find((service) => service.serviceType === 'afis')).toMatchObject({
      callsign: 'Hammerfest Information',
      frequencies: [{ valueMHz: '121.005' }, { valueMHz: '121.500' }],
    });
  });

  it('imports the published Bardufoss TMA geometry, FL/altitude limits, unit and frequency', () => {
    const result = importEnr21Airspace(fixture('bardufoss-enr21.html'), {
      dataset, effectiveDate: '2026-06-11', sourceUrl: 'https://aim-prod.avinor.no/example/ENR-2.1.html',
      aerodromeFeatureId: 'aerodrome:ENDU', publishedName: 'Bardufoss TMA',
      associatedAerodromeFeatureIds: ['aerodrome:ENDU'],
    });
    expect(result.features[0]).toMatchObject({ areaKind: 'tma', name: 'Bardufoss TMA' });
    expect(result.featureDetails[0]).toMatchObject({
      lowerLimit: { kind: 'distance', value: 5500, reference: 'AMSL' },
      upperLimit: { kind: 'flight-level', level: 105 },
    });
    expect(result.atsUnits[0]).toMatchObject({ publishedName: 'Bardufoss TWR' });
    expect(result.communicationServices[0]).toMatchObject({
      callsign: 'Bardufoss Approach/ Radar', frequencies: [{ valueMHz: '118.805' }],
    });
  });

  it('imports only explicitly published VAC reporting-point coordinates with traceable provenance', () => {
    const result = importVacReportingPoints(fixture('endu-vac.txt'), {
      dataset, effectiveDate: '2026-06-11', aerodromeFeatureId: 'aerodrome:ENDU',
      aerodromeIdentifier: 'ENDU', sourceUrl: 'https://aim-prod.avinor.no/example/623256.pdf', sourcePage: '1',
    });
    expect(result.features).toHaveLength(20);
    expect(result.features.find(({ identifier }) => identifier === 'ELLA')).toMatchObject({
      pointKind: 'reporting-point', position: { latitude: 69.03333333333333, longitude: 18.63888888888889 },
    });
    expect(result.details[0]).toMatchObject({
      coordinateMethod: 'published-coordinate', associatedAerodromeFeatureId: 'aerodrome:ENDU',
      sourceReferences: [{ sourceType: 'vac-pdf', aipSection: 'AD 2.24' }],
    });
    expect(importVacReportingPoints('No published coordinate table', {
      dataset, effectiveDate: '2026-06-11', aerodromeFeatureId: 'aerodrome:ENHF',
      aerodromeIdentifier: 'ENHF', sourceUrl: 'fixture',
    }).features).toEqual([]);
  });
});
