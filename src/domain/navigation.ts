export interface Wind {
  directionFromTrueDeg: number;
  speedKt: number;
}

export interface NavigationParameters {
  trueAirspeedKt: number;
  wind: Wind;
}

export interface RoutePlanningInputs {
  departureTimeUtcMs: number;
  /** Magnetic variation in degrees: east positive, west negative. */
  magneticVariationDegEast: number;
  wind: Wind;
}

/** Legacy constant-altitude navigation inputs retained for the MVP 0.11 calculation API. */
export interface NavigationPlanInputs
  extends NavigationParameters,
    RoutePlanningInputs {
  plannedAltitudeFtMsl: number;
}
