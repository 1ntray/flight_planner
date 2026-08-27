export interface TileSource {
  url: string;
  attribution: string;
  maxZoom: number;
}

export const KARTVERKET_TOPO_TILE_SOURCE: TileSource = {
  url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
  attribution: '© Kartverket',
  maxZoom: 18,
};

