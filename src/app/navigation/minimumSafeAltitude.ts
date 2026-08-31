/** A manual MSA is optional, but its relationship to the planned altitude is not. */
export type MinimumSafeAltitudeWarning =
  | 'missing'
  | 'above-planned-altitude'
  | null;

export function evaluateMinimumSafeAltitude(
  minimumSafeAltitudeFtMsl: number | undefined,
  plannedAltitudeFtMsl: number | null,
): MinimumSafeAltitudeWarning {
  if (minimumSafeAltitudeFtMsl === undefined) return 'missing';
  if (
    plannedAltitudeFtMsl !== null &&
    minimumSafeAltitudeFtMsl > plannedAltitudeFtMsl
  ) {
    return 'above-planned-altitude';
  }
  return null;
}
