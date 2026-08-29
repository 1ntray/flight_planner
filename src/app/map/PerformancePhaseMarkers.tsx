import { divIcon } from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { Marker, Tooltip, useMap } from 'react-leaflet';

import {
  calculatePositionAlongGeometry,
  calculateRoute,
} from '../../calculations';
import type { CalculatedPerformanceRoute } from '../../calculations';
import type { FlightPlan, LegAltitudePlan } from '../../domain';
import { derivePerformancePhaseBoundaries } from './performancePhaseBoundaries';

const TARGET_TOLERANCE_NM = 1e-6;
const TANGENT_SAMPLE_NM = 0.05;

function boundaryIcon(
  phase: 'climb' | 'descent',
  label: 'BOC' | 'TOC' | 'TOD' | 'BOD',
  tickAngleDeg: number,
) {
  return divIcon({
    className: `performance-boundary-marker performance-boundary-marker--${phase}`,
    html: [
      `<span class="performance-boundary-marker__tick" style="--boundary-tick-angle: ${tickAngleDeg.toFixed(2)}deg"></span>`,
      `<span class="performance-boundary-marker__code">${label}</span>`,
    ].join(''),
    iconAnchor: [20, 12],
    iconSize: [40, 24],
  });
}

function calculateTickAngleDeg(
  map: LeafletMap,
  geometry: Parameters<typeof calculatePositionAlongGeometry>[0],
  distanceFromLegStartNm: number,
  legDistanceNm: number,
): number {
  const beforeDistanceNm = Math.max(
    0,
    distanceFromLegStartNm - TANGENT_SAMPLE_NM,
  );
  const afterDistanceNm = Math.min(
    legDistanceNm,
    distanceFromLegStartNm + TANGENT_SAMPLE_NM,
  );
  const before = calculatePositionAlongGeometry(
    geometry,
    beforeDistanceNm,
  ).position;
  const after = calculatePositionAlongGeometry(
    geometry,
    afterDistanceNm,
  ).position;
  const beforePoint = map.latLngToLayerPoint([
    before.latitude,
    before.longitude,
  ]);
  const afterPoint = map.latLngToLayerPoint([
    after.latitude,
    after.longitude,
  ]);
  const routeAngleDeg = Math.atan2(
    afterPoint.y - beforePoint.y,
    afterPoint.x - beforePoint.x,
  ) * 180 / Math.PI;

  return routeAngleDeg + 90;
}

export interface PerformancePhaseMarkersProps {
  flightPlan: FlightPlan;
  performanceRoute: CalculatedPerformanceRoute | null;
  altitudePlans: readonly LegAltitudePlan[];
}

export function PerformancePhaseMarkers({
  flightPlan,
  performanceRoute,
  altitudePlans,
}: PerformancePhaseMarkersProps) {
  const map = useMap();
  const legs = calculateRoute(flightPlan);
  const boundaries = derivePerformancePhaseBoundaries(performanceRoute);

  return (
    <>
      {boundaries.flatMap((boundary) => {
        const altitudePlan = altitudePlans.find(
          (plan) =>
            plan.fromWaypointId === boundary.fromWaypointId &&
            plan.toWaypointId === boundary.toWaypointId,
        );
        const explicitTargets = [
          altitudePlan?.targetPlacement,
          altitudePlan?.endTargetPlacement,
        ];

        if (
          boundary.boundary === 'end' &&
          explicitTargets.some(
            (target) =>
              target?.mode === 'distance-along-leg' &&
              Math.abs(
                target.distanceFromStartNm -
                  boundary.distanceFromLegStartNm,
              ) <= TARGET_TOLERANCE_NM,
          )
        ) {
          return [];
        }

        const leg = legs.find(
          (candidate) =>
            candidate.fromId === boundary.fromWaypointId &&
            candidate.toId === boundary.toWaypointId,
        );
        if (leg === undefined) {
          return [];
        }
        const point = calculatePositionAlongGeometry(
          leg.geometry,
          boundary.distanceFromLegStartNm,
        );
        const tickAngleDeg = calculateTickAngleDeg(
          map,
          leg.geometry,
          boundary.distanceFromLegStartNm,
          leg.distanceNm,
        );

        return [
          <Marker
            key={boundary.key}
            position={[point.position.latitude, point.position.longitude]}
            icon={boundaryIcon(
              boundary.phase,
              boundary.label,
              tickAngleDeg,
            )}
            bubblingMouseEvents={false}
          >
            <Tooltip
              className={`performance-boundary-label performance-boundary-label--${boundary.phase}`}
              direction="top"
              offset={[0, -8]}
              opacity={0.95}
            >
              {boundary.label} · {Math.round(boundary.altitudeFtMsl)} ft
            </Tooltip>
          </Marker>,
        ];
      })}
    </>
  );
}
