import { divIcon } from 'leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';

import {
  calculateNearestPointOnGeometry,
  calculatePositionAlongGeometry,
  calculateRoute,
} from '../../calculations';
import type { CalculatedPerformanceRoute } from '../../calculations';
import type { FlightPlan, LegAltitudePlan, Position } from '../../domain';

function targetIcon(className: string, label: string) {
  return divIcon({
    className: `altitude-target-marker ${className}`,
    html: `<span>${label}</span>`,
    // The label deliberately overflows this small Leaflet icon box. It stays
    // readable without competing with a nearby waypoint's hit target.
    iconAnchor: [8, 8],
    iconSize: [16, 16],
  });
}

const altitudeTargetIcons = {
  ALT: targetIcon('altitude-target-marker--alt', 'ALT'),
  TOC: targetIcon('altitude-target-marker--toc', 'TOC'),
  BOD: targetIcon('altitude-target-marker--bod', 'BOD'),
} as const;

export interface AltitudeTargetMarkersProps {
  flightPlan: FlightPlan;
  plans: readonly LegAltitudePlan[];
  performanceRoute: CalculatedPerformanceRoute | null;
  geometryEditingEnabled: boolean;
  onSetTargetDistance: (
    fromWaypointId: string,
    toWaypointId: string,
    distanceFromStartNm: number,
    target: 'primary' | 'end',
  ) => void;
}

function markerPosition(marker: LeafletMarker): Position {
  const latLng = marker.getLatLng();
  return { latitude: latLng.lat, longitude: latLng.lng };
}

export function AltitudeTargetMarkers({
  flightPlan,
  plans,
  performanceRoute,
  geometryEditingEnabled,
  onSetTargetDistance,
}: AltitudeTargetMarkersProps) {
  const legs = calculateRoute(flightPlan);

  return (
    <>
      {plans.flatMap((plan) => {
        const leg = legs.find(
          (candidate) =>
            candidate.fromId === plan.fromWaypointId &&
            candidate.toId === plan.toWaypointId,
        );

        if (leg === undefined) {
          return [];
        }
        const performanceLeg =
          performanceRoute?.status === 'ok'
            ? performanceRoute.legs.find(
                (candidate) =>
                  candidate.fromId === plan.fromWaypointId &&
                  candidate.toId === plan.toWaypointId,
              )
            : undefined;
        const snapMarker = (marker: LeafletMarker) => {
          const snapped = calculateNearestPointOnGeometry(
            leg.geometry,
            markerPosition(marker),
          );
          marker.setLatLng([
            snapped.position.latitude,
            snapped.position.longitude,
          ]);
          return snapped;
        };

        return ([
          ['primary', plan.targetPlacement] as const,
          ['end', plan.endTargetPlacement] as const,
        ]).flatMap(([targetKind, placement]) => {
          if (placement?.mode !== 'distance-along-leg') {
            return [];
          }
          const target = calculatePositionAlongGeometry(
            leg.geometry,
            placement.distanceFromStartNm,
          );
          const matchingTransition = performanceLeg?.steps.find(
            (step) =>
              step.phase !== 'cruise' &&
              Math.abs(
                step.endDistanceFromLegNm - target.distanceFromStartNm,
              ) <= 1e-6,
          );
          const targetLabel =
            matchingTransition?.phase === 'climb'
              ? 'TOC'
              : matchingTransition?.phase === 'descent'
                ? 'BOD'
                : 'ALT';

          return [
            <Marker
              key={`${plan.fromWaypointId}:${plan.toWaypointId}:${targetKind}`}
              position={[target.position.latitude, target.position.longitude]}
              icon={altitudeTargetIcons[targetLabel]}
              draggable={geometryEditingEnabled}
              bubblingMouseEvents={false}
              zIndexOffset={200}
              title={`${targetKind === 'primary' ? 'Planned' : 'End'} altitude target — drag along route`}
              alt={`${targetKind === 'primary' ? 'Planned' : 'End'} altitude target`}
              eventHandlers={{
                drag: (event) => snapMarker(event.target as LeafletMarker),
                dragend: (event) => {
                  const snapped = snapMarker(event.target as LeafletMarker);
                  onSetTargetDistance(
                    plan.fromWaypointId,
                    plan.toWaypointId,
                    snapped.distanceFromStartNm,
                    targetKind,
                  );
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -15]} opacity={0.95}>
                {targetLabel} · {targetKind === 'primary' ? 'planned' : 'end'} altitude at{' '}
                {target.distanceFromStartNm.toFixed(1)} NM
              </Tooltip>
            </Marker>,
          ];
        });
      })}
    </>
  );
}
