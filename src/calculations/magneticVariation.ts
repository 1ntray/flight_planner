import { magvar } from 'magvar';

import type { FlightPlan, MagneticVariationMode, Position } from '../domain';
import type { CalculatedPerformanceRoute } from './performanceRoute';
import type {
  CalculatedNavigationRoute,
} from './navigationRoute';
import { calculateGeodesicMidpoint } from './geodesy';
import { calculateMagneticDirectionDeg } from './navigation';

export const WMM2025_MODEL_ID = 'WMM2025' as const;
export const WMM2025_VALID_FROM_UTC_MS = Date.UTC(2025, 0, 1);
export const WMM2025_VALID_UNTIL_UTC_MS = Date.UTC(2030, 0, 1);
const FEET_PER_KILOMETRE = 3280.839895013123;

export type MagneticVariationUnavailableReason =
  | 'outside-model-validity'
  | 'missing-leg-time'
  | 'invalid-input'
  | 'undefined-declination';

export interface MagneticVariationSource {
  readonly kind: 'manual' | 'model';
  readonly id: string;
  readonly validFromUtcMs?: number;
  readonly validUntilUtcMs?: number;
}

export type MagneticVariationResult =
  | {
      readonly status: 'available';
      readonly variationDegEast: number;
      readonly source: MagneticVariationSource;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: MagneticVariationUnavailableReason;
      readonly source: MagneticVariationSource;
    };

export interface MagneticVariationQuery {
  readonly position: Position;
  readonly altitudeFtMsl: number;
  readonly timeUtcMs: number;
}

/** Offline geomagnetic-model boundary. It deliberately has no React or map dependency. */
export interface MagneticVariationProvider {
  getVariation(query: MagneticVariationQuery): MagneticVariationResult;
}

function isValidPosition(position: Position): boolean {
  return Number.isFinite(position.latitude) &&
    Number.isFinite(position.longitude) &&
    position.latitude >= -90 && position.latitude <= 90;
}

function normalizeLongitudeDeg(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

const WMM2025_SOURCE: MagneticVariationSource = {
  kind: 'model',
  id: WMM2025_MODEL_ID,
  validFromUtcMs: WMM2025_VALID_FROM_UTC_MS,
  validUntilUtcMs: WMM2025_VALID_UNTIL_UTC_MS,
};

/**
 * Local WMM2025 provider. The bundled coefficients are evaluated offline;
 * planning altitudes are supplied in ft MSL and converted to km MSL here.
 */
export const wmm2025MagneticVariationProvider: MagneticVariationProvider = {
  getVariation({ position, altitudeFtMsl, timeUtcMs }): MagneticVariationResult {
    if (
      !isValidPosition(position) ||
      !Number.isFinite(altitudeFtMsl) ||
      !Number.isFinite(timeUtcMs)
    ) {
      return { status: 'unavailable', reason: 'invalid-input', source: WMM2025_SOURCE };
    }

    if (
      timeUtcMs < WMM2025_VALID_FROM_UTC_MS ||
      timeUtcMs >= WMM2025_VALID_UNTIL_UTC_MS
    ) {
      return {
        status: 'unavailable',
        reason: 'outside-model-validity',
        source: WMM2025_SOURCE,
      };
    }

    const variationDegEast = magvar(
      position.latitude,
      normalizeLongitudeDeg(position.longitude),
      altitudeFtMsl / FEET_PER_KILOMETRE,
      new Date(timeUtcMs),
    );

    return Number.isFinite(variationDegEast)
      ? { status: 'available', variationDegEast, source: WMM2025_SOURCE }
      : { status: 'unavailable', reason: 'undefined-declination', source: WMM2025_SOURCE };
  },
};

export interface LegMagneticVariation {
  readonly fromId: string;
  readonly toId: string;
  readonly midpoint: Position;
  readonly timeUtcMs: number | null;
  readonly altitudeFtMsl: number | null;
  readonly result: MagneticVariationResult;
}

export interface CalculateRouteMagneticVariationsInput {
  readonly flightPlan: FlightPlan;
  readonly navigationRoute: CalculatedNavigationRoute;
  readonly performanceRoute?: CalculatedPerformanceRoute | null;
  readonly mode: MagneticVariationMode | undefined;
  readonly manualVariationDegEast: number;
  readonly fallbackAltitudeFtMsl: number | null;
  readonly provider?: MagneticVariationProvider;
}

function key(fromId: string, toId: string): string {
  return `${fromId}\u0000${toId}`;
}

function performanceAltitudeAtTime(
  leg: Extract<CalculatedPerformanceRoute, { status: 'ok' }>['legs'][number],
  timeUtcMs: number,
): number | null {
  const step = leg.steps.find(
    (candidate) =>
      timeUtcMs >= candidate.startTimeUtcMs && timeUtcMs <= candidate.endTimeUtcMs,
  );
  if (step === undefined) return leg.targetAltitudeFtMsl;

  const durationMs = step.endTimeUtcMs - step.startTimeUtcMs;
  if (durationMs <= 0) return step.representativeAltitudeFtMsl;
  const fraction = (timeUtcMs - step.startTimeUtcMs) / durationMs;
  return step.startAltitudeFtMsl +
    (step.endAltitudeFtMsl - step.startAltitudeFtMsl) * fraction;
}

export function calculateRouteMagneticVariations({
  flightPlan,
  navigationRoute,
  performanceRoute = null,
  mode,
  manualVariationDegEast,
  fallbackAltitudeFtMsl,
  provider = wmm2025MagneticVariationProvider,
}: CalculateRouteMagneticVariationsInput): readonly LegMagneticVariation[] {
  if (!Number.isFinite(manualVariationDegEast) || Math.abs(manualVariationDegEast) > 180) {
    throw new RangeError('Manual magnetic variation must be between -180 and 180 degrees');
  }
  if (fallbackAltitudeFtMsl !== null && (!Number.isFinite(fallbackAltitudeFtMsl) || fallbackAltitudeFtMsl < 0)) {
    throw new RangeError('Fallback altitude must be a finite non-negative number');
  }

  const useManual = mode === undefined || mode === 'manual';
  const performanceByLeg = new Map(
    performanceRoute?.status === 'ok'
      ? performanceRoute.legs.map((leg) => [key(leg.fromId, leg.toId), leg])
      : [],
  );
  const waypointById = new Map(
    flightPlan.waypoints.map((waypoint) => [waypoint.id, waypoint]),
  );

  return navigationRoute.legs.map((leg) => {
    const from = waypointById.get(leg.fromId);
    const to = waypointById.get(leg.toId);
    if (from === undefined || to === undefined) {
      throw new RangeError(`Navigation leg ${leg.fromId} to ${leg.toId} has no route endpoints`);
    }
    // Deliberately direct A→B, independent of shaping geometry.
    const midpoint = calculateGeodesicMidpoint(from.position, to.position);
    if (useManual) {
      return {
        fromId: leg.fromId,
        toId: leg.toId,
        midpoint,
        timeUtcMs: null,
        altitudeFtMsl: null,
        result: {
          status: 'available' as const,
          variationDegEast: manualVariationDegEast,
          source: { kind: 'manual' as const, id: 'manual' },
        },
      };
    }

    const performanceLeg = performanceByLeg.get(key(leg.fromId, leg.toId));
    const startTimeUtcMs = performanceLeg?.startTimeUtcMs ?? leg.startTimeUtcMs;
    const endTimeUtcMs = performanceLeg?.endTimeUtcMs ?? leg.endTimeUtcMs;
    const timeUtcMs = startTimeUtcMs === null || startTimeUtcMs === undefined ||
      endTimeUtcMs === null || endTimeUtcMs === undefined
      ? null
      : startTimeUtcMs + (endTimeUtcMs - startTimeUtcMs) / 2;
    const altitudeFtMsl = timeUtcMs === null
      ? null
      : performanceLeg === undefined
        ? fallbackAltitudeFtMsl
        : performanceAltitudeAtTime(performanceLeg, timeUtcMs);
    const result = timeUtcMs === null || altitudeFtMsl === null
      ? {
          status: 'unavailable' as const,
          reason: 'missing-leg-time' as const,
          source: WMM2025_SOURCE,
        }
      : provider.getVariation({ position: midpoint, altitudeFtMsl, timeUtcMs });

    return { fromId: leg.fromId, toId: leg.toId, midpoint, timeUtcMs, altitudeFtMsl, result };
  });
}

export function applyLegMagneticVariations(
  route: CalculatedNavigationRoute,
  variations: readonly LegMagneticVariation[],
): CalculatedNavigationRoute {
  const byLeg = new Map(variations.map((variation) => [key(variation.fromId, variation.toId), variation]));
  return {
    ...route,
    legs: route.legs.map((leg) => {
      const variation = byLeg.get(key(leg.fromId, leg.toId));
      const variationDegEast = variation?.result.status === 'available'
        ? variation.result.variationDegEast
        : null;
      return {
        ...leg,
        magneticVariationDegEast: variationDegEast,
        magneticVariationSource: variation?.result.source ?? null,
        magneticVariationUnavailableReason:
          variation?.result.status === 'unavailable' ? variation.result.reason : null,
        magneticTrackDeg: variationDegEast === null || leg.trueTrackDeg === null
          ? null
          : calculateMagneticDirectionDeg(leg.trueTrackDeg, variationDegEast),
        magneticHeadingDeg: variationDegEast === null || leg.navigation?.status !== 'ok'
          ? null
          : calculateMagneticDirectionDeg(leg.navigation.trueHeadingDeg, variationDegEast),
      };
    }),
  };
}
