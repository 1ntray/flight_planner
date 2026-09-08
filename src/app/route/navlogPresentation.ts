import { calculateMagneticDirectionDeg, normalizeTrackDeg } from '../../calculations';

export interface NavlogDirectionDisplay {
  readonly trueTrackDeg: number | null;
  readonly variationDegEast: number | null;
  readonly magneticTrackDeg: number | null;
  readonly windCorrectionDeg: number | null;
  readonly magneticHeadingDeg: number | null;
}

/** Rounds a calculated navlog value without changing its calculation source. */
export function roundNavlogValue(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundDirectionDeg(value: number): number {
  return roundNavlogValue(normalizeTrackDeg(value)) % 360;
}

function signedDirectionDifferenceDeg(
  fromDeg: number,
  toDeg: number,
): number {
  return ((normalizeTrackDeg(toDeg) - normalizeTrackDeg(fromDeg) + 540) % 360) - 180;
}

/**
 * Produces the linked, whole-number direction values shown in the navlog.
 * The navigation calculation remains unrounded; only this presentation chain
 * uses rounded TT, variation, and WCA so the displayed values add up.
 */
export function calculateNavlogDirectionDisplay(
  trueTrackDeg: number | null,
  variationDegEast: number | null,
  trueHeadingDeg: number | null,
): NavlogDirectionDisplay {
  const displayedTrueTrackDeg = trueTrackDeg === null
    ? null
    : roundDirectionDeg(trueTrackDeg);
  const displayedVariationDegEast = variationDegEast === null
    ? null
    : roundNavlogValue(variationDegEast);
  const displayedMagneticTrackDeg =
    displayedTrueTrackDeg === null || displayedVariationDegEast === null
      ? null
      : calculateMagneticDirectionDeg(
          displayedTrueTrackDeg,
          displayedVariationDegEast,
        );
  const displayedWindCorrectionDeg =
    trueTrackDeg === null || trueHeadingDeg === null
      ? null
      : roundNavlogValue(
          signedDirectionDifferenceDeg(trueTrackDeg, trueHeadingDeg),
        );
  const displayedMagneticHeadingDeg =
    displayedMagneticTrackDeg === null || displayedWindCorrectionDeg === null
      ? null
      : normalizeTrackDeg(displayedMagneticTrackDeg + displayedWindCorrectionDeg);

  return {
    trueTrackDeg: displayedTrueTrackDeg,
    variationDegEast: displayedVariationDegEast,
    magneticTrackDeg: displayedMagneticTrackDeg,
    windCorrectionDeg: displayedWindCorrectionDeg,
    magneticHeadingDeg: displayedMagneticHeadingDeg,
  };
}

/**
 * Keeps a displayed leg value consistent with the rounded accumulated column.
 */
export function roundNavlogAccumulatedIncrement(
  accumulatedValue: number,
  priorAccumulatedValue: number,
): number {
  return roundNavlogValue(accumulatedValue) - roundNavlogValue(priorAccumulatedValue);
}
