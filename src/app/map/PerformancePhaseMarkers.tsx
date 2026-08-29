import { divIcon } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';

import {
  calculatePositionAlongGeometry,
  calculateRoute,
} from '../../calculations';
import type { CalculatedPerformanceRoute } from '../../calculations';
import type { FlightPlan, LegAltitudePlan } from '../../domain';
import { derivePerformancePhaseBoundaries } from './performancePhaseBoundaries';

const TARGET_TOLERANCE_NM = 1e-6;

function boundaryIcon(className: string, label: string) {
  return divIcon({
    className: `performance-boundary-marker ${className}`,
    html: `<span>${label}</span>`,
    iconAnchor: [14, 14],
    iconSize: [28, 28],
  });
}

const icons = {
  BOC: boundaryIcon('performance-boundary-marker--boc', 'BOC'),
  TOC: boundaryIcon('performance-boundary-marker--toc', 'TOC'),
  TOD: boundaryIcon('performance-boundary-marker--tod', 'TOD'),
  BOD: boundaryIcon('performance-boundary-marker--bod', 'BOD'),
} as const;

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

        return [
          <Marker
            key={boundary.key}
            position={[point.position.latitude, point.position.longitude]}
            icon={icons[boundary.label]}
            interactive={false}
          >
            <Tooltip
              className={`performance-boundary-label performance-boundary-label--${boundary.phase}`}
              direction="top"
              offset={[0, -13]}
              opacity={0.95}
              permanent
            >
              {boundary.label} · {Math.round(boundary.altitudeFtMsl)} ft
            </Tooltip>
          </Marker>,
        ];
      })}
    </>
  );
}
