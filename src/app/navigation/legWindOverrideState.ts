import { calculatePositionAlongGeometry, normalizeTrackDeg } from '../../calculations';
import type {
  CalculatedPerformanceLeg,
  CalculatedPerformanceRoute,
} from '../../calculations';
import type { ManualLegWindOverride, Wind } from '../../domain';
import type { ForecastLegWind } from '../../weather';
import { createSampledWindResolver } from '../../weather';
import { calculatePerformanceLegNavigationSummary } from '../route/performanceLegSummary';

export type LegWindDefaultSource = 'manual' | 'forecast';

export interface LegWindDefault {
  readonly wind: Wind;
  readonly source: LegWindDefaultSource;
}

export function legWindKey(fromWaypointId: string, toWaypointId: string): string {
  return `${fromWaypointId}\u0000${toWaypointId}`;
}

export function findManualLegWindOverride(
  overrides: readonly ManualLegWindOverride[],
  fromWaypointId: string,
  toWaypointId: string,
): ManualLegWindOverride | undefined {
  return overrides.find(
    (override) =>
      override.fromWaypointId === fromWaypointId &&
      override.toWaypointId === toWaypointId,
  );
}

export function setManualLegWindOverride(
  overrides: readonly ManualLegWindOverride[],
  fromWaypointId: string,
  toWaypointId: string,
  wind: Wind | null,
): readonly ManualLegWindOverride[] {
  if (fromWaypointId === '' || toWaypointId === '') {
    throw new RangeError('A manual wind override requires two waypoint IDs');
  }

  const retained = overrides.filter(
    (override) =>
      override.fromWaypointId !== fromWaypointId ||
      override.toWaypointId !== toWaypointId,
  );
  if (wind === null) return retained;
  if (
    !Number.isFinite(wind.directionFromTrueDeg) ||
    !Number.isFinite(wind.speedKt) ||
    wind.speedKt < 0
  ) {
    throw new RangeError('A manual wind override must contain a finite direction and non-negative speed');
  }

  return [
    ...retained,
    {
      fromWaypointId,
      toWaypointId,
      wind: {
        directionFromTrueDeg: normalizeTrackDeg(wind.directionFromTrueDeg),
        speedKt: wind.speedKt,
      },
    },
  ];
}

function forecastWindForPerformanceLeg(
  leg: CalculatedPerformanceLeg,
  forecasts: readonly ForecastLegWind[],
): Wind | null {
  if (forecasts.length === 0) return null;
  const resolveForecastWind = createSampledWindResolver(
    forecasts,
    { directionFromTrueDeg: 0, speedKt: 0 },
  );
  return calculatePerformanceLegNavigationSummary({
    ...leg,
    steps: leg.steps.map((step) => ({
      ...step,
      wind: resolveForecastWind({
        fromWaypointId: leg.fromId,
        toWaypointId: leg.toId,
        position: calculatePositionAlongGeometry(
          leg.geometry,
          (step.startDistanceFromLegNm + step.endDistanceFromLegNm) / 2,
        ).position,
        timeUtcMs: (step.startTimeUtcMs + step.endTimeUtcMs) / 2,
        altitudeFtMsl: step.representativeAltitudeFtMsl,
      }),
    })),
  })?.wind ?? null;
}

export function createLegWindDefaults(
  legs: readonly { readonly fromId: string; readonly toId: string }[],
  globalManualWind: Wind,
  useLoadedForecast: boolean,
  forecastWinds: readonly ForecastLegWind[],
  performanceRoute: CalculatedPerformanceRoute | null,
): ReadonlyMap<string, LegWindDefault> {
  const forecastsByLeg = new Map<string, ForecastLegWind[]>();
  for (const forecast of forecastWinds) {
    const key = legWindKey(forecast.fromId, forecast.toId);
    forecastsByLeg.set(key, [...(forecastsByLeg.get(key) ?? []), forecast]);
  }
  const performanceByLeg = new Map<string, CalculatedPerformanceLeg>(
    performanceRoute?.status === 'ok'
      ? performanceRoute.legs.map((leg) => [legWindKey(leg.fromId, leg.toId), leg])
      : [],
  );

  return new Map<string, LegWindDefault>(legs.map((leg): [string, LegWindDefault] => {
    const key = legWindKey(leg.fromId, leg.toId);
    if (useLoadedForecast) {
      const forecasts = forecastsByLeg.get(key) ?? [];
      const performanceLeg = performanceByLeg.get(key);
      const forecastWind = performanceLeg === undefined
        ? forecasts[0]?.wind ?? null
        : forecastWindForPerformanceLeg(performanceLeg, forecasts);
      if (forecastWind !== null) {
        return [key, { wind: forecastWind, source: 'forecast' }];
      }
    }
    return [key, { wind: globalManualWind, source: 'manual' }];
  }));
}
