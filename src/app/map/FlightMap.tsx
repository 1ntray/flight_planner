import { divIcon } from 'leaflet';
import type { LatLngTuple, Marker as LeafletMarker } from 'leaflet';
import { useState } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';

import type { Position, Waypoint } from '../../domain';
import {
  buildRouteDisplayPositions,
  getWaypointDisplayPosition,
} from './routeDisplay';
import type { DraggedWaypointPosition } from './routeDisplay';
import { getChromiumRasterSeamClassName } from './rasterTileSeamWorkaround';
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

interface MapClickHandlerProps {
  onAddWaypoint: (position: Position) => void;
}

function MapClickHandler({ onAddWaypoint }: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      onAddWaypoint({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

export interface FlightMapProps {
  waypoints: readonly Waypoint[];
  selectedWaypointId: string | null;
  onAddWaypoint: (position: Position) => void;
  onMoveWaypoint: (id: string, position: Position) => void;
  onSelectWaypoint: (id: string) => void;
}

export function FlightMap({
  waypoints,
  selectedWaypointId,
  onAddWaypoint,
  onMoveWaypoint,
  onSelectWaypoint,
}: FlightMapProps) {
  const [draggedWaypoint, setDraggedWaypoint] =
    useState<DraggedWaypointPosition | null>(null);
  const routePositions: LatLngTuple[] = buildRouteDisplayPositions(
    waypoints,
    draggedWaypoint,
  );

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      className="flight-map"
      zoomControl
    >
      <TileLayer
        url={KARTVERKET_TOPO_TILE_SOURCE.url}
        attribution={KARTVERKET_TOPO_TILE_SOURCE.attribution}
        maxZoom={KARTVERKET_TOPO_TILE_SOURCE.maxZoom}
        className={getChromiumRasterSeamClassName(navigator.userAgent)}
      />

      <MapClickHandler onAddWaypoint={onAddWaypoint} />

      {routePositions.length > 1 ? (
        <Polyline
          positions={routePositions}
          pathOptions={{ color: '#176da5', weight: 4 }}
        />
      ) : null}

      {waypoints.map((waypoint) => {
        const displayPosition = getWaypointDisplayPosition(
          waypoint,
          draggedWaypoint,
        );
        const updateDraggedPosition = (marker: LeafletMarker) => {
          const position = marker.getLatLng();

          setDraggedWaypoint({
            waypointId: waypoint.id,
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
              waypoint.id === selectedWaypointId
                ? selectedWaypointIcon
                : waypointIcon
            }
            draggable
            bubblingMouseEvents={false}
            title={waypoint.name}
            alt={waypoint.name}
            eventHandlers={{
              click: () => onSelectWaypoint(waypoint.id),
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
                setDraggedWaypoint(null);
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
    </MapContainer>
  );
}
