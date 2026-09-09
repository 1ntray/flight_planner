import { describe, expect, it } from 'vitest';
import type { VacChartManifest } from '../domain';
import { validateProductionVacChartManifest, validateVacChartManifest } from './vacManifest';

const manifest: VacChartManifest = {
  id: 'endu-vac-2026-06-11', aerodromeFeatureId: 'aerodrome:ENDU', title: 'Bardufoss VAC',
  chartDate: '2026-06-11', tileUrlTemplate: '/vac/endu/{z}/{x}/{y}.png', targetCrs: 'EPSG:3857',
  bounds: { south: 68.8, west: 17.6, north: 69.4, east: 19.2 }, minimumZoom: 9, maximumZoom: 14,
  defaultOpacity: 0.75,
  groundControlPoints: [
    { pixelX: 0, pixelY: 0, latitude: 69.4, longitude: 17.6 },
    { pixelX: 1000, pixelY: 0, latitude: 69.4, longitude: 19.2 },
    { pixelX: 1000, pixelY: 1000, latitude: 68.8, longitude: 19.2 },
    { pixelX: 0, pixelY: 1000, latitude: 68.8, longitude: 17.6 },
  ], sourceReferences: [],
};

const sourceReferences: VacChartManifest['sourceReferences'] = [{
  sourceType: 'vac-pdf', aipSection: 'AD 2 TEST 6-1', sourceReference: 'https://example.test/test.pdf',
}];

describe('VAC chart manifest validation', () => {
  it('accepts a prepared Web Mercator tile manifest with retained control points', () => {
    expect(validateVacChartManifest(manifest)).toEqual([]);
  });

  it('rejects an untraceable or malformed runtime tile definition', () => {
    expect(validateVacChartManifest({
      ...manifest, tileUrlTemplate: '/vac/endu.png', defaultOpacity: 2, groundControlPoints: [],
    })).toEqual([
      'VAC defaultOpacity must be between 0 and 1',
      'VAC tile URL must contain {z}, {x}, and {y}',
      'VAC preparation must retain at least four ground-control points',
    ]);
  });

  it('rejects wrong CRS, invalid bounds, zooms, and dates structurally', () => {
    expect(validateVacChartManifest({
      ...manifest,
      chartDate: 'not-a-date',
      targetCrs: 'EPSG:4326' as 'EPSG:3857',
      bounds: { south: 70, west: 20, north: 69, east: 18 },
      minimumZoom: 10.5,
      maximumZoom: 9,
    })).toEqual(expect.arrayContaining([
      'VAC chartDate must be a valid date',
      'VAC tiles must be prepared in EPSG:3857',
      'VAC zooms must be non-negative integers and minimumZoom must not exceed maximumZoom',
      'VAC bounds must contain valid ordered WGS84 latitudes',
      'VAC bounds must contain valid ordered WGS84 longitudes',
    ]));
  });

  it('accepts a traceable chart that passed independent production validation', () => {
    expect(validateProductionVacChartManifest({
      ...manifest,
      sourcePdfSha256: 'a'.repeat(64),
      sourceReferences,
      validation: {
        residualRmsPixels: 1.2,
        maximumResidualPixels: 2.4,
        residualRmsMeters: 38,
        maximumResidualMeters: 72,
        fitPointCount: 8,
        validationPointCount: 6,
        qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
      },
    })).toEqual([]);
  });

  it('rejects missing validation and production thresholds', () => {
    expect(validateProductionVacChartManifest(manifest)).toEqual([
      'Production VAC charts must retain a valid source PDF SHA-256',
      'Production VAC charts must retain a VAC PDF source reference',
      'Production VAC charts must include independent validation results',
    ]);
  });

  it('rejects a chart whose measured error exceeds its declared gate', () => {
    const errors = validateProductionVacChartManifest({
      ...manifest,
      sourcePdfSha256: 'b'.repeat(64),
      sourceReferences,
      validation: {
        residualRmsPixels: 4,
        maximumResidualPixels: 8,
        residualRmsMeters: 120,
        maximumResidualMeters: 180,
        fitPointCount: 8,
        validationPointCount: 6,
        qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
      },
    });
    expect(errors).toContain('VAC validation RMS exceeds the production threshold');
  });

  it('rejects non-finite control points, WGS84 bounds, and residuals', () => {
    const errors = validateVacChartManifest({
      ...manifest,
      bounds: { south: -91, west: 18, north: 69, east: 19 },
      groundControlPoints: manifest.groundControlPoints.map((point, index) =>
        index === 0 ? { ...point, pixelX: Number.NaN, latitude: 91 } : point,
      ),
      validation: { residualRmsPixels: -1, maximumResidualPixels: Number.NaN },
    });
    expect(errors).toEqual(expect.arrayContaining([
      'VAC bounds must contain valid ordered WGS84 latitudes',
      'VAC ground-control points must contain finite pixels and valid WGS84 coordinates',
      'VAC validation residuals must be finite and non-negative',
    ]));
  });

  it('reports both RMS and individual threshold failures', () => {
    const errors = validateProductionVacChartManifest({
      ...manifest,
      sourcePdfSha256: 'c'.repeat(64),
      sourceReferences,
      validation: {
        residualRmsPixels: 4, maximumResidualPixels: 8,
        residualRmsMeters: 120, maximumResidualMeters: 220,
        fitPointCount: 8, validationPointCount: 6,
        qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
      },
    });
    expect(errors).toEqual(expect.arrayContaining([
      'VAC validation RMS exceeds the production threshold',
      'VAC validation maximum error exceeds the production threshold',
    ]));
  });
});
