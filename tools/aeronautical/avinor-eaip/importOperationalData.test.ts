import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AeronauticalDatasetRef } from '../../../src/domain';
import {
  importAd2OperationalData,
  importEnr21Airspace,
  importEnr22OperationalData,
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

  it('keeps multiple AD 2.17 geometry/vertical-limit volumes separate', () => {
    const result = importAd2OperationalData(fixture('multi-volume-ad2.html'), {
      ...enduConfig,
      sourceAerodrome: 'ENNO',
      aerodromeFeatureId: 'aerodrome:ENNO',
    });

    expect(result.features).toHaveLength(2);
    expect(result.features.map(({ name }) => name)).toEqual([
      'Notodden TIZ (GND–5500 FT AMSL)',
      'Notodden TIZ (GND–4500 FT AMSL)',
    ]);
    expect(result.featureDetails.map((details) =>
      details.detailKind === 'airspace' ? details.upperLimit?.publishedText : null,
    )).toEqual(['5500 FT AMSL', '4500 FT AMSL']);
    expect(result.communicationServices.filter(
      ({ publishedServiceType }) => publishedServiceType === 'APP',
    ).map(({ id }) => id)).toEqual([
      'communication:ad2:enno:app:124-355',
      'communication:ad2:enno:app:134-055',
    ]);
    expect(result.communicationServices.find(
      ({ publishedServiceType }) => publishedServiceType === 'AFIS',
    )?.associations.filter(({ featureKind }) => featureKind === 'airspace')).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('retains AD 2.18 services when AD 2.17 explicitly publishes NIL', () => {
    const source = `
      <h4 class="Title">ENGK AD 2.17 ATS AIRSPACE</h4>
      <table>
        <tr><td>1</td><td>Designation and lateral limits</td><td>NIL</td></tr>
        <tr><td>2</td><td>Vertical limits</td><td>NIL</td></tr>
        <tr><td>3</td><td>Airspace classification</td><td>NIL</td></tr>
      </table>
      <h4 class="Title">ENGK AD 2.18 ATS COMMUNICATION FACILITIES</h4>
      <table>
        <tr><th>Service Designation</th><th>Call Sign</th><th>FREQ</th><th>HR</th><th>RMK</th></tr>
        <tr><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>
        <tr><td>RADIO</td><td>Gullknapp Traffic</td><td>129.905 MHZ</td><td>HX</td><td>NIL</td></tr>
      </table>`;
    const result = importAd2OperationalData(source, {
      ...enduConfig,
      sourceAerodrome: 'ENGK',
      aerodromeFeatureId: 'aerodrome:ENGK',
    });

    expect(result.features).toEqual([]);
    expect(result.communicationServices).toMatchObject([
      { publishedServiceType: 'RADIO', frequencies: [{ valueMHz: '129.905' }] },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('imports every published Bardufoss TMA volume and all source frequencies', () => {
    const result = importEnr21Airspace(fixture('bardufoss-enr21.html'), {
      dataset, effectiveDate: '2026-06-11', sourceUrl: 'https://aim-prod.avinor.no/example/ENR-2.1.html',
      aerodromeFeatureId: 'aerodrome:ENDU', publishedName: 'Bardufoss TMA',
      associatedAerodromeFeatureIds: ['aerodrome:ENDU'],
    });
    expect(result.features).toHaveLength(3);
    expect(result.features.every(({ areaKind }) => areaKind === 'tma')).toBe(true);
    expect(result.features.map(({ name }) => name)).toEqual([
      'Bardufoss TMA (5500 FT AMSL–FL 105)',
      'Bardufoss TMA (4500 FT AMSL–FL 105)',
      'Bardufoss TMA (6500 FT AMSL–FL 105)',
    ]);
    expect(result.featureDetails.map((details) =>
      details.detailKind === 'airspace' && details.lowerLimit?.kind === 'distance'
        ? details.lowerLimit.value
        : null,
    ).sort((left, right) => (left ?? 0) - (right ?? 0))).toEqual([4500, 5500, 6500]);
    expect(result.featureDetails.every((details) =>
      details.detailKind === 'airspace' &&
      details.airspaceClass === 'C' &&
      details.upperLimit?.kind === 'flight-level' &&
      details.upperLimit.level === 105,
    )).toBe(true);
    expect(result.atsUnits[0]).toMatchObject({ publishedName: 'Bardufoss TWR' });
    expect(result.communicationServices[0]).toMatchObject({
      callsign: 'Bardufoss Approach/ Radar',
    });
    expect(result.communicationServices[0]?.frequencies.map(({ valueMHz }) => valueMHz)).toEqual([
      '118.805', '125.855', '275.300', '397.375',
    ]);
    expect(result.communicationServices[0]?.associations).toEqual([
      ...result.features.map((feature) => ({
        featureId: feature.ref.featureId,
        featureKind: 'airspace',
        basis: 'explicit',
      })),
      { featureId: 'aerodrome:ENDU', featureKind: 'aerodrome', basis: 'explicit' },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('imports ENR 2.2 TIA and data-only Polaris service coverage', () => {
    const result = importEnr22OperationalData(
      fixture('enr22-tia-polaris.html'),
      {
        dataset,
        effectiveDate: '2026-06-11',
        sourceUrl: 'https://aim-prod.avinor.no/example/ENR-2.2.html',
      },
    );

    const namsos = result.features.find(({ identifier }) => identifier === 'Namsos TIA');
    expect(namsos).toMatchObject({ areaKind: 'tia' });
    expect(result.featureDetails.find(
      (details) => details.ref.featureId === namsos?.ref.featureId,
    )).toMatchObject({
      airspaceType: 'tia',
      airspaceClass: 'G',
      lowerLimit: { kind: 'distance', value: 3500, reference: 'AMSL' },
      upperLimit: { kind: 'distance', value: 6500, reference: 'AMSL' },
      sourceReferences: [{ aipSection: 'ENR 2.2 section 1' }],
    });
    expect(result.communicationServices.find(
      ({ id }) => id === 'communication:enr22:namsos-tia:area-control',
    )).toMatchObject({
      callsign: 'Polaris Control',
      frequencies: [{ valueMHz: '118.555', remarks: 'Sector 24' }],
      associations: [{ featureId: namsos?.ref.featureId, featureKind: 'airspace' }],
    });

    expect(result.features.filter(({ identifier }) => identifier === 'Røros TIA')).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'unsupported-airspace-geometry',
      publishedName: 'Røros TIA',
    }));

    expect(result.atsServiceAreas.filter(
      ({ publishedName }) => publishedName === 'Polaris ACC Sector 10',
    )).toHaveLength(2);
    expect(result.atsServiceAreas.find(
      ({ publishedName }) => publishedName === 'Polaris ACC Sector 24',
    )).toMatchObject({
      sectorIdentifier: '24',
      geometryStatus: 'resolved',
      lowerLimit: { kind: 'surface', value: 'GND' },
      upperLimit: { kind: 'unlimited' },
      sourceReferences: [{ aipSection: 'ENR 2.2 section 6' }],
    });
    expect(result.communicationServices.find(
      ({ id }) => id === 'communication:enr22:polaris-acc-sector-10:area-control',
    )?.frequencies).toEqual([
      { valueMHz: '136.280', remarks: 'Sector 10/11' },
    ]);
    expect(result.atsServiceAreas.find(
      ({ publishedName }) => publishedName === 'Polaris ACC Sector 25',
    )).toMatchObject({
      geometryStatus: 'unresolved',
      polygons: [],
      sourceGeometry: {
        kind: 'polygon',
        rings: [{ segments: [{ kind: 'published-reference' }] }],
      },
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'unsupported-service-area-geometry',
      publishedName: 'Polaris ACC Sector 25',
    }));
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

  it('extracts multiple published reporting points from one PDF text line', () => {
    const result = importVacReportingPoints(
      'NESVERK 583735N 0085057E RYKENE 582430N 0083823E UGLEBU 582930N 0084451E',
      {
        dataset, effectiveDate: '2026-06-11', aerodromeFeatureId: 'aerodrome:ENGK',
        aerodromeIdentifier: 'ENGK', sourceUrl: 'https://example.test/ENGK-VAC.pdf',
      },
    );
    expect(result.features.map(({ identifier }) => identifier)).toEqual([
      'NESVERK', 'RYKENE', 'UGLEBU',
    ]);
  });
});
