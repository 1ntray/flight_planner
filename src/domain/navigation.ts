export interface Wind {
  directionFromTrueDeg: number;
  speedKt: number;
}

export interface NavigationParameters {
  trueAirspeedKt: number;
  wind: Wind;
}

export interface NavigationPlanInputs extends NavigationParameters {
  departureTimeUtcMs: number;
  plannedAltitudeFtMsl: number;
  /** Magnetic variation in degrees: east positive, west negative. */
  magneticVariationDegEast: number;
}
