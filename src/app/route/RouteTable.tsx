import { useMemo } from 'react';

import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceLeg,
  CalculatedPerformanceRoute,
  CalculatedSectorOperationalFlightPlan,
  WindAdjustedLegResult,
} from '../../calculations';
import { calculateMagneticDirectionDeg, normalizeTrackDeg } from '../../calculations';
import type { AlternatePlanningInputs, Waypoint, Wind } from '../../domain';
import type { ForecastLegWind } from '../../weather';
import { formatForecastWindCollectionDetails } from '../navigation/weatherFormatting';
import { calculatePerformanceLegNavigationSummary } from './performanceLegSummary';
import {
  formatDistanceNmValue,
  formatEetMinutesValue,
  formatGroundSpeedKtValue,
  formatMagneticHeadingDeg,
  formatMagneticTrackDeg,
  formatTrueTrackDeg,
  formatUtcDateTime,
  formatUtcRouteTime,
  formatWindCorrectionDeg,
  formatWindValue,
} from './routeFormatting';

export interface RouteTableProps {
  waypoints: readonly Waypoint[];
  route: CalculatedNavigationRoute;
  alternateNavigationRoute?: CalculatedNavigationRoute | null;
  performanceRoute?: CalculatedPerformanceRoute | null;
  operationalSector?: CalculatedSectorOperationalFlightPlan;
  alternateInputs?: AlternatePlanningInputs | null;
  alternateTrueAirspeedKt?: number | null;
  alternateWaypoints?: readonly Waypoint[];
  forecastWinds?: readonly ForecastLegWind[];
}

function legKey(fromId: string, toId: string): string {
  return `${fromId}\0${toId}`;
}

function getNoSolutionMessage(result: WindAdjustedLegResult): string | null {
  if (result.status === 'ok') return null;
  return result.reason === 'crosswind-exceeds-true-airspeed'
    ? 'Crosswind exceeds TAS'
    : 'No forward groundspeed';
}

function representativeTasKt(leg: CalculatedPerformanceLeg): number | null {
  const cruiseSteps = leg.steps.filter((step) => step.phase === 'cruise');
  const targetCruise = cruiseSteps.filter(
    (step) =>
      Math.abs(step.representativeAltitudeFtMsl - leg.targetAltitudeFtMsl) <=
      1e-9,
  );
  const cruise = (targetCruise.length > 0 ? targetCruise : cruiseSteps).reduce<
    CalculatedPerformanceLeg['steps'][number] | null
  >(
    (longest, step) =>
      longest === null || step.durationSeconds > longest.durationSeconds
        ? step
        : longest,
    null,
  );
  if (cruise !== null) return cruise.trueAirspeedKt;
  const duration = leg.steps.reduce(
    (total, step) => total + step.durationSeconds,
    0,
  );
  return duration <= 0
    ? null
    : leg.steps.reduce(
        (total, step) => total + step.trueAirspeedKt * step.durationSeconds,
        0,
      ) / duration;
}

function formatVariation(variationDegEast: number | null): string {
  if (variationDegEast === null) return '—';
  const eastDeg = Math.round(variationDegEast);
  if (eastDeg === 0) return '0°';
  return `${Math.abs(eastDeg)}°${eastDeg > 0 ? 'E' : 'W'}`;
}

function variationDetails(
  source: CalculatedNavigationRoute['legs'][number]['magneticVariationSource'],
  unavailableReason: CalculatedNavigationRoute['legs'][number]['magneticVariationUnavailableReason'],
): string | undefined {
  if (source?.kind === 'manual') return 'Manual magnetic variation';
  if (source?.kind === 'model') {
    return unavailableReason === null
      ? `${source.id} magnetic variation`
      : `${source.id} unavailable: ${unavailableReason}`;
  }
  return undefined;
}

function windCorrection(
  trueTrackDeg: number | null,
  trueHeadingDeg: number | null,
): string {
  if (trueTrackDeg === null || trueHeadingDeg === null) return '—';
  const correction =
    ((normalizeTrackDeg(trueHeadingDeg) -
      normalizeTrackDeg(trueTrackDeg) +
      540) %
      360) -
    180;
  return formatWindCorrectionDeg(correction);
}

function effectiveFuelFlowLph(leg: CalculatedPerformanceLeg): number | null {
  return leg.eetSeconds <= 0
    ? null
    : leg.fuelLitres / (leg.eetSeconds / 3600);
}

function formatTas(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

function formatFuel(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(1);
}

function AlternateRow({
  alternateNavigationRoute,
  alternate,
  trueAirspeedKt,
  waypointNames,
}: {
  alternateNavigationRoute: CalculatedNavigationRoute | null | undefined;
  alternate: AlternatePlanningInputs;
  trueAirspeedKt: number | null | undefined;
  waypointNames: ReadonlyMap<string, string>;
}) {
  const leg = alternateNavigationRoute?.legs[0];
  if (leg === undefined) return null;
  const navigation = leg.navigation?.status === 'ok' ? leg.navigation : null;
  return (
    <tr className="route-table__alternate-row">
      <td>Alt.</td>
      <td>{formatTas(trueAirspeedKt ?? null)}</td>
      <td>{formatTrueTrackDeg(leg.trueTrackDeg)}</td>
      <td>{formatVariation(leg.magneticVariationDegEast)}</td>
      <td>{formatMagneticTrackDeg(leg.magneticTrackDeg)}</td>
      <td>{formatWindValue(leg.wind)}</td>
      <td>{windCorrection(leg.trueTrackDeg, navigation?.trueHeadingDeg ?? null)}</td>
      <td>—</td><td>—</td>
      <td>—</td>
      <td>{formatFuel(alternate.fuelLitres)}</td><td>—</td>
      <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
      <td>—</td><td>—</td>
      <td>{formatMagneticHeadingDeg(leg.magneticHeadingDeg)}</td>
      <td>{navigation === null ? '—' : formatGroundSpeedKtValue(navigation.groundSpeedKt)}</td>
      <td>{formatDistanceNmValue(alternate.distanceNm)}</td>
      <td>{formatEetMinutesValue(alternate.timeMinutes * 60)}</td>
      <td>—</td>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
    </tr>
  );
}

export function RouteTable({
  waypoints,
  route,
  alternateNavigationRoute = null,
  performanceRoute = null,
  operationalSector,
  alternateInputs = null,
  alternateTrueAirspeedKt = null,
  alternateWaypoints = [],
  forecastWinds = [],
}: RouteTableProps) {
  const waypointNames = useMemo(
    () =>
      new Map(
        [...waypoints, ...alternateWaypoints].map((waypoint) => [
          waypoint.id,
          waypoint.name,
        ]),
      ),
    [alternateWaypoints, waypoints],
  );
  const forecastsByLeg = useMemo(() => {
    const grouped = new Map<string, ForecastLegWind[]>();
    for (const forecast of forecastWinds) {
      const key = legKey(forecast.fromId, forecast.toId);
      grouped.set(key, [...(grouped.get(key) ?? []), forecast]);
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
    () =>
      new Map(
        (operationalSector?.rows ?? []).map((row) => [
          legKey(row.leg.fromId, row.leg.toId),
          row,
        ]),
      ),
    [operationalSector],
  );
  let localDistanceNm = 0;
  let localTimeSeconds = 0;
  let localFuelLitres = 0;

  return (
    <div className="route-table-wrap route-table-wrap--ofp">
      {route.legs.length === 0 ? (
        <p className="empty-route">
          Add at least two waypoints to calculate a route leg.
        </p>
      ) : (
        <table className="route-table route-table--ofp">
          <thead>
            <tr>
              <th rowSpan={2}>FROM</th><th rowSpan={2}>TAS</th><th rowSpan={2}>TT</th><th rowSpan={2}>VAR</th><th rowSpan={2}>MT</th>
              <th colSpan={2}>WIND</th><th colSpan={2}>ACC</th><th colSpan={3}>FUEL</th>
              <th rowSpan={2}>TO</th><th colSpan={2}>ALTITUDE</th><th rowSpan={2}>MH</th>
              <th colSpan={3}>INTERMEDIATE</th><th colSpan={3}>TIME</th><th colSpan={2}>FUEL REMAINING</th><th rowSpan={2}>FREQ</th>
            </tr>
            <tr>
              <th>DIR/VEL</th><th>WCA</th><th>DIST</th><th>TIME</th><th>FF</th><th>INT</th><th>ACC</th>
              <th>MSA</th><th>PL</th><th>GS</th><th>DIST</th><th>TIME</th><th>ETO</th><th>ATO</th><th>DIFF</th><th>EST</th><th>ACT</th>
            </tr>
          </thead>
          <tbody>
            {route.legs.map((leg) => {
              const performanceLeg = performanceByLeg.get(
                legKey(leg.fromId, leg.toId),
              );
              const summary =
                performanceLeg === undefined
                  ? null
                  : calculatePerformanceLegNavigationSummary(performanceLeg);
              const solution =
                leg.navigation?.status === 'ok' ? leg.navigation : null;
              const noSolution =
                leg.navigation === null
                  ? null
                  : getNoSolutionMessage(leg.navigation);
              const operationalRow = operationalByLeg.get(
                legKey(leg.fromId, leg.toId),
              );
              const eetSeconds = performanceLeg?.eetSeconds ?? leg.eetSeconds;
              const fuelLitres = performanceLeg?.fuelLitres ?? 0;
              localDistanceNm += leg.distanceNm;
              localTimeSeconds += eetSeconds ?? 0;
              localFuelLitres += fuelLitres;
              const accumulated = operationalRow?.accumulated ?? {
                distanceNm: localDistanceNm,
                airborneSeconds: localTimeSeconds,
                airborneFuelLitres: localFuelLitres,
              };
              const trueHeadingDeg =
                summary?.trueHeadingDeg ?? solution?.trueHeadingDeg ?? null;
              const magneticHeadingDeg =
                leg.magneticVariationDegEast === null || trueHeadingDeg === null
                  ? null
                  : calculateMagneticDirectionDeg(
                      trueHeadingDeg,
                      leg.magneticVariationDegEast,
                    );
              const wind = summary?.wind ?? leg.wind;
              const endTimeUtcMs =
                performanceLeg?.endTimeUtcMs ?? leg.endTimeUtcMs;
              const legForecasts =
                forecastsByLeg.get(legKey(leg.fromId, leg.toId)) ?? [];
              const windDetails =
                legForecasts.length === 0
                  ? leg.windSource === 'manual'
                    ? 'Manual wind'
                    : undefined
                  : formatForecastWindCollectionDetails(legForecasts);
              const magneticVariationDetails = variationDetails(
                leg.magneticVariationSource,
                leg.magneticVariationUnavailableReason,
              );

              return (
                <tr key={legKey(leg.fromId, leg.toId)}>
                  <td>{waypointNames.get(leg.fromId) ?? leg.fromId}</td>
                  <td>{performanceLeg === undefined ? '—' : formatTas(representativeTasKt(performanceLeg))}</td>
                  <td>{formatTrueTrackDeg(leg.trueTrackDeg)}</td>
                  <td title={magneticVariationDetails}>{formatVariation(leg.magneticVariationDegEast)}</td>
                  <td>{formatMagneticTrackDeg(leg.magneticTrackDeg)}</td>
                  <td title={windDetails}>{formatWindValue(wind)}</td>
                  <td>{windCorrection(leg.trueTrackDeg, trueHeadingDeg)}</td>
                  <td>{formatDistanceNmValue(accumulated.distanceNm)}</td>
                  <td>{formatEetMinutesValue(accumulated.airborneSeconds)}</td>
                  <td>{performanceLeg === undefined ? '—' : formatFuel(effectiveFuelFlowLph(performanceLeg))}</td>
                  <td>{performanceLeg === undefined ? '—' : formatFuel(performanceLeg.fuelLitres)}</td>
                  <td>{operationalRow === undefined ? '—' : formatFuel(accumulated.airborneFuelLitres)}</td>
                  <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
                  <td>—</td>
                  <td>{performanceLeg === undefined ? '—' : Math.round(performanceLeg.targetAltitudeFtMsl)}</td>
                  <td>{formatMagneticHeadingDeg(magneticHeadingDeg)}</td>
                  <td>{performanceLeg?.effectiveGroundSpeedKt !== undefined
                    ? performanceLeg.effectiveGroundSpeedKt === null
                      ? '—'
                      : formatGroundSpeedKtValue(performanceLeg.effectiveGroundSpeedKt)
                    : solution === null
                      ? '—'
                      : formatGroundSpeedKtValue(solution.groundSpeedKt)}</td>
                  <td>{formatDistanceNmValue(leg.distanceNm)}</td>
                  <td title={noSolution ?? undefined}>{eetSeconds === null ? '—' : formatEetMinutesValue(eetSeconds)}</td>
                  <td title={endTimeUtcMs === null ? undefined : formatUtcDateTime(endTimeUtcMs)}>{endTimeUtcMs === null || route.departureTimeUtcMs === null ? '—' : formatUtcRouteTime(endTimeUtcMs, route.departureTimeUtcMs)}</td>
                  <td>—</td><td>—</td>
                  <td>{operationalRow === undefined ? '—' : formatFuel(operationalRow.estimatedFuelRemainingLitres)}</td>
                  <td>—</td><td>—</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td><td colSpan={6} />
              <td>{formatDistanceNmValue(operationalSector?.accumulatedTotal.distanceNm ?? route.totalDistanceNm)}</td>
              <td>{operationalSector === undefined
                ? route.totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(route.totalEetSeconds)
                : formatEetMinutesValue(operationalSector.accumulatedTotal.airborneSeconds)}</td>
              <td>—</td>
              <td>{formatFuel(operationalSector?.intermediateTotal.airborneFuelLitres ?? (performanceRoute?.status === 'ok' ? performanceRoute.totalFuelLitres : null))}</td>
              <td>{formatFuel(operationalSector?.accumulatedTotal.airborneFuelLitres)}</td>
              <td>Total</td><td colSpan={4} />
              <td>{formatDistanceNmValue(operationalSector?.intermediateTotal.distanceNm ?? route.totalDistanceNm)}</td>
              <td>{operationalSector === undefined
                ? route.totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(route.totalEetSeconds)
                : formatEetMinutesValue(operationalSector.intermediateTotal.airborneSeconds)}</td>
              <td colSpan={3} />
              <td>{formatFuel(operationalSector?.fuelAtLandingLitres)}</td><td /><td />
            </tr>
            {alternateInputs === null ? null : (
              <AlternateRow
                alternateNavigationRoute={alternateNavigationRoute}
                alternate={alternateInputs}
                trueAirspeedKt={alternateTrueAirspeedKt}
                waypointNames={waypointNames}
              />
            )}
          </tfoot>
        </table>
      )}
    </div>
  );
}
