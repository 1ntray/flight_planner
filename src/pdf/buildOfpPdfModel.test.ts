import { describe, expect, it } from 'vitest';
import { calculateNavigationRoute, calculateOperationalFlightPlan } from '../calculations';
import { PROJECT_AIRCRAFT_DEFINITION, type AircraftPerformancePlanInputs, type FlightPlan, type OperationalPlanningInputs, type RoutePlanningInputs } from '../domain';
import { createEmptyOperationalInputDraft } from '../app/navigation/operationalInput';
import { buildOfpPdfModel, OfpPdfModelError } from './buildOfpPdfModel';

const flightPlan: FlightPlan = { waypoints: [{ id: 'A', name: 'ENDU', position: { latitude: 69.0, longitude: 18.0 } }, { id: 'B', name: 'ENEV', position: { latitude: 68.5, longitude: 16.7 } }], legShapes: [], sectorBoundaryWaypointIds: [] };
const navigation: RoutePlanningInputs = { departureTimeUtcMs: Date.UTC(2026, 8, 11, 8), magneticVariationDegEast: 10, wind: { directionFromTrueDeg: 20, speedKt: 9 } };
const performance: AircraftPerformancePlanInputs = { massKg: 900, defaultAltitudeFtMsl: 2500, departureElevationFtMsl: 254, destinationElevationFtMsl: 85, patternHeightAglFt: 1000, departureWeather: { qnhHpa: 1013, isaDeviationC: 0 }, destinationWeather: { qnhHpa: 1013, isaDeviationC: 0 }, legAltitudePlans: [], sectorStopPlans: [] };
const inputs: OperationalPlanningInputs = { fuelOnboardLitres: 224, leftSeatMassKg: 80, rightSeatMassKg: 0, baggageMassKg: 15, extraFuelLitres: 18, finalReserveLitres: 36, sectorOperations: [], patternPlans: [], alternate: null };

function modelInput() {
  const plan = calculateOperationalFlightPlan({ flightPlan, navigation, performance, aircraft: PROJECT_AIRCRAFT_DEFINITION, operational: inputs });
  if (plan.status !== 'ok') throw new Error(plan.message);
  const route = calculateNavigationRoute({ flightPlan, planning: { ...navigation, trueAirspeedKt: 103, plannedAltitudeFtMsl: 2500 } });
  return { flightPlan, navigationRoute: route, sector: plan.sectors[0]!, aircraft: PROJECT_AIRCRAFT_DEFINITION, operationalInputs: inputs, legAltitudePlans: [], operationalDraft: createEmptyOperationalInputDraft(), aerodromeDetailsByWaypointId: new Map(), airportOperationEnvironments: new Map(), departureTimeUtcMs: plan.performanceRoute.sectors[0]!.departureTimeUtcMs, landingTimeUtcMs: plan.performanceRoute.sectors[0]!.estimatedArrivalTimeUtcMs };
}

describe('buildOfpPdfModel', () => {
  it('maps calculated navlog, fuel, and W&B values without fabricating actuals', () => {
    const model = buildOfpPdfModel(modelInput());
    expect(model.page1.navlogRows).toHaveLength(1);
    expect(model.page1.navlogRows[0]!.from).toBe('ENDU');
    expect(model.page1.navlogRows[0]!.actualTimeUtcMs).toBeNull();
    expect(model.page1.navlogRows[0]!.actualFuelRemainingLitres).toBeNull();
    expect(model.page1.navlogRows[0]!.frequency).toBeNull();
    expect(model.page2.weightAndBalance?.leftSeat.massKg).toBe(80);
    expect(model.page2.weightAndBalance?.enrouteAuxiliaryFuel.massKg ?? 0).toBeLessThanOrEqual(0);
    expect(model.page2.weightAndBalance?.enrouteMainFuel.massKg ?? 0).toBeLessThanOrEqual(0);
    expect(model.page2.fuelRequirements?.trip.litres).toBeGreaterThan(0);
  });

  it('rejects a navlog larger than the physical template', () => {
    const input = modelInput();
    expect(() => buildOfpPdfModel({ ...input, sector: { ...input.sector, rows: Array.from({ length: 17 }, () => input.sector.rows[0]!) } })).toThrow(OfpPdfModelError);
  });
});
