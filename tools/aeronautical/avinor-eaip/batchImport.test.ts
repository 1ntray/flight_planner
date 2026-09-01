import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  discoverAd2Aerodromes,
  importAvinorEaipAerodromes,
} from './batchImport';
import { NORWAY_EAIP_EDITION } from './edition';

const indexPath = fileURLToPath(new URL('./fixtures/ad-1.3.html', import.meta.url));
const enduPath = fileURLToPath(new URL('./fixtures/endu.html', import.meta.url));
const bardufossEnr21Path = fileURLToPath(new URL('./fixtures/bardufoss-enr21.html', import.meta.url));
const enr22Path = fileURLToPath(new URL('./fixtures/enr22-tia-polaris.html', import.meta.url));
const indexFixture = readFileSync(indexPath, 'utf8');
const enduFixture = readFileSync(enduPath, 'utf8');
const bardufossEnr21Fixture = readFileSync(bardufossEnr21Path, 'utf8');
const enr22Fixture = readFileSync(enr22Path, 'utf8');
const timestamps = {
  retrievedAtUtc: '2026-08-29T08:00:00.000Z',
  importedAtUtc: '2026-08-29T08:05:00.000Z',
};

describe('Avinor eAIP AD 2 batch importer', () => {
  it('discovers AD 2 aerodromes and deliberately excludes AD 3 heliports', () => {
    expect(
      discoverAd2Aerodromes(indexFixture, NORWAY_EAIP_EDITION.indexUrl),
    ).toEqual([
      {
        sourceAerodrome: 'ENDU',
        sourceUrl:
          'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-2.ENDU-en-GB.html',
      },
      {
        sourceAerodrome: 'ENTC',
        sourceUrl:
          'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-2.ENTC-en-GB.html',
      },
    ]);
  });

  it('uses AD 1.3 table semantics when the published index does not link pages', () => {
    const semanticIndex = `
      <table>
        <tr><td>ALTA</td><td>ENAT</td><td>AD 2 ENAT</td></tr>
        <tr><td>VÆRØY</td><td>ENVR</td><td>AD 3 ENVR</td></tr>
      </table>`;

    expect(
      discoverAd2Aerodromes(semanticIndex, NORWAY_EAIP_EDITION.indexUrl),
    ).toEqual([
      {
        sourceAerodrome: 'ENAT',
        sourceUrl:
          'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-2.ENAT-en-GB.html',
      },
    ]);
  });

  it('normalizes each valid page into one dataset and retains source-specific provenance', () => {
    const result = importAvinorEaipAerodromes(
      [
        {
          sourceAerodrome: 'ENDU',
          sourceUrl: 'https://example.test/EN-AD-2.ENDU-en-GB.html',
          html: enduFixture,
        },
        {
          sourceAerodrome: 'ENTC',
          sourceUrl: 'https://example.test/EN-AD-2.ENTC-en-GB.html',
          html: enduFixture.replaceAll('ENDU', 'ENTC').replaceAll('BARDUFOSS', 'TROMSO'),
        },
      ],
      NORWAY_EAIP_EDITION,
      timestamps,
    );

    expect(result.importedAerodromes).toEqual(['ENDU', 'ENTC']);
    expect(result.dataset.features.filter(
      (feature) => feature.geometryType === 'point' && feature.pointKind === 'aerodrome',
    ).map((feature) => feature.identifier)).toEqual(['ENDU', 'ENTC']);
    expect(result.dataset.featureDetails.filter(
      (detail) => detail.detailKind === 'aerodrome',
    ).map((detail) => detail.ref.featureId)).toEqual([
      'aerodrome:ENDU',
      'aerodrome:ENTC',
    ]);
    expect(result.dataset.features.filter(
      (feature) => feature.geometryType === 'area' && feature.areaKind === 'ctr',
    )).toHaveLength(2);
    expect(result.dataset.communicationServices.length).toBeGreaterThan(0);
    expect(result.dataset.metadata.sourceReference).toBe(NORWAY_EAIP_EDITION.indexUrl);
    expect(result.failures).toEqual([]);
  });

  it('merges every normalized ENR 2.1 TMA volume into the batch dataset', () => {
    const result = importAvinorEaipAerodromes(
      [{
        sourceAerodrome: 'ENDU',
        sourceUrl: 'https://example.test/EN-AD-2.ENDU-en-GB.html',
        html: enduFixture,
      }],
      NORWAY_EAIP_EDITION,
      timestamps,
      {
        sourceUrl: 'https://example.test/EN-ENR-2.1-en-GB.html',
        html: bardufossEnr21Fixture,
      },
      {
        sourceUrl: 'https://example.test/EN-ENR-2.2-en-GB.html',
        html: enr22Fixture,
      },
    );

    const tmas = result.dataset.features.filter(
      (feature) => feature.geometryType === 'area' && feature.areaKind === 'tma',
    );
    expect(tmas).toHaveLength(3);
    expect(result.dataset.features.some(
      (feature) => feature.geometryType === 'area' && feature.areaKind === 'tia',
    )).toBe(true);
    expect(result.dataset.atsServiceAreas.length).toBeGreaterThan(0);
    expect(result.dataset.communicationServices.find(
      ({ id }) => id === 'communication:enr21:bardufoss-tma:approach',
    )?.frequencies.map(({ valueMHz }) => valueMHz)).toEqual([
      '118.805', '125.855', '275.300', '397.375',
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'unsupported-airspace-geometry',
        sourceAerodrome: 'ENR 2.2',
      }),
      expect.objectContaining({
        code: 'unsupported-service-area-geometry',
        sourceAerodrome: 'ENR 2.2',
      }),
    ]);
  });

  it('reports a malformed page and continues with the remaining aerodromes', () => {
    const result = importAvinorEaipAerodromes(
      [
        {
          sourceAerodrome: 'ENDU',
          sourceUrl: 'https://example.test/EN-AD-2.ENDU-en-GB.html',
          html: enduFixture.replace('690321N', '69XX21N'),
        },
        {
          sourceAerodrome: 'ENTC',
          sourceUrl: 'https://example.test/EN-AD-2.ENTC-en-GB.html',
          html: enduFixture.replaceAll('ENDU', 'ENTC').replaceAll('BARDUFOSS', 'TROMSO'),
        },
      ],
      NORWAY_EAIP_EDITION,
      timestamps,
    );

    expect(result.importedAerodromes).toEqual(['ENTC']);
    expect(result.failures).toEqual([
      expect.objectContaining({
        sourceAerodrome: 'ENDU',
        code: 'malformed-position',
        aipSection: 'AD 2.2',
      }),
    ]);
  });
});
