import { describe, expect, it } from 'vitest';
import { parsePublishedDms, validateVacPreparationConfig } from './config';
import { ENDU_VAC_PREPARATION } from './prepared/endu';
import { NATIONAL_VAC_PREPARATIONS } from './prepared/national';

describe('VAC preparation config', () => {
  it('parses published latitude and longitude without inference', () => {
    expect(parsePublishedDms('691425N')).toBeCloseTo(69.2402777778, 10);
    expect(parsePublishedDms('0175754E')).toBeCloseTo(17.965, 10);
    expect(parsePublishedDms('0180000W')).toBe(-18);
  });

  it('accepts the reviewed ENDU config with disjoint fit and validation points', () => {
    expect(validateVacPreparationConfig(ENDU_VAC_PREPARATION)).toBe(ENDU_VAC_PREPARATION);
  });

  it('accepts every reviewed national image preparation config', () => {
    expect(NATIONAL_VAC_PREPARATIONS).toHaveLength(46);
    for (const config of NATIONAL_VAC_PREPARATIONS) {
      expect(validateVacPreparationConfig(config)).toBe(config);
      expect(config.outputFormat).toBe('webp-image');
      expect(config.fitPoints.length).toBeGreaterThanOrEqual(4);
      expect(config.validationPoints.length).toBeGreaterThanOrEqual(2);
    }
    expect(NATIONAL_VAC_PREPARATIONS.filter(({ icao }) => ['ENAT', 'ENNA', 'ENLK', 'ENSK', 'ENSH'].includes(icao)))
      .toHaveLength(5);
  });

  it('accepts reviewed decimal graticule coordinates without labelling them as published point pairs', () => {
    const graticule = NATIONAL_VAC_PREPARATIONS.find(({ icao }) => icao === 'ENLK')!;
    expect(graticule.fitPoints[0]).toMatchObject({
      label: 'GRATICULE-GRID-1-1',
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });
    expect(graticule.fitPoints[0]!.publishedLatitude).toBeUndefined();
    expect(validateVacPreparationConfig(graticule)).toBe(graticule);
  });

  it('rejects malformed coordinates and validation points reused for fitting', () => {
    expect(() => validateVacPreparationConfig({
      ...ENDU_VAC_PREPARATION,
      validationPoints: [
        { ...ENDU_VAC_PREPARATION.validationPoints[0]!, publishedLatitude: '696099N' },
        ENDU_VAC_PREPARATION.validationPoints[1]!,
      ],
    })).toThrow(/Malformed published DMS coordinate/);
    expect(() => validateVacPreparationConfig({
      ...ENDU_VAC_PREPARATION,
      validationPoints: [ENDU_VAC_PREPARATION.fitPoints[0]!, ENDU_VAC_PREPARATION.validationPoints[0]!],
    })).toThrow(/must be independent/);
  });

  it('rejects missing, partial, or mixed coordinate representations', () => {
    const reviewed = NATIONAL_VAC_PREPARATIONS.find(({ icao }) => icao === 'ENLK')!;
    const first = reviewed.fitPoints[0]!;
    const { longitude: omittedLongitude, ...withoutLongitude } = first;
    expect(omittedLongitude).toEqual(expect.any(Number));
    expect(() => validateVacPreparationConfig({
      ...reviewed,
      fitPoints: [withoutLongitude, ...reviewed.fitPoints.slice(1)],
    })).toThrow(/finite reviewed WGS84 coordinate pair/);
    expect(() => validateVacPreparationConfig({
      ...reviewed,
      fitPoints: [{ ...first, publishedLatitude: '681000N', publishedLongitude: '0133000E' }, ...reviewed.fitPoints.slice(1)],
    })).toThrow(/exactly one published DMS pair or reviewed decimal pair/);
  });

  it('rejects a source hash that cannot identify exact bytes', () => {
    expect(() => validateVacPreparationConfig({ ...ENDU_VAC_PREPARATION, sourcePdfSha256: 'unknown' }))
      .toThrow(/64 hexadecimal/);
  });

  it('requires an explicit positive preparation revision', () => {
    expect(() => validateVacPreparationConfig({ ...ENDU_VAC_PREPARATION, preparationRevision: 0 }))
      .toThrow(/positive integer/);
  });

  it('rejects a missing or non-HTTPS source and insufficient reviewed points', () => {
    expect(() => validateVacPreparationConfig({ ...ENDU_VAC_PREPARATION, sourceUrl: '' }))
      .toThrow(/valid HTTPS URL/);
    expect(() => validateVacPreparationConfig({ ...ENDU_VAC_PREPARATION, sourceUrl: 'http://example.test/chart.pdf' }))
      .toThrow(/valid HTTPS URL/);
    expect(() => validateVacPreparationConfig({ ...ENDU_VAC_PREPARATION, fitPoints: ENDU_VAC_PREPARATION.fitPoints.slice(0, 3) }))
      .toThrow(/at least four fit points/);
    expect(() => validateVacPreparationConfig({ ...ENDU_VAC_PREPARATION, validationPoints: ENDU_VAC_PREPARATION.validationPoints.slice(0, 1) }))
      .toThrow(/at least two independent validation points/);
  });

  it('rejects poorly distributed or out-of-crop control points', () => {
    expect(() => validateVacPreparationConfig({
      ...ENDU_VAC_PREPARATION,
      fitPoints: ENDU_VAC_PREPARATION.fitPoints.map((point, index) => ({
        ...point,
        sourcePointX: 100 + index,
        sourcePointY: 200 + index,
      })),
    })).toThrow(/span at least 40%/);
    expect(() => validateVacPreparationConfig({
      ...ENDU_VAC_PREPARATION,
      validationPoints: [
        { ...ENDU_VAC_PREPARATION.validationPoints[0]!, sourcePointX: 0 },
        ENDU_VAC_PREPARATION.validationPoints[1]!,
      ],
    })).toThrow(/outside the configured chart crop/);
  });
});
