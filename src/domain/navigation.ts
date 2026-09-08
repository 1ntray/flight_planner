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

/** A forecast model selected for the whole flight plan. */
export type WindForecastModelId = 'ecmwf_ifs025' | 'icon_eu';

/** A user-entered wind bound to a stable, adjacent pair of route waypoints. */
export interface ManualLegWindOverride {
  fromWaypointId: string;
  toWaypointId: string;
  wind: Wind;
}

export interface RoutePlanningInputs {
  departureTimeUtcMs: number;
  /** Defaults to ECMWF IFS 0.25° when loading documents created before this field. */
  windForecastModel?: WindForecastModelId;
  /** Optional manual winds take precedence over the selected forecast for their leg. */
  manualLegWindOverrides?: readonly ManualLegWindOverride[];
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
