export type BaseMapId = 'kartverket-topo' | 'avinor-icao';

interface BaseMapSourceBase {
  readonly id: BaseMapId;
  readonly label: string;
  readonly attribution: string;
  readonly maxZoom: number;
  readonly minZoom?: number;
}

export interface XyzBaseMapSource extends BaseMapSourceBase {
  readonly kind: 'xyz';
  readonly url: string;
}

export interface ArcGisExportTileBaseMapSource extends BaseMapSourceBase {
  readonly kind: 'arcgis-export-tiles';
  readonly serviceUrl: string;
  readonly format: 'png32';
  readonly transparent: boolean;
  readonly displayTileSizePx: number;
  readonly exportPixelRatio: number;
  readonly effectiveDate: string;
  readonly termsUrl: string;
}

export type BaseMapSource = XyzBaseMapSource | ArcGisExportTileBaseMapSource;

export const DEFAULT_BASE_MAP_ID: BaseMapId = 'kartverket-topo';

export const KARTVERKET_TOPO_BASE_MAP_SOURCE: XyzBaseMapSource = {
  id: 'kartverket-topo',
  kind: 'xyz',
  label: 'Norgeskart topo',
  url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
  attribution: '© Kartverket',
  maxZoom: 18,
};

export const AVINOR_ICAO_BASE_MAP_SOURCE: ArcGisExportTileBaseMapSource = {
  id: 'avinor-icao',
  kind: 'arcgis-export-tiles',
  label: 'Avinor ICAO 1:500 000',
  serviceUrl:
    'https://avigis.avinor.no/agsmap/rest/services/ICAO_500000_ExB/MapServer/',
  format: 'png32',
  transparent: true,
  displayTileSizePx: 256,
  exportPixelRatio: 4,
  attribution:
    'Chart © Avinor · <a href="https://experience.arcgis.com/experience/41465e716c9e4a458e168f81a8961a74" target="_blank" rel="noreferrer">ICAO 1:500 000 terms</a> · Powered by Esri',
  maxZoom: 18,
  minZoom: 4,
  effectiveDate: '19-MAR-2026',
  termsUrl:
    'https://experience.arcgis.com/experience/41465e716c9e4a458e168f81a8961a74',
};

export const BASE_MAP_SOURCES: readonly BaseMapSource[] = [
  KARTVERKET_TOPO_BASE_MAP_SOURCE,
  AVINOR_ICAO_BASE_MAP_SOURCE,
];

export function getBaseMapSource(id: BaseMapId): BaseMapSource {
  const source = BASE_MAP_SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) {
    throw new RangeError(`Unknown base map source: ${id}`);
  }
  return source;
}
