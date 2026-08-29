import { divIcon } from 'leaflet';
import { Marker, Tooltip, useMap } from 'react-leaflet';

import {
  calculatePositionAlongGeometry,
  calculateRoute,
} from '../../calculations';
import type { CalculatedPerformanceRoute } from '../../calculations';
import type { FlightPlan, LegAltitudePlan } from '../../domain';
import { derivePerformancePhaseBoundaries } from './performancePhaseBoundaries';
import { calculatePerformanceTickAngleDeg } from './performancePhaseMarkerGeometry';

const TARGET_TOLERANCE_NM = 1e-6;

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
    iconAnchor: [34, 21],
    iconSize: [68, 42],
  });
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
        const tickAngleDeg = calculatePerformanceTickAngleDeg(
          leg.geometry,
          point.segmentIndex,
          (position) => {
            const projected = map.project(
              [position.latitude, position.longitude],
              map.getZoom(),
            );
            return { x: projected.x, y: projected.y };
          },
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
