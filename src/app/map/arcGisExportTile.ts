import type { Coords } from 'leaflet';

import type { ArcGisExportTileBaseMapSource } from './baseMapSource';

const WEB_MERCATOR_HALF_WORLD_METRES = 20_037_508.342789244;

export interface WebMercatorBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function requireTileCoordinates({ x, y, z }: Coords): void {
  if (![x, y, z].every(Number.isInteger) || z < 0) {
    throw new RangeError('Tile coordinates must be non-negative integers.');
  }

  const tileCount = 2 ** z;
  if (x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
    throw new RangeError('Tile coordinates fall outside the Web Mercator grid.');
  }
}

/** Returns the standard XYZ tile bounds in EPSG:3857 metres. */
export function calculateWebMercatorTileBounds(
  coords: Coords,
): WebMercatorBounds {
  requireTileCoordinates(coords);

  const tileSpan = (WEB_MERCATOR_HALF_WORLD_METRES * 2) / 2 ** coords.z;
  const minX = -WEB_MERCATOR_HALF_WORLD_METRES + coords.x * tileSpan;
  const maxY = WEB_MERCATOR_HALF_WORLD_METRES - coords.y * tileSpan;

  return {
    minX,
    minY: maxY - tileSpan,
    maxX: minX + tileSpan,
    maxY,
  };
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

export function buildArcGisExportTileUrl(
  source: ArcGisExportTileBaseMapSource,
  coords: Coords,
): string {
  const bounds = calculateWebMercatorTileBounds(coords);
  const exportSize = source.displayTileSizePx * source.exportPixelRatio;
  const url = new URL('export', source.serviceUrl);

  url.search = new URLSearchParams({
    bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
      .map(formatCoordinate)
      .join(','),
    bboxSR: '3857',
    imageSR: '3857',
    size: `${exportSize},${exportSize}`,
    dpi: String(96 * source.exportPixelRatio),
    format: source.format,
    transparent: String(source.transparent),
    f: 'image',
    // The ArcGIS service ignores this application-specific parameter. It
    // gives the local tile cache a stable AIRAC/edition invalidation key.
    fpCacheEdition: source.effectiveDate,
  }).toString();

  return url.toString();
}
