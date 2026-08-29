export interface Wind {
  directionFromTrueDeg: number;
  speedKt: number;
}

export interface NavigationParameters {
  trueAirspeedKt: number;
  wind: Wind;
}

/** How magnetic variation is obtained for the navigation log. */
export type MagneticVariationMode = 'automatic-wmm2025' | 'manual';

export interface RoutePlanningInputs {
  departureTimeUtcMs: number;
  /**
   * The user-selected source of magnetic variation. Omitted only by legacy
   * calculation callers; those retain the historic manual interpretation.
   */
  magneticVariationMode?: MagneticVariationMode;
  /**
   * Manual magnetic variation in degrees: east positive, west negative.
   * It is retained while automatic WMM2025 mode is selected so switching back
   * to manual does not discard the user's value.
   */
  magneticVariationDegEast: number;
  wind: Wind;
}

/** Legacy constant-altitude navigation inputs retained for the MVP 0.11 calculation API. */
export interface NavigationPlanInputs
  extends NavigationParameters,
    RoutePlanningInputs {
  plannedAltitudeFtMsl: number;
}
