import { DomEvent } from 'leaflet';
import type { LatLngTuple, LeafletMouseEvent } from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  Pane,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import {
  calculateNearestPointOnGeodesicSegment,
  calculateNearestPointOnGeometry,
  EFFECTIVELY_IDENTICAL_DISTANCE_METERS,
} from '../../calculations';
import type { CalculatedPerformanceRoute } from '../../calculations';
import type {
  AeronauticalDatasetRef,
  AeronauticalPointFeature,
  FlightPlan,
  Position,
  RouteShapingPoint,
  LegAltitudePlan,
} from '../../domain';
import type { AeronauticalDataRepository } from '../../aeronautical';
import { AeronauticalLayerControl } from './AeronauticalLayerControl';
import {
  AeronauticalLayers,
} from './AeronauticalLayers';
import type { AeronauticalLoadStatus } from './AeronauticalLayers';
import {
  DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
} from './aeronauticalLayerConfig';
import type { AeronauticalLayerId } from './aeronauticalLayerConfig';
import { getChromiumRasterSeamClassName } from './rasterTileSeamWorkaround';
import {
  buildRouteDisplayLegs,
} from './routeDisplay';
import type {
  DraggedRoutePointPosition,
  PendingRouteShapingPoint,
  RouteDisplayLeg,
  RouteDisplaySegment,
  SelectedRoutePoint,
} from './routeDisplay';
import type {
  RouteWaypointInsertionCandidate,
} from '../route/routeInsertion';
import { RoutePointMarkers } from './RoutePointMarkers';
import { AltitudeTargetMarkers } from './AltitudeTargetMarkers';
import { PerformancePhaseMarkers } from './PerformancePhaseMarkers';
import type { AltitudePlacementLeg } from '../navigation/altitudePlanState';
import { KARTVERKET_TOPO_TILE_SOURCE } from './tileSource';
import './rasterTileSeamWorkaround.css';

const INITIAL_CENTER: LatLngTuple = [69.35, 18.75];
const INITIAL_ZOOM = 8;
const ROUTE_LINE_DRAG_THRESHOLD_PIXELS = 5;

interface MapClickHandlerProps {
  enabled: boolean;
  insertionCandidateActive: boolean;
  onAddWaypoint: (position: Position) => void;
  onDismissInsertionCandidate: () => void;
  consumeSuppressedClick: () => boolean;
}

function toPosition(event: LeafletMouseEvent): Position {
  return {
    latitude: event.latlng.lat,
    longitude: event.latlng.lng,
  };
}

function MapClickHandler({
  enabled,
  insertionCandidateActive,
  onAddWaypoint,
  onDismissInsertionCandidate,
  consumeSuppressedClick,
}: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      if (consumeSuppressedClick()) {
        return;
      }

      if (!enabled) {
        return;
      }

      if (insertionCandidateActive) {
        onDismissInsertionCandidate();
        return;
      }

      onAddWaypoint(toPosition(event));
    },
  });

  return null;
}

interface RouteLineProps {
  legs: readonly RouteDisplayLeg[];
  interactionEnabled: boolean;
  altitudePlacementLeg: AltitudePlacementLeg | null;
  onBeginInteraction: (interaction: RouteLinePress) => void;
  onSetAltitudeTarget: (
    fromWaypointId: string,
    toWaypointId: string,
    distanceFromStartNm: number,
  ) => void;
}

interface RouteLinePress {
  mode: 'pressed';
  fromWaypointId: string;
  toWaypointId: string;
  segment: RouteDisplaySegment;
  startContainerPoint: { x: number; y: number };
  shapingPointId: string;
}

interface RouteLineShapingDrag {
  mode: 'shaping';
  pendingPoint: PendingRouteShapingPoint;
}

type RouteLineInteraction = RouteLinePress | RouteLineShapingDrag;

function RouteLines({
  legs,
  interactionEnabled,
  altitudePlacementLeg,
  onBeginInteraction,
  onSetAltitudeTarget,
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
            altitudePlacementLeg !== null &&
            (altitudePlacementLeg.fromWaypointId !== leg.fromWaypointId ||
              altitudePlacementLeg.toWaypointId !== leg.toWaypointId)
              ? []
              :
            leg.segments.map((segment) => {
              const choosingAltitudeTarget = altitudePlacementLeg !== null;
              return (
                <Polyline
                  key={`hit:${leg.fromWaypointId}:${leg.toWaypointId}:${segment.segmentIndex}:${choosingAltitudeTarget ? 'altitude' : 'route'}`}
                  positions={segment.positions}
                  pathOptions={{
                    color: '#176da5',
                    opacity: 0.001,
                    weight: 18,
                    bubblingMouseEvents: false,
                    className: choosingAltitudeTarget
                      ? 'route-line-hit-target route-line-hit-target--altitude'
                      : 'route-line-hit-target',
                  }}
                  eventHandlers={{
                    mousedown: (event) => {
                      DomEvent.stop(event.originalEvent);

                      if (choosingAltitudeTarget) {
                        return;
                      }

                      map.dragging.disable();
                      onBeginInteraction({
                        mode: 'pressed',
                        fromWaypointId: leg.fromWaypointId,
                        toWaypointId: leg.toWaypointId,
                        segment,
                        startContainerPoint: {
                          x: event.containerPoint.x,
                          y: event.containerPoint.y,
                        },
                        shapingPointId: crypto.randomUUID(),
                      });
                    },
                    click: (event) => {
                      DomEvent.stop(event.originalEvent);

                      if (!choosingAltitudeTarget) {
                        return;
                      }

                      const geometry = [
                        leg.segments[0]!.startPosition,
                        ...leg.segments.map((item) => item.endPosition),
                      ];
                      const snapped = calculateNearestPointOnGeometry(
                        geometry,
                        toPosition(event),
                      );
                      onSetAltitudeTarget(
                        leg.fromWaypointId,
                        leg.toWaypointId,
                        snapped.distanceFromStartNm,
                      );
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

interface RouteLineInteractionHandlerProps {
  interaction: RouteLineInteraction | null;
  onInteractionChange: (interaction: RouteLineInteraction | null) => void;
  onSelectInsertionCandidate: (
    candidate: RouteWaypointInsertionCandidate,
  ) => void;
  onDragThresholdExceeded: () => void;
  onCommitShapingPoint: (
    pendingPoint: PendingRouteShapingPoint,
    position: Position,
  ) => void;
}

function RouteLineInteractionHandler({
  interaction,
  onInteractionChange,
  onSelectInsertionCandidate,
  onDragThresholdExceeded,
  onCommitShapingPoint,
}: RouteLineInteractionHandlerProps) {
  const isInteracting = interaction !== null;
  const map = useMapEvents({
    mousemove(event) {
      if (interaction?.mode === 'pressed') {
        const horizontalMovement =
          event.containerPoint.x - interaction.startContainerPoint.x;
        const verticalMovement =
          event.containerPoint.y - interaction.startContainerPoint.y;

        if (
          Math.hypot(horizontalMovement, verticalMovement) >=
          ROUTE_LINE_DRAG_THRESHOLD_PIXELS
        ) {
          onDragThresholdExceeded();
          onInteractionChange({
            mode: 'shaping',
            pendingPoint: {
              fromWaypointId: interaction.fromWaypointId,
              toWaypointId: interaction.toWaypointId,
              insertionIndex: interaction.segment.segmentIndex,
              point: {
                id: interaction.shapingPointId,
                position: toPosition(event),
              },
            },
          });
        }
      } else if (interaction?.mode === 'shaping') {
        onInteractionChange({
          ...interaction,
          pendingPoint: {
            ...interaction.pendingPoint,
            point: {
              ...interaction.pendingPoint.point,
              position: toPosition(event),
            },
          },
        });
      }
    },
    mouseup(event) {
      if (interaction?.mode === 'pressed') {
        const snapped = calculateNearestPointOnGeodesicSegment(
          interaction.segment.startPosition,
          interaction.segment.endPosition,
          toPosition(event),
        );
        const distanceToEndMeters =
          snapped.segmentLengthMeters - snapped.distanceAlongSegmentMeters;

        if (
          snapped.distanceAlongSegmentMeters >
            EFFECTIVELY_IDENTICAL_DISTANCE_METERS &&
          distanceToEndMeters > EFFECTIVELY_IDENTICAL_DISTANCE_METERS
        ) {
          onSelectInsertionCandidate({
            fromWaypointId: interaction.fromWaypointId,
            toWaypointId: interaction.toWaypointId,
            segmentIndex: interaction.segment.segmentIndex,
            segmentStart: interaction.segment.startRef,
            segmentEnd: interaction.segment.endRef,
            position: snapped.position,
          });
        }

        onInteractionChange(null);
      } else if (interaction?.mode === 'shaping') {
        onCommitShapingPoint(interaction.pendingPoint, toPosition(event));
        onInteractionChange(null);
      }
    },
  });

  useEffect(() => {
    if (isInteracting) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }

    return () => {
      if (isInteracting) {
        map.dragging.enable();
      }
    };
  }, [isInteracting, map]);

  return null;
}

interface RouteInsertionActionProps {
  candidate: RouteWaypointInsertionCandidate;
  onConfirm: () => void;
  onCancel: () => void;
}

function RouteInsertionAction({
  candidate,
  onConfirm,
  onCancel,
}: RouteInsertionActionProps) {
  return (
    <Popup
      position={[candidate.position.latitude, candidate.position.longitude]}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="route-insertion-popup"
    >
      <p>Insert a real navlog waypoint here?</p>
      <div className="route-insertion-popup__actions">
        <button type="button" className="button" onClick={onConfirm}>
          Add waypoint
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Popup>
  );
}

export interface FlightMapProps {
  flightPlan: FlightPlan;
  aeronauticalRepository: AeronauticalDataRepository;
  selectedRoutePoint: SelectedRoutePoint | null;
  altitudePlans: readonly LegAltitudePlan[];
  altitudePlacementLeg: AltitudePlacementLeg | null;
  performanceRoute: CalculatedPerformanceRoute | null;
  onAddWaypoint: (position: Position) => void;
  onAddAnchoredWaypoint: (feature: AeronauticalPointFeature) => void;
  onMoveWaypoint: (id: string, position: Position) => void;
  onAddShapingPoint: (
    fromWaypointId: string,
    toWaypointId: string,
    insertionIndex: number,
    point: RouteShapingPoint,
  ) => void;
  onMoveShapingPoint: (id: string, position: Position) => void;
  onInsertWaypoint: (candidate: RouteWaypointInsertionCandidate) => void;
  onSelectRoutePoint: (selection: SelectedRoutePoint) => void;
  onSetAltitudeTarget: (
    fromWaypointId: string,
    toWaypointId: string,
    distanceFromStartNm: number,
  ) => void;
}

export function FlightMap({
  flightPlan,
  aeronauticalRepository,
  selectedRoutePoint,
  altitudePlans,
  altitudePlacementLeg,
  performanceRoute,
  onAddWaypoint,
  onAddAnchoredWaypoint,
  onMoveWaypoint,
  onAddShapingPoint,
  onMoveShapingPoint,
  onInsertWaypoint,
  onSelectRoutePoint,
  onSetAltitudeTarget,
}: FlightMapProps) {
  const [draggedPoint, setDraggedPoint] =
    useState<DraggedRoutePointPosition | null>(null);
  const [routeLineInteraction, setRouteLineInteraction] =
    useState<RouteLineInteraction | null>(null);
  const [routeInsertionCandidate, setRouteInsertionCandidate] =
    useState<RouteWaypointInsertionCandidate | null>(null);
  const suppressNextMapClick = useRef(false);
  const [aeronauticalDataset, setAeronauticalDataset] =
    useState<AeronauticalDatasetRef | null>(null);
  const [aeronauticalStatus, setAeronauticalStatus] =
    useState<AeronauticalLoadStatus>('idle');
  const [aeronauticalLayerVisibility, setAeronauticalLayerVisibility] =
    useState(DEFAULT_AERONAUTICAL_LAYER_VISIBILITY);
  const pendingShapingPoint =
    routeLineInteraction?.mode === 'shaping'
      ? routeLineInteraction.pendingPoint
      : null;
  const routeLegs = buildRouteDisplayLegs(
    flightPlan,
    draggedPoint,
    pendingShapingPoint,
  );
  const commitPendingPoint = useCallback(
    (pendingPoint: PendingRouteShapingPoint, position: Position) => {
      const point = { ...pendingPoint.point, position };

      onAddShapingPoint(
        pendingPoint.fromWaypointId,
        pendingPoint.toWaypointId,
        pendingPoint.insertionIndex,
        point,
      );
      onSelectRoutePoint({ kind: 'shaping-point', id: point.id });
    },
    [onAddShapingPoint, onSelectRoutePoint],
  );
  const updateAeronauticalLayerVisibility = useCallback(
    (layerId: AeronauticalLayerId, visible: boolean) => {
      setAeronauticalLayerVisibility((current) => ({
        ...current,
        [layerId]: visible,
      }));
    },
    [],
  );
  const beginRouteLineInteraction = useCallback(
    (interaction: RouteLinePress) => {
      suppressNextMapClick.current = true;
      setRouteInsertionCandidate(null);
      setRouteLineInteraction(interaction);
    },
    [],
  );
  const consumeSuppressedMapClick = useCallback(() => {
    if (!suppressNextMapClick.current) {
      return false;
    }

    suppressNextMapClick.current = false;
    return true;
  }, []);
  const selectRoutePoint = useCallback(
    (selection: SelectedRoutePoint) => {
      setRouteInsertionCandidate(null);
      onSelectRoutePoint(selection);
    },
    [onSelectRoutePoint],
  );
  const addAnchoredWaypoint = useCallback(
    (feature: AeronauticalPointFeature) => {
      setRouteInsertionCandidate(null);
      onAddAnchoredWaypoint(feature);
    },
    [onAddAnchoredWaypoint],
  );
  const confirmRouteInsertion = useCallback(() => {
    if (routeInsertionCandidate === null) {
      return;
    }

    onInsertWaypoint(routeInsertionCandidate);
    setRouteInsertionCandidate(null);
  }, [onInsertWaypoint, routeInsertionCandidate]);

  useEffect(() => {
    setRouteInsertionCandidate(null);
  }, [flightPlan]);

  return (
    <>
      <MapContainer
        center={INITIAL_CENTER}
        zoom={INITIAL_ZOOM}
        className={`flight-map${routeLineInteraction?.mode === 'shaping' ? ' flight-map--shaping-route' : ''}`}
        zoomControl
      >
        <TileLayer
          url={KARTVERKET_TOPO_TILE_SOURCE.url}
          attribution={KARTVERKET_TOPO_TILE_SOURCE.attribution}
          maxZoom={KARTVERKET_TOPO_TILE_SOURCE.maxZoom}
          className={getChromiumRasterSeamClassName(navigator.userAgent)}
        />

        <MapClickHandler
          enabled={routeLineInteraction === null && altitudePlacementLeg === null}
          insertionCandidateActive={routeInsertionCandidate !== null}
          onAddWaypoint={onAddWaypoint}
          onDismissInsertionCandidate={() => setRouteInsertionCandidate(null)}
          consumeSuppressedClick={consumeSuppressedMapClick}
        />
        <RouteLineInteractionHandler
          interaction={routeLineInteraction}
          onInteractionChange={setRouteLineInteraction}
          onSelectInsertionCandidate={setRouteInsertionCandidate}
          onDragThresholdExceeded={() => {
            suppressNextMapClick.current = false;
          }}
          onCommitShapingPoint={commitPendingPoint}
        />

        <AeronauticalLayers
          repository={aeronauticalRepository}
          visibility={aeronauticalLayerVisibility}
          onAnchorPoint={addAnchoredWaypoint}
          onDatasetChange={setAeronauticalDataset}
          onStatusChange={setAeronauticalStatus}
        />

        <Pane name="route-lines" style={{ zIndex: 500 }}>
          <RouteLines
            legs={routeLegs}
            interactionEnabled={routeLineInteraction === null}
            altitudePlacementLeg={altitudePlacementLeg}
            onBeginInteraction={beginRouteLineInteraction}
            onSetAltitudeTarget={onSetAltitudeTarget}
          />
        </Pane>

        {routeInsertionCandidate === null ? null : (
          <RouteInsertionAction
            candidate={routeInsertionCandidate}
            onConfirm={confirmRouteInsertion}
            onCancel={() => setRouteInsertionCandidate(null)}
          />
        )}

        <RoutePointMarkers
          flightPlan={flightPlan}
          selectedRoutePoint={selectedRoutePoint}
          draggedPoint={draggedPoint}
          pendingShapingPoint={pendingShapingPoint}
          onDraggedPointChange={setDraggedPoint}
          onMoveWaypoint={onMoveWaypoint}
          onMoveShapingPoint={onMoveShapingPoint}
          onSelectRoutePoint={selectRoutePoint}
        />
        <PerformancePhaseMarkers
          flightPlan={flightPlan}
          performanceRoute={performanceRoute}
          altitudePlans={altitudePlans}
        />
        <AltitudeTargetMarkers
          flightPlan={flightPlan}
          plans={altitudePlans}
          performanceRoute={performanceRoute}
          onSetTargetDistance={onSetAltitudeTarget}
        />
      </MapContainer>

      <AeronauticalLayerControl
        dataset={aeronauticalDataset}
        status={aeronauticalStatus}
        visibility={aeronauticalLayerVisibility}
        onVisibilityChange={updateAeronauticalLayerVisibility}
      />
    </>
  );
}
