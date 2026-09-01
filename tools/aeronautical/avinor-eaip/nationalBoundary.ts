import { load } from 'cheerio';

import type { Position } from '../../../src/domain';
import { AvinorEaipImportError } from './types.ts';

export const NATIONAL_BOUNDARY_SCHEMA_VERSION = 1;
export const NATIONAL_BOUNDARY_MAX_SNAP_NM = 0.5;
export const NATIONAL_BOUNDARY_SIMPLIFICATION_TOLERANCE_NM = 0.02;

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
      datasetName: 'Norges maritime grenser – Riksgrense / avtalt avgrensningslinje',
      metadataUuid: 'e106adf4-c9d8-4fce-a9b5-7886a4126d23',
      sourceUrl,
      referenceDate: '2025-04-11',
      retrievedAtUtc,
      coordinateReferenceSystem: 'EPSG:4326',
    },
    lines,
  });
}

interface BoundaryGraph {
  readonly positions: readonly Position[];
  readonly neighbours: readonly (readonly BoundaryEdge[])[];
  readonly segments: readonly BoundarySegment[];
}

interface BoundaryEdge {
  readonly to: number;
  readonly distanceNm: number;
}

interface BoundarySegment {
  readonly from: number;
  readonly to: number;
  readonly distanceNm: number;
}

const graphCache = new WeakMap<PreparedNationalBoundaryDataset, BoundaryGraph>();

function coordinateKey(longitude: number, latitude: number): string {
  return `${longitude.toFixed(7)},${latitude.toFixed(7)}`;
}

function boundaryGraph(dataset: PreparedNationalBoundaryDataset): BoundaryGraph {
  const cached = graphCache.get(dataset);
  if (cached !== undefined) return cached;

  const positions: Position[] = [];
  const neighbours: BoundaryEdge[][] = [];
  const segments: BoundarySegment[] = [];
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
      const distanceNm = approximateDistanceNm(positions[from]!, positions[to]!);
      if (!neighbours[from]?.some((edge) => edge.to === to)) {
        neighbours[from]?.push({ to, distanceNm });
        neighbours[to]?.push({ to: from, distanceNm });
        segments.push({ from, to, distanceNm });
      }
    }
  }

  const graph = { positions, neighbours, segments };
  graphCache.set(dataset, graph);
  return graph;
}

function approximateDistanceNm(from: Position, to: Position): number {
  const meanLatitudeRadians = ((from.latitude + to.latitude) / 2) * Math.PI / 180;
  const northNm = (to.latitude - from.latitude) * 60;
  const eastNm = (to.longitude - from.longitude) * 60 * Math.cos(meanLatitudeRadians);
  return Math.hypot(northNm, eastNm);
}

function distanceFromSegmentNm(
  point: readonly [number, number],
  from: readonly [number, number],
  to: readonly [number, number],
): number {
  const referenceLatitude = point[1] * Math.PI / 180;
  const longitudeScale = 60 * Math.cos(referenceLatitude);
  const latitudeScale = 60;
  const fromX = (from[0] - point[0]) * longitudeScale;
  const fromY = (from[1] - point[1]) * latitudeScale;
  const toX = (to[0] - point[0]) * longitudeScale;
  const toY = (to[1] - point[1]) * latitudeScale;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(fromX * deltaX + fromY * deltaY) / lengthSquared));
  return Math.hypot(fromX + deltaX * fraction, fromY + deltaY * fraction);
}

export function simplifyNationalBoundaryLine(
  line: readonly (readonly [number, number])[],
  toleranceNm = NATIONAL_BOUNDARY_SIMPLIFICATION_TOLERANCE_NM,
): readonly (readonly [number, number])[] {
  if (line.length <= 2) return line;
  const retained = new Uint8Array(line.length);
  retained[0] = 1;
  retained[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maximumDistance = toleranceNm;
    let maximumIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = distanceFromSegmentNm(line[index]!, line[start]!, line[end]!);
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }
    if (maximumIndex >= 0) {
      retained[maximumIndex] = 1;
      stack.push([start, maximumIndex], [maximumIndex, end]);
    }
  }
  return line.filter((_, index) => retained[index] === 1);
}

interface BoundarySnap {
  readonly segment: BoundarySegment;
  readonly position: Position;
  readonly fraction: number;
  readonly distanceNm: number;
}

function nearestSegment(graph: BoundaryGraph, query: Position): BoundarySnap | null {
  let best: BoundarySnap | null = null;
  let bestDistanceNm = Number.POSITIVE_INFINITY;
  const latitudeScale = 60;
  const longitudeScale = 60 * Math.cos(query.latitude * Math.PI / 180);
  for (const segment of graph.segments) {
    const from = graph.positions[segment.from]!;
    const to = graph.positions[segment.to]!;
    const fromX = (from.longitude - query.longitude) * longitudeScale;
    const fromY = (from.latitude - query.latitude) * latitudeScale;
    const toX = (to.longitude - query.longitude) * longitudeScale;
    const toY = (to.latitude - query.latitude) * latitudeScale;
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const fraction = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(fromX * deltaX + fromY * deltaY) / lengthSquared));
    const position = {
      latitude: from.latitude + (to.latitude - from.latitude) * fraction,
      longitude: from.longitude + (to.longitude - from.longitude) * fraction,
    };
    const distanceNm = approximateDistanceNm(position, query);
    if (distanceNm < bestDistanceNm) {
      bestDistanceNm = distanceNm;
      best = { segment, position, fraction, distanceNm };
    }
  }
  return best;
}

interface QueueItem {
  readonly index: number;
  readonly distanceNm: number;
}

class MinimumQueue {
  private readonly values: QueueItem[] = [];

  push(value: QueueItem): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent]!.distanceNm <= value.distanceNm) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): QueueItem | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (first === undefined || last === undefined || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length &&
        this.values[right]!.distanceNm < this.values[left]!.distanceNm
        ? right
        : left;
      if (this.values[child]!.distanceNm >= last.distanceNm) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function shortestBoundaryPath(
  graph: BoundaryGraph,
  start: BoundarySnap,
  end: BoundarySnap,
): readonly number[] | null {
  const distances = new Float64Array(graph.positions.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(graph.positions.length);
  previous.fill(-1);
  const queue = new MinimumQueue();
  const startOptions = [
    { index: start.segment.from, distanceNm: start.segment.distanceNm * start.fraction },
    { index: start.segment.to, distanceNm: start.segment.distanceNm * (1 - start.fraction) },
  ];
  for (const option of startOptions) {
    if (option.distanceNm >= distances[option.index]!) continue;
    distances[option.index] = option.distanceNm;
    previous[option.index] = -2;
    queue.push(option);
  }
  while (true) {
    const item = queue.pop();
    if (item === undefined) break;
    if (item.distanceNm !== distances[item.index]) continue;
    for (const edge of graph.neighbours[item.index] ?? []) {
      const nextDistance = item.distanceNm + edge.distanceNm;
      if (nextDistance >= distances[edge.to]!) continue;
      distances[edge.to] = nextDistance;
      previous[edge.to] = item.index;
      queue.push({ index: edge.to, distanceNm: nextDistance });
    }
  }
  const endOptions = [
    { index: end.segment.from, distanceNm: end.segment.distanceNm * end.fraction },
    { index: end.segment.to, distanceNm: end.segment.distanceNm * (1 - end.fraction) },
  ];
  const selected = endOptions
    .map((option) => ({ ...option, total: distances[option.index]! + option.distanceNm }))
    .sort((first, second) => first.total - second.total)[0];
  if (selected === undefined || !Number.isFinite(selected.total)) return null;
  const reversed: number[] = [];
  for (let current = selected.index; current >= 0; current = previous[current] as number) {
    reversed.push(current);
    if (previous[current] === -2) break;
  }
  return reversed.reverse();
}

function appendDistinct(target: Position[], position: Position): void {
  const last = target.at(-1);
  if (
    last === undefined ||
    last.latitude !== position.latitude ||
    last.longitude !== position.longitude
  ) {
    target.push(position);
  }
}

export function resolveNationalBoundary(
  dataset: PreparedNationalBoundaryDataset,
  from: Position,
  to: Position,
  section: string,
): ResolvedNationalBoundary {
  const graph = boundaryGraph(dataset);
  const start = nearestSegment(graph, from);
  const end = nearestSegment(graph, to);
  if (
    start === null ||
    end === null ||
    start.distanceNm > NATIONAL_BOUNDARY_MAX_SNAP_NM ||
    end.distanceNm > NATIONAL_BOUNDARY_MAX_SNAP_NM
  ) {
    throw new AvinorEaipImportError(
      'national-boundary-snap-failed',
      `Published boundary endpoints are not within ${NATIONAL_BOUNDARY_MAX_SNAP_NM.toFixed(1)} NM of the authoritative national boundary (start ${start?.distanceNm.toFixed(3) ?? 'unavailable'} NM, end ${end?.distanceNm.toFixed(3) ?? 'unavailable'} NM)`,
      section,
    );
  }
  let pathPositions: readonly Position[];
  if (
    start.segment.from === end.segment.from &&
    start.segment.to === end.segment.to
  ) {
    pathPositions = [start.position, end.position];
  } else {
    const indices = shortestBoundaryPath(graph, start, end);
    if (indices === null) {
      throw new AvinorEaipImportError(
        'national-boundary-path-failed',
        'Published boundary endpoints do not resolve to one connected authoritative boundary path',
        section,
      );
    }
    pathPositions = [
      start.position,
      ...indices.map((index) => graph.positions[index] as Position),
      end.position,
    ];
  }
  const positions: Position[] = [];
  appendDistinct(positions, from);
  pathPositions.forEach((position) => appendDistinct(positions, position));
  appendDistinct(positions, to);
  return {
    positions,
    startSnapDistanceNm: start.distanceNm,
    endSnapDistanceNm: end.distanceNm,
  };
}
