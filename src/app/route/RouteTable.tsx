import { useMemo } from 'react';

import type {
  CalculatedNavigationRoute,
  WindAdjustedLegResult,
} from '../../calculations';
import type { Waypoint } from '../../domain';
import type { ForecastLegWind } from '../../weather';
import { formatForecastWindDetails } from '../navigation/weatherFormatting';
import {
  formatDistanceNmValue,
  formatEetMinutesValue,
  formatGroundSpeedKtValue,
  formatMagneticHeadingDeg,
  formatMagneticTrackDeg,
  formatTrueHeadingDeg,
  formatTrueTrackDeg,
  formatUtcDateTime,
  formatUtcRouteTime,
  formatWindValue,
} from './routeFormatting';

export interface RouteTableProps {
  waypoints: readonly Waypoint[];
  route: CalculatedNavigationRoute;
  forecastWinds?: readonly ForecastLegWind[];
}

function legKey(fromId: string, toId: string): string {
  return `${fromId}\0${toId}`;
}

function getNoSolutionMessage(result: WindAdjustedLegResult): string | null {
  if (result.status === 'ok') {
    return null;
  }

  return result.reason === 'crosswind-exceeds-true-airspeed'
    ? 'Crosswind exceeds TAS'
    : 'No forward groundspeed';
}

export function RouteTable({
  waypoints,
  route,
  forecastWinds = [],
}: RouteTableProps) {
  const waypointNames = useMemo(
    () => new Map(waypoints.map((waypoint) => [waypoint.id, waypoint.name])),
    [waypoints],
  );
  const forecastByLeg = useMemo(
    () =>
      new Map(
        forecastWinds.map((forecast) => [
          legKey(forecast.fromId, forecast.toId),
          forecast,
        ]),
      ),
    [forecastWinds],
  );

  return (
    <div className="route-table-wrap">
      {route.legs.length === 0 ? (
        <p className="empty-route">
          Add at least two waypoints to calculate a route leg.
        </p>
      ) : (
        <table className="route-table">
          <colgroup>
            <col className="route-table__waypoint-column" />
            <col className="route-table__waypoint-column" />
            <col className="route-table__angle-column" />
            <col className="route-table__wind-column" />
            <col className="route-table__angle-column" />
            <col className="route-table__distance-column" />
            <col className="route-table__groundspeed-column" />
            <col className="route-table__time-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">FROM</th>
              <th scope="col">TO</th>
              <th scope="col" aria-label="True track and magnetic track">
                TT<span className="route-table__unit">MT</span>
              </th>
              <th scope="col" aria-label="Wind from true degrees and speed knots">
                WIND<span className="route-table__unit">°T / KT</span>
              </th>
              <th scope="col" aria-label="True heading and magnetic heading">
                TH<span className="route-table__unit">MH</span>
              </th>
              <th scope="col" aria-label="Distance nautical miles">
                DIST<span className="route-table__unit">NM</span>
              </th>
              <th scope="col" aria-label="Groundspeed knots">
                GS<span className="route-table__unit">KT</span>
              </th>
              <th
                scope="col"
                aria-label="Estimated elapsed time minutes and estimated arrival UTC"
              >
                EET<span className="route-table__unit">MIN / Z</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {route.legs.map((leg) => {
              const navigation = leg.navigation;
              const solution =
                navigation?.status === 'ok' ? navigation : null;
              const noSolutionMessage =
                navigation === null ? null : getNoSolutionMessage(navigation);
              const eta =
                leg.endTimeUtcMs !== null &&
                route.departureTimeUtcMs !== null
                  ? formatUtcRouteTime(
                      leg.endTimeUtcMs,
                      route.departureTimeUtcMs,
                    )
                  : null;
              const etaDateTime =
                leg.endTimeUtcMs === null
                  ? null
                  : formatUtcDateTime(leg.endTimeUtcMs);
              const timingLabel =
                noSolutionMessage ??
                (leg.eetSeconds === null
                  ? undefined
                  : `${formatEetMinutesValue(leg.eetSeconds)} minutes${etaDateTime === null ? '' : `, ETA ${etaDateTime}`}`);
              const forecastWind = forecastByLeg.get(
                legKey(leg.fromId, leg.toId),
              );
              const windDetails =
                forecastWind === undefined
                  ? leg.windSource === 'manual'
                    ? 'Manual wind'
                    : undefined
                  : formatForecastWindDetails(forecastWind);

              return (
                <tr key={`${leg.fromId}:${leg.toId}`}>
                  <td>{waypointNames.get(leg.fromId) ?? leg.fromId}</td>
                  <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
                  <td>
                    {formatTrueTrackDeg(leg.trueTrackDeg)}
                    <span className="route-table__secondary-value">
                      {formatMagneticTrackDeg(leg.magneticTrackDeg)}
                    </span>
                  </td>
                  <td
                    title={windDetails}
                    aria-label={
                      leg.wind === null
                        ? undefined
                        : `${leg.wind.directionFromTrueDeg.toFixed(1)} degrees true at ${leg.wind.speedKt.toFixed(1)} knots, ${windDetails ?? `${leg.windSource ?? 'unknown'} wind`}`
                    }
                  >
                    {formatWindValue(leg.wind)}
                    {forecastWind === undefined ? null : (
                      <span className="route-table__secondary-value">
                        ECMWF
                      </span>
                    )}
                  </td>
                  <td>
                    {formatTrueHeadingDeg(solution?.trueHeadingDeg ?? null)}
                    <span className="route-table__secondary-value">
                      {formatMagneticHeadingDeg(leg.magneticHeadingDeg)}
                    </span>
                  </td>
                  <td>{formatDistanceNmValue(leg.distanceNm)}</td>
                  <td>
                    {solution === null
                      ? '—'
                      : formatGroundSpeedKtValue(solution.groundSpeedKt)}
                  </td>
                  <td
                    title={noSolutionMessage ?? etaDateTime ?? undefined}
                    aria-label={timingLabel}
                  >
                    {leg.eetSeconds === null
                      ? (noSolutionMessage === null ? '—' : 'NO SOL')
                      : formatEetMinutesValue(leg.eetSeconds)}
                    {eta === null ? null : (
                      <span className="route-table__secondary-value">
                        {eta}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Total</td>
              <td>{formatDistanceNmValue(route.totalDistanceNm)}</td>
              <td aria-hidden="true" />
              <td
                title={
                  route.estimatedArrivalTimeUtcMs === null
                    ? undefined
                    : formatUtcDateTime(route.estimatedArrivalTimeUtcMs)
                }
              >
                {route.totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(route.totalEetSeconds)}
                {route.estimatedArrivalTimeUtcMs === null ||
                route.departureTimeUtcMs === null ? null : (
                  <span className="route-table__secondary-value">
                    {formatUtcRouteTime(
                      route.estimatedArrivalTimeUtcMs,
                      route.departureTimeUtcMs,
                    )}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
