import { describe, expect, it } from 'vitest';

import type { FlightPlanningDocument } from '../domain';
import { PROJECT_AIRCRAFT_PERFORMANCE_PROFILE } from '../domain';
import {
  parseFlightPlanningDocument,
  parseFlightPlanningDocumentJson,
  serializeFlightPlanningDocument,
} from './flightPlanningDocument';

const document: FlightPlanningDocument = {
  schemaVersion: 2,
  flightPlan: {
    waypoints: [
      {
        id: 'A',
        name: 'DEPARTURE',
        position: { latitude: 69, longitude: 18 },
        anchor: {
          kind: 'aeronautical-feature',
          feature: {
            dataset: {
              datasetId: 'airac-2608-r1',
              providerId: 'test-provider',
              sourceName: 'Test source',
              airacCycle: '2608',
              effectiveFromUtc: '2026-08-06T00:00:00Z',
              effectiveToUtc: '2026-09-03T00:00:00Z',
              revisionId: 'r1',
            },
            featureId: 'ad-a',
            featureVersionId: 'ad-a-v1',
            featureKind: 'aerodrome',
          },
          publishedIdentifier: 'ENAA',
          publishedName: 'Test aerodrome',
        },
      },
      {
        id: 'B',
        name: 'COAST',
        position: { latitude: 69.4, longitude: 19 },
      },
    ],
    legShapes: [
      {
        fromWaypointId: 'A',
        toWaypointId: 'B',
        points: [
          {
            id: 'G1',
            position: { latitude: 69.2, longitude: 18.4 },
          },
        ],
      },
    ],
  },
  planningInputs: {
    departureTimeUtcMs: Date.UTC(2026, 7, 28, 9),
    magneticVariationDegEast: 8.5,
    wind: { directionFromTrueDeg: 240, speedKt: 18 },
  },
  aircraftPerformanceProfile: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
  performanceInputs: {
    massKg: 820,
    defaultAltitudeFtMsl: 4500,
    departureElevationFtMsl: 50,
    destinationElevationFtMsl: 100,
    patternHeightAglFt: 1000,
    departureWeather: { qnhHpa: 1012, isaDeviationC: 2 },
    destinationWeather: { qnhHpa: 1016, isaDeviationC: 4 },
    legAltitudePlans: [{
      fromWaypointId: 'A',
      toWaypointId: 'B',
      altitudeFtMsl: 5500,
      targetPlacement: {
        mode: 'distance-along-leg',
        distanceFromStartNm: 12.5,
      },
    }],
  },
  useForecastWinds: true,
};

describe('flight-planning document persistence', () => {
  it('round-trips route inputs, shaping geometry, and anchor provenance', () => {
    const restored = parseFlightPlanningDocumentJson(
      serializeFlightPlanningDocument(document),
    );

    expect(restored).toEqual(document);
    expect(restored).not.toBe(document);
    expect(restored.flightPlan.waypoints[0]?.anchor?.feature.dataset.airacCycle)
      .toBe('2608');
  });

  it('serializes only versioned input data rather than calculated output', () => {
    const serialized = JSON.parse(
      serializeFlightPlanningDocument(document),
    ) as Record<string, unknown>;

    expect(Object.keys(serialized)).toEqual([
      'schemaVersion',
      'flightPlan',
      'planningInputs',
      'aircraftPerformanceProfile',
      'performanceInputs',
      'useForecastWinds',
    ]);
    expect(serializeFlightPlanningDocument(document)).not.toContain(
      'calculatedLeg',
    );
    expect(serializeFlightPlanningDocument(document)).not.toContain(
      'forecastWinds',
    );
  });

  it('rejects malformed JSON and unsupported schema versions', () => {
    expect(() => parseFlightPlanningDocumentJson('{broken')).toThrow(
      'not valid JSON',
    );
    expect(() =>
      parseFlightPlanningDocument({ ...document, schemaVersion: 3 }),
    ).toThrow('Unsupported flight-planning document schema version 3');
  });

  it('rejects invalid positions, waypoint names, and duplicate point IDs', () => {
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          waypoints: [
            {
              ...document.flightPlan.waypoints[0],
              position: { latitude: 91, longitude: 18 },
            },
          ],
          legShapes: [],
        },
      }),
    ).toThrow('latitude must be between -90 and 90');
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          waypoints: [
            { ...document.flightPlan.waypoints[0], name: '   ' },
          ],
          legShapes: [],
        },
      }),
    ).toThrow('name must not be empty');
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          ...document.flightPlan,
          legShapes: [
            {
              ...document.flightPlan.legShapes[0],
              points: [
                {
                  id: 'A',
                  position: { latitude: 69.2, longitude: 18.4 },
                },
              ],
            },
          ],
        },
      }),
    ).toThrow('Duplicate route point ID A');
  });

  it('rejects orphaned or duplicate leg shapes', () => {
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          ...document.flightPlan,
          legShapes: [
            {
              ...document.flightPlan.legShapes[0],
              toWaypointId: 'missing',
            },
          ],
        },
      }),
    ).toThrow('does not match an adjacent waypoint leg');
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          ...document.flightPlan,
          legShapes: [
            document.flightPlan.legShapes[0],
            {
              ...document.flightPlan.legShapes[0],
              points: [
                {
                  id: 'G2',
                  position: { latitude: 69.3, longitude: 18.7 },
                },
              ],
            },
          ],
        },
      }),
    ).toThrow('Duplicate route shape');
  });

  it('rejects area-feature anchors and incomplete provenance', () => {
    const anchor = document.flightPlan.waypoints[0]!.anchor!;

    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          waypoints: [
            {
              ...document.flightPlan.waypoints[0],
              anchor: {
                ...anchor,
                feature: { ...anchor.feature, featureKind: 'ctr' },
              },
            },
          ],
          legShapes: [],
        },
      }),
    ).toThrow('must identify a point feature');
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        flightPlan: {
          waypoints: [
            {
              ...document.flightPlan.waypoints[0],
              anchor: {
                ...anchor,
                feature: {
                  ...anchor.feature,
                  dataset: {
                    ...anchor.feature.dataset,
                    datasetId: '',
                  },
                },
              },
            },
          ],
          legShapes: [],
        },
      }),
    ).toThrow('datasetId must not be empty');
  });

  it.each([
    {
      field: 'departureTimeUtcMs',
      value: 1e20,
      message: 'must be a valid UTC timestamp',
    },
    {
      field: 'magneticVariationDegEast',
      value: 181,
      message: 'must be between -180 and 180',
    },
  ])('rejects invalid planning input $field', ({ field, value, message }) => {
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        planningInputs: {
          ...document.planningInputs,
          [field]: value,
        },
      }),
    ).toThrow(message);
  });

  it('migrates a V1 document without inventing missing performance inputs', () => {
    const migrated = parseFlightPlanningDocument({
      schemaVersion: 1,
      flightPlan: document.flightPlan,
      planningInputs: {
        ...document.planningInputs,
        trueAirspeedKt: 105,
        plannedAltitudeFtMsl: 4500,
      },
      useForecastWinds: true,
    });

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      planningInputs: document.planningInputs,
      aircraftPerformanceProfile: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
      performanceInputs: null,
    });
  });

  it('validates performance inputs and adjacent leg altitude plans', () => {
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        performanceInputs: {
          ...document.performanceInputs!,
          massKg: 0,
        },
      }),
    ).toThrow('massKg must be greater than zero');
    expect(() =>
      parseFlightPlanningDocument({
        ...document,
        performanceInputs: {
          ...document.performanceInputs!,
          legAltitudePlans: [{
            fromWaypointId: 'A',
            toWaypointId: 'missing',
          }],
        },
      }),
    ).toThrow('does not match an adjacent waypoint leg');
  });
});
