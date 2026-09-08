import { useMemo } from 'react';

import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceLeg,
  CalculatedPerformanceRoute,
  CommunicationChange,
  CalculatedSectorOperationalFlightPlan,
  WindAdjustedLegResult,
} from '../../calculations';
import type {
  AlternatePlanningInputs,
  LegAltitudePlan,
  Waypoint,
} from '../../domain';
import type { ForecastLegWind } from '../../weather';
import { formatForecastWindCollectionDetails } from '../navigation/weatherFormatting';
import { calculatePerformanceLegNavigationSummary } from './performanceLegSummary';
import {
  calculateNavlogDirectionDisplay,
  roundNavlogAccumulatedIncrement,
  roundNavlogValue,
} from './navlogPresentation';
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
  alternateProgress?: {
    readonly accumulatedDistanceNm: number;
    readonly accumulatedTimeSeconds: number;
    readonly accumulatedFuelLitres: number | null;
    readonly estimatedFuelRemainingLitres: number | null;
  } | null;
  forecastWinds?: readonly ForecastLegWind[];
  legAltitudePlans?: readonly LegAltitudePlan[];
  communicationChangesByLeg?: ReadonlyMap<string, readonly CommunicationChange[]>;
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

function effectiveFuelFlowLph(leg: CalculatedPerformanceLeg): number | null {
  return leg.eetSeconds <= 0
    ? null
    : leg.fuelLitres / (leg.eetSeconds / 3600);
}

function formatTas(value: number | null): string {
  return value === null ? '—' : roundNavlogValue(value).toString();
}

function formatFuel(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : roundNavlogValue(value).toString();
}

function formatDistanceIncrement(
  accumulatedDistanceNm: number,
  priorAccumulatedDistanceNm: number,
): string {
  return roundNavlogAccumulatedIncrement(
    accumulatedDistanceNm,
    priorAccumulatedDistanceNm,
  ).toString();
}

function formatTimeIncrement(
  accumulatedSeconds: number,
  priorAccumulatedSeconds: number,
): string {
  return roundNavlogAccumulatedIncrement(
    accumulatedSeconds / 60,
    priorAccumulatedSeconds / 60,
  ).toString();
}

function formatFuelIncrement(
  accumulatedFuelLitres: number,
  priorAccumulatedFuelLitres: number,
): string {
  return roundNavlogAccumulatedIncrement(
    accumulatedFuelLitres,
    priorAccumulatedFuelLitres,
  ).toString();
}

function communicationCell(changes: readonly CommunicationChange[]): {
  readonly lines: readonly string[];
  readonly title: string;
} {
  const values = changes.map(({ distanceFromLegStartNm, selection }) => {
    const location = distanceFromLegStartNm <= 0.05
      ? 'at leg start'
      : `${distanceFromLegStartNm.toFixed(1)} NM from leg start`;
    if (selection.operatingFrequency.status === 'selected') {
      const { candidate } = selection.operatingFrequency;
      return {
        text: candidate.frequency.valueMHz,
        title: `${candidate.callsign ?? candidate.publishedServiceType} ${candidate.frequency.valueMHz} MHz (${location})`,
      };
    }
    const labels = selection.operatingFrequency.candidates.map((candidate) =>
      `${candidate.callsign ?? candidate.publishedServiceType} ${candidate.frequency.valueMHz} MHz`,
    );
    return {
      text: `${selection.operatingFrequency.candidates
        .map(({ frequency }) => frequency.valueMHz)
        .join(' / ')} ?`,
      title: `Choose a preferred frequency in Settings: ${labels.join('; ')} (${location})`,
    };
  });
  return {
    lines: values.map(({ text }) => text),
    title: values.map(({ title }) => title).join('; '),
  };
}

function AlternateRow({
  alternateNavigationRoute,
  alternate,
  trueAirspeedKt,
  waypointNames,
  progress,
}: {
  alternateNavigationRoute: CalculatedNavigationRoute | null | undefined;
  alternate: AlternatePlanningInputs;
  trueAirspeedKt: number | null | undefined;
  waypointNames: ReadonlyMap<string, string>;
  progress: RouteTableProps['alternateProgress'];
}) {
  const leg = alternateNavigationRoute?.legs[0];
  if (leg === undefined) return null;
  const navigation = leg.navigation?.status === 'ok' ? leg.navigation : null;
  const directions = calculateNavlogDirectionDisplay(
    leg.trueTrackDeg,
    leg.magneticVariationDegEast,
    navigation?.trueHeadingDeg ?? null,
  );
  const priorAccumulatedDistanceNm = progress === null || progress === undefined
    ? null
    : progress.accumulatedDistanceNm - alternate.distanceNm;
  const priorAccumulatedTimeSeconds = progress === null || progress === undefined
    ? null
    : progress.accumulatedTimeSeconds - alternate.timeMinutes * 60;
  const priorAccumulatedFuelLitres =
    progress?.accumulatedFuelLitres === null ||
    progress?.accumulatedFuelLitres === undefined
      ? null
      : progress.accumulatedFuelLitres - alternate.fuelLitres;
  return (
    <tr className="route-table__alternate-row">
      <td>Alt.</td>
      <td>{formatTas(trueAirspeedKt ?? null)}</td>
      <td>{formatTrueTrackDeg(directions.trueTrackDeg)}</td>
      <td>{formatVariation(directions.variationDegEast)}</td>
      <td>{formatMagneticTrackDeg(directions.magneticTrackDeg)}</td>
      <td>{formatWindValue(leg.wind)}</td>
      <td>{directions.windCorrectionDeg === null ? '—' : formatWindCorrectionDeg(directions.windCorrectionDeg)}</td>
      <td>{progress === null || progress === undefined ? '—' : formatDistanceNmValue(progress.accumulatedDistanceNm)}</td>
      <td>{progress === null || progress === undefined ? '—' : formatEetMinutesValue(progress.accumulatedTimeSeconds)}</td>
      <td>—</td>
      <td>{priorAccumulatedFuelLitres === null || progress?.accumulatedFuelLitres === null || progress?.accumulatedFuelLitres === undefined
        ? formatFuel(alternate.fuelLitres)
        : formatFuelIncrement(progress.accumulatedFuelLitres, priorAccumulatedFuelLitres)}</td>
      <td>{progress === null || progress === undefined ? '—' : formatFuel(progress.accumulatedFuelLitres)}</td>
      <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
      <td>—</td><td>{Math.round(alternate.plannedAltitudeFtMsl)}</td>
      <td>{formatMagneticHeadingDeg(directions.magneticHeadingDeg)}</td>
      <td>{navigation === null ? '—' : formatGroundSpeedKtValue(navigation.groundSpeedKt)}</td>
      <td>{priorAccumulatedDistanceNm === null || progress === null || progress === undefined
        ? formatDistanceNmValue(alternate.distanceNm)
        : formatDistanceIncrement(progress.accumulatedDistanceNm, priorAccumulatedDistanceNm)}</td>
      <td>{priorAccumulatedTimeSeconds === null || progress === null || progress === undefined
        ? formatEetMinutesValue(alternate.timeMinutes * 60)
        : formatTimeIncrement(progress.accumulatedTimeSeconds, priorAccumulatedTimeSeconds)}</td>
      <td>—</td><td>—</td><td>—</td>
      <td>{progress === null || progress === undefined ? '—' : formatFuel(progress.estimatedFuelRemainingLitres)}</td>
      <td>—</td><td>—</td>
    </tr>
  );
}

function PatternRow({
  row,
  waypointNames,
}: {
  row: NonNullable<CalculatedSectorOperationalFlightPlan['patternRow']>;
  waypointNames: ReadonlyMap<string, string>;
}) {
  const airportName = waypointNames.get(row.airportWaypointId) ?? row.airportWaypointId;
  const priorAccumulatedSeconds = row.accumulated.airborneSeconds - row.intermediate.airborneSeconds;
  const priorAccumulatedFuelLitres = row.accumulated.airborneFuelLitres - row.intermediate.airborneFuelLitres;
  return (
    <tr className="route-table__pattern-row">
      <td>{airportName}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      <td>—</td>
      <td>{formatEetMinutesValue(row.accumulated.airborneSeconds)}</td>
      <td>{formatFuel(row.fuelFlowLph)}</td>
      <td>{formatFuelIncrement(row.accumulated.airborneFuelLitres, priorAccumulatedFuelLitres)}</td>
      <td>{formatFuel(row.accumulated.airborneFuelLitres)}</td>
      <td>{airportName}</td>
      <td>—</td><td>{Math.round(row.patternAltitudeFtMsl)}</td><td>—</td>
      <td>—</td><td>—</td>
      <td>{formatTimeIncrement(row.accumulated.airborneSeconds, priorAccumulatedSeconds)}</td>
      <td>—</td><td>—</td><td>—</td>
      <td>{formatFuel(row.estimatedFuelRemainingLitres)}</td>
      <td>—</td><td>—</td>
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
  alternateProgress = null,
  forecastWinds = [],
  legAltitudePlans = [],
  communicationChangesByLeg = new Map(),
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
  const altitudePlanByLeg = useMemo(
    () =>
      new Map(
        legAltitudePlans.map((plan) => [
          legKey(plan.fromWaypointId, plan.toWaypointId),
          plan,
        ]),
      ),
    [legAltitudePlans],
  );
  let localDistanceNm = 0;
  let localTimeSeconds = 0;
  let localFuelLitres = 0;
  const operationalSectorPriorAccumulated = operationalSector === undefined
    ? null
    : {
        distanceNm:
          operationalSector.accumulatedTotal.distanceNm -
          operationalSector.intermediateTotal.distanceNm,
        airborneSeconds:
          operationalSector.accumulatedTotal.airborneSeconds -
          operationalSector.intermediateTotal.airborneSeconds,
        airborneFuelLitres:
          operationalSector.accumulatedTotal.airborneFuelLitres -
          operationalSector.intermediateTotal.airborneFuelLitres,
      };

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
              const altitudePlan = altitudePlanByLeg.get(
                legKey(leg.fromId, leg.toId),
              );
              const eetSeconds = performanceLeg?.eetSeconds ?? leg.eetSeconds;
              const fuelLitres = performanceLeg?.fuelLitres ?? 0;
              const priorFallbackAccumulated = {
                distanceNm: localDistanceNm,
                airborneSeconds: localTimeSeconds,
                airborneFuelLitres: localFuelLitres,
              };
              localDistanceNm += leg.distanceNm;
              localTimeSeconds += eetSeconds ?? 0;
              localFuelLitres += fuelLitres;
              const accumulated = operationalRow?.accumulated ?? {
                distanceNm: localDistanceNm,
                airborneSeconds: localTimeSeconds,
                airborneFuelLitres: localFuelLitres,
              };
              const priorAccumulated = operationalRow === undefined
                ? priorFallbackAccumulated
                : {
                    distanceNm:
                      operationalRow.accumulated.distanceNm -
                      operationalRow.intermediate.distanceNm,
                    airborneSeconds:
                      operationalRow.accumulated.airborneSeconds -
                      operationalRow.intermediate.airborneSeconds,
                    airborneFuelLitres:
                      operationalRow.accumulated.airborneFuelLitres -
                      operationalRow.intermediate.airborneFuelLitres,
                  };
              const trueHeadingDeg =
                summary?.trueHeadingDeg ?? solution?.trueHeadingDeg ?? null;
              const directions = calculateNavlogDirectionDisplay(
                leg.trueTrackDeg,
                leg.magneticVariationDegEast,
                trueHeadingDeg,
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
              const communication = communicationCell(
                communicationChangesByLeg.get(legKey(leg.fromId, leg.toId)) ?? [],
              );

              return (
                <tr key={legKey(leg.fromId, leg.toId)}>
                  <td>{waypointNames.get(leg.fromId) ?? leg.fromId}</td>
                  <td>{performanceLeg === undefined ? '—' : formatTas(representativeTasKt(performanceLeg))}</td>
                  <td>{formatTrueTrackDeg(directions.trueTrackDeg)}</td>
                  <td title={magneticVariationDetails}>{formatVariation(directions.variationDegEast)}</td>
                  <td>{formatMagneticTrackDeg(directions.magneticTrackDeg)}</td>
                  <td title={windDetails}>{formatWindValue(wind)}</td>
                  <td>{directions.windCorrectionDeg === null ? '—' : formatWindCorrectionDeg(directions.windCorrectionDeg)}</td>
                  <td>{formatDistanceNmValue(accumulated.distanceNm)}</td>
                  <td>{formatEetMinutesValue(accumulated.airborneSeconds)}</td>
                  <td>{performanceLeg === undefined ? '—' : formatFuel(effectiveFuelFlowLph(performanceLeg))}</td>
                  <td>{performanceLeg === undefined ? '—' : formatFuelIncrement(accumulated.airborneFuelLitres, priorAccumulated.airborneFuelLitres)}</td>
                  <td>{operationalRow === undefined ? '—' : formatFuel(accumulated.airborneFuelLitres)}</td>
                  <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
                  <td>{altitudePlan?.minimumSafeAltitudeFtMsl === undefined
                    ? '—'
                    : Math.round(altitudePlan.minimumSafeAltitudeFtMsl)}</td>
                  <td>{performanceLeg === undefined ? '—' : Math.round(performanceLeg.targetAltitudeFtMsl)}</td>
                  <td>{formatMagneticHeadingDeg(directions.magneticHeadingDeg)}</td>
                  <td>{performanceLeg?.effectiveGroundSpeedKt !== undefined
                    ? performanceLeg.effectiveGroundSpeedKt === null
                      ? '—'
                      : formatGroundSpeedKtValue(performanceLeg.effectiveGroundSpeedKt)
                    : solution === null
                      ? '—'
                      : formatGroundSpeedKtValue(solution.groundSpeedKt)}</td>
                  <td>{formatDistanceIncrement(accumulated.distanceNm, priorAccumulated.distanceNm)}</td>
                  <td title={noSolution ?? undefined}>{eetSeconds === null ? '—' : formatTimeIncrement(accumulated.airborneSeconds, priorAccumulated.airborneSeconds)}</td>
                  <td title={endTimeUtcMs === null ? undefined : formatUtcDateTime(endTimeUtcMs)}>{endTimeUtcMs === null || route.departureTimeUtcMs === null ? '—' : formatUtcRouteTime(endTimeUtcMs, route.departureTimeUtcMs)}</td>
                  <td>—</td><td>—</td>
                  <td>{operationalRow === undefined ? '—' : formatFuel(operationalRow.estimatedFuelRemainingLitres)}</td>
                  <td>—</td>
                  <td title={communication.title || undefined}>
                    {communication.lines.length === 0
                      ? '—'
                      : communication.lines.map((line, index) => (
                          <span
                            key={`${line}:${index}`}
                            className="route-table__frequency-line"
                          >
                            {line}
                          </span>
                        ))}
                  </td>
                </tr>
              );
            })}
            {operationalSector?.patternRow === null ||
            operationalSector?.patternRow === undefined ? null : (
              <PatternRow
                row={operationalSector.patternRow}
                waypointNames={waypointNames}
              />
            )}
            {alternateInputs === null ? null : (
              <AlternateRow
                alternateNavigationRoute={alternateNavigationRoute}
                alternate={alternateInputs}
                trueAirspeedKt={alternateTrueAirspeedKt}
                waypointNames={waypointNames}
                progress={alternateProgress}
              />
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td><td colSpan={6} />
              <td>{formatDistanceNmValue(alternateProgress?.accumulatedDistanceNm ?? operationalSector?.accumulatedTotal.distanceNm ?? route.totalDistanceNm)}</td>
              <td>{alternateProgress === null
                ? operationalSector === undefined
                ? route.totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(route.totalEetSeconds)
                : formatEetMinutesValue(operationalSector.accumulatedTotal.airborneSeconds)
                : formatEetMinutesValue(alternateProgress.accumulatedTimeSeconds)}</td>
              <td>—</td>
              <td>{operationalSectorPriorAccumulated === null || operationalSector === undefined
                ? formatFuel(performanceRoute?.status === 'ok' ? performanceRoute.totalFuelLitres : null)
                : formatFuelIncrement(
                    operationalSector.accumulatedTotal.airborneFuelLitres,
                    operationalSectorPriorAccumulated.airborneFuelLitres,
                  )}</td>
              <td>{formatFuel(alternateProgress?.accumulatedFuelLitres ?? operationalSector?.accumulatedTotal.airborneFuelLitres)}</td>
              <td>Total</td><td colSpan={4} />
              <td>{operationalSectorPriorAccumulated === null || operationalSector === undefined
                ? formatDistanceNmValue(route.totalDistanceNm)
                : formatDistanceIncrement(
                    operationalSector.accumulatedTotal.distanceNm,
                    operationalSectorPriorAccumulated.distanceNm,
                  )}</td>
              <td>{operationalSector === undefined
                ? route.totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(route.totalEetSeconds)
                : formatTimeIncrement(
                    operationalSector.accumulatedTotal.airborneSeconds,
                    operationalSectorPriorAccumulated!.airborneSeconds,
                  )}</td>
              <td colSpan={3} />
              <td>{formatFuel(alternateProgress?.estimatedFuelRemainingLitres ?? operationalSector?.fuelAtLandingLitres)}</td><td /><td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
