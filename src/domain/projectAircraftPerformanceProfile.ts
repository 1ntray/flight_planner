import type {
  AircraftDefinition,
  AircraftPerformanceProfile,
} from './aircraftPerformance';
import type {
  AircraftFuelSystemDefinition,
  AircraftWeightBalanceDefinition,
} from './operationalPlanning';

export const PROJECT_AIRCRAFT_PERFORMANCE_PROFILE: AircraftPerformanceProfile = {
  climb: {
    iasKt: 80,
    fuelFlowLph: 61,
    rateModel: {
      kind: 'effective-altitude-linear-mass',
      isaAltitudeFactorFtPerC: 120,
      referenceMassKg: 820,
      baseRateFtPerMin: 1210,
      altitudeCoefficientPerFt: -0.047,
      massCoefficientPerKg: -1.55,
      altitudeMassCoefficientPerFtKg: -0.000035,
    },
  },
  cruise: {
    iasKt: 103,
    fuelFlowLph: 36,
  },
  descent: {
    iasKt: 103,
    fuelFlowLph: 26.5,
    rateFtPerMin: 500,
  },
};

export const ZLIN_Z242_FUEL_SYSTEM: AircraftFuelSystemDefinition = {
  densityKgPerLitre: 0.72,
  main: { usableCapacityLitres: 116, armM: 0.75 },
  auxiliary: { usableCapacityLitres: 108, armM: 0.948 },
  consumptionOrder: ['auxiliary', 'main'],
  groundDepartureAllowance: {
    fuelLitres: 7,
    planningTimeMinutes: 15,
  },
  reserveFuelFlowLph: 36,
};

const COMMON_WEIGHT_BALANCE = {
  leftSeatArmM: 0.956,
  rightSeatArmM: 0.956,
  baggageArmM: 1.766,
  maximumBaggageMassKg: 20,
  maximumTakeoffMassKg: 1090,
  maximumLandingMassKg: 1050,
} as const;

function createZlinAircraft(
  registration: string,
  basicEmptyMassKg: number,
  basicEmptyMomentKgm: number,
): AircraftDefinition {
  const weightBalance: AircraftWeightBalanceDefinition = {
    basicEmptyMassKg,
    basicEmptyMomentKgm,
    ...COMMON_WEIGHT_BALANCE,
  };

  return {
    aircraftId: `zlin-z242-${registration.toLowerCase()}`,
    revision: 1,
    displayName: 'Zlin Z242',
    registration,
    performance: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
    fuelSystem: ZLIN_Z242_FUEL_SYSTEM,
    weightBalance,
  };
}

export const PROJECT_AIRCRAFT_DEFINITION = createZlinAircraft(
  'LN-UPS',
  763,
  502,
);

export const AIRCRAFT_CATALOG: readonly AircraftDefinition[] = [
  PROJECT_AIRCRAFT_DEFINITION,
  createZlinAircraft('LN-UPT', 775, 526),
  createZlinAircraft('LN-UPR', 776, 525),
];
