import type {
  AircraftDefinition,
  AircraftPerformanceProfile,
} from './aircraftPerformance';

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

export const PROJECT_AIRCRAFT_DEFINITION: AircraftDefinition = {
  aircraftId: 'project-aircraft',
  revision: 1,
  displayName: 'Zlin Z242',
  performance: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
};

export const AIRCRAFT_CATALOG: readonly AircraftDefinition[] = [
  PROJECT_AIRCRAFT_DEFINITION,
];
