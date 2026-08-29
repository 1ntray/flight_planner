import { useMemo } from 'react';

import { deriveFlightPlanSectors } from '../../calculations';
import type {
  CalculatedNavigationRoute,
  CalculatedOperationalFlightPlan,
  CalculatedPerformanceRoute,
  CalculatedPerformanceRouteSuccess,
} from '../../calculations';
import type {
  AircraftDefinition,
  FlightPlan,
  OperationalPlanningInputs,
} from '../../domain';
import type { ForecastLegWind } from '../../weather';
import { RouteTable } from './RouteTable';
import { OperationalSectorSummary } from './OperationalSectorSummary';
import { formatUtcRouteTime } from './routeFormatting';

export interface SectorRouteTablesProps {
  flightPlan: FlightPlan;
  route: CalculatedNavigationRoute;
  performanceRoute?: CalculatedPerformanceRoute | null;
  operationalPlan?: CalculatedOperationalFlightPlan | null;
  aircraftDefinition: AircraftDefinition;
  operationalInputs?: OperationalPlanningInputs | null;
  forecastWinds?: readonly ForecastLegWind[];
}

function sectorNavigationRoute(
  route: CalculatedNavigationRoute,
  waypointIds: ReadonlySet<string>,
  departureTimeUtcMs: number | null,
): CalculatedNavigationRoute {
  const legs = route.legs.filter(
    (leg) => waypointIds.has(leg.fromId) && waypointIds.has(leg.toId),
  );
  const totalEetSeconds = legs.every((leg) => leg.eetSeconds !== null)
    ? legs.reduce((total, leg) => total + leg.eetSeconds!, 0)
    : null;

  return {
    departureTimeUtcMs,
    legs,
    totalDistanceNm: legs.reduce((total, leg) => total + leg.distanceNm, 0),
    totalEetSeconds,
    estimatedArrivalTimeUtcMs: legs.at(-1)?.endTimeUtcMs ?? null,
  };
}

function sectorPerformanceRoute(
  route: CalculatedPerformanceRoute | null | undefined,
  sectorIndex: number,
): CalculatedPerformanceRoute | null {
  if (route === null || route === undefined || route.status === 'no-solution') {
    return route ?? null;
  }

  const sector = route.sectors[sectorIndex];

  if (sector === undefined) {
    return null;
  }

  const result: CalculatedPerformanceRouteSuccess = {
    status: 'ok',
    environment: sector.environment,
    legs: sector.legs,
    sectors: [sector],
    totalDistanceNm: sector.totalDistanceNm,
    totalEetSeconds: sector.totalEetSeconds,
    totalFuelLitres: sector.totalFuelLitres,
    estimatedArrivalTimeUtcMs: sector.estimatedArrivalTimeUtcMs,
    arrivalTargetAltitudeFtMsl: sector.arrivalTargetAltitudeFtMsl,
  };

  return result;
}

export function SectorRouteTables({
  flightPlan,
  route,
  performanceRoute = null,
  operationalPlan = null,
  aircraftDefinition,
  operationalInputs = null,
  forecastWinds = [],
}: SectorRouteTablesProps) {
  const sectors = useMemo(
    () => deriveFlightPlanSectors(flightPlan),
    [flightPlan],
  );
  const alternatePerformanceRoute =
    operationalPlan?.status === 'ok'
      ? operationalPlan.alternatePerformanceRoute
      : null;
  const alternateWaypoints =
    operationalInputs?.alternate === null ||
    operationalInputs?.alternate === undefined ||
    flightPlan.waypoints.at(-1) === undefined
      ? []
      : [flightPlan.waypoints.at(-1)!, operationalInputs.alternate.waypoint];

  if (sectors.length <= 1) {
    const operationalSector =
      operationalPlan?.status === 'ok' ? operationalPlan.sectors[0] : undefined;
    const performanceSector =
      performanceRoute?.status === 'ok'
        ? performanceRoute.sectors[0]
        : undefined;
    const fromName = flightPlan.waypoints[0]?.name;
    const toName = flightPlan.waypoints.at(-1)?.name;
    const departureTimeUtcMs = performanceSector?.departureTimeUtcMs ?? null;
    const arrivalTimeUtcMs = performanceSector?.estimatedArrivalTimeUtcMs ?? null;
    return (
      <div className="sector-navlogs">
        {fromName === undefined || toName === undefined ? null : (
          <div className="sector-navlog__heading">
            <p className="eyebrow">Sector 1</p>
            <h3>{fromName} → {toName}</h3>
            <dl className="sector-navlog__times">
              <div><dt>DEP</dt><dd>{fromName}</dd></div>
              <div><dt>Take-off</dt><dd>{departureTimeUtcMs === null ? '—' : formatUtcRouteTime(departureTimeUtcMs, departureTimeUtcMs)}</dd></div>
              <div><dt>DEST</dt><dd>{toName}</dd></div>
              <div><dt>Landing / pattern</dt><dd>{arrivalTimeUtcMs === null || departureTimeUtcMs === null ? '—' : formatUtcRouteTime(arrivalTimeUtcMs, departureTimeUtcMs)}</dd></div>
            </dl>
          </div>
        )}
        <RouteTable
          waypoints={flightPlan.waypoints}
          route={route}
          performanceRoute={performanceRoute}
          alternatePerformanceRoute={alternatePerformanceRoute}
          alternateWaypoints={alternateWaypoints}
          forecastWinds={forecastWinds}
          {...(operationalSector === undefined ? {} : { operationalSector })}
        />
        {operationalSector === undefined || operationalInputs === null ? null : (
          <OperationalSectorSummary
            sector={operationalSector}
            aircraft={aircraftDefinition}
            inputs={operationalInputs}
            {...(operationalPlan?.status === 'ok' &&
            operationalPlan.alternatePerformanceRoute !== null
              ? { alternateDistanceNm: operationalPlan.alternatePerformanceRoute.totalDistanceNm }
              : {})}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sector-navlogs">
      {sectors.map((sector) => {
        const waypointIds = new Set(
          sector.flightPlan.waypoints.map((waypoint) => waypoint.id),
        );
        const performance = sectorPerformanceRoute(
          performanceRoute,
          sector.sectorIndex,
        );
        const performanceSector =
          performance?.status === 'ok' ? performance.sectors[0] : undefined;
        const operationalSector =
          operationalPlan?.status === 'ok'
            ? operationalPlan.sectors[sector.sectorIndex]
            : undefined;
        const navigation = sectorNavigationRoute(
          route,
          waypointIds,
          performanceSector?.departureTimeUtcMs ??
            route.legs[sector.waypointStartIndex]?.startTimeUtcMs ??
            route.departureTimeUtcMs,
        );
        const fromName = sector.flightPlan.waypoints[0]!.name;
        const toName = sector.flightPlan.waypoints.at(-1)!.name;
        const departureTimeUtcMs = performanceSector?.departureTimeUtcMs ?? null;
        const arrivalTimeUtcMs = performanceSector?.estimatedArrivalTimeUtcMs ?? null;

        return (
          <section
            key={`${sector.fromWaypointId}:${sector.toWaypointId}`}
            className="sector-navlog"
            aria-labelledby={`sector-navlog-${sector.sectorIndex}`}
          >
            <div className="sector-navlog__heading">
              <p className="eyebrow">Sector {sector.sectorIndex + 1}</p>
              <h3 id={`sector-navlog-${sector.sectorIndex}`}>
                {fromName} → {toName}
              </h3>
              <dl className="sector-navlog__times">
                <div><dt>DEP</dt><dd>{fromName}</dd></div>
                <div><dt>Take-off</dt><dd>{departureTimeUtcMs === null ? '—' : formatUtcRouteTime(departureTimeUtcMs, departureTimeUtcMs)}</dd></div>
                <div><dt>DEST</dt><dd>{toName}</dd></div>
                <div><dt>Landing / pattern</dt><dd>{arrivalTimeUtcMs === null || departureTimeUtcMs === null ? '—' : formatUtcRouteTime(arrivalTimeUtcMs, departureTimeUtcMs)}</dd></div>
              </dl>
            </div>
            <RouteTable
              waypoints={sector.flightPlan.waypoints}
              route={navigation}
              performanceRoute={performance}
              alternatePerformanceRoute={alternatePerformanceRoute}
              alternateWaypoints={alternateWaypoints}
              forecastWinds={forecastWinds}
              {...(operationalSector === undefined ? {} : { operationalSector })}
            />
            {operationalSector === undefined || operationalInputs === null ? null : (
              <OperationalSectorSummary
                sector={operationalSector}
                aircraft={aircraftDefinition}
                inputs={operationalInputs}
                {...(operationalPlan?.status === 'ok' &&
                operationalPlan.alternatePerformanceRoute !== null
                  ? { alternateDistanceNm: operationalPlan.alternatePerformanceRoute.totalDistanceNm }
                  : {})}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
