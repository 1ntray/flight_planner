declare module 'magvar' {
  export const MODEL_EPOCH: number;
  export const MODEL_VALID_UNTIL: number;

  /**
   * WMM2025 magnetic declination in degrees, positive east of true north.
   * Altitude is kilometres above mean sea level.
   */
  export function magvar(
    latitudeDeg: number,
    longitudeDeg: number,
    altitudeKmMsl?: number,
    time?: Date | number,
  ): number;
}
