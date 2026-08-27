import type { CalculatedNavigationRoute } from '../calculations';
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
