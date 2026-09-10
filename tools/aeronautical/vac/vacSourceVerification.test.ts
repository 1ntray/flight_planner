import { describe, expect, it } from 'vitest';

import type { VacChartManifest } from '../../../src/domain';
import type { PublishedVacChartSource } from './vacSourceDiscovery';
import { verifyVacChartSources } from './vacSourceVerification';

function published(icao: string, file: string): PublishedVacChartSource {
  return {
    icao,
    title: 'Visual Approach Chart - ICAO',
    aipPage: `AD 2 ${icao} 6 - 1`,
    sourceUrl: `https://example.test/${file}.pdf`,
  };
}

function active(icao: string, file: string): VacChartManifest {
  return {
    id: `vac:${icao}:2026-09-03`, aerodromeFeatureId: `aerodrome:${icao}`,
    title: `${icao} VAC`, chartDate: '2026-09-03', sourcePdfSha256: 'a'.repeat(64),
    imageUrl: `aeronautical/vac/${icao.toLowerCase()}/chart.webp`, targetCrs: 'EPSG:3857',
    bounds: { west: 1, east: 2, south: 60, north: 61 }, minimumZoom: 9, maximumZoom: 13,
    defaultOpacity: 0.75, groundControlPoints: [],
    validation: {
      residualRmsPixels: 1, maximumResidualPixels: 1, residualRmsMeters: 1,
      maximumResidualMeters: 1, fitPointCount: 4, validationPointCount: 2,
      qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
    },
    sourceReferences: [{
      sourceType: 'vac-pdf', sourceAerodrome: icao, sourceDocument: `${icao} VAC`,
      aipSection: `AD 2 ${icao} 6-1`, sourceReference: `https://example.test/${file}.pdf`,
    }],
  };
}

describe('VAC source verification', () => {
  it('reports exact edition URL matches, missing charts, and stale active sources', () => {
    const result = verifyVacChartSources(
      [published('ENDU', 'current'), published('ENSR', 'new')],
      [active('ENDU', 'current'), active('ENSR', 'old')],
    );
    expect(result).toMatchObject({ publishedCount: 2, activeCount: 2, matchedCount: 1 });
    expect(result.missingPublished).toEqual([published('ENSR', 'new')]);
    expect(result.staleActive).toEqual([{
      id: 'vac:ENSR:2026-09-03', icao: 'ENSR', sourceUrl: 'https://example.test/old.pdf',
    }]);
  });
});

