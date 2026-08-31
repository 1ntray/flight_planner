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
  deriveFlightPlanSectors,
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
import { ArcGisExportTileLayer } from './ArcGisExportTileLayer';
import type { BaseMapLoadStatus } from './ArcGisExportTileLayer';
import { BaseMapControl } from './BaseMapControl';
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
  getRouteDisplayLegMidpoint,
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
import { AerodromeInfoPopup } from './AerodromeInfoPopup';
import { MsaCorridor } from './MsaCorridor';
import { findReportingPointShapingAttachmentTarget } from './aeronauticalWaypointAttachment';
import { VacChartLayers } from './VacChartLayers';
import { aerodromeInfoFeatureFromWaypoint } from './aerodromeInfo';
import {
  DEFAULT_BASE_MAP_ID,
  getBaseMapSource,
} from './baseMapSource';
import type { BaseMapId } from './baseMapSource';
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
      } else if (tool.kind === 'select' || tool.kind === 'edit-route') {
        onClearSelection();
      }
    },
  });

  return null;
}

interface BatchEntryMapCenterProps {
  focus: { readonly key: string; readonly position: Position } | null;
}

/** Keeps the item under sequential keyboard entry in the centre of the map. */
function BatchEntryMapCenter({ focus }: BatchEntryMapCenterProps) {
  const map = useMap();

  useEffect(() => {
    if (focus === null) {
      return;
    }

    map.panTo(
      [focus.position.latitude, focus.position.longitude],
      { animate: true, duration: 0.25 },
    );
  }, [focus?.key, map]);

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
                      if (tool.kind !== 'edit-route') {
                        return;
                      }

                      DomEvent.stop(event.originalEvent);

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

                      if (tool.kind === 'select' || tool.kind === 'edit-route') {
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
    toContainerPoint: (position: Position) => { x: number; y: number },
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
        onCommitShapingPoint(
          interaction.pendingPoint,
          toPosition(event),
          (position) => map.latLngToContainerPoint([position.latitude, position.longitude]),
        );
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
  msaFocusRequest: number;
  waypointNameFocusRequest: number;
  batchEntryActive?: boolean;
  autoShowMsaCorridor?: boolean;
  suppressSelectionPopups?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  performanceRoute: CalculatedPerformanceRoute | null;
  alternateWaypoint?: Waypoint;
  onAddWaypoint: (position: Position) => void;
  onAddAnchoredWaypoint: (feature: AeronauticalPointFeature) => void;
  onSelectAlternateAerodrome: (feature: AeronauticalPointFeature) => void;
  onAttachWaypoint: (id: string, feature: AeronauticalPointFeature) => void;
  onMoveWaypoint: (id: string, position: Position) => void;
  onAddShapingPoint: (
    fromWaypointId: string,
    toWaypointId: string,
    insertionIndex: number,
    point: RouteShapingPoint,
    anchorFeature?: AeronauticalPointFeature,
  ) => void;
  onMoveShapingPoint: (id: string, position: Position) => void;
  onAttachShapingPoint: (id: string, feature: AeronauticalPointFeature) => void;
  onDetachShapingPoint: (id: string) => void;
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
  onSetLegMinimumSafeAltitude: (
    fromWaypointId: string,
    toWaypointId: string,
    minimumSafeAltitudeFtMsl: number | null,
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
  onUndo: () => void;
  onRedo: () => void;
}

export function FlightMap({
  flightPlan,
  aeronauticalRepository,
  selection,
  tool,
  altitudePlans,
  defaultAltitudeFtMsl,
  altitudeFocusRequest,
  msaFocusRequest,
  waypointNameFocusRequest,
  batchEntryActive = false,
  autoShowMsaCorridor = false,
  suppressSelectionPopups = false,
  canUndo,
  canRedo,
  performanceRoute,
  alternateWaypoint,
  onAddWaypoint,
  onAddAnchoredWaypoint,
  onSelectAlternateAerodrome,
  onAttachWaypoint,
  onMoveWaypoint,
  onAddShapingPoint,
  onMoveShapingPoint,
  onAttachShapingPoint,
  onDetachShapingPoint,
  onInsertWaypoint,
  onSelectionChange,
  onToolChange,
  onRenameWaypoint,
  onDeleteSelection,
  onDetachWaypoint,
  onToggleWaypointSectorBoundary,
  onSetLegAltitude,
  onSetLegMinimumSafeAltitude,
  onSetLegEndAltitude,
  onResetAltitudeTarget,
  onSetAltitudeTarget,
  onUndo,
  onRedo,
}: FlightMapProps) {
  const [draggedPoint, setDraggedPoint] =
    useState<DraggedRoutePointPosition | null>(null);
  const [baseMapId, setBaseMapId] = useState<BaseMapId>(
    DEFAULT_BASE_MAP_ID,
  );
  const [baseMapStatus, setBaseMapStatus] =
    useState<BaseMapLoadStatus>('ready');
  const [icaoTermsAccepted, setIcaoTermsAccepted] = useState(false);
  const [icaoTermsPromptOpen, setIcaoTermsPromptOpen] = useState(false);
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
  const [vacChartsVisible, setVacChartsVisible] = useState(false);
  const [vacChartOpacity, setVacChartOpacity] = useState(0.75);
  const [msaCorridorVisible, setMsaCorridorVisible] = useState(false);

  // Sequential MSA entry is the one workflow where the corridor is needed for
  // every leg. Keep it enabled after the mode ends so the pilot retains control
  // over the visual aid rather than having it disappear mid-review.
  useEffect(() => {
    if (autoShowMsaCorridor) {
      setMsaCorridorVisible(true);
    }
  }, [autoShowMsaCorridor]);
  const [visibleAeronauticalPointFeatures, setVisibleAeronauticalPointFeatures] =
    useState<readonly AeronauticalPointFeature[]>([]);
  const [selectedAerodromeInformation, setSelectedAerodromeInformation] =
    useState<AeronauticalPointFeature | null>(null);
  const baseMapSource = getBaseMapSource(baseMapId);
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
  const selectedDisplayLeg = selectedLeg === null
    ? undefined
    : routeLegs.find(
        (leg) =>
          leg.fromWaypointId === selectedLeg.candidate.fromWaypointId &&
          leg.toWaypointId === selectedLeg.candidate.toWaypointId,
      );
  const selectedLegGeometry = selectedDisplayLeg === undefined
    ? null
    : [
        selectedDisplayLeg.segments[0]?.startPosition,
        ...selectedDisplayLeg.segments.map((segment) => segment.endPosition),
      ].filter((position): position is Position => position !== undefined);
  const batchEntryMapFocus = !batchEntryActive
    ? null
    : selectedWaypoint === undefined
      ? selectedDisplayLeg === undefined
        ? null
        : {
            key: `leg:${selectedDisplayLeg.fromWaypointId}:${selectedDisplayLeg.toWaypointId}`,
            position: getRouteDisplayLegMidpoint(selectedDisplayLeg),
          }
      : {
          key: `waypoint:${selectedWaypoint.id}`,
          position: selectedWaypointDisplayPosition ?? selectedWaypoint.position,
        };
  const selectedLegIsArrivalLeg =
    selectedLeg !== null &&
    deriveFlightPlanSectors(flightPlan).some((sector) => {
      const waypoints = sector.flightPlan.waypoints;
      const from = waypoints.at(-2);
      const to = waypoints.at(-1);

      return (
        from?.id === selectedLeg.candidate.fromWaypointId &&
        to?.id === selectedLeg.candidate.toWaypointId
      );
    });
  const toolFrom =
    tool.kind === 'place-altitude-target'
      ? flightPlan.waypoints.find(({ id }) => id === tool.fromWaypointId)
      : undefined;
  const toolTo =
    tool.kind === 'place-altitude-target'
      ? flightPlan.waypoints.find(({ id }) => id === tool.toWaypointId)
      : undefined;
  const commitPendingPoint = useCallback(
    (
      pendingPoint: PendingRouteShapingPoint,
      position: Position,
      toContainerPoint: (position: Position) => { x: number; y: number },
    ) => {
      const attachmentTarget = findReportingPointShapingAttachmentTarget(
        position,
        visibleAeronauticalPointFeatures,
        toContainerPoint,
      );
      const point = {
        ...pendingPoint.point,
        position: attachmentTarget?.position ?? position,
      };

      onAddShapingPoint(
        pendingPoint.fromWaypointId,
        pendingPoint.toWaypointId,
        pendingPoint.insertionIndex,
        point,
        attachmentTarget ?? undefined,
      );
      onSelectionChange(null);
    },
    [onAddShapingPoint, onSelectionChange, visibleAeronauticalPointFeatures],
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
  const selectBaseMap = useCallback(
    (nextId: BaseMapId) => {
      if (nextId === 'avinor-icao' && !icaoTermsAccepted) {
        setIcaoTermsPromptOpen(true);
        return;
      }

      setIcaoTermsPromptOpen(false);
      setBaseMapStatus(nextId === 'avinor-icao' ? 'loading' : 'ready');
      setBaseMapId(nextId);
    },
    [icaoTermsAccepted],
  );
  const acceptIcaoTerms = useCallback(() => {
    setIcaoTermsAccepted(true);
    setIcaoTermsPromptOpen(false);
    setBaseMapStatus('loading');
    setBaseMapId('avinor-icao');
  }, []);
  const showAerodromeInformation = useCallback(
    (feature: AeronauticalPointFeature) => {
      setSelectedAerodromeInformation(feature);
      onSelectionChange(null);
    },
    [onSelectionChange],
  );
  const showWaypointSourceAerodrome = useCallback(
    (waypoint: Waypoint) => {
      const feature = aerodromeInfoFeatureFromWaypoint(waypoint);
      if (feature === null) return;
      showAerodromeInformation(feature);
    },
    [showAerodromeInformation],
  );
  useEffect(() => {
    if (tool.kind !== 'select' || suppressSelectionPopups) {
      setSelectedAerodromeInformation(null);
    }
  }, [suppressSelectionPopups, tool.kind]);
  useEffect(() => {
    if (selectedAerodromeInformation === null) {
      return;
    }

    const closeAerodromeInformationOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      // Let the information popup consume Escape before the global planner
      // shortcuts handle it as a generic selection cancellation.
      event.preventDefault();
      event.stopPropagation();
      setSelectedAerodromeInformation(null);
    };

    window.addEventListener(
      'keydown',
      closeAerodromeInformationOnEscape,
      true,
    );
    return () => window.removeEventListener(
      'keydown',
      closeAerodromeInformationOnEscape,
      true,
    );
  }, [selectedAerodromeInformation]);
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
      setSelectedAerodromeInformation(null);
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
        {baseMapSource.kind === 'xyz' ? (
          <TileLayer
            url={baseMapSource.url}
            attribution={baseMapSource.attribution}
            maxZoom={baseMapSource.maxZoom}
            className={getChromiumRasterSeamClassName(navigator.userAgent)}
          />
        ) : (
          <ArcGisExportTileLayer
            source={baseMapSource}
            onStatusChange={setBaseMapStatus}
          />
        )}

        <MapClickHandler
          tool={tool}
          onAddWaypoint={onAddWaypoint}
          onClearSelection={() => {
            onSelectionChange(null);
            setSelectedAerodromeInformation(null);
          }}
          consumeSuppressedClick={consumeSuppressedMapClick}
        />
        <BatchEntryMapCenter focus={batchEntryMapFocus} />
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
          onSelectAerodromeInformation={showAerodromeInformation}
          alternateAerodromeSelectionEnabled={tool.kind === 'select-alternate-aerodrome'}
          onSelectAlternateAerodrome={onSelectAlternateAerodrome}
          onPointFeaturesChange={setVisibleAeronauticalPointFeatures}
          onDatasetChange={setAeronauticalDataset}
          onStatusChange={setAeronauticalStatus}
        />
        <VacChartLayers
          repository={aeronauticalRepository}
          visible={vacChartsVisible}
          opacity={vacChartOpacity}
        />
        {msaCorridorVisible && selectedLegGeometry !== null ? (
          <MsaCorridor geometry={selectedLegGeometry} />
        ) : null}

        <Pane name="route-lines" style={{ zIndex: 500 }}>
          <RouteLines
            legs={routeLegs}
          interactionEnabled={
            routeLineInteraction?.mode !== 'shaping' &&
            tool.kind !== 'select-alternate-aerodrome'
          }
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
              <Tooltip pane="tooltipPane" permanent direction="top" className="waypoint-label">
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
          geometryEditingEnabled={tool.kind === 'edit-route'}
          onDraggedPointChange={setDraggedPoint}
          onMoveWaypoint={onMoveWaypoint}
          aeronauticalPointFeatures={visibleAeronauticalPointFeatures}
          onAttachWaypoint={onAttachWaypoint}
          onMoveShapingPoint={onMoveShapingPoint}
          onAttachShapingPoint={onAttachShapingPoint}
          onSelectRoutePoint={(selected) => {
            setSelectedAerodromeInformation(null);
            onSelectionChange(selected);
          }}
        />
        {tool.kind !== 'select' ||
        suppressSelectionPopups ||
        selectedAerodromeInformation === null ? null : (
          <AerodromeInfoPopup
            feature={selectedAerodromeInformation}
            repository={aeronauticalRepository}
            onClose={() => setSelectedAerodromeInformation(null)}
          />
        )}
        <PerformancePhaseMarkers
          flightPlan={flightPlan}
          performanceRoute={performanceRoute}
          altitudePlans={altitudePlans}
        />
        <AltitudeTargetMarkers
          flightPlan={flightPlan}
          plans={altitudePlans}
          performanceRoute={performanceRoute}
          geometryEditingEnabled={tool.kind === 'edit-route'}
          onSetTargetDistance={onSetAltitudeTarget}
        />

        {tool.kind !== 'select' ||
        suppressSelectionPopups ||
        selectedWaypoint === undefined ? null : (
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
            onShowSourceAerodrome={showWaypointSourceAerodrome}
            onToggleSectorBoundary={onToggleWaypointSectorBoundary}
            onDelete={onDeleteSelection}
            onClose={() => onSelectionChange(null)}
          />
        )}

        {tool.kind !== 'select' ||
        suppressSelectionPopups ||
        selectedShapingPoint === undefined ||
        selectedShapingPointDisplayPosition === undefined ? null : (
          <ShapingPointMapPopup
            point={{
              ...selectedShapingPoint,
              position: selectedShapingPointDisplayPosition,
            }}
            onDelete={onDeleteSelection}
            onDetach={() => onDetachShapingPoint(selectedShapingPoint.id)}
            onClose={() => onSelectionChange(null)}
          />
        )}

        {tool.kind !== 'select' ||
        suppressSelectionPopups ||
        selectedLeg === null ||
        selectedLegFrom === undefined ||
        selectedLegTo === undefined ? null : (
          <LegMapPopup
            selection={selectedLeg}
            fromWaypoint={selectedLegFrom}
            toWaypoint={selectedLegTo}
            plan={selectedLegPlan}
            defaultAltitudeFtMsl={defaultAltitudeFtMsl}
            isArrivalLeg={selectedLegIsArrivalLeg}
            altitudeFocusRequest={altitudeFocusRequest}
            msaFocusRequest={msaFocusRequest}
            onInsertWaypoint={() => onInsertWaypoint(selectedLeg.candidate)}
            onSetAltitude={(altitudeFtMsl) =>
              onSetLegAltitude(
                selectedLeg.candidate.fromWaypointId,
                selectedLeg.candidate.toWaypointId,
                altitudeFtMsl,
              )
            }
            onSetMinimumSafeAltitude={(minimumSafeAltitudeFtMsl) =>
              onSetLegMinimumSafeAltitude(
                selectedLeg.candidate.fromWaypointId,
                selectedLeg.candidate.toWaypointId,
                minimumSafeAltitudeFtMsl,
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
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={onToolChange}
        onUndo={onUndo}
        onRedo={onRedo}
      />

      <div className="map-layer-controls">
        <BaseMapControl
          selectedId={baseMapId}
          status={baseMapStatus}
          termsPromptOpen={icaoTermsPromptOpen}
          onSelect={selectBaseMap}
          onAcceptTerms={acceptIcaoTerms}
          onCancelTerms={() => setIcaoTermsPromptOpen(false)}
        />
        <AeronauticalLayerControl
          dataset={aeronauticalDataset}
          status={aeronauticalStatus}
          visibility={aeronauticalLayerVisibility}
          onVisibilityChange={updateAeronauticalLayerVisibility}
          vacVisible={vacChartsVisible}
          vacOpacity={vacChartOpacity}
          onVacVisibilityChange={setVacChartsVisible}
          onVacOpacityChange={setVacChartOpacity}
        />
        <label className="msa-corridor-control">
          <span>
            <input
              type="checkbox"
              checked={msaCorridorVisible}
              disabled={selectedLegGeometry === null}
              onChange={(event) =>
                setMsaCorridorVisible(event.currentTarget.checked)}
            />
            1 NM MSA corridor
          </span>
          <small>
            {selectedLegGeometry === null
              ? 'Select a leg to display its shaped-route corridor.'
              : 'Visual aid only; assess terrain and obstacles manually.'}
          </small>
        </label>
      </div>
    </>
  );
}
