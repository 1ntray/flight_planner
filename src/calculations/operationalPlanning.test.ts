import { describe, expect, it } from 'vitest';

import type {
  AircraftPerformancePlanInputs,
  FlightPlan,
  OperationalPlanningInputs,
  RoutePlanningInputs,
} from '../domain';
import {
  AIRCRAFT_CATALOG,
  PROJECT_AIRCRAFT_DEFINITION,
  ZLIN_Z242_FUEL_SYSTEM,
} from '../domain';
import {
  allocateFuelToTanks,
  calculateLoadingState,
  calculateOperationalFlightPlan,
  consumeFuelFromTanks,
} from './operationalPlanning';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'ENDU', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'ENEV', position: { latitude: 0, longitude: 1 } },
    { id: 'C', name: 'ENTC', position: { latitude: 0, longitude: 2 } },
    { id: 'D', name: 'ENAT', position: { latitude: 0, longitude: 3 } },
  ],
  legShapes: [],
  sectorBoundaryWaypointIds: ['B', 'C'],
};

const navigation: RoutePlanningInputs = {
  departureTimeUtcMs: Date.UTC(2026, 7, 29, 8),
  magneticVariationDegEast: 0,
  wind: { directionFromTrueDeg: 0, speedKt: 0 },
};

const performance: AircraftPerformancePlanInputs = {
  massKg: 900,
  defaultAltitudeFtMsl: 1000,
  departureElevationFtMsl: 1000,
  destinationElevationFtMsl: 1000,
  patternHeightAglFt: 0,
  departureWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
  destinationWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
  legAltitudePlans: [],
  sectorStopPlans: [
    {
      waypointId: 'B',
      elevationFtMsl: 1000,
      weather: { qnhHpa: 1013.25, isaDeviationC: 0 },
    },
    {
      waypointId: 'C',
      elevationFtMsl: 1000,
      weather: { qnhHpa: 1013.25, isaDeviationC: 0 },
    },
  ],
};

function operational(
  overrides: Partial<OperationalPlanningInputs> = {},
): OperationalPlanningInputs {
  return {
    fuelOnboardLitres: 224,
    leftSeatMassKg: 80,
    rightSeatMassKg: 0,
    baggageMassKg: 0,
    extraFuelLitres: 18,
    finalReserveLitres: 36,
    sectorOperations: [
      { waypointId: 'B', kind: 'touch-and-go' },
      { waypointId: 'C', kind: 'touch-and-go' },
    ],
    alternate: null,
    ...overrides,
  };
}

describe('operational planning', () => {
  it('allocates main first and consumes auxiliary first', () => {
    const full = allocateFuelToTanks(224, ZLIN_Z242_FUEL_SYSTEM);
    expect(full).toEqual({
      mainLitres: 116,
      auxiliaryLitres: 108,
      totalLitres: 224,
    });

    expect(consumeFuelFromTanks(full, 7)).toEqual({
      mainLitres: 116,
      auxiliaryLitres: 101,
      totalLitres: 217,
    });
    expect(allocateFuelToTanks(100, ZLIN_Z242_FUEL_SYSTEM)).toEqual({
      mainLitres: 100,
      auxiliaryLitres: 0,
      totalLitres: 100,
    });
    expect(consumeFuelFromTanks(full, 110)).toEqual({
      mainLitres: 114,
      auxiliaryLitres: 0,
      totalLitres: 114,
    });
  });

  it('calculates loading mass, moment, and arm from separate tank stations', () => {
    const inputs = operational({
      fuelOnboardLitres: 150,
      leftSeatMassKg: 80,
      rightSeatMassKg: 70,
      baggageMassKg: 10,
    });
    const fuel = allocateFuelToTanks(150, ZLIN_Z242_FUEL_SYSTEM);
    const loadingDefinition = PROJECT_AIRCRAFT_DEFINITION.weightBalance!;
    const result = calculateLoadingState(
      fuel,
      inputs,
      ZLIN_Z242_FUEL_SYSTEM,
      loadingDefinition,
    );
    const expectedMass = 763 + 80 + 70 + 10 + 150 * 0.72;
    const expectedMoment =
      502 +
      (80 + 70) * 0.956 +
      10 * 1.766 +
      116 * 0.72 * 0.75 +
      34 * 0.72 * 0.948;

    expect(result.totalMassKg).toBeCloseTo(expectedMass, 12);
    expect(result.totalMomentKgm).toBeCloseTo(expectedMoment, 12);
    expect(result.armM).toBeCloseTo(expectedMoment / expectedMass, 12);
  });

  it('exposes the three registration-specific empty mass and moments', () => {
    expect(AIRCRAFT_CATALOG.map((aircraft) => ({
      registration: aircraft.registration,
      mass: aircraft.weightBalance?.basicEmptyMassKg,
      moment: aircraft.weightBalance?.basicEmptyMomentKgm,
    }))).toEqual([
      { registration: 'LN-UPS', mass: 763, moment: 502 },
      { registration: 'LN-UPT', mass: 775, moment: 526 },
      { registration: 'LN-UPR', mass: 776, moment: 525 },
    ]);
  });

  it('keeps intermediate totals per sector while accumulating across OFPs', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational(),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.sectors).toHaveLength(3);
      expect(result.sectors[1]!.rows[0]!.intermediate.distanceNm)
        .toBeCloseTo(result.performanceRoute.sectors[1]!.totalDistanceNm, 12);
      expect(result.sectors[1]!.rows[0]!.accumulated.distanceNm)
        .toBeCloseTo(
          result.performanceRoute.sectors[0]!.totalDistanceNm +
          result.performanceRoute.sectors[1]!.totalDistanceNm,
          12,
        );
      expect(result.sectors[2]!.accumulatedTotal.distanceNm)
        .toBeCloseTo(result.performanceRoute.totalDistanceNm, 12);
      expect(result.sectors[2]!.accumulatedTotal.airborneSeconds)
        .toBeCloseTo(result.performanceRoute.totalEetSeconds, 9);
      expect(result.sectors[2]!.accumulatedTotal.airborneFuelLitres)
        .toBeCloseTo(result.performanceRoute.totalFuelLitres, 9);
      const firstRow = result.sectors[0]!.rows[0]!;
      expect(firstRow.estimatedFuelRemainingLitres).toBeCloseTo(
        224 - 7 - firstRow.leg.fuelLitres,
        9,
      );
    }
  });

  it('adds 7 L and 15 minutes only while a taxi departure remains', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational(),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const first = result.sectors[0]!;
      const second = result.sectors[1]!;
      expect(first.tripFuel.litres).toBeCloseTo(
        result.performanceRoute.totalFuelLitres + 7,
        9,
      );
      expect(first.tripFuel.timeMinutes).toBeCloseTo(
        result.performanceRoute.totalEetSeconds / 60 + 15,
        9,
      );
      expect(second.tripFuel.litres).toBeCloseTo(
        result.performanceRoute.sectors[1]!.totalFuelLitres +
        result.performanceRoute.sectors[2]!.totalFuelLitres,
        9,
      );
      expect(second.tripFuel.timeMinutes).toBeCloseTo(
        (result.performanceRoute.sectors[1]!.totalEetSeconds +
          result.performanceRoute.sectors[2]!.totalEetSeconds) / 60,
        9,
      );
      expect(
        first.takeoffLoading.fuel.auxiliaryLitres -
          first.landingLoading.fuel.auxiliaryLitres,
      ).toBeCloseTo(first.intermediateTotal.airborneFuelLitres, 9);
      expect(
        first.takeoffLoading.fuel.mainLitres -
          first.landingLoading.fuel.mainLitres,
      ).toBeCloseTo(0, 9);
    }
  });

  it('applies a full-stop fuel target and a new ground allowance', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational({
        sectorOperations: [
          {
            waypointId: 'B',
            kind: 'full-stop',
            departureFuelOnboardLitres: 150,
          },
          { waypointId: 'C', kind: 'touch-and-go' },
        ],
      }),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.sectors[1]!.fuelOnboardBeforeDepartureLitres).toBe(150);
      expect(result.sectors[1]!.fuelAtTakeoffLitres).toBe(143);
      expect(result.sectors[0]!.tripFuel.litres).toBeCloseTo(
        result.performanceRoute.totalFuelLitres + 14,
        9,
      );
      expect(result.sectors[1]!.tripFuel.timeMinutes).toBeCloseTo(
        (result.performanceRoute.sectors[1]!.totalEetSeconds +
          result.performanceRoute.sectors[2]!.totalEetSeconds) / 60 + 15,
        9,
      );
    }
  });

  it('uses paired requirement times and surplus fuel for endurance', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational(),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const first = result.sectors[0]!;
      expect(first.extraFuel).toMatchObject({ litres: 18, timeMinutes: 30 });
      expect(first.finalReserve).toMatchObject({ litres: 36, timeMinutes: 60 });
      expect(first.enduranceMinutes).toBeCloseTo(
        first.totalFuelRequired.timeMinutes +
          (first.fuelOnboardBeforeDepartureLitres -
            first.totalFuelRequired.litres) / 36 * 60,
        9,
      );
    }
  });

  it('shows zero and no required fuel when minimum flight time is unnecessary', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational({ fuelOnboardLitres: 100 }),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.sectors[0]!.minimumFlight).toEqual({
        status: 'not-required',
        timeMinutes: 0,
        requiredFuelRemainingLitres: null,
      });
    }
  });

  it('integrates planned phase burn to find the 1050 kg minimum flight time', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational({
        fuelOnboardLitres: 100,
        leftSeatMassKg: 110,
        rightSeatMassKg: 111,
      }),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const minimum = result.sectors[0]!.minimumFlight;
      expect(minimum.status).toBe('reachable');
      if (minimum.status === 'reachable') {
        expect(minimum.timeMinutes).toBeGreaterThan(0);
        expect(minimum.requiredFuelRemainingLitres).toBeLessThan(93);
      }
    }
  });

  it('uses pilot-entered alternate requirements rather than a performance calculation', () => {
    const result = calculateOperationalFlightPlan({
      flightPlan,
      navigation,
      performance,
      aircraft: PROJECT_AIRCRAFT_DEFINITION,
      operational: operational({
        alternate: {
          waypoint: {
            id: 'ALT',
            name: 'ALTERNATE',
            position: { latitude: 1, longitude: 3 },
          },
          plannedAltitudeFtMsl: 2500,
          distanceNm: 42,
          timeMinutes: 31,
          fuelLitres: 19,
        },
      }),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.sectors[0]!.alternateFuel).toMatchObject({
        litres: 19,
        timeMinutes: 31,
      });
    }
  });
});
