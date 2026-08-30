import { describe, expect, it } from 'vitest';

import type { Waypoint } from '../../domain';
import { aerodromeInfoFeatureFromWaypoint } from './aerodromeInfo';

const anchoredAerodromeWaypoint: Waypoint = {
  id: 'route-waypoint',
  name: 'ENDU',
  position: { latitude: 69.0558, longitude: 18.5404 },
  anchor: {
    kind: 'aeronautical-feature',
    feature: {
      dataset: {
        datasetId: 'avinor-eaip-2026-06-11',
        providerId: 'avinor',
        sourceName: 'Avinor eAIP',
        airacCycle: '2026-06-11',
        effectiveFromUtc: '2026-06-11T00:00:00Z',
        effectiveToUtc: null,
      },
      featureId: 'aerodrome:ENDU',
      featureKind: 'aerodrome',
    },
    publishedIdentifier: 'ENDU',
    publishedName: 'Bardufoss',
  },
};

describe('aerodromeInfoFeatureFromWaypoint', () => {
  it('uses the anchored waypoint snapshot as the aerodrome information position', () => {
    expect(aerodromeInfoFeatureFromWaypoint(anchoredAerodromeWaypoint)).toEqual({
      geometryType: 'point',
      pointKind: 'aerodrome',
      ref: anchoredAerodromeWaypoint.anchor!.feature,
      identifier: 'ENDU',
      name: 'Bardufoss',
      suggestedWaypointName: 'ENDU',
      position: anchoredAerodromeWaypoint.position,
    });
  });

  it('does not present non-aerodrome anchors as aerodrome information', () => {
    const reportingPoint: Waypoint = {
      ...anchoredAerodromeWaypoint,
      anchor: {
        ...anchoredAerodromeWaypoint.anchor!,
        feature: {
          ...anchoredAerodromeWaypoint.anchor!.feature,
          featureKind: 'reporting-point',
        },
      },
    };

    expect(aerodromeInfoFeatureFromWaypoint(reportingPoint)).toBeNull();
  });
});
