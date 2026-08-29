import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AerodromeDetails } from '../../../src/domain';
import { ENDU_EAIP_EDITION } from './edition';
import { importEnduEaip } from './importEndu';
import { parseCompactDmsPosition } from './parseCoordinate';
import { AvinorEaipImportError } from './types';

const fixturePath = fileURLToPath(new URL('./fixtures/endu.html', import.meta.url));
const fixture = readFileSync(fixturePath, 'utf8');
const config = {
  ...ENDU_EAIP_EDITION,
  retrievedAtUtc: '2026-08-29T08:00:00.000Z',
  importedAtUtc: '2026-08-29T08:05:00.000Z',
};

function aerodromeDetails(source = fixture): AerodromeDetails {
  const result = importEnduEaip(source, config);
  const details = result.dataset.featureDetails[0];
  if (details === undefined || details.detailKind !== 'aerodrome') {
    throw new Error('Fixture did not produce aerodrome details');
  }
  return details;
}

describe('Avinor ENDU eAIP importer', () => {
  it('normalizes ICAO, published name, ARP and aerodrome elevation', () => {
    const result = importEnduEaip(fixture, config);
    const feature = result.dataset.features[0];
    const details = aerodromeDetails();

    if (feature === undefined || feature.geometryType !== 'point') {
      throw new Error('Fixture did not produce an aerodrome point feature');
    }

    expect(feature).toMatchObject({
      geometryType: 'point',
      pointKind: 'aerodrome',
      identifier: 'ENDU',
      name: 'BARDUFOSS',
      suggestedWaypointName: 'ENDU',
      position: {
        latitude: 69.05583333333333,
        longitude: 18.540277777777778,
      },
    });
    expect(details.icaoIdentifier).toBe('ENDU');
    expect(details.name).toBe('BARDUFOSS');
    expect(details.arpPosition).toEqual(feature.position);
    expect(details.elevationFt).toBe(254);
    expect(result.warnings).toEqual([]);
  });

  it('keeps physical length and standard declared distances per direction', () => {
    const runway = aerodromeDetails().runways[0];

    expect(runway).toMatchObject({
      identifier: '10/28',
      lengthM: 2995,
      directions: [
        {
          designator: '10',
          trueBearingDeg: 109.01,
          declaredDistances: {
            toraM: 2443,
            todaM: 2443,
            asdaM: 2443,
            ldaM: 2001,
          },
        },
        {
          designator: '28',
          trueBearingDeg: 289.05,
          declaredDistances: {
            toraM: 2443,
            todaM: 2443,
            asdaM: 2443,
            ldaM: 2443,
          },
        },
      ],
    });
  });

  it('deliberately ignores reduced alternate take-off-position distances', () => {
    const directions = aerodromeDetails().runways[0]?.directions;

    expect(directions?.[0]?.declaredDistances.todaM).toBe(2443);
    expect(directions?.[1]?.declaredDistances.todaM).toBe(2443);
    expect(JSON.stringify(directions)).not.toContain('2721');
    expect(JSON.stringify(directions)).not.toContain('2717');
  });

  it('preserves published supplementary and paired runway designators', () => {
    const source = fixture
      .replaceAll('ENDU', 'ENTO')
      .replaceAll('BARDUFOSS', 'TORP')
      .replaceAll('<span class="SD">10</span>', '<span class="SD">17 18</span>')
      .replaceAll('<span class="SD">28</span>', '<span class="SD">35 36</span>')
      .replace('<span class="SD">2995</span>', '<span class="SD">2810 2809</span>');
    const result = importEnduEaip(source, {
      ...config,
      sourceAerodrome: 'ENTO',
      sourceUrl: 'https://example.test/EN-AD-2.ENTO-en-GB.html',
    });
    const details = result.dataset.featureDetails[0];

    expect(details).toMatchObject({
      detailKind: 'aerodrome',
      runways: [
        { identifier: '17/35', lengthM: 2810 },
        { identifier: '18/36', lengthM: 2809 },
      ],
    });
  });

  it('keeps a published S suffix as part of a runway designator', () => {
    const source = fixture
      .replaceAll('ENDU', 'ENNO')
      .replaceAll('BARDUFOSS', 'NOTODDEN')
      .replaceAll('<span class="SD">10</span>', '<span class="SD">12S</span>')
      .replaceAll('<span class="SD">28</span>', '<span class="SD">30S</span>');
    const result = importEnduEaip(source, {
      ...config,
      sourceAerodrome: 'ENNO',
      sourceUrl: 'https://example.test/EN-AD-2.ENNO-en-GB.html',
    });
    const details = result.dataset.featureDetails[0];

    expect(details).toMatchObject({
      detailKind: 'aerodrome',
      runways: [{ identifier: '12S/30S', lengthM: 2995 }],
    });
  });

  it('preserves dataset and AIP-section provenance without generated IDs', () => {
    const result = importEnduEaip(
      fixture.replaceAll(/ID_\d+/g, 'CHANGED_GENERATED_ID'),
      config,
    );
    const details = result.dataset.featureDetails[0];

    expect(result.dataset.metadata).toEqual({
      datasetId: 'avinor-eaip-2026-06-11',
      providerId: 'avinor',
      sourceName: 'eAIP',
      airacCycle: null,
      effectiveFromUtc: '2026-06-11T00:00:00Z',
      effectiveToUtc: null,
      revisionId: 'AIP AMDT 04/2026',
      editionLabel: '2026-06-11-AIRAC',
      retrievedAtUtc: '2026-08-29T08:00:00.000Z',
      importedAtUtc: '2026-08-29T08:05:00.000Z',
      sourceReference: ENDU_EAIP_EDITION.sourceUrl,
    });
    expect(details?.sourceReferences.map((source) => source.aipSection)).toEqual(
      ['AD 2.1', 'AD 2.2', 'AD 2.12', 'AD 2.13'],
    );
    expect(details?.ref.featureId).toBe('aerodrome:ENDU');
    expect(details?.ref.dataset).not.toHaveProperty('retrievedAtUtc');
  });

  it('represents a missing optional true bearing as null with a warning', () => {
    const source = fixture.replace(
      '<span class="SD">289.05°</span>',
      '<span class="SD">NIL</span>',
    );
    const result = importEnduEaip(source, config);
    const details = result.dataset.featureDetails[0];

    expect(details?.runways[0]?.directions[1]?.trueBearingDeg).toBeNull();
    expect(result.warnings).toContainEqual({
      code: 'missing-runway-bearing',
      message: 'True bearing is unavailable for runway 28',
      aipSection: 'AD 2.12',
    });
  });

  it('rejects malformed required ARP coordinates', () => {
    const source = fixture.replace('690321N', '69XX21N');

    expect(() => importEnduEaip(source, config)).toThrowError(
      AvinorEaipImportError,
    );
    expect(() => importEnduEaip(source, config)).toThrow(
      /Malformed WGS84 position/,
    );
  });

  it('rejects malformed standard declared distances', () => {
    const publishedCell =
      '<span class="SD">2443</span><span class="sdParams" style="display:none">TRWY_DIRECTION_DECL_DIST;VAL_DIST;3231</span>';
    const malformedCell = publishedCell.replace('2443', 'NOT-A-DISTANCE');
    const source = fixture.replace(publishedCell, malformedCell);

    expect(() => importEnduEaip(source, config)).toThrow(
      /Malformed TORA for runway 10/,
    );
  });

  it('rejects a source edition that does not match configured provenance', () => {
    const source = fixture.replace('content="2026-06-11"', 'content="2026-07-09"');

    expect(() => importEnduEaip(source, config)).toThrow(
      /Expected effective date 2026-06-11, found 2026-07-09/,
    );
  });
});

describe('compact DMS coordinate parsing', () => {
  it('converts threshold-style precision without rounding source values', () => {
    expect(
      parseCompactDmsPosition('690329.56N 0183113.57E', 'AD 2.12'),
    ).toEqual({
      latitude: 69.05821111111111,
      longitude: 18.52043611111111,
    });
  });

  it('rejects invalid minutes and seconds rather than normalizing them', () => {
    expect(() =>
      parseCompactDmsPosition('696100N 0183225E', 'AD 2.2'),
    ).toThrow(/Out-of-range latitude/);
  });
});
