import { describe, expect, it } from 'vitest';

import {
  parseKartverketNationalBoundaryWfs,
  resolveNationalBoundary,
  simplifyNationalBoundaryLine,
} from './nationalBoundary';

const wfsFixture = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2">
  <wfs:member><gml:LineString srsName="urn:ogc:def:crs:EPSG::4326"><gml:posList>18 69 19 69.5 20 70</gml:posList></gml:LineString></wfs:member>
  <wfs:member><gml:LineString srsName="urn:ogc:def:crs:EPSG::4326"><gml:posList>20 70 21 70.5</gml:posList></gml:LineString></wfs:member>
</wfs:FeatureCollection>`;

describe('prepared national boundary', () => {
  it('parses WFS longitude/latitude order and resolves the connected path', () => {
    const dataset = parseKartverketNationalBoundaryWfs(
      wfsFixture,
      '2026-09-01T00:00:00Z',
      'https://example.test/wfs',
    );
    const result = resolveNationalBoundary(
      dataset,
      { latitude: 69, longitude: 18 },
      { latitude: 70.5, longitude: 21 },
      'fixture',
    );

    expect(result.positions).toEqual([
      { latitude: 69, longitude: 18 },
      { latitude: 69.5, longitude: 19 },
      { latitude: 70, longitude: 20 },
      { latitude: 70.5, longitude: 21 },
    ]);
    expect(result.startSnapDistanceNm).toBe(0);
    expect(result.endSnapDistanceNm).toBe(0);
  });

  it('rejects endpoints that cannot be verified against the source', () => {
    const dataset = parseKartverketNationalBoundaryWfs(
      wfsFixture,
      '2026-09-01T00:00:00Z',
      'https://example.test/wfs',
    );
    expect(() => resolveNationalBoundary(
      dataset,
      { latitude: 60, longitude: 10 },
      { latitude: 70.5, longitude: 21 },
      'fixture',
    )).toThrow(/not within 0\.5 NM/);
  });

  it('keeps line endpoints while removing only sub-tolerance detail', () => {
    expect(simplifyNationalBoundaryLine([
      [18, 69],
      [18.5, 69.0001],
      [19, 69],
    ], 0.02)).toEqual([[18, 69], [19, 69]]);
    expect(simplifyNationalBoundaryLine([
      [18, 69],
      [18.5, 69.01],
      [19, 69],
    ], 0.02)).toEqual([[18, 69], [18.5, 69.01], [19, 69]]);
  });
});
