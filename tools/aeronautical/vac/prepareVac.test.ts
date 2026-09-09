import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertVacSourceHash, calculateCropPixelGeometry, pdfPointToCroppedPixel } from './prepareVac';
import { ENDU_VAC_PREPARATION } from './prepared/endu';

describe('VAC source identity', () => {
  it('accepts only the exact reviewed source bytes', () => {
    const bytes = Buffer.from('reviewed VAC fixture');
    const expected = createHash('sha256').update(bytes).digest('hex');
    expect(() => assertVacSourceHash(bytes, expected)).not.toThrow();
    expect(() => assertVacSourceHash(Buffer.from('changed VAC fixture'), expected))
      .toThrow(/source hash mismatch.*No output was published/);
  });

  it('converts PDF-point review coordinates into deterministic cropped pixels', () => {
    const crop = calculateCropPixelGeometry(ENDU_VAC_PREPARATION);
    expect(crop).toEqual({ scale: 1200 / 72, left: 1060, top: 2176, width: 7845, height: 9233 });
    expect(pdfPointToCroppedPixel(ENDU_VAC_PREPARATION.fitPoints[0]!, crop)).toEqual({
      pixelX: 1284.25,
      pixelY: 2637.4833333333345,
    });
  });
});
