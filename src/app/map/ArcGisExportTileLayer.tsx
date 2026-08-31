import { GridLayer } from 'leaflet';
import type { Coords, DoneCallback } from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

import { buildArcGisExportTileUrl } from './arcGisExportTile';
import type { ArcGisExportTileBaseMapSource } from './baseMapSource';

export type BaseMapLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ArcGisExportTileLayerProps {
  source: ArcGisExportTileBaseMapSource;
  onStatusChange: (status: BaseMapLoadStatus) => void;
}

class ArcGisExportGridLayer extends GridLayer {
  readonly source: ArcGisExportTileBaseMapSource;

  constructor(source: ArcGisExportTileBaseMapSource) {
    super({
      attribution: source.attribution,
      maxZoom: source.maxZoom,
      minZoom: source.minZoom,
      noWrap: true,
      pane: 'tilePane',
      tileSize: source.displayTileSizePx,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    });
    this.source = source;
  }

  override createTile(coords: Coords, done: DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.className = 'avinor-icao-export-tile';
    tile.decoding = 'async';
    tile.setAttribute('role', 'presentation');
    tile.onload = () => done(undefined, tile);
    tile.onerror = () =>
      done(new Error(`Unable to load Avinor chart tile ${coords.z}/${coords.x}/${coords.y}.`), tile);
    tile.src = buildArcGisExportTileUrl(this.source, coords);
    return tile;
  }
}

/**
 * Renders stable EPSG:3857 export tiles from Avinor's dynamic MapServer.
 * ArcGIS performs all source-raster reprojection; Leaflet only positions the
 * resulting tiles in its presentation grid.
 */
export function ArcGisExportTileLayer({
  source,
  onStatusChange,
}: ArcGisExportTileLayerProps) {
  const map = useMap();

  useEffect(() => {
    const layer = new ArcGisExportGridLayer(source);

    layer.on('loading', () => onStatusChange('loading'));
    layer.on('load', () => onStatusChange('ready'));
    layer.on('tileerror', () => onStatusChange('error'));
    onStatusChange('loading');
    layer.addTo(map);
    layer.bringToBack();

    return () => {
      layer.removeFrom(map);
    };
  }, [map, onStatusChange, source]);

  return null;
}
