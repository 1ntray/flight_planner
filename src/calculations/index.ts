export {
  calculateGeodesicMidpoint,
  calculateInverseGeodesic,
  calculateNearestPointOnGeodesicSegment,
  calculatePositionAtDistanceAndTrack,
  calculatePositionAlongGeodesic,
  EFFECTIVELY_IDENTICAL_DISTANCE_METERS,
  METERS_PER_NAUTICAL_MILE,
  normalizeTrackDeg,
} from './geodesy';
export {
  buildMsaCorridorGeometry,
  MSA_CORRIDOR_RADIUS_NM,
} from './msaCorridor';
export type { MsaCorridorGeometry } from './msaCorridor';
export type {
  InverseGeodesicResult,
  NearestPointOnGeodesicSegmentResult,
} from './geodesy';
export {
  calculateClimbRate,
  calculateClimbTime,
  calculateDescentTime,
  calculatePhaseFuel,
  calculatePatternAltitudeFtMsl,
  calculateAerodromePatternAltitudeFtMsl,
  DEFAULT_PATTERN_HEIGHT_AGL_FT,
  ENDU_DEFAULT_PATTERN_ALTITUDE_FT_MSL,
  calculatePlanningEnvironment,
  calculateTasFromIas,
  createDescentIntervals,
  PERFORMANCE_ALTITUDE_STEP_FT,
  PATTERN_ALTITUDE_ROUNDING_FT,
} from './aircraftPerformance';
export type {
  ClimbCalculation,
  ClimbCalculationResult,
  ImpossibleClimbCalculation,
  VerticalInterval,
} from './aircraftPerformance';
export {
  calculateMagneticDirectionDeg,
  calculateWindAdjustedLeg,
  SECONDS_PER_HOUR,
} from './navigation';
export type {
  NavigationNoSolutionReason,
  WindAdjustedLegInput,
  WindAdjustedLegNoSolution,
  WindAdjustedLegResult,
  WindAdjustedLegSolution,
} from './navigation';
export { calculateNavigationRoute } from './navigationRoute';
export type {
  CalculatedNavigationRoute,
  CalculatedNavigationRouteLeg,
  LegWindOverride,
  NavigationRouteCalculationInput,
  NavigationWindSource,
} from './navigationRoute';
export {
  applyLegMagneticVariations,
  calculateRouteMagneticVariations,
  wmm2025MagneticVariationProvider,
  WMM2025_MODEL_ID,
  WMM2025_VALID_FROM_UTC_MS,
  WMM2025_VALID_UNTIL_UTC_MS,
} from './magneticVariation';
export type {
  CalculateRouteMagneticVariationsInput,
  LegMagneticVariation,
  MagneticVariationProvider,
  MagneticVariationQuery,
  MagneticVariationResult,
  MagneticVariationSource,
  MagneticVariationUnavailableReason,
} from './magneticVariation';
export {
  buildLegGeometry,
  calculateFlightPlanLegs,
  calculateLeg,
  calculateRoute,
} from './route';
export {
  calculateNearestPointOnGeometry,
  calculatePositionAlongGeometry,
} from './routeProgress';
export { deriveFlightPlanSectors } from './flightSectors';
export type { FlightPlanSector } from './flightSectors';
export type {
  NearestPointOnGeometry,
  PositionAlongGeometry,
} from './routeProgress';
export { calculatePerformanceRoute } from './performanceRoute';
export type {
  CalculatedLegPhase,
  CalculatedPerformanceLeg,
  CalculatedPerformanceRoute,
  CalculatedPerformanceSector,
  CalculatedPerformanceRouteNoSolution,
  CalculatedPerformanceRouteSuccess,
  CalculatedPerformanceStep,
  PerformanceRouteCalculationInput,
  PerformanceRouteNoSolutionReason,
  WindResolver,
} from './performanceRoute';
export {
  allocateFuelToTanks,
  calculateLoadingState,
  calculateInitialTakeoffLoading,
  calculateOperationalFlightPlan,
  consumeFuelFromTanks,
} from './operationalPlanning';
export type {
  CalculatedFuelRequirementLine,
  CalculatedLoadingState,
  CalculatedMinimumFlight,
  CalculatedOfpLegRow,
  CalculatedOfpProgressValue,
  CalculatedOperationalFlightPlan,
  CalculatedOperationalFlightPlanNoSolution,
  CalculatedOperationalFlightPlanSuccess,
  CalculatedSectorOperationalFlightPlan,
  CalculatedTankFuel,
  OperationalFlightPlanCalculationInput,
  OperationalWarning,
  OperationalWarningCode,
} from './operationalPlanning';
