import { load } from 'cheerio';

import type { Position } from '../../../src/domain';
import { AvinorEaipImportError } from './types';

export const NATIONAL_BOUNDARY_SCHEMA_VERSION = 1;
export const NATIONAL_BOUNDARY_MAX_SNAP_NM = 0.5;

export interface PreparedNationalBoundaryDataset {
  readonly schemaVersion: typeof NATIONAL_BOUNDARY_SCHEMA_VERSION;
  readonly source: {
    readonly provider: 'Kartverket';
    readonly datasetName: string;
    readonly metadataUuid: string;
    readonly sourceUrl: string;
    readonly referenceDate: string;
    readonly retrievedAtUtc: string;
    readonly coordinateReferenceSystem: 'EPSG:4326';
  };
  /** Source-order longitude/latitude coordinate pairs from Kartverket WFS. */
  readonly lines: readonly (readonly (readonly [number, number])[])[];
}

export interface ResolvedNationalBoundary {
  readonly positions: readonly Position[];
  readonly startSnapDistanceNm: number;
  readonly endSnapDistanceNm: number;
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validatePreparedNationalBoundaryDataset(
  value: unknown,
): PreparedNationalBoundaryDataset {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Prepared national-boundary dataset must be an object');
  }
  const candidate = value as Partial<PreparedNationalBoundaryDataset>;
  if (candidate.schemaVersion !== NATIONAL_BOUNDARY_SCHEMA_VERSION) {
    throw new Error('Unsupported prepared national-boundary schema version');
  }
  if (
    candidate.source?.provider !== 'Kartverket' ||
    candidate.source.coordinateReferenceSystem !== 'EPSG:4326' ||
    typeof candidate.source.datasetName !== 'string' ||
    typeof candidate.source.metadataUuid !== 'string' ||
    typeof candidate.source.sourceUrl !== 'string' ||
    typeof candidate.source.referenceDate !== 'string' ||
    typeof candidate.source.retrievedAtUtc !== 'string'
  ) {
    throw new Error('Prepared national-boundary source metadata is malformed');
  }
  if (
    !Array.isArray(candidate.lines) ||
    candidate.lines.length === 0 ||
    candidate.lines.some(
      (line) =>
        !Array.isArray(line) ||
        line.length < 2 ||
        line.some(
          (coordinate) =>
            !Array.isArray(coordinate) ||
            coordinate.length !== 2 ||
            !finiteCoordinate(coordinate[0]) ||
            !finiteCoordinate(coordinate[1]) ||
            coordinate[0] < -180 ||
            coordinate[0] > 180 ||
            coordinate[1] < -90 ||
            coordinate[1] > 90,
        ),
    )
  ) {
    throw new Error('Prepared national-boundary geometry is malformed');
  }
  return candidate as PreparedNationalBoundaryDataset;
}

/** Parses only Kartverket WFS Riksgrense LineStrings into a compact snapshot. */
export function parseKartverketNationalBoundaryWfs(
  source: string,
  retrievedAtUtc: string,
  sourceUrl: string,
): PreparedNationalBoundaryDataset {
  const $ = load(source, { xml: true });
  const lines = $('gml\\:LineString, LineString')
    .toArray()
    .flatMap((line) => {
      const posList = $(line).find('gml\\:posList, posList').first().text().trim();
      if (posList === '') return [];
      const values = posList.split(/\s+/).map(Number);
      if (values.length < 4 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
        throw new Error('Kartverket WFS contains a malformed gml:posList');
      }
      const coordinates: [number, number][] = [];
      for (let index = 0; index < values.length; index += 2) {
        const longitude = values[index];
        const latitude = values[index + 1];
        if (longitude === undefined || latitude === undefined) {
          throw new Error('Kartverket WFS contains an incomplete coordinate pair');
        }
        coordinates.push([longitude, latitude]);
      }
      return [coordinates];
    });

  return validatePreparedNationalBoundaryDataset({
    schemaVersion: NATIONAL_BOUNDARY_SCHEMA_VERSION,
    source: {
      provider: 'Kartverket',
      datasetName: 'Administrative enheter kommuner – Riksgrense',
      metadataUuid: '041f1e6e-bdbc-4091-b48f-8a5990f3cc5b',
      sourceUrl,
      referenceDate: '2026-01-01',
      retrievedAtUtc,
      coordinateReferenceSystem: 'EPSG:4326',
    },
    lines,
  });
}

interface BoundaryGraph {
  readonly positions: readonly Position[];
  readonly neighbours: readonly (readonly number[])[];
}

const graphCache = new WeakMap<PreparedNationalBoundaryDataset, BoundaryGraph>();

function coordinateKey(longitude: number, latitude: number): string {
  return `${longitude.toFixed(7)},${latitude.toFixed(7)}`;
}

function boundaryGraph(dataset: PreparedNationalBoundaryDataset): BoundaryGraph {
  const cached = graphCache.get(dataset);
  if (cached !== undefined) return cached;

  const positions: Position[] = [];
  const neighbours: number[][] = [];
  const indexByCoordinate = new Map<string, number>();
  const indexFor = ([longitude, latitude]: readonly [number, number]): number => {
    const key = coordinateKey(longitude, latitude);
    const existing = indexByCoordinate.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length;
    indexByCoordinate.set(key, index);
    positions.push({ latitude, longitude });
    neighbours.push([]);
    return index;
  };

  for (const line of dataset.lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const fromCoordinate = line[index];
      const toCoordinate = line[index + 1];
      if (fromCoordinate === undefined || toCoordinate === undefined) continue;
      const from = indexFor(fromCoordinate);
      const to = indexFor(toCoordinate);
      if (!neighbours[from]?.includes(to)) neighbours[from]?.push(to);
      if (!neighbours[to]?.includes(from)) neighbours[to]?.push(from);
    }
  }

  const graph = { positions, neighbours };
  graphCache.set(dataset, graph);
  return graph;
}

function approximateDistanceNm(from: Position, to: Position): number {
  const meanLatitudeRadians = ((from.latitude + to.latitude) / 2) * Math.PI / 180;
  const northNm = (to.latitude - from.latitude) * 60;
  const eastNm = (to.longitude - from.longitude) * 60 * Math.cos(meanLatitudeRadians);
  return Math.hypot(northNm, eastNm);
}

function nearestVertex(positions: readonly Position[], query: Position): {
  readonly index: number;
  readonly distanceNm: number;
} {
  let bestIndex = -1;
  let bestDistanceNm = Number.POSITIVE_INFINITY;
  positions.forEach((position, index) => {
    const distanceNm = approximateDistanceNm(position, query);
    if (distanceNm < bestDistanceNm) {
      bestDistanceNm = distanceNm;
      bestIndex = index;
    }
  });
  return { index: bestIndex, distanceNm: bestDistanceNm };
}

function shortestBoundaryPath(
  graph: BoundaryGraph,
  startIndex: number,
  endIndex: number,
): readonly number[] | null {
  const queue = [startIndex];
  const previous = new Int32Array(graph.positions.length);
  previous.fill(-1);
  previous[startIndex] = startIndex;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === undefined) break;
    if (current === endIndex) break;
    for (const neighbour of graph.neighbours[current] ?? []) {
      if (previous[neighbour] !== -1) continue;
      previous[neighbour] = current;
      queue.push(neighbour);
    }
  }
  if (previous[endIndex] === -1) return null;
  const reversed: number[] = [];
  for (let current = endIndex; ; current = previous[current] as number) {
    reversed.push(current);
    if (current === startIndex) break;
  }
  return reversed.reverse();
}

export function resolveNationalBoundary(
  dataset: PreparedNationalBoundaryDataset,
  from: Position,
  to: Position,
  section: string,
): ResolvedNationalBoundary {
  const graph = boundaryGraph(dataset);
  const start = nearestVertex(graph.positions, from);
  const end = nearestVertex(graph.positions, to);
  if (
    start.index < 0 ||
    end.index < 0 ||
    start.distanceNm > NATIONAL_BOUNDARY_MAX_SNAP_NM ||
    end.distanceNm > NATIONAL_BOUNDARY_MAX_SNAP_NM
  ) {
    throw new AvinorEaipImportError(
      'national-boundary-snap-failed',
      `Published boundary endpoints are not within ${NATIONAL_BOUNDARY_MAX_SNAP_NM.toFixed(1)} NM of the authoritative national boundary`,
      section,
    );
  }
  const indices = shortestBoundaryPath(graph, start.index, end.index);
  if (indices === null) {
    throw new AvinorEaipImportError(
      'national-boundary-path-failed',
      'Published boundary endpoints do not resolve to one connected authoritative boundary path',
      section,
    );
  }
  const intermediate = indices.map((index) => graph.positions[index] as Position);
  return {
    positions: [from, ...intermediate, to],
    startSnapDistanceNm: start.distanceNm,
    endSnapDistanceNm: end.distanceNm,
  };
}
