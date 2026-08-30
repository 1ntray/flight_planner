import { describe, expect, it } from 'vitest';

import type { FlightPlanningDocument } from '../domain';
import {
  PROJECT_AIRCRAFT_DEFINITION,
  PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
} from '../domain';
import {
  parseFlightPlanningDocument,
  parseFlightPlanningDocumentJson,
  serializeFlightPlanningDocument,
} from './flightPlanningDocument';

const document: FlightPlanningDocument = {
  schemaVersion: 9,
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
    sectorBoundaryWaypointIds: [],
  },
  planningInputs: {
    departureTimeUtcMs: Date.UTC(2026, 7, 28, 9),
    magneticVariationMode: 'manual',
    magneticVariationDegEast: 8.5,
    wind: { directionFromTrueDeg: 240, speedKt: 18 },
  },
  aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
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
      endAltitudeFtMsl: 2500,
      endTargetPlacement: {
        mode: 'distance-along-leg',
        distanceFromStartNm: 42,
      },
    }],
    sectorStopPlans: [],
  },
  operationalInputs: null,
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

  it('round-trips operational loading, stop, and alternate snapshots', () => {
    const operationalDocument: FlightPlanningDocument = {
      ...document,
      operationalInputs: {
        fuelOnboardLitres: 224,
        leftSeatMassKg: 82,
        rightSeatMassKg: 74,
        baggageMassKg: 12,
        extraFuelLitres: 18,
        finalReserveLitres: 36,
        sectorOperations: [],
        alternate: {
          waypoint: {
            id: 'ALT',
            name: 'ENAL',
            position: { latitude: 62.56, longitude: 6.11 },
          },
          plannedAltitudeFtMsl: 2500,
          distanceNm: 45,
          timeMinutes: 30,
          fuelLitres: 18,
        },
      },
    };

    expect(parseFlightPlanningDocumentJson(
      serializeFlightPlanningDocument(operationalDocument),
    )).toEqual(operationalDocument);
  });

  it('serializes only versioned input data rather than calculated output', () => {
    const serialized = JSON.parse(
      serializeFlightPlanningDocument(document),
    ) as Record<string, unknown>;

    expect(Object.keys(serialized)).toEqual([
      'schemaVersion',
      'flightPlan',
      'planningInputs',
      'aircraftDefinition',
      'performanceInputs',
      'operationalInputs',
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
      parseFlightPlanningDocument({ ...document, schemaVersion: 10 }),
    ).toThrow('Unsupported flight-planning document schema version 10');
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
      schemaVersion: 9,
      planningInputs: document.planningInputs,
      aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
      performanceInputs: null,
    });
  });

  it('migrates the V2 flat performance profile into an aircraft snapshot', () => {
    const migrated = parseFlightPlanningDocument({
      schemaVersion: 2,
      flightPlan: document.flightPlan,
      planningInputs: document.planningInputs,
      aircraftPerformanceProfile: {
        profileId: 'project-aircraft-performance',
        revision: 1,
        climbIasKt: 80,
        cruiseIasKt: 103,
        descentIasKt: 103,
        climbFuelFlowLph: 61,
        cruiseFuelFlowLph: 36,
        descentFuelFlowLph: 26.5,
        descentRateFtPerMin: 500,
      },
      performanceInputs: document.performanceInputs,
      useForecastWinds: true,
    });

    expect(migrated).toMatchObject({
      schemaVersion: 9,
      aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
      performanceInputs: document.performanceInputs,
    });
  });

  it('migrates V3 by adding empty sector collections', () => {
    const { sectorBoundaryWaypointIds: _boundaries, ...legacyFlightPlan } =
      document.flightPlan;
    const { sectorStopPlans: _stops, ...legacyPerformanceInputs } =
      document.performanceInputs!;
    const migrated = parseFlightPlanningDocument({
      schemaVersion: 3,
      flightPlan: legacyFlightPlan,
      planningInputs: document.planningInputs,
      aircraftDefinition: document.aircraftDefinition,
      performanceInputs: legacyPerformanceInputs,
      useForecastWinds: document.useForecastWinds,
    });

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.flightPlan.sectorBoundaryWaypointIds).toEqual([]);
    expect(migrated.performanceInputs?.sectorStopPlans).toEqual([]);
  });

  it('round-trips an intermediate airport and validates its planning data', () => {
    const sectorDocument: FlightPlanningDocument = {
      ...document,
      flightPlan: {
        ...document.flightPlan,
        waypoints: [
          ...document.flightPlan.waypoints,
          {
            id: 'C',
            name: 'DESTINATION',
            position: { latitude: 69.8, longitude: 20 },
          },
        ],
        sectorBoundaryWaypointIds: ['B'],
      },
      performanceInputs: {
        ...document.performanceInputs!,
        sectorStopPlans: [{
          waypointId: 'B',
          elevationFtMsl: 250,
          weather: { qnhHpa: 1009, isaDeviationC: 3 },
          stopDurationMinutes: 30,
        }],
      },
    };

    expect(parseFlightPlanningDocumentJson(
      serializeFlightPlanningDocument(sectorDocument),
    )).toEqual(sectorDocument);
    expect(() => parseFlightPlanningDocument({
      ...sectorDocument,
      performanceInputs: {
        ...sectorDocument.performanceInputs!,
        sectorStopPlans: [],
      },
    })).toThrow('must provide every route sector boundary');
  });

  it('migrates the V4 fixed onward departure without changing its meaning', () => {
    const legacyDepartureTime = Date.UTC(2026, 7, 28, 12);
    const migrated = parseFlightPlanningDocument({
      ...document,
      schemaVersion: 4,
      flightPlan: {
        ...document.flightPlan,
        waypoints: [
          ...document.flightPlan.waypoints,
          {
            id: 'C',
            name: 'DESTINATION',
            position: { latitude: 69.8, longitude: 20 },
          },
        ],
        sectorBoundaryWaypointIds: ['B'],
      },
      performanceInputs: {
        ...document.performanceInputs!,
        sectorStopPlans: [{
          waypointId: 'B',
          elevationFtMsl: 250,
          weather: { qnhHpa: 1009, isaDeviationC: 3 },
          onwardDepartureTimeUtcMs: legacyDepartureTime,
        }],
      },
    });

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.performanceInputs?.sectorStopPlans?.[0])
      .toMatchObject({ onwardDepartureTimeUtcMs: legacyDepartureTime });
  });

  it('migrates V5 without inventing operational inputs', () => {
    const { operationalInputs: _operationalInputs, ...legacyDocument } =
      document;
    const migrated = parseFlightPlanningDocument({
      ...legacyDocument,
      schemaVersion: 5,
    });

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.operationalInputs).toBeNull();
  });

  it('migrates V6 operational plans without inventing a second altitude target', () => {
    const legacyDocument = {
      ...document,
      schemaVersion: 6,
      performanceInputs: {
        ...document.performanceInputs!,
        legAltitudePlans: document.performanceInputs!.legAltitudePlans.map(
          ({ endAltitudeFtMsl: _endAltitude, endTargetPlacement: _endTarget, ...plan }) => plan,
        ),
      },
    };

    const migrated = parseFlightPlanningDocument(legacyDocument);

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.performanceInputs?.legAltitudePlans[0])
      .not.toHaveProperty('endAltitudeFtMsl');
    expect(migrated.operationalInputs).toEqual(document.operationalInputs);
  });

  it('migrates V7 route-wide variation into explicit manual mode', () => {
    const { magneticVariationMode: _mode, ...legacyPlanningInputs } =
      document.planningInputs;
    const migrated = parseFlightPlanningDocument({
      ...document,
      schemaVersion: 7,
      planningInputs: legacyPlanningInputs,
    });

    expect(migrated).toMatchObject({
      schemaVersion: 9,
      planningInputs: {
        magneticVariationMode: 'manual',
        magneticVariationDegEast: 8.5,
      },
    });
  });

  it('migrates V8 reserve minutes and calculated-alternate inputs to manual values', () => {
    const legacyV8 = {
      ...document,
      schemaVersion: 8,
      operationalInputs: {
        fuelOnboardLitres: 224,
        leftSeatMassKg: 56,
        rightSeatMassKg: 0,
        baggageMassKg: 15,
        extraFuelLitres: 18,
        finalReserveMinutes: 60,
        sectorOperations: [],
        alternate: {
          waypoint: {
            id: 'ALT',
            name: 'ENAL',
            position: { latitude: 62.56, longitude: 6.11 },
          },
          elevationFtMsl: 70,
          weather: { qnhHpa: 1013, isaDeviationC: 0 },
          altitudeFtMsl: 2500,
        },
      },
    };

    expect(parseFlightPlanningDocument(legacyV8)).toMatchObject({
      schemaVersion: 9,
      operationalInputs: {
        finalReserveLitres: 36,
        alternate: {
          distanceNm: 0,
          timeMinutes: 0,
          fuelLitres: 0,
        },
      },
    });
  });

  it('preserves serialized aircraft coefficients instead of consulting the catalog', () => {
    const customDocument = {
      ...document,
      aircraftDefinition: {
        ...document.aircraftDefinition,
        aircraftId: 'test-aircraft',
        displayName: 'Test aircraft',
        performance: {
          ...PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
          climb: {
            ...PROJECT_AIRCRAFT_PERFORMANCE_PROFILE.climb,
            rateModel: {
              ...PROJECT_AIRCRAFT_PERFORMANCE_PROFILE.climb.rateModel,
              baseRateFtPerMin: 999,
            },
          },
        },
      },
    };

    expect(parseFlightPlanningDocument(customDocument).aircraftDefinition)
      .toEqual(customDocument.aircraftDefinition);
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
