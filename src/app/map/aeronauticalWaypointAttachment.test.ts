import { describe, expect, it } from 'vitest';

import {
  AERONAUTICAL_WAYPOINT_ATTACH_RADIUS_PIXELS,
  findReportingPointShapingAttachmentTarget,
  findAeronauticalWaypointAttachmentTarget,
  findRouteWaypointSnapTarget,
} from './aeronauticalWaypointAttachment';

const dataset = {
  datasetId: 'test-dataset',
  providerId: 'test-provider',
  sourceName: 'Test source',
  airacCycle: null,
  effectiveFromUtc: '2026-01-01T00:00:00Z',
  effectiveToUtc: null,
};

const features = [
  {
    geometryType: 'point' as const,
    pointKind: 'aerodrome' as const,
    ref: {
      dataset,
      featureId: 'endu',
      featureKind: 'aerodrome' as const,
    },
    identifier: 'ENDU',
    suggestedWaypointName: 'ENDU',
    position: { latitude: 69.055, longitude: 18.54 },
  },
  {
    geometryType: 'point' as const,
    pointKind: 'navaid' as const,
    ref: {
      dataset,
      featureId: 'navaid-1',
      featureKind: 'navaid' as const,
    },
    identifier: 'NAV01',
    suggestedWaypointName: 'NAV01',
    position: { latitude: 69.12, longitude: 18.62 },
  },
];

const screenPointByPosition = (position: { latitude: number; longitude: number }) => ({
  x: position.longitude * 1_000,
  y: position.latitude * 1_000,
});

describe('aeronautical waypoint attachment targeting', () => {
  it('selects the nearest visible point within the drop radius', () => {
    const target = findAeronauticalWaypointAttachmentTarget(
      { latitude: 69.056, longitude: 18.548 },
      features,
      screenPointByPosition,
    );

    expect(target?.identifier).toBe('ENDU');
  });

  it('does not attach when no point is within the screen-space drop radius', () => {
    const target = findAeronauticalWaypointAttachmentTarget(
      { latitude: 69.09, longitude: 18.58 },
      features,
      screenPointByPosition,
    );

    expect(target).toBeNull();
  });

  it('uses the configured radius as an inclusive boundary', () => {
    const target = findAeronauticalWaypointAttachmentTarget(
      {
        latitude: 69.055,
        longitude:
          18.54 + AERONAUTICAL_WAYPOINT_ATTACH_RADIUS_PIXELS / 1_000,
      },
      features,
      screenPointByPosition,
    );

    expect(target?.identifier).toBe('ENDU');
  });

  it('limits shaping-point snapping to reporting points', () => {
    const reportingPoint = {
      ...features[0]!,
      pointKind: 'reporting-point' as const,
      ref: { ...features[0]!.ref, featureKind: 'reporting-point' as const },
      identifier: 'VRP01',
    };

    expect(
      findReportingPointShapingAttachmentTarget(
        reportingPoint.position,
        [features[1]!, reportingPoint],
        screenPointByPosition,
      )?.identifier,
    ).toBe('VRP01');
    expect(
      findReportingPointShapingAttachmentTarget(
        features[1]!.position,
        [features[1]!],
        screenPointByPosition,
      ),
    ).toBeNull();
  });

  it('snaps a free waypoint to the nearest other route waypoint', () => {
    const routeWaypoints = [
      {
        id: 'from',
        name: 'FROM',
        position: { latitude: 69.055, longitude: 18.54 },
      },
      {
        id: 'target',
        name: 'TARGET',
        position: { latitude: 69.06, longitude: 18.55 },
      },
    ];

    expect(
      findRouteWaypointSnapTarget(
        { latitude: 69.06, longitude: 18.551 },
        routeWaypoints,
        'from',
        screenPointByPosition,
      )?.id,
    ).toBe('target');
  });

  it('does not select the dragged waypoint as its own snap target', () => {
    const routeWaypoints = [
      {
        id: 'dragged',
        name: 'DRAGGED',
        position: { latitude: 69.055, longitude: 18.54 },
      },
    ];

    expect(
      findRouteWaypointSnapTarget(
        routeWaypoints[0]!.position,
        routeWaypoints,
        'dragged',
        screenPointByPosition,
      ),
    ).toBeNull();
  });
});
