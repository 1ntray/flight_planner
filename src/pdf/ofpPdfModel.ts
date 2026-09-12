import type { AirportWind } from '../weather';

/**
 * Semantic, presentation-only representation of one printed Z242 OFP.
 * Numeric values retain their calculated precision until the PDF formatter
 * renders them. A null value means there is no authoritative source value.
 */
export interface OfpPdfModel {
  readonly page1: OfpPdfPage1Model;
  readonly page2: OfpPdfPage2Model;
}

export interface OfpPdfPage1Model {
  readonly departureName: string | null;
  readonly destinationName: string | null;
  readonly takeoffTimeUtcMs: number | null;
  readonly landingTimeUtcMs: number | null;
  readonly dateUtcMs: number | null;
  readonly registration: string | null;
  readonly flightTimeSeconds: number | null;
  readonly fuelDepartureLitres: number | null;
  readonly fuelRemainingLitres: number | null;
  readonly navlogRows: readonly OfpNavlogRow[];
  /** Route total before the optional alternate leg. */
  readonly totals: OfpNavlogTotals;
  readonly alternateRow: OfpNavlogRow | null;
  /** Route total including alternate fuel/time/distance when it is planned. */
  readonly alternateTotals: OfpNavlogTotals | null;
}

export interface OfpNavlogRow {
  readonly kind: 'leg' | 'pattern' | 'alternate';
  readonly from: string | null;
  readonly to: string | null;
  readonly tasKt: number | null;
  readonly trueTrackDeg: number | null;
  readonly variationDegEast: number | null;
  readonly trueHeadingDeg: number | null;
  readonly wind: { readonly directionFromTrueDeg: number; readonly speedKt: number } | null;
  readonly windCorrectionDeg: number | null;
  readonly accumulatedDistanceNm: number | null;
  readonly accumulatedTimeSeconds: number | null;
  readonly fuelFlowLph: number | null;
  readonly intermediateFuelLitres: number | null;
  readonly accumulatedFuelLitres: number | null;
  readonly minimumSafeAltitudeFtMsl: number | null;
  readonly plannedAltitudeFtMsl: number | null;
  readonly groundSpeedKt: number | null;
  readonly intermediateDistanceNm: number | null;
  readonly intermediateTimeSeconds: number | null;
  readonly estimatedTimeUtcMs: number | null;
  readonly estimatedFuelRemainingLitres: number | null;
  /** Actuals and frequencies have no authoritative app input in this export. */
  readonly actualTimeUtcMs: number | null;
  readonly timeDifferenceSeconds: number | null;
  readonly actualFuelRemainingLitres: number | null;
  readonly frequency: string | null;
}

export interface OfpNavlogTotals {
  readonly accumulatedDistanceNm: number | null;
  readonly accumulatedTimeSeconds: number | null;
  readonly intermediateFuelLitres: number | null;
  readonly accumulatedFuelLitres: number | null;
  readonly intermediateDistanceNm: number | null;
  readonly intermediateTimeSeconds: number | null;
  readonly estimatedFuelRemainingLitres: number | null;
}

export interface OfpPdfPage2Model {
  readonly registration: string | null;
  readonly weightAndBalance: OfpWeightBalanceModel | null;
  readonly fuelRequirements: OfpFuelRequirementsModel | null;
  readonly cruise: OfpCruiseModel;
  readonly departureAerodrome: OfpAerodromeModel;
  readonly destinationAerodrome: OfpAerodromeModel;
  readonly crosswindLimitKt: number | null;
  readonly departureRunwayPerformance: OfpRunwayPerformanceModel | null;
  readonly destinationRunwayPerformance: OfpRunwayPerformanceModel | null;
  readonly minimumFlight: OfpMinimumFlightModel;
  readonly dateUtcMs: number | null;
}

export interface OfpWeightBalanceModel {
  readonly basicEmpty: OfpWeightBalanceRow;
  readonly leftSeat: OfpWeightBalanceRow;
  readonly rightSeat: OfpWeightBalanceRow;
  readonly mainFuel: OfpWeightBalanceRow;
  readonly auxiliaryFuel: OfpWeightBalanceRow;
  readonly baggage: OfpWeightBalanceRow;
  readonly takeoff: OfpWeightBalanceRow;
  readonly enrouteAuxiliaryFuel: OfpWeightBalanceRow;
  readonly enrouteMainFuel: OfpWeightBalanceRow;
  readonly landing: OfpWeightBalanceRow;
}

export interface OfpWeightBalanceRow {
  readonly massKg: number | null;
  readonly armM: number | null;
  readonly momentKgm: number | null;
}

export interface OfpFuelRequirementsModel {
  readonly trip: OfpFuelRequirementLine;
  readonly alternate: OfpFuelRequirementLine;
  readonly extra: OfpFuelRequirementLine;
  readonly finalReserve: OfpFuelRequirementLine;
  readonly totalRequired: OfpFuelRequirementLine;
  readonly totalOnboard: {
    readonly litres: number | null;
    readonly kilograms: number | null;
  };
  readonly enduranceMinutes: number | null;
}

export interface OfpFuelRequirementLine {
  readonly litres: number | null;
  readonly kilograms: number | null;
  readonly timeMinutes: number | null;
}

export interface OfpCruiseModel {
  readonly altitudeFtMsl: number | null;
  readonly oatC: number | null;
  readonly rpm: number | null;
  readonly manifoldPressure: number | null;
  readonly tasKt: number | null;
  readonly fuelFlowLph: number | null;
}

export interface OfpAerodromeModel {
  readonly name: string | null;
  readonly runway: string | null;
  readonly elevationFtMsl: number | null;
  readonly qnhHpa: number | null;
  readonly temperatureC: number | null;
  readonly wind: AirportWind | null;
  readonly crosswindKt: number | null;
  readonly pressureAltitudeFt: number | null;
  readonly densityAltitudeFt: number | null;
  readonly flaps: string | null;
}

export interface OfpMinimumFlightModel {
  readonly timeMinutes: number | null;
  readonly requiredFuelRemainingLitres: number | null;
}

export interface OfpRunwayPerformanceModel {
  readonly uncorrectedDistanceM: number | null;
  readonly headwindKt: number | null;
  readonly runwayState: string | null;
  readonly rcc: number | null;
  readonly correctionPercent: number | null;
  readonly correctedDistanceM: number | null;
  readonly performanceFactorPercent: number | null;
  readonly requiredDistanceM: number | null;
  readonly availableDistanceM: number | null;
}

/** Number of ordinary navlog rows printed by the official page-one form. */
export const OFP_TEMPLATE_NAVLOG_ROW_LIMIT = 16;
