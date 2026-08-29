import type {
  CalculatedLeg,
  FlightPlan,
  NavigationPlanInputs,
  Position,
  Waypoint,
  Wind,
} from '../domain';
import { calculateGeodesicMidpoint } from './geodesy';
import {
  calculateMagneticDirectionDeg,
  calculateWindAdjustedLeg,
  validateNavigationParameters,
} from './navigation';
import type { WindAdjustedLegResult } from './navigation';
import { calculateRoute } from './route';
import type {
  MagneticVariationSource,
  MagneticVariationUnavailableReason,
} from './magneticVariation';

const MILLISECONDS_PER_SECOND = 1000;

export interface NavigationRouteCalculationInput {
  flightPlan: FlightPlan;
  planning: NavigationPlanInputs | null;
  legWinds?: readonly LegWindOverride[];
}

export type NavigationWindSource = 'manual' | 'forecast';

export interface LegWindOverride {
  fromId: string;
  toId: string;
  wind: Wind;
  source: Exclude<NavigationWindSource, 'manual'>;
}

export interface CalculatedNavigationRouteLeg extends CalculatedLeg {
  midpoint: Position;
  magneticVariationDegEast: number | null;
  magneticVariationSource: MagneticVariationSource | null;
  magneticVariationUnavailableReason: MagneticVariationUnavailableReason | null;
  magneticTrackDeg: number | null;
  magneticHeadingDeg: number | null;
  wind: Wind | null;
  windSource: NavigationWindSource | null;
  navigation: WindAdjustedLegResult | null;
  eetSeconds: number | null;
  startTimeUtcMs: number | null;
  midpointTimeUtcMs: number | null;
  endTimeUtcMs: number | null;
}

export interface CalculatedNavigationRoute {
  departureTimeUtcMs: number | null;
  legs: CalculatedNavigationRouteLeg[];
  totalDistanceNm: number;
  totalEetSeconds: number | null;
  estimatedArrivalTimeUtcMs: number | null;
}

function validateNavigationPlanInputs(planning: NavigationPlanInputs): void {
  validateNavigationParameters(planning);

  if (!Number.isFinite(planning.departureTimeUtcMs)) {
    throw new RangeError('Departure time must be a finite UTC timestamp');
  }

  if (!Number.isFinite(planning.plannedAltitudeFtMsl)) {
    throw new RangeError('Planned altitude must be a finite number');
  }

  if (planning.plannedAltitudeFtMsl < 0) {
    throw new RangeError('Planned altitude must not be negative');
  }

  if (!Number.isFinite(planning.magneticVariationDegEast)) {
    throw new RangeError('Magnetic variation must be a finite number');
  }

  if (Math.abs(planning.magneticVariationDegEast) > 180) {
    throw new RangeError(
      'Magnetic variation must be between -180 and 180 degrees',
    );
  }

}

function legKey(fromId: string, toId: string): string {
  return `${fromId}\u0000${toId}`;
}

function createLegWindMap(
  planning: NavigationPlanInputs | null,
  legWinds: readonly LegWindOverride[],
): Map<string, LegWindOverride> {
  if (planning === null && legWinds.length > 0) {
    throw new RangeError('Leg winds require route planning inputs');
  }

  const windsByLeg = new Map<string, LegWindOverride>();

  for (const legWind of legWinds) {
    if (legWind.fromId === '' || legWind.toId === '') {
      throw new RangeError('Leg wind waypoint IDs must not be empty');
    }

    if (planning !== null) {
      validateNavigationParameters({
        trueAirspeedKt: planning.trueAirspeedKt,
        wind: legWind.wind,
      });
    }

    const key = legKey(legWind.fromId, legWind.toId);

    if (windsByLeg.has(key)) {
      throw new RangeError(
        `Duplicate wind override for leg ${legWind.fromId} to ${legWind.toId}`,
      );
    }

    windsByLeg.set(key, legWind);
  }

  return windsByLeg;
}

export function calculateNavigationRoute({
  flightPlan,
  planning,
  legWinds = [],
}: NavigationRouteCalculationInput): CalculatedNavigationRoute {
  if (planning !== null) {
    validateNavigationPlanInputs(planning);
  }

  const windsByLeg = createLegWindMap(planning, legWinds);

  const geometricLegs = calculateRoute(flightPlan);
  const { waypoints } = flightPlan;
  let timingCursorUtcMs = planning?.departureTimeUtcMs ?? null;
  let timingIsComplete = planning !== null;
  let totalEetSeconds: number | null = planning === null ? null : 0;

  const legs = geometricLegs.map((leg, index): CalculatedNavigationRouteLeg => {
    const from = waypoints[index];
    const to = waypoints[index + 1];

    if (from === undefined || to === undefined) {
      throw new Error('A navigation leg must have two route waypoints');
    }

    const midpoint = calculateGeodesicMidpoint(from.position, to.position);
    const windOverride = windsByLeg.get(legKey(leg.fromId, leg.toId));
    const wind = planning === null ? null : (windOverride?.wind ?? planning.wind);
    const windSource: NavigationWindSource | null =
      planning === null ? null : (windOverride?.source ?? 'manual');
    const magneticVariationDegEast = planning !== null &&
      (planning.magneticVariationMode === undefined || planning.magneticVariationMode === 'manual')
      ? planning.magneticVariationDegEast
      : null;
    const magneticTrackDeg =
      magneticVariationDegEast === null || leg.trueTrackDeg === null
        ? null
        : calculateMagneticDirectionDeg(
            leg.trueTrackDeg,
            magneticVariationDegEast,
          );
    const startTimeUtcMs = timingIsComplete ? timingCursorUtcMs : null;
    let navigation: WindAdjustedLegResult | null = null;
    let magneticHeadingDeg: number | null = null;
    let eetSeconds: number | null = null;
    let midpointTimeUtcMs: number | null = null;
    let endTimeUtcMs: number | null = null;

    if (planning !== null && leg.trueTrackDeg !== null) {
      navigation = calculateWindAdjustedLeg({
        trueTrackDeg: leg.trueTrackDeg,
        distanceNm: leg.distanceNm,
        trueAirspeedKt: planning.trueAirspeedKt,
        wind: wind!,
      });

      if (navigation.status === 'ok') {
        magneticHeadingDeg = magneticVariationDegEast === null
          ? null
          : calculateMagneticDirectionDeg(
              navigation.trueHeadingDeg,
              magneticVariationDegEast,
            );
        eetSeconds = navigation.eetSeconds;

        if (totalEetSeconds !== null) {
          totalEetSeconds += eetSeconds;
        }

        if (startTimeUtcMs !== null) {
          midpointTimeUtcMs =
            startTimeUtcMs +
            (eetSeconds * MILLISECONDS_PER_SECOND) / 2;
          endTimeUtcMs =
            startTimeUtcMs + eetSeconds * MILLISECONDS_PER_SECOND;
          timingCursorUtcMs = endTimeUtcMs;
        }
      } else {
        timingIsComplete = false;
        timingCursorUtcMs = null;
        totalEetSeconds = null;
      }
    } else if (planning !== null && leg.distanceNm === 0) {
      eetSeconds = 0;
      midpointTimeUtcMs = startTimeUtcMs;
      endTimeUtcMs = startTimeUtcMs;
    } else if (planning !== null) {
      timingIsComplete = false;
      timingCursorUtcMs = null;
      totalEetSeconds = null;
    }

    return {
      ...leg,
      midpoint,
      magneticVariationDegEast,
      magneticVariationSource: magneticVariationDegEast === null
        ? null
        : { kind: 'manual', id: 'manual' },
      magneticVariationUnavailableReason: null,
      magneticTrackDeg,
      magneticHeadingDeg,
      wind,
      windSource,
      navigation,
      eetSeconds,
      startTimeUtcMs,
      midpointTimeUtcMs,
      endTimeUtcMs,
    };
  });

  return {
    departureTimeUtcMs: planning?.departureTimeUtcMs ?? null,
    legs,
    totalDistanceNm: geometricLegs.reduce(
      (total, leg) => total + leg.distanceNm,
      0,
    ),
    totalEetSeconds,
    estimatedArrivalTimeUtcMs:
      timingIsComplete && planning !== null ? timingCursorUtcMs : null,
  };
}
