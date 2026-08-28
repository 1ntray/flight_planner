import {
  calculateInverseGeodesic,
  calculatePositionAlongGeometry,
} from '../calculations';
import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceRoute,
  WindResolver,
} from '../calculations';
import type { Wind } from '../domain';
import type { ForecastLegWind } from './types';
import type { WeatherSampleRequest } from './types';

export function buildWeatherSampleRequests(
  route: CalculatedNavigationRoute,
  altitudeFtMsl: number,
): WeatherSampleRequest[] {
  if (!Number.isFinite(altitudeFtMsl)) {
    throw new RangeError('Weather sampling altitude must be a finite number');
  }

  if (altitudeFtMsl < 0) {
    throw new RangeError('Weather sampling altitude must not be negative');
  }

  return route.legs.flatMap((leg) => {
    if (leg.distanceNm === 0 || leg.midpointTimeUtcMs === null) {
      return [];
    }

    return [
      {
        fromId: leg.fromId,
        toId: leg.toId,
        position: leg.midpoint,
        timeUtcMs: leg.midpointTimeUtcMs,
        altitudeFtMsl,
      },
    ];
  });
}

export function buildPerformanceWeatherSampleRequests(
  route: CalculatedPerformanceRoute,
): WeatherSampleRequest[] {
  if (route.status !== 'ok') {
    return [];
  }

  return route.legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      fromId: leg.fromId,
      toId: leg.toId,
      position: calculatePositionAlongGeometry(
        leg.geometry,
        (step.startDistanceFromLegNm + step.endDistanceFromLegNm) / 2,
      ).position,
      timeUtcMs: (step.startTimeUtcMs + step.endTimeUtcMs) / 2,
      altitudeFtMsl: step.representativeAltitudeFtMsl,
    })),
  );
}

export function createSampledWindResolver(
  samples: readonly ForecastLegWind[],
  fallback: Wind,
): WindResolver {
  return (query) => {
    const candidates = samples.filter(
      (sample) =>
        sample.fromId === query.fromWaypointId &&
        sample.toId === query.toWaypointId,
    );
    let best: ForecastLegWind | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const sample of candidates) {
      const score =
        Math.abs(sample.altitudeFtMsl - query.altitudeFtMsl) / 100 +
        Math.abs(sample.sampledTimeUtcMs - query.timeUtcMs) / 60_000 +
        calculateInverseGeodesic(sample.sampledPosition, query.position).distanceNm;

      if (score < bestScore) {
        best = sample;
        bestScore = score;
      }
    }

    return best?.wind ?? fallback;
  };
}

export function weatherSampleRequestsMatch(
  first: readonly WeatherSampleRequest[],
  second: readonly WeatherSampleRequest[],
): boolean {
  return (
    first.length === second.length &&
    first.every((request, index) => {
      const comparison = second[index];

      return (
        comparison !== undefined &&
        request.fromId === comparison.fromId &&
        request.toId === comparison.toId &&
        request.position.latitude === comparison.position.latitude &&
        request.position.longitude === comparison.position.longitude &&
        request.timeUtcMs === comparison.timeUtcMs &&
        request.altitudeFtMsl === comparison.altitudeFtMsl
      );
    })
  );
}
