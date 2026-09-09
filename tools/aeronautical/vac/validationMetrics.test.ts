import { describe, expect, it } from 'vitest';
import { calculateVacValidationMetrics, geodesicErrorMeters } from './validationMetrics';

describe('VAC validation metrics', () => {
  it('calculates deterministic independent RMS and maximum errors', () => {
    const metrics = calculateVacValidationMetrics([
      { label: 'A', horizontalErrorMeters: 30, pixelError: 3, predictedLatitude: 69, predictedLongitude: 18 },
      { label: 'B', horizontalErrorMeters: 40, pixelError: 4, predictedLatitude: 69, predictedLongitude: 18 },
    ], 8);
    expect(metrics.residualRmsMeters).toBeCloseTo(Math.sqrt(1250));
    expect(metrics.maximumResidualMeters).toBe(40);
    expect(metrics.residualRmsPixels).toBeCloseTo(Math.sqrt(12.5));
    expect(metrics.maximumResidualPixels).toBe(4);
    expect(metrics.fitPointCount).toBe(8);
    expect(metrics.validationPointCount).toBe(2);
  });

  it('measures coordinate movement on WGS84 in metres', () => {
    expect(geodesicErrorMeters(
      { latitude: 69, longitude: 18 },
      { latitude: 69, longitude: 18 },
    )).toBe(0);
    expect(geodesicErrorMeters(
      { latitude: 69, longitude: 18 },
      { latitude: 69.001, longitude: 18 },
    )).toBeGreaterThan(100);
  });

  it('fails clearly on insufficient or malformed holdouts', () => {
    expect(() => calculateVacValidationMetrics([], 8)).toThrow(/independent validation points/);
    expect(() => calculateVacValidationMetrics([
      { label: 'A', horizontalErrorMeters: -1, pixelError: 0, predictedLatitude: 69, predictedLongitude: 18 },
      { label: 'B', horizontalErrorMeters: 0, pixelError: 0, predictedLatitude: 69, predictedLongitude: 18 },
    ], 8)).toThrow(/invalid/);
  });
});
