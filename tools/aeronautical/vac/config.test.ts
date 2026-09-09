import { describe, expect, it } from 'vitest';
import { parsePublishedDms, validateVacPreparationConfig } from './config';
import { ENDU_VAC_PREPARATION } from './prepared/endu';

describe('VAC preparation config', () => {
  it('parses published latitude and longitude without inference', () => {
    expect(parsePublishedDms('691425N')).toBeCloseTo(69.2402777778, 10);
    expect(parsePublishedDms('0175754E')).toBeCloseTo(17.965, 10);
    expect(parsePublishedDms('0180000W')).toBe(-18);
  });

  it('accepts the reviewed ENDU config with disjoint fit and validation points', () => {
    expect(validateVacPreparationConfig(ENDU_VAC_PREPARATION)).toBe(ENDU_VAC_PREPARATION);
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
