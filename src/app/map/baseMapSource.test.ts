import { describe, expect, it } from 'vitest';

import {
  AVINOR_ICAO_BASE_MAP_SOURCE,
  BASE_MAP_SOURCES,
  DEFAULT_BASE_MAP_ID,
  getBaseMapSource,
  KARTVERKET_TOPO_BASE_MAP_SOURCE,
} from './baseMapSource';

describe('base map sources', () => {
  it('keeps Kartverket as the default Web Mercator base map', () => {
    expect(DEFAULT_BASE_MAP_ID).toBe('kartverket-topo');
    expect(getBaseMapSource(DEFAULT_BASE_MAP_ID)).toBe(
      KARTVERKET_TOPO_BASE_MAP_SOURCE,
    );
    expect(KARTVERKET_TOPO_BASE_MAP_SOURCE.url).toContain('/webmercator/');
  });

  it('configures Avinor as a server-rendered ArcGIS map service', () => {
    expect(AVINOR_ICAO_BASE_MAP_SOURCE).toMatchObject({
      kind: 'arcgis-export-tiles',
      format: 'png32',
      transparent: true,
      displayTileSizePx: 256,
      exportPixelRatio: 4,
      minZoom: 4,
      effectiveDate: '19-MAR-2026',
    });
    expect(AVINOR_ICAO_BASE_MAP_SOURCE.serviceUrl).toMatch(
      /ICAO_500000_ExB\/MapServer\/$/u,
    );
  });

  it('exposes stable, unique source identifiers', () => {
    expect(BASE_MAP_SOURCES.map(({ id }) => id)).toEqual([
      'kartverket-topo',
      'avinor-icao',
    ]);
    expect(new Set(BASE_MAP_SOURCES.map(({ id }) => id)).size).toBe(
      BASE_MAP_SOURCES.length,
    );
  });

  it('rejects unknown source identifiers', () => {
    expect(() => getBaseMapSource('unknown' as never)).toThrow(RangeError);
  });
});
