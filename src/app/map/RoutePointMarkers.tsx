import { divIcon } from 'leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import { Marker, Tooltip, useMap } from 'react-leaflet';

import type {
  AeronauticalPointFeature,
  FlightPlan,
  Position,
} from '../../domain';
import {
  findAeronauticalWaypointAttachmentTarget,
  findReportingPointShapingAttachmentTarget,
} from './aeronauticalWaypointAttachment';
import { getRoutePointDisplayPosition } from './routeDisplay';
import type {
  DraggedRoutePointPosition,
  MapSelection,
  PendingRouteShapingPoint,
  SelectedRoutePoint,
} from './routeDisplay';

const waypointIcon = divIcon({
  className: 'waypoint-marker',
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

const selectedWaypointIcon = divIcon({
  className: 'waypoint-marker waypoint-marker--selected',
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

const anchoredWaypointIcon = divIcon({
  className: 'waypoint-marker waypoint-marker--anchored',
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

const selectedAnchoredWaypointIcon = divIcon({
  className:
    'waypoint-marker waypoint-marker--anchored waypoint-marker--selected',
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

const shapingPointIcon = divIcon({
  className: 'route-shaping-marker',
  iconAnchor: [8, 8],
  iconSize: [16, 16],
});

const selectedShapingPointIcon = divIcon({
  className: 'route-shaping-marker route-shaping-marker--selected',
  iconAnchor: [8, 8],
  iconSize: [16, 16],
});

const anchoredShapingPointIcon = divIcon({
  className: 'route-shaping-marker route-shaping-marker--anchored',
  iconAnchor: [8, 8],
  iconSize: [16, 16],
});

const selectedAnchoredShapingPointIcon = divIcon({
  className:
    'route-shaping-marker route-shaping-marker--anchored route-shaping-marker--selected',
  iconAnchor: [8, 8],
  iconSize: [16, 16],
});

export interface RoutePointMarkersProps {
  flightPlan: FlightPlan;
  selectedRoutePoint: MapSelection | null;
  draggedPoint: DraggedRoutePointPosition | null;
  pendingShapingPoint: PendingRouteShapingPoint | null;
  geometryEditingEnabled: boolean;
  onDraggedPointChange: (
    draggedPoint: DraggedRoutePointPosition | null,
  ) => void;
  onMoveWaypoint: (id: string, position: Position) => void;
  aeronauticalPointFeatures: readonly AeronauticalPointFeature[];
  onAttachWaypoint: (id: string, feature: AeronauticalPointFeature) => void;
  onMoveShapingPoint: (id: string, position: Position) => void;
  onAttachShapingPoint: (id: string, feature: AeronauticalPointFeature) => void;
  onSelectRoutePoint: (selection: SelectedRoutePoint) => void;
}

function markerPosition(marker: LeafletMarker): Position {
  const position = marker.getLatLng();
  return { latitude: position.lat, longitude: position.lng };
}

export function RoutePointMarkers({
  flightPlan,
  selectedRoutePoint,
  draggedPoint,
  pendingShapingPoint,
  geometryEditingEnabled,
  onDraggedPointChange,
  onMoveWaypoint,
  aeronauticalPointFeatures,
  onAttachWaypoint,
  onMoveShapingPoint,
  onAttachShapingPoint,
  onSelectRoutePoint,
}: RoutePointMarkersProps) {
  const map = useMap();

  return (
    <>
      {flightPlan.waypoints.map((waypoint) => {
        const displayPosition = getRoutePointDisplayPosition(
          waypoint.id,
          waypoint.position,
          draggedPoint,
        );
        const updateDraggedPosition = (marker: LeafletMarker) => {
          onDraggedPointChange({
            kind: 'waypoint',
            pointId: waypoint.id,
            position: markerPosition(marker),
          });
        };
        const isSelected =
          selectedRoutePoint?.kind === 'waypoint' &&
          selectedRoutePoint.id === waypoint.id;
        const isAnchored = waypoint.anchor !== undefined;

        return (
          <Marker
            key={`${waypoint.id}:${isAnchored ? 'anchored' : 'free'}:${waypoint.name}`}
            position={[displayPosition.latitude, displayPosition.longitude]}
            icon={
              isAnchored
                ? isSelected
                  ? selectedAnchoredWaypointIcon
                  : anchoredWaypointIcon
                : isSelected
                  ? selectedWaypointIcon
                  : waypointIcon
            }
            draggable={!isAnchored && geometryEditingEnabled}
            bubblingMouseEvents={false}
            zIndexOffset={500}
            title={`${waypoint.name}${isAnchored ? ' — anchored' : ''}`}
            alt={waypoint.name}
            eventHandlers={{
              click: () =>
                onSelectRoutePoint({ kind: 'waypoint', id: waypoint.id }),
              ...(isAnchored
                ? {}
                : {
                    dragstart: (event) => {
                      updateDraggedPosition(event.target as LeafletMarker);
                    },
                    drag: (event) => {
                      updateDraggedPosition(event.target as LeafletMarker);
                    },
                    dragend: (event) => {
                      const marker = event.target as LeafletMarker;
                      const position = markerPosition(marker);
                      const attachmentTarget =
                        findAeronauticalWaypointAttachmentTarget(
                          position,
                          aeronauticalPointFeatures,
                          (candidatePosition) =>
                            map.latLngToContainerPoint([
                              candidatePosition.latitude,
                              candidatePosition.longitude,
                            ]),
                        );

                      if (attachmentTarget === null) {
                        onMoveWaypoint(waypoint.id, position);
                      } else {
                        onAttachWaypoint(waypoint.id, attachmentTarget);
                      }
                      onDraggedPointChange(null);
                    },
                  }),
            }}
          >
            <Tooltip
              pane="tooltipPane"
              className="waypoint-label"
              direction="top"
              offset={[0, -14]}
              opacity={1}
              permanent
            >
              {waypoint.name}
              {isAnchored ? ' · anchored' : ''}
            </Tooltip>
          </Marker>
        );
      })}

      {flightPlan.legShapes.flatMap((shape) =>
        shape.points.map((point) => {
          const displayPosition = getRoutePointDisplayPosition(
            point.id,
            point.position,
            draggedPoint,
          );
          const updateDraggedPosition = (marker: LeafletMarker) => {
            onDraggedPointChange({
              kind: 'shaping-point',
              pointId: point.id,
              position: markerPosition(marker),
            });
          };
          const isSelected =
            selectedRoutePoint?.kind === 'shaping-point' &&
            selectedRoutePoint.id === point.id;
          const isAnchored = point.anchor !== undefined;

          return (
            <Marker
              key={point.id}
              position={[displayPosition.latitude, displayPosition.longitude]}
              icon={
                isAnchored
                  ? isSelected
                    ? selectedAnchoredShapingPointIcon
                    : anchoredShapingPointIcon
                  : isSelected
                    ? selectedShapingPointIcon
                    : shapingPointIcon
              }
              draggable={geometryEditingEnabled}
              bubblingMouseEvents={false}
              title={isAnchored
                ? `Route shaping point — attached to ${point.anchor!.publishedIdentifier}`
                : 'Route shaping point'}
              alt="Route shaping point"
              eventHandlers={{
                click: () =>
                  onSelectRoutePoint({
                    kind: 'shaping-point',
                    id: point.id,
                  }),
                dragstart: (event) => {
                  updateDraggedPosition(event.target as LeafletMarker);
                },
                drag: (event) => {
                  updateDraggedPosition(event.target as LeafletMarker);
                },
                dragend: (event) => {
                  const marker = event.target as LeafletMarker;
                  const position = markerPosition(marker);
                  const attachmentTarget = findReportingPointShapingAttachmentTarget(
                    position,
                    aeronauticalPointFeatures,
                    (candidatePosition) =>
                      map.latLngToContainerPoint([
                        candidatePosition.latitude,
                        candidatePosition.longitude,
                      ]),
                  );

                  if (attachmentTarget === null) {
                    onMoveShapingPoint(point.id, position);
                  } else {
                    onAttachShapingPoint(point.id, attachmentTarget);
                  }
                  onDraggedPointChange(null);
                },
              }}
            />
          );
        }),
      )}

      {pendingShapingPoint === null ? null : (
        <Marker
          position={[
            pendingShapingPoint.point.position.latitude,
            pendingShapingPoint.point.position.longitude,
          ]}
          icon={selectedShapingPointIcon}
          interactive={false}
        />
      )}
    </>
  );
}
