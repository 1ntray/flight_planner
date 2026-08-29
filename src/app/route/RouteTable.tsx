import { useMemo } from 'react';

import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceRoute,
  CalculatedSectorOperationalFlightPlan,
  WindAdjustedLegResult,
} from '../../calculations';
import type { Waypoint } from '../../domain';
import type { ForecastLegWind } from '../../weather';
import { formatForecastWindCollectionDetails } from '../navigation/weatherFormatting';
import { calculatePerformanceLegNavigationSummary } from './performanceLegSummary';
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

const PHASE_LABELS = {
  climb: 'CLB',
  cruise: 'CRZ',
  descent: 'DES',
} as const;

export interface RouteTableProps {
  waypoints: readonly Waypoint[];
  route: CalculatedNavigationRoute;
  performanceRoute?: CalculatedPerformanceRoute | null;
  forecastWinds?: readonly ForecastLegWind[];
  operationalSector?: CalculatedSectorOperationalFlightPlan;
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
  performanceRoute = null,
  forecastWinds = [],
  operationalSector,
}: RouteTableProps) {
  const waypointNames = useMemo(
    () => new Map(waypoints.map((waypoint) => [waypoint.id, waypoint.name])),
    [waypoints],
  );
  const forecastsByLeg = useMemo(() => {
    const grouped = new Map<string, ForecastLegWind[]>();

    for (const forecast of forecastWinds) {
      const key = legKey(forecast.fromId, forecast.toId);
      const existing = grouped.get(key);

      if (existing === undefined) {
        grouped.set(key, [forecast]);
      } else {
        existing.push(forecast);
      }
    }

    return grouped;
  }, [forecastWinds]);
  const performanceByLeg = useMemo(
    () =>
      new Map(
        performanceRoute?.status === 'ok'
          ? performanceRoute.legs.map((leg) => [
              legKey(leg.fromId, leg.toId),
              leg,
            ])
          : [],
      ),
    [performanceRoute],
  );
  const operationalByLeg = useMemo(
    () => new Map(
      (operationalSector?.rows ?? []).map((row) => [
        legKey(row.leg.fromId, row.leg.toId),
        row,
      ]),
    ),
    [operationalSector],
  );
  const effectiveRouteArrivalUtcMs =
    performanceRoute?.status === 'ok'
      ? performanceRoute.estimatedArrivalTimeUtcMs
      : route.estimatedArrivalTimeUtcMs;

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
            <col className="route-table__altitude-column" />
            <col className="route-table__distance-column" />
            <col className="route-table__groundspeed-column" />
            <col className="route-table__time-column" />
            <col className="route-table__fuel-column" />
            <col className="route-table__fuel-column" />
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
              <th scope="col" aria-label="Target altitude feet mean sea level">
                ALT<span className="route-table__unit">FT</span>
              </th>
              <th scope="col" aria-label="Intermediate and accumulated distance nautical miles">
                DIST<span className="route-table__unit">INT / ACC NM</span>
              </th>
              <th scope="col" aria-label="Groundspeed knots">
                GS<span className="route-table__unit">KT</span>
              </th>
              <th
                scope="col"
                aria-label="Intermediate and accumulated airborne time minutes"
              >
                TIME<span className="route-table__unit">INT / ACC MIN</span>
              </th>
              <th scope="col" aria-label="Intermediate and accumulated airborne fuel litres">
                FUEL<span className="route-table__unit">INT / ACC L</span>
              </th>
              <th scope="col" aria-label="Estimated fuel remaining litres">
                REM<span className="route-table__unit">L</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {route.legs.map((leg) => {
              const navigation = leg.navigation;
              const performanceLeg = performanceByLeg.get(
                legKey(leg.fromId, leg.toId),
              );
              const operationalRow = operationalByLeg.get(
                legKey(leg.fromId, leg.toId),
              );
              const performanceNavigation =
                performanceLeg === undefined
                  ? null
                  : calculatePerformanceLegNavigationSummary(performanceLeg);
              const solution =
                navigation?.status === 'ok' ? navigation : null;
              const noSolutionMessage =
                navigation === null ? null : getNoSolutionMessage(navigation);
              const effectiveEndTimeUtcMs =
                performanceLeg?.endTimeUtcMs ?? leg.endTimeUtcMs;
              const effectiveEetSeconds =
                performanceLeg?.eetSeconds ?? leg.eetSeconds;
              const eta =
                effectiveEndTimeUtcMs !== null &&
                route.departureTimeUtcMs !== null
                  ? formatUtcRouteTime(
                      effectiveEndTimeUtcMs,
                      route.departureTimeUtcMs,
                    )
                  : null;
              const etaDateTime =
                effectiveEndTimeUtcMs === null
                  ? null
                  : formatUtcDateTime(effectiveEndTimeUtcMs);
              const timingLabel =
                noSolutionMessage ??
                (effectiveEetSeconds === null
                  ? undefined
                  : `${formatEetMinutesValue(effectiveEetSeconds)} minutes${etaDateTime === null ? '' : `, ETA ${etaDateTime}`}`);
              const legForecasts =
                forecastsByLeg.get(legKey(leg.fromId, leg.toId)) ?? [];
              const windDetails =
                legForecasts.length === 0
                  ? leg.windSource === 'manual'
                    ? 'Manual wind'
                    : undefined
                  : formatForecastWindCollectionDetails(legForecasts);

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
                      (performanceNavigation?.wind ?? leg.wind) === null
                        ? undefined
                        : `${(performanceNavigation?.wind ?? leg.wind)!.directionFromTrueDeg.toFixed(1)} degrees true at ${(performanceNavigation?.wind ?? leg.wind)!.speedKt.toFixed(1)} knots, ${performanceNavigation?.source === 'cruise' ? 'longest cruise portion' : performanceNavigation?.source === 'average' ? 'duration-weighted leg average' : windDetails ?? `${leg.windSource ?? 'unknown'} wind`}`
                    }
                  >
                    {formatWindValue(performanceNavigation?.wind ?? leg.wind)}
                    {performanceNavigation === null && legForecasts.length === 0 ? null : (
                      <span className="route-table__secondary-value">
                        {[
                          performanceNavigation?.source === 'cruise'
                            ? 'CRZ'
                            : performanceNavigation?.source === 'average'
                              ? 'AVG'
                              : null,
                          legForecasts.length === 0 ? null : 'ECMWF',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td title={performanceNavigation?.source === 'average' ? 'Duration-weighted circular-average heading' : performanceNavigation?.source === 'cruise' ? 'Heading for the longest cruise portion' : undefined}>
                    {formatTrueHeadingDeg(
                      performanceNavigation?.trueHeadingDeg ??
                        solution?.trueHeadingDeg ??
                        null,
                    )}
                    <span className="route-table__secondary-value">
                      {formatMagneticHeadingDeg(
                        performanceNavigation?.magneticHeadingDeg ??
                          leg.magneticHeadingDeg,
                      )}
                    </span>
                  </td>
                  <td>
                    {performanceLeg === undefined
                      ? '—'
                      : Math.round(performanceLeg.targetAltitudeFtMsl)}
                    {performanceLeg === undefined ? null : (
                      <span className="route-table__secondary-value">
                        {performanceLeg.phases
                          .map(({ phase }) => PHASE_LABELS[phase])
                          .join('/')}
                      </span>
                    )}
                  </td>
                  <td>
                    {formatDistanceNmValue(operationalRow?.intermediate.distanceNm ?? leg.distanceNm)}
                    {operationalRow === undefined ? null : (
                      <span className="route-table__secondary-value">
                        {formatDistanceNmValue(operationalRow.accumulated.distanceNm)}
                      </span>
                    )}
                  </td>
                  <td>
                    {performanceLeg?.effectiveGroundSpeedKt !== undefined
                      ? performanceLeg.effectiveGroundSpeedKt === null
                        ? '—'
                        : formatGroundSpeedKtValue(
                            performanceLeg.effectiveGroundSpeedKt,
                          )
                      : solution === null
                      ? '—'
                      : formatGroundSpeedKtValue(solution.groundSpeedKt)}
                  </td>
                  <td
                    title={noSolutionMessage ?? etaDateTime ?? undefined}
                    aria-label={timingLabel}
                  >
                    {effectiveEetSeconds === null
                      ? (noSolutionMessage === null ? '—' : 'NO SOL')
                      : formatEetMinutesValue(effectiveEetSeconds)}
                    {operationalRow !== undefined ? (
                      <span className="route-table__secondary-value">
                        {formatEetMinutesValue(operationalRow.accumulated.airborneSeconds)}
                      </span>
                    ) : eta === null ? null : (
                      <span className="route-table__secondary-value">
                        {eta}
                      </span>
                    )}
                  </td>
                  <td>
                    {performanceLeg === undefined
                      ? '—'
                      : performanceLeg.fuelLitres.toFixed(1)}
                    {operationalRow === undefined ? null : (
                      <span className="route-table__secondary-value">
                        {operationalRow.accumulated.airborneFuelLitres.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td>
                    {operationalRow === undefined
                      ? '—'
                      : operationalRow.estimatedFuelRemainingLitres.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Total</td>
              <td>
                {formatDistanceNmValue(operationalSector?.intermediateTotal.distanceNm ?? route.totalDistanceNm)}
                {operationalSector === undefined ? null : (
                  <span className="route-table__secondary-value">
                    {formatDistanceNmValue(operationalSector.accumulatedTotal.distanceNm)}
                  </span>
                )}
              </td>
              <td aria-hidden="true" />
              <td
                title={
                  effectiveRouteArrivalUtcMs === null
                    ? undefined
                    : formatUtcDateTime(effectiveRouteArrivalUtcMs)
                }
              >
                {performanceRoute?.status === 'ok'
                  ? formatEetMinutesValue(performanceRoute.totalEetSeconds)
                  : route.totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(route.totalEetSeconds)}
                {operationalSector !== undefined ? (
                  <span className="route-table__secondary-value">
                    {formatEetMinutesValue(operationalSector.accumulatedTotal.airborneSeconds)}
                  </span>
                ) : effectiveRouteArrivalUtcMs === null ||
                route.departureTimeUtcMs === null ? null : (
                  <span className="route-table__secondary-value">
                    {formatUtcRouteTime(
                      effectiveRouteArrivalUtcMs,
                      route.departureTimeUtcMs,
                    )}
                  </span>
                )}
              </td>
              <td>
                {performanceRoute?.status === 'ok'
                  ? performanceRoute.totalFuelLitres.toFixed(1)
                  : '—'}
                {operationalSector === undefined ? null : (
                  <span className="route-table__secondary-value">
                    {operationalSector.accumulatedTotal.airborneFuelLitres.toFixed(1)}
                  </span>
                )}
              </td>
              <td>{operationalSector?.fuelAtLandingLitres.toFixed(1) ?? '—'}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
