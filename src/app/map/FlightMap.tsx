import { DomEvent } from 'leaflet';
import type { LatLngTuple, LeafletMouseEvent } from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  CircleMarker,
  Pane,
  Polyline,
  TileLayer,
  Tooltip,
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
  Waypoint,
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
  getRouteSectorColor,
  getRoutePointDisplayPosition,
} from './routeDisplay';
import type {
  DraggedRoutePointPosition,
  PendingRouteShapingPoint,
  RouteDisplayLeg,
  RouteDisplaySegment,
  MapSelection,
  MapTool,
  SelectedRouteLeg,
} from './routeDisplay';
import type {
  RouteWaypointInsertionCandidate,
} from '../route/routeInsertion';
import { RoutePointMarkers } from './RoutePointMarkers';
import { AltitudeTargetMarkers } from './AltitudeTargetMarkers';
import { PerformancePhaseMarkers } from './PerformancePhaseMarkers';
import { MapToolControl } from './MapToolControl';
import { WaypointMapPopup } from './WaypointMapPopup';
import { ShapingPointMapPopup } from './ShapingPointMapPopup';
import { LegMapPopup } from './LegMapPopup';
import { KARTVERKET_TOPO_TILE_SOURCE } from './tileSource';
import './rasterTileSeamWorkaround.css';

const INITIAL_CENTER: LatLngTuple = [69.35, 18.75];
const INITIAL_ZOOM = 8;
const ROUTE_LINE_DRAG_THRESHOLD_PIXELS = 5;

interface MapClickHandlerProps {
  tool: MapTool;
  onAddWaypoint: (position: Position) => void;
  onClearSelection: () => void;
  consumeSuppressedClick: () => boolean;
}

function toPosition(event: LeafletMouseEvent): Position {
  return {
    latitude: event.latlng.lat,
    longitude: event.latlng.lng,
  };
}

function MapClickHandler({
  tool,
  onAddWaypoint,
  onClearSelection,
  consumeSuppressedClick,
}: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      if (consumeSuppressedClick()) {
        return;
      }

      if (tool.kind === 'add-waypoint') {
        onAddWaypoint(toPosition(event));
      } else if (tool.kind === 'select') {
        onClearSelection();
      }
    },
  });

  return null;
}

interface RouteLineProps {
  legs: readonly RouteDisplayLeg[];
  interactionEnabled: boolean;
  tool: MapTool;
  selectedLeg: SelectedRouteLeg | null;
  onBeginInteraction: (interaction: RouteLinePress) => void;
  onSelectLeg: (selection: SelectedRouteLeg) => void;
  onInsertWaypoint: (candidate: RouteWaypointInsertionCandidate) => void;
  onSetAltitudeTarget: (
    fromWaypointId: string,
    toWaypointId: string,
    distanceFromStartNm: number,
    target: 'primary' | 'end',
  ) => void;
}

interface RouteLinePress {
  mode: 'pressed';
  fromWaypointId: string;
  toWaypointId: string;
  segment: RouteDisplaySegment;
  legGeometry: readonly Position[];
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
  tool,
  selectedLeg,
  onBeginInteraction,
  onSelectLeg,
  onInsertWaypoint,
  onSetAltitudeTarget,
}: RouteLineProps) {
  const map = useMap();

  return (
    <>
      {legs.map((leg) => (
        <Polyline
          key={`visible:${leg.fromWaypointId}:${leg.toWaypointId}`}
          positions={leg.positions}
          pathOptions={{
            color:
              selectedLeg?.candidate.fromWaypointId === leg.fromWaypointId &&
              selectedLeg.candidate.toWaypointId === leg.toWaypointId
                ? '#e08b28'
                : getRouteSectorColor(leg.sectorIndex),
            weight:
              selectedLeg?.candidate.fromWaypointId === leg.fromWaypointId &&
              selectedLeg.candidate.toWaypointId === leg.toWaypointId
                ? 6
                : 4,
          }}
        />
      ))}

      {interactionEnabled
        ? legs.flatMap((leg) =>
            tool.kind === 'place-altitude-target' &&
            (tool.fromWaypointId !== leg.fromWaypointId ||
              tool.toWaypointId !== leg.toWaypointId)
              ? []
              :
            leg.segments.map((segment) => {
              const choosingAltitudeTarget =
                tool.kind === 'place-altitude-target';
              const geometry = [
                leg.segments[0]!.startPosition,
                ...leg.segments.map((item) => item.endPosition),
              ];
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

                      if (tool.kind !== 'select') {
                        return;
                      }

                      map.dragging.disable();
                      onBeginInteraction({
                        mode: 'pressed',
                        fromWaypointId: leg.fromWaypointId,
                        toWaypointId: leg.toWaypointId,
                        segment,
                        legGeometry: geometry,
                        startContainerPoint: {
                          x: event.containerPoint.x,
                          y: event.containerPoint.y,
                        },
                        shapingPointId: crypto.randomUUID(),
                      });
                    },
                    click: (event) => {
                      DomEvent.stop(event.originalEvent);

                      const snapped = calculateNearestPointOnGeometry(
                        geometry,
                        toPosition(event),
                      );
                      if (choosingAltitudeTarget) {
                        onSetAltitudeTarget(
                          leg.fromWaypointId,
                          leg.toWaypointId,
                          snapped.distanceFromStartNm,
                          tool.target,
                        );
                        return;
                      }

                      const segmentSnap = calculateNearestPointOnGeodesicSegment(
                        segment.startPosition,
                        segment.endPosition,
                        toPosition(event),
                      );
                      const candidate = {
                        fromWaypointId: leg.fromWaypointId,
                        toWaypointId: leg.toWaypointId,
                        segmentIndex: segment.segmentIndex,
                        segmentStart: segment.startRef,
                        segmentEnd: segment.endRef,
                        position: segmentSnap.position,
                      };

                      if (tool.kind === 'select') {
                        onSelectLeg({
                          kind: 'leg',
                          candidate,
                          distanceFromStartNm: snapped.distanceFromStartNm,
                        });
                      } else if (tool.kind === 'add-waypoint') {
                        onInsertWaypoint(candidate);
                      }
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
  onSelectLeg: (selection: SelectedRouteLeg) => void;
  onDragThresholdExceeded: () => void;
  onCommitShapingPoint: (
    pendingPoint: PendingRouteShapingPoint,
    position: Position,
  ) => void;
}

function RouteLineInteractionHandler({
  interaction,
  onInteractionChange,
  onSelectLeg,
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
          onSelectLeg({
            kind: 'leg',
            candidate: {
              fromWaypointId: interaction.fromWaypointId,
              toWaypointId: interaction.toWaypointId,
              segmentIndex: interaction.segment.segmentIndex,
              segmentStart: interaction.segment.startRef,
              segmentEnd: interaction.segment.endRef,
              position: snapped.position,
            },
            distanceFromStartNm: calculateNearestPointOnGeometry(
              interaction.legGeometry,
              snapped.position,
            ).distanceFromStartNm,
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

export interface FlightMapProps {
  flightPlan: FlightPlan;
  aeronauticalRepository: AeronauticalDataRepository;
  selection: MapSelection | null;
  tool: MapTool;
  altitudePlans: readonly LegAltitudePlan[];
  defaultAltitudeFtMsl: string;
  altitudeFocusRequest: number;
  waypointNameFocusRequest: number;
  performanceRoute: CalculatedPerformanceRoute | null;
  alternateWaypoint?: Waypoint;
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
  onSelectionChange: (selection: MapSelection | null) => void;
  onToolChange: (tool: MapTool) => void;
  onRenameWaypoint: (id: string, name: string) => void;
  onDeleteSelection: () => void;
  onDetachWaypoint: (id: string) => void;
  onToggleWaypointSectorBoundary: (id: string) => void;
  onSetLegAltitude: (
    fromWaypointId: string,
    toWaypointId: string,
    altitudeFtMsl: number | null,
  ) => void;
  onSetLegEndAltitude: (
    fromWaypointId: string,
    toWaypointId: string,
    altitudeFtMsl: number | null,
  ) => void;
  onResetAltitudeTarget: (
    fromWaypointId: string,
    toWaypointId: string,
    target: 'primary' | 'end',
  ) => void;
  onSetAltitudeTarget: (
    fromWaypointId: string,
    toWaypointId: string,
    distanceFromStartNm: number,
    target: 'primary' | 'end',
  ) => void;
}

export function FlightMap({
  flightPlan,
  aeronauticalRepository,
  selection,
  tool,
  altitudePlans,
  defaultAltitudeFtMsl,
  altitudeFocusRequest,
  waypointNameFocusRequest,
  performanceRoute,
  alternateWaypoint,
  onAddWaypoint,
  onAddAnchoredWaypoint,
  onMoveWaypoint,
  onAddShapingPoint,
  onMoveShapingPoint,
  onInsertWaypoint,
  onSelectionChange,
  onToolChange,
  onRenameWaypoint,
  onDeleteSelection,
  onDetachWaypoint,
  onToggleWaypointSectorBoundary,
  onSetLegAltitude,
  onSetLegEndAltitude,
  onResetAltitudeTarget,
  onSetAltitudeTarget,
}: FlightMapProps) {
  const [draggedPoint, setDraggedPoint] =
    useState<DraggedRoutePointPosition | null>(null);
  const [routeLineInteraction, setRouteLineInteraction] =
    useState<RouteLineInteraction | null>(null);
  const suppressNextMapClick = useRef(false);
  const suppressNextRouteLineClick = useRef(false);
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
  const selectedWaypoint =
    selection?.kind === 'waypoint'
      ? flightPlan.waypoints.find(({ id }) => id === selection.id)
      : undefined;
  const selectedWaypointIndex = selectedWaypoint === undefined
    ? -1
    : flightPlan.waypoints.findIndex(({ id }) => id === selectedWaypoint.id);
  const selectedWaypointDisplayPosition = selectedWaypoint === undefined
    ? undefined
    : getRoutePointDisplayPosition(
        selectedWaypoint.id,
        selectedWaypoint.position,
        draggedPoint,
      );
  const selectedShapingPoint =
    selection?.kind === 'shaping-point'
      ? flightPlan.legShapes
          .flatMap(({ points }) => points)
          .find(({ id }) => id === selection.id)
      : undefined;
  const selectedShapingPointDisplayPosition =
    selectedShapingPoint === undefined
      ? undefined
      : getRoutePointDisplayPosition(
          selectedShapingPoint.id,
          selectedShapingPoint.position,
          draggedPoint,
        );
  const selectedLeg = selection?.kind === 'leg' ? selection : null;
  const selectedLegFrom = selectedLeg === null
    ? undefined
    : flightPlan.waypoints.find(
        ({ id }) => id === selectedLeg.candidate.fromWaypointId,
      );
  const selectedLegTo = selectedLeg === null
    ? undefined
    : flightPlan.waypoints.find(
        ({ id }) => id === selectedLeg.candidate.toWaypointId,
      );
  const selectedLegPlan = selectedLeg === null
    ? undefined
    : altitudePlans.find(
        (plan) =>
          plan.fromWaypointId === selectedLeg.candidate.fromWaypointId &&
          plan.toWaypointId === selectedLeg.candidate.toWaypointId,
      );
  const toolFrom =
    tool.kind === 'place-altitude-target'
      ? flightPlan.waypoints.find(({ id }) => id === tool.fromWaypointId)
      : undefined;
  const toolTo =
    tool.kind === 'place-altitude-target'
      ? flightPlan.waypoints.find(({ id }) => id === tool.toWaypointId)
      : undefined;
  const commitPendingPoint = useCallback(
    (pendingPoint: PendingRouteShapingPoint, position: Position) => {
      const point = { ...pendingPoint.point, position };

      onAddShapingPoint(
        pendingPoint.fromWaypointId,
        pendingPoint.toWaypointId,
        pendingPoint.insertionIndex,
        point,
      );
      onSelectionChange(null);
    },
    [onAddShapingPoint, onSelectionChange],
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
      setRouteLineInteraction(interaction);
    },
    [],
  );
  const selectMapLeg = useCallback(
    (selected: SelectedRouteLeg) => {
      suppressNextMapClick.current = false;
      onSelectionChange(selected);
    },
    [onSelectionChange],
  );
  const selectMapLegFromClick = useCallback(
    (selected: SelectedRouteLeg) => {
      if (suppressNextRouteLineClick.current) {
        suppressNextRouteLineClick.current = false;
        return;
      }

      setRouteLineInteraction(null);
      selectMapLeg(selected);
    },
    [selectMapLeg],
  );
  const consumeSuppressedMapClick = useCallback(() => {
    if (!suppressNextMapClick.current) {
      return false;
    }

    suppressNextMapClick.current = false;
    return true;
  }, []);
  return (
    <>
      <MapContainer
        center={INITIAL_CENTER}
        zoom={INITIAL_ZOOM}
        className={`flight-map flight-map--tool-${tool.kind}${routeLineInteraction?.mode === 'shaping' ? ' flight-map--shaping-route' : ''}`}
        zoomControl
      >
        <TileLayer
          url={KARTVERKET_TOPO_TILE_SOURCE.url}
          attribution={KARTVERKET_TOPO_TILE_SOURCE.attribution}
          maxZoom={KARTVERKET_TOPO_TILE_SOURCE.maxZoom}
          className={getChromiumRasterSeamClassName(navigator.userAgent)}
        />

        <MapClickHandler
          tool={tool}
          onAddWaypoint={onAddWaypoint}
          onClearSelection={() => onSelectionChange(null)}
          consumeSuppressedClick={consumeSuppressedMapClick}
        />
        <RouteLineInteractionHandler
          interaction={routeLineInteraction}
          onInteractionChange={setRouteLineInteraction}
          onSelectLeg={selectMapLeg}
          onDragThresholdExceeded={() => {
            suppressNextMapClick.current = false;
            suppressNextRouteLineClick.current = true;
          }}
          onCommitShapingPoint={commitPendingPoint}
        />

        <AeronauticalLayers
          repository={aeronauticalRepository}
          visibility={aeronauticalLayerVisibility}
          anchoringEnabled={tool.kind === 'add-waypoint'}
          onAnchorPoint={onAddAnchoredWaypoint}
          onDatasetChange={setAeronauticalDataset}
          onStatusChange={setAeronauticalStatus}
        />

        <Pane name="route-lines" style={{ zIndex: 500 }}>
          <RouteLines
            legs={routeLegs}
            interactionEnabled={routeLineInteraction?.mode !== 'shaping'}
            tool={tool}
            selectedLeg={selectedLeg}
            onBeginInteraction={beginRouteLineInteraction}
            onSelectLeg={selectMapLegFromClick}
            onInsertWaypoint={onInsertWaypoint}
            onSetAltitudeTarget={onSetAltitudeTarget}
          />
        </Pane>

        {alternateWaypoint === undefined ||
        flightPlan.waypoints.length === 0 ? null : (
          <Pane name="alternate-route" style={{ zIndex: 490 }}>
            <Polyline
              positions={[
                [
                  flightPlan.waypoints.at(-1)!.position.latitude,
                  flightPlan.waypoints.at(-1)!.position.longitude,
                ],
                [
                  alternateWaypoint.position.latitude,
                  alternateWaypoint.position.longitude,
                ],
              ]}
              pathOptions={{ color: '#704887', weight: 3, dashArray: '7 7' }}
              interactive={false}
            />
            <CircleMarker
              center={[
                alternateWaypoint.position.latitude,
                alternateWaypoint.position.longitude,
              ]}
              radius={7}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#704887', fillOpacity: 1 }}
              interactive={false}
            >
              <Tooltip permanent direction="top" className="waypoint-label">
                ALT {alternateWaypoint.name}
              </Tooltip>
            </CircleMarker>
          </Pane>
        )}

        <RoutePointMarkers
          flightPlan={flightPlan}
          selectedRoutePoint={selection}
          draggedPoint={draggedPoint}
          pendingShapingPoint={pendingShapingPoint}
          onDraggedPointChange={setDraggedPoint}
          onMoveWaypoint={onMoveWaypoint}
          onMoveShapingPoint={onMoveShapingPoint}
          onSelectRoutePoint={onSelectionChange}
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

        {tool.kind !== 'select' || selectedWaypoint === undefined ? null : (
          <WaypointMapPopup
            waypoint={selectedWaypoint}
            position={selectedWaypointDisplayPosition ?? selectedWaypoint.position}
            nameFocusRequest={waypointNameFocusRequest}
            canBeSectorBoundary={
              selectedWaypointIndex > 0 &&
              selectedWaypointIndex < flightPlan.waypoints.length - 1
            }
            isSectorBoundary={
              flightPlan.sectorBoundaryWaypointIds?.includes(
                selectedWaypoint.id,
              ) ?? false
            }
            onRename={onRenameWaypoint}
            onDetach={onDetachWaypoint}
            onToggleSectorBoundary={onToggleWaypointSectorBoundary}
            onDelete={onDeleteSelection}
            onClose={() => onSelectionChange(null)}
          />
        )}

        {tool.kind !== 'select' ||
        selectedShapingPoint === undefined ||
        selectedShapingPointDisplayPosition === undefined ? null : (
          <ShapingPointMapPopup
            position={selectedShapingPointDisplayPosition}
            onDelete={onDeleteSelection}
            onClose={() => onSelectionChange(null)}
          />
        )}

        {tool.kind !== 'select' ||
        selectedLeg === null ||
        selectedLegFrom === undefined ||
        selectedLegTo === undefined ? null : (
          <LegMapPopup
            selection={selectedLeg}
            fromWaypoint={selectedLegFrom}
            toWaypoint={selectedLegTo}
            plan={selectedLegPlan}
            defaultAltitudeFtMsl={defaultAltitudeFtMsl}
            altitudeFocusRequest={altitudeFocusRequest}
            onInsertWaypoint={() => onInsertWaypoint(selectedLeg.candidate)}
            onSetAltitude={(altitudeFtMsl) =>
              onSetLegAltitude(
                selectedLeg.candidate.fromWaypointId,
                selectedLeg.candidate.toWaypointId,
                altitudeFtMsl,
              )
            }
            onSetEndAltitude={(altitudeFtMsl) =>
              onSetLegEndAltitude(
                selectedLeg.candidate.fromWaypointId,
                selectedLeg.candidate.toWaypointId,
                altitudeFtMsl,
              )
            }
            onPlaceAltitudeTarget={() =>
              onToolChange({
                kind: 'place-altitude-target',
                fromWaypointId: selectedLeg.candidate.fromWaypointId,
                toWaypointId: selectedLeg.candidate.toWaypointId,
                target: 'primary',
              })
            }
            onPlaceEndAltitudeTarget={() =>
              onToolChange({
                kind: 'place-altitude-target',
                fromWaypointId: selectedLeg.candidate.fromWaypointId,
                toWaypointId: selectedLeg.candidate.toWaypointId,
                target: 'end',
              })
            }
            onResetAltitudeTarget={() =>
              onResetAltitudeTarget(
                selectedLeg.candidate.fromWaypointId,
                selectedLeg.candidate.toWaypointId,
                'primary',
              )
            }
            onResetEndAltitudeTarget={() =>
              onResetAltitudeTarget(
                selectedLeg.candidate.fromWaypointId,
                selectedLeg.candidate.toWaypointId,
                'end',
              )
            }
            onClose={() => onSelectionChange(null)}
          />
        )}
      </MapContainer>

      <MapToolControl
        tool={tool}
        fromName={toolFrom?.name}
        toName={toolTo?.name}
        onToolChange={onToolChange}
      />

      <AeronauticalLayerControl
        dataset={aeronauticalDataset}
        status={aeronauticalStatus}
        visibility={aeronauticalLayerVisibility}
        onVisibilityChange={updateAeronauticalLayerVisibility}
      />
    </>
  );
}
