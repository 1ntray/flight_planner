import type { Coords } from 'leaflet';
import { describe, expect, it } from 'vitest';

import { AVINOR_ICAO_BASE_MAP_SOURCE } from './baseMapSource';
import {
  buildArcGisExportTileUrl,
  calculateWebMercatorTileBounds,
} from './arcGisExportTile';

function coords(x: number, y: number, z: number): Coords {
  return { x, y, z } as Coords;
}

describe('calculateWebMercatorTileBounds', () => {
  it('covers the complete Web Mercator world at z0', () => {
    expect(calculateWebMercatorTileBounds(coords(0, 0, 0))).toEqual({
      minX: -20_037_508.342789244,
      minY: -20_037_508.342789244,
      maxX: 20_037_508.342789244,
      maxY: 20_037_508.342789244,
    });
  });

  it('uses XYZ north-to-south row ordering', () => {
    expect(calculateWebMercatorTileBounds(coords(1, 0, 1))).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20_037_508.342789244,
      maxY: 20_037_508.342789244,
    });
  });

  it('rejects coordinates outside the zoom grid', () => {
    expect(() => calculateWebMercatorTileBounds(coords(2, 0, 1))).toThrow(
      RangeError,
    );
  });
});

describe('buildArcGisExportTileUrl', () => {
  it('requests a stable four-times-density Web Mercator tile', () => {
    const url = new URL(
      buildArcGisExportTileUrl(
        AVINOR_ICAO_BASE_MAP_SOURCE,
        coords(1, 0, 1),
      ),
    );

    expect(url.pathname).toMatch(/\/MapServer\/export$/u);
    expect(url.searchParams.get('bbox')).toBe(
      '0.000000,0.000000,20037508.342789,20037508.342789',
    );
    expect(url.searchParams.get('bboxSR')).toBe('3857');
    expect(url.searchParams.get('imageSR')).toBe('3857');
    expect(url.searchParams.get('size')).toBe('1024,1024');
    expect(url.searchParams.get('dpi')).toBe('384');
    expect(url.searchParams.get('fpCacheEdition')).toBe('19-MAR-2026');
  });
});
