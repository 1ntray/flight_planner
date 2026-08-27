import { divIcon, DomEvent } from 'leaflet';
import type {
  LatLngTuple,
  LeafletMouseEvent,
  Marker as LeafletMarker,
} from 'leaflet';
import { useCallback, useEffect, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import type {
  FlightPlan,
  Position,
  RouteShapingPoint,
} from '../../domain';
import { getChromiumRasterSeamClassName } from './rasterTileSeamWorkaround';
import {
  buildRouteDisplayLegs,
  getRoutePointDisplayPosition,
} from './routeDisplay';
import type {
  DraggedRoutePointPosition,
  PendingRouteShapingPoint,
  RouteDisplayLeg,
} from './routeDisplay';
import { KARTVERKET_TOPO_TILE_SOURCE } from './tileSource';
import './rasterTileSeamWorkaround.css';

const INITIAL_CENTER: LatLngTuple = [69.35, 18.75];
const INITIAL_ZOOM = 8;

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

export type SelectedRoutePoint =
  | { kind: 'waypoint'; id: string }
  | { kind: 'shaping-point'; id: string };

interface MapClickHandlerProps {
  enabled: boolean;
  onAddWaypoint: (position: Position) => void;
}

function toPosition(event: LeafletMouseEvent): Position {
  return {
    latitude: event.latlng.lat,
    longitude: event.latlng.lng,
  };
}

function MapClickHandler({ enabled, onAddWaypoint }: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      if (enabled) {
        onAddWaypoint(toPosition(event));
      }
    },
  });

  return null;
}

interface RouteLineProps {
  legs: readonly RouteDisplayLeg[];
  interactionEnabled: boolean;
  onBeginShapingPointDrag: (
    pendingPoint: PendingRouteShapingPoint,
  ) => void;
}

function RouteLines({
  legs,
  interactionEnabled,
  onBeginShapingPointDrag,
}: RouteLineProps) {
  const map = useMap();

  return (
    <>
      {legs.map((leg) => (
        <Polyline
          key={`visible:${leg.fromWaypointId}:${leg.toWaypointId}`}
          positions={leg.positions}
          pathOptions={{ color: '#176da5', weight: 4 }}
        />
      ))}

      {interactionEnabled
        ? legs.flatMap((leg) =>
            leg.positions.slice(1).map((position, segmentIndex) => {
              const previousPosition = leg.positions[segmentIndex];

              if (previousPosition === undefined) {
                return null;
              }

              return (
                <Polyline
                  key={`hit:${leg.fromWaypointId}:${leg.toWaypointId}:${segmentIndex}`}
                  positions={[previousPosition, position]}
                  pathOptions={{
                    color: '#176da5',
                    opacity: 0.001,
                    weight: 18,
                    bubblingMouseEvents: false,
                    className: 'route-line-hit-target',
                  }}
                  eventHandlers={{
                    mousedown: (event) => {
                      DomEvent.stop(event.originalEvent);
                      map.dragging.disable();
                      onBeginShapingPointDrag({
                        fromWaypointId: leg.fromWaypointId,
                        toWaypointId: leg.toWaypointId,
                        insertionIndex: segmentIndex,
                        point: {
                          id: crypto.randomUUID(),
                          position: toPosition(event),
                        },
                      });
                    },
                  }}
                />
              );
            }),
          )
        : null}
    </>
  );
}

interface PendingShapingPointDragHandlerProps {
  pendingPoint: PendingRouteShapingPoint | null;
  onMove: (position: Position) => void;
  onCommit: (position: Position) => void;
}

function PendingShapingPointDragHandler({
  pendingPoint,
  onMove,
  onCommit,
}: PendingShapingPointDragHandlerProps) {
  const isDragging = pendingPoint !== null;
  const map = useMapEvents({
    mousemove(event) {
      if (pendingPoint !== null) {
        onMove(toPosition(event));
      }
    },
    mouseup(event) {
      if (pendingPoint !== null) {
        onCommit(toPosition(event));
      }
    },
  });

  useEffect(() => {
    if (isDragging) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }

    return () => {
      if (isDragging) {
        map.dragging.enable();
      }
    };
  }, [isDragging, map]);

  return null;
}

export interface FlightMapProps {
  flightPlan: FlightPlan;
  selectedRoutePoint: SelectedRoutePoint | null;
  onAddWaypoint: (position: Position) => void;
  onMoveWaypoint: (id: string, position: Position) => void;
  onAddShapingPoint: (
    fromWaypointId: string,
    toWaypointId: string,
    insertionIndex: number,
    point: RouteShapingPoint,
  ) => void;
  onMoveShapingPoint: (id: string, position: Position) => void;
  onSelectRoutePoint: (selection: SelectedRoutePoint) => void;
}

export function FlightMap({
  flightPlan,
  selectedRoutePoint,
  onAddWaypoint,
  onMoveWaypoint,
  onAddShapingPoint,
  onMoveShapingPoint,
  onSelectRoutePoint,
}: FlightMapProps) {
  const [draggedPoint, setDraggedPoint] =
    useState<DraggedRoutePointPosition | null>(null);
  const [pendingShapingPoint, setPendingShapingPoint] =
    useState<PendingRouteShapingPoint | null>(null);
  const routeLegs = buildRouteDisplayLegs(
    flightPlan,
    draggedPoint,
    pendingShapingPoint,
  );
  const updatePendingPosition = useCallback((position: Position) => {
    setPendingShapingPoint((current) =>
      current === null
        ? null
        : { ...current, point: { ...current.point, position } },
    );
  }, []);
  const commitPendingPoint = useCallback(
    (position: Position) => {
      if (pendingShapingPoint === null) {
        return;
      }

      const point = { ...pendingShapingPoint.point, position };

      onAddShapingPoint(
        pendingShapingPoint.fromWaypointId,
        pendingShapingPoint.toWaypointId,
        pendingShapingPoint.insertionIndex,
        point,
      );
      onSelectRoutePoint({ kind: 'shaping-point', id: point.id });
      setPendingShapingPoint(null);
    },
    [onAddShapingPoint, onSelectRoutePoint, pendingShapingPoint],
  );

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      className={`flight-map${pendingShapingPoint === null ? '' : ' flight-map--shaping-route'}`}
      zoomControl
    >
      <TileLayer
        url={KARTVERKET_TOPO_TILE_SOURCE.url}
        attribution={KARTVERKET_TOPO_TILE_SOURCE.attribution}
        maxZoom={KARTVERKET_TOPO_TILE_SOURCE.maxZoom}
        className={getChromiumRasterSeamClassName(navigator.userAgent)}
      />

      <MapClickHandler
        enabled={pendingShapingPoint === null}
        onAddWaypoint={onAddWaypoint}
      />
      <PendingShapingPointDragHandler
        pendingPoint={pendingShapingPoint}
        onMove={updatePendingPosition}
        onCommit={commitPendingPoint}
      />

      <RouteLines
        legs={routeLegs}
        interactionEnabled={pendingShapingPoint === null}
        onBeginShapingPointDrag={setPendingShapingPoint}
      />

      {flightPlan.waypoints.map((waypoint) => {
        const displayPosition = getRoutePointDisplayPosition(
          waypoint.id,
          waypoint.position,
          draggedPoint,
        );
        const updateDraggedPosition = (marker: LeafletMarker) => {
          const position = marker.getLatLng();

          setDraggedPoint({
            kind: 'waypoint',
            pointId: waypoint.id,
            position: {
              latitude: position.lat,
              longitude: position.lng,
            },
          });
        };

        return (
          <Marker
            key={waypoint.id}
            position={[displayPosition.latitude, displayPosition.longitude]}
            icon={
              selectedRoutePoint?.kind === 'waypoint' &&
              selectedRoutePoint.id === waypoint.id
                ? selectedWaypointIcon
                : waypointIcon
            }
            draggable
            bubblingMouseEvents={false}
            title={waypoint.name}
            alt={waypoint.name}
            eventHandlers={{
              click: () =>
                onSelectRoutePoint({ kind: 'waypoint', id: waypoint.id }),
              dragstart: (event) => {
                updateDraggedPosition(event.target as LeafletMarker);
              },
              drag: (event) => {
                updateDraggedPosition(event.target as LeafletMarker);
              },
              dragend: (event) => {
                const marker = event.target as LeafletMarker;
                const position = marker.getLatLng();

                onMoveWaypoint(waypoint.id, {
                  latitude: position.lat,
                  longitude: position.lng,
                });
                setDraggedPoint(null);
              },
            }}
          >
            <Tooltip
              className="waypoint-label"
              direction="top"
              offset={[0, -14]}
              opacity={1}
              permanent
            >
              {waypoint.name}
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
            const position = marker.getLatLng();

            setDraggedPoint({
              kind: 'shaping-point',
              pointId: point.id,
              position: {
                latitude: position.lat,
                longitude: position.lng,
              },
            });
          };

          return (
            <Marker
              key={point.id}
              position={[displayPosition.latitude, displayPosition.longitude]}
              icon={
                selectedRoutePoint?.kind === 'shaping-point' &&
                selectedRoutePoint.id === point.id
                  ? selectedShapingPointIcon
                  : shapingPointIcon
              }
              draggable
              bubblingMouseEvents={false}
              title="Route shaping point"
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
                  const position = marker.getLatLng();

                  onMoveShapingPoint(point.id, {
                    latitude: position.lat,
                    longitude: position.lng,
                  });
                  setDraggedPoint(null);
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
    </MapContainer>
  );
}
