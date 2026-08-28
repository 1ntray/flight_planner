import { divIcon } from 'leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';

import {
  calculateNearestPointOnGeometry,
  calculatePositionAlongGeometry,
  calculateRoute,
} from '../../calculations';
import type { FlightPlan, LegAltitudePlan, Position } from '../../domain';

const altitudeTargetIcon = divIcon({
  className: 'altitude-target-marker',
  html: '<span>ALT</span>',
  iconAnchor: [15, 15],
  iconSize: [30, 30],
});

export interface AltitudeTargetMarkersProps {
  flightPlan: FlightPlan;
  plans: readonly LegAltitudePlan[];
  onSetTargetDistance: (
    fromWaypointId: string,
    toWaypointId: string,
    distanceFromStartNm: number,
  ) => void;
}

function markerPosition(marker: LeafletMarker): Position {
  const latLng = marker.getLatLng();
  return { latitude: latLng.lat, longitude: latLng.lng };
}

export function AltitudeTargetMarkers({
  flightPlan,
  plans,
  onSetTargetDistance,
}: AltitudeTargetMarkersProps) {
  const legs = calculateRoute(flightPlan);

  return (
    <>
      {plans.flatMap((plan) => {
        if (plan.targetPlacement?.mode !== 'distance-along-leg') {
          return [];
        }

        const leg = legs.find(
          (candidate) =>
            candidate.fromId === plan.fromWaypointId &&
            candidate.toId === plan.toWaypointId,
        );

        if (leg === undefined) {
          return [];
        }

        const target = calculatePositionAlongGeometry(
          leg.geometry,
          plan.targetPlacement.distanceFromStartNm,
        );
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

        return [
          <Marker
            key={`${plan.fromWaypointId}:${plan.toWaypointId}`}
            position={[target.position.latitude, target.position.longitude]}
            icon={altitudeTargetIcon}
            draggable
            bubblingMouseEvents={false}
            title="Altitude target — drag along route"
            alt="Altitude target"
            eventHandlers={{
              drag: (event) => snapMarker(event.target as LeafletMarker),
              dragend: (event) => {
                const snapped = snapMarker(event.target as LeafletMarker);
                onSetTargetDistance(
                  plan.fromWaypointId,
                  plan.toWaypointId,
                  snapped.distanceFromStartNm,
                );
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -15]} opacity={0.95}>
              Reach altitude at {target.distanceFromStartNm.toFixed(1)} NM
            </Tooltip>
          </Marker>,
        ];
      })}
    </>
  );
}
