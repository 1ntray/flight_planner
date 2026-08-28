import { describe, expect, it } from 'vitest';

import { calculateRoute } from '../../calculations';
import type { Waypoint } from '../../domain';
import {
  appendAnchoredWaypoint,
  appendWaypoint,
  detachWaypointById,
  MAX_WAYPOINT_NAME_LENGTH,
  moveWaypointById,
  renameWaypointById,
  removeWaypointById,
} from './waypointState';

const dataset = {
  datasetId: 'dataset-2608-r1',
  providerId: 'test-provider',
  sourceName: 'Test aeronautical data',
  airacCycle: '2608',
  effectiveFromUtc: '2026-08-06T00:00:00Z',
  effectiveToUtc: '2026-09-03T00:00:00Z',
};

const reportingPoint = {
  geometryType: 'point' as const,
  pointKind: 'reporting-point' as const,
  ref: {
    dataset,
    featureId: 'vrp-1',
    featureVersionId: 'vrp-1-v2',
    featureKind: 'reporting-point' as const,
  },
  identifier: 'ALFA',
  name: 'Alfa reporting point',
  suggestedWaypointName: 'ALFA',
  position: { latitude: 69.1, longitude: 18.2 },
};

const originalWaypoints: Waypoint[] = [
  {
    id: 'stable-a',
    name: 'WP01',
    position: { latitude: 69, longitude: 18 },
  },
  {
    id: 'stable-b',
    name: 'WP02',
    position: { latitude: 69.2, longitude: 18.5 },
  },
  {
    id: 'stable-c',
    name: 'WP03',
    position: { latitude: 69.4, longitude: 19 },
  },
];

describe('waypoint state helpers', () => {
  it('appends a sequentially named waypoint with the supplied stable ID', () => {
    const result = appendWaypoint(
      originalWaypoints,
      { latitude: 69.6, longitude: 19.5 },
      'stable-d',
    );

    expect(result.at(-1)).toEqual({
      id: 'stable-d',
      name: 'WP04',
      position: { latitude: 69.6, longitude: 19.5 },
    });
    expect(originalWaypoints).toHaveLength(3);
  });

  it('moves one waypoint without changing its stable ID or name', () => {
    const position = { latitude: 69.3, longitude: 18.8 };
    const result = moveWaypointById(originalWaypoints, 'stable-b', position);

    expect(result[1]).toEqual({ id: 'stable-b', name: 'WP02', position });
    expect(result[0]).toBe(originalWaypoints[0]);
    expect(result[2]).toBe(originalWaypoints[2]);
  });

  it('renames one waypoint while retaining stable identity and geometry', () => {
    const result = renameWaypointById(
      originalWaypoints,
      'stable-b',
      '  COAST NORTH  ',
    );

    expect(result[1]).toEqual({
      id: 'stable-b',
      name: 'COAST NORTH',
      position: originalWaypoints[1]!.position,
    });
    expect(result[0]).toBe(originalWaypoints[0]);
    expect(result[2]).toBe(originalWaypoints[2]);
    expect(originalWaypoints[1]?.name).toBe('WP02');
  });

  it('renames an anchored waypoint without changing its anchor or coordinate', () => {
    const anchored = appendAnchoredWaypoint([], reportingPoint, 'route-id');
    const result = renameWaypointById(anchored, 'route-id', 'Training VRP');

    expect(result[0]?.name).toBe('Training VRP');
    expect(result[0]?.id).toBe('route-id');
    expect(result[0]?.position).toBe(anchored[0]?.position);
    expect(result[0]?.anchor).toBe(anchored[0]?.anchor);
    expect(result[0]?.anchor?.publishedIdentifier).toBe('ALFA');
  });

  it('rejects empty, overlong, and unknown waypoint renames', () => {
    expect(() =>
      renameWaypointById(originalWaypoints, 'stable-a', '   '),
    ).toThrow('must not be empty');
    expect(() =>
      renameWaypointById(
        originalWaypoints,
        'stable-a',
        'X'.repeat(MAX_WAYPOINT_NAME_LENGTH + 1),
      ),
    ).toThrow(`must not exceed ${MAX_WAYPOINT_NAME_LENGTH} characters`);
    expect(() =>
      renameWaypointById(originalWaypoints, 'missing', 'VALID'),
    ).toThrow('does not exist');
  });

  it('anchors a new internal waypoint to an exact feature snapshot', () => {
    const result = appendAnchoredWaypoint(
      originalWaypoints,
      reportingPoint,
      'route-waypoint-id',
    );

    expect(result.at(-1)).toEqual({
      id: 'route-waypoint-id',
      name: 'ALFA',
      position: reportingPoint.position,
      anchor: {
        kind: 'aeronautical-feature',
        feature: reportingPoint.ref,
        publishedIdentifier: 'ALFA',
        publishedName: 'Alfa reporting point',
      },
    });
    expect(result.at(-1)?.position).not.toBe(reportingPoint.position);
    expect(result.at(-1)?.id).not.toBe(reportingPoint.ref.featureId);
  });

  it('requires detachment before an anchored waypoint can move', () => {
    const anchored = appendAnchoredWaypoint([], reportingPoint, 'route-id');

    expect(() =>
      moveWaypointById(anchored, 'route-id', {
        latitude: 70,
        longitude: 19,
      }),
    ).toThrow('must be detached before moving');

    const detached = detachWaypointById(anchored, 'route-id');
    const moved = moveWaypointById(detached, 'route-id', {
      latitude: 70,
      longitude: 19,
    });

    expect(detached[0]).toEqual({
      id: 'route-id',
      name: 'ALFA',
      position: reportingPoint.position,
    });
    expect(moved[0]?.position).toEqual({ latitude: 70, longitude: 19 });
  });

  it('allows the same feature to appear twice with independent route IDs', () => {
    const first = appendAnchoredWaypoint([], reportingPoint, 'route-id-1');
    const second = appendAnchoredWaypoint(
      first,
      reportingPoint,
      'route-id-2',
    );

    expect(second.map((waypoint) => waypoint.id)).toEqual([
      'route-id-1',
      'route-id-2',
    ]);
    expect(second[0]?.anchor?.feature.featureId).toBe('vrp-1');
    expect(second[1]?.anchor?.feature.featureId).toBe('vrp-1');
  });

  it('keeps the coordinate and provenance through JSON serialization', () => {
    const anchored = appendAnchoredWaypoint([], reportingPoint, 'route-id');
    const restored = JSON.parse(JSON.stringify(anchored)) as Waypoint[];

    expect(restored).toEqual(anchored);
    expect(restored[0]?.position).toEqual({
      latitude: 69.1,
      longitude: 18.2,
    });
    expect(restored[0]?.anchor?.feature.dataset.airacCycle).toBe('2608');
  });

  it('does not follow a coordinate from a newer feature object', () => {
    const anchored = appendAnchoredWaypoint([], reportingPoint, 'route-id');
    const newerFeature = {
      ...reportingPoint,
      position: { latitude: 70, longitude: 20 },
      ref: {
        ...reportingPoint.ref,
        dataset: { ...dataset, datasetId: 'dataset-2609-r1' },
      },
    };

    expect(newerFeature.position).not.toEqual(anchored[0]?.position);
    expect(anchored[0]?.position).toEqual({
      latitude: 69.1,
      longitude: 18.2,
    });
    expect(anchored[0]?.anchor?.feature.dataset.datasetId).toBe(
      'dataset-2608-r1',
    );
  });

  it('removes a middle waypoint so route derivation connects its neighbours', () => {
    const remainingWaypoints = removeWaypointById(
      originalWaypoints,
      'stable-b',
    );
    const legs = calculateRoute({
      waypoints: remainingWaypoints,
      legShapes: [],
    });

    expect(remainingWaypoints.map((waypoint) => waypoint.id)).toEqual([
      'stable-a',
      'stable-c',
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromId: 'stable-a', toId: 'stable-c' });
  });
});
