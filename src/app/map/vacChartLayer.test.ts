import { describe, expect, it } from 'vitest';
import type { VacChartManifest } from '../../domain';
import { filterRenderableVacCharts, resolveVacTileUrlTemplate } from './vacChartLayer';

const chart: VacChartManifest = {
  id: 'vac:test',
  aerodromeFeatureId: 'aerodrome:TEST',
  title: 'Test VAC',
  chartDate: '2026-01-01',
  sourcePdfSha256: 'a'.repeat(64),
  tileUrlTemplate: 'aeronautical/vac/test/{z}/{x}/{y}.png',
  targetCrs: 'EPSG:3857',
  bounds: { south: 68, west: 17, north: 70, east: 20 },
  minimumZoom: 9,
  maximumZoom: 12,
  defaultOpacity: 0.75,
  groundControlPoints: Array.from({ length: 4 }, (_, index) => ({
    pixelX: index * 100,
    pixelY: index * 100,
    latitude: 69,
    longitude: 18,
  })),
  validation: {
    residualRmsPixels: 1,
    maximumResidualPixels: 2,
    residualRmsMeters: 20,
    maximumResidualMeters: 40,
    fitPointCount: 4,
    validationPointCount: 2,
    qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
  },
  sourceReferences: [{
    sourceType: 'vac-pdf', aipSection: 'AD 2 TEST 6-1', sourceReference: 'https://example.test/test.pdf',
  }],
};

describe('VAC runtime layer selection', () => {
  it('resolves repository-relative tile paths beneath the Vite base path', () => {
    expect(resolveVacTileUrlTemplate(chart.tileUrlTemplate, '/flight_planner/'))
      .toBe('/flight_planner/aeronautical/vac/test/{z}/{x}/{y}.png');
    expect(resolveVacTileUrlTemplate('/absolute/{z}/{x}/{y}.png', '/flight_planner/'))
      .toBe('/absolute/{z}/{x}/{y}.png');
  });

  it('loads only visible, validated charts at or above their minimum zoom', () => {
    const { validation: _validation, ...unvalidatedChart } = chart;
    expect(filterRenderableVacCharts([chart], false, 12)).toEqual([]);
    expect(filterRenderableVacCharts([chart], true, 8)).toEqual([]);
    expect(filterRenderableVacCharts([chart], true, 9)).toEqual([chart]);
    expect(filterRenderableVacCharts([unvalidatedChart], true, 12)).toEqual([]);
  });
});
