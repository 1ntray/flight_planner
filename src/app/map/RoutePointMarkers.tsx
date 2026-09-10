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
  findRouteWaypointSnapTarget,
} from './aeronauticalWaypointAttachment';
import {
  buildRouteDisplayLegs,
  getRoutePointDisplayPosition,
  ROUTE_SECTOR_COLORS,
} from './routeDisplay';
import type {
  DraggedRoutePointPosition,
  MapSelection,
  PendingRouteShapingPoint,
  SelectedRoutePoint,
} from './routeDisplay';

type WaypointSourceShape = 'aerodrome' | 'reporting-point' | null;

const waypointIcons = new Map<string, ReturnType<typeof divIcon>>();

function uniqueSectorIndices(sectorIndices: readonly number[]): number[] {
  return [
    ...new Set(
      sectorIndices.map(
        (sectorIndex) => sectorIndex % ROUTE_SECTOR_COLORS.length,
      ),
    ),
  ];
}

function sectorColors(sectorIndices: readonly number[]): string[] {
  return uniqueSectorIndices(sectorIndices).map(
    (sectorIndex) => ROUTE_SECTOR_COLORS[sectorIndex]!,
  );
}

function sectorFill(colors: readonly string[]): string {
  if (colors.length === 1) return colors[0]!;
  if (colors.length === 2) {
    return `linear-gradient(90deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)`;
  }

  return `conic-gradient(${colors
    .map((color, index) => {
      const start = (index / colors.length) * 100;
      const end = ((index + 1) / colors.length) * 100;
      return `${color} ${start}% ${end}%`;
    })
    .join(', ')})`;
}

/**
 * Uses an SVG rather than a clipped rectangular element. CSS clipping leaves
 * the element's shadow and pseudo-element bounds visible in some Leaflet/
 * Chromium combinations, especially where markers overlap.
 */
function reportingPointMarkerSvg(
  sectorIndices: readonly number[],
  size: number,
  selected: boolean,
  markerKind: 'waypoint' | 'shaping-point',
): string {
  const normalizedSectorIndices = uniqueSectorIndices(sectorIndices);
  const colors = sectorColors(normalizedSectorIndices);
  const gradientId = `route-${markerKind}-reporting-${normalizedSectorIndices.join('-')}`;
  const fill =
    colors.length === 1 ? colors[0]! : `url(#${gradientId})`;
  const gradient =
    colors.length <= 1
      ? ''
      : `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0">${colors
          .map((color, index) => {
            const start = (index / colors.length) * 100;
            const end = ((index + 1) / colors.length) * 100;
            return `<stop offset="${start}%" stop-color="${color}" /><stop offset="${end}%" stop-color="${color}" />`;
          })
          .join('')}</linearGradient></defs>`;

  return `<svg class="route-reporting-point-marker${
    selected ? ' route-reporting-point-marker--selected' : ''
  }" width="${size}" height="${size}" viewBox="0 0 32 30" aria-hidden="true">${gradient}<path d="M16 2.5 29 26.5H3Z" fill="${fill}" stroke="${
    selected ? '#fff4b5' : '#ffffff'
  }" stroke-width="3" stroke-linejoin="round" /><circle cx="16" cy="18" r="3" fill="#ffffff" /></svg>`;
}

function waypointIcon(
  sourceShape: WaypointSourceShape,
  sectorIndices: readonly number[],
  selected: boolean,
): ReturnType<typeof divIcon> {
  const normalizedSectorIndices = uniqueSectorIndices(sectorIndices);
  const fill = sectorFill(sectorColors(normalizedSectorIndices));
  const key = `${sourceShape ?? 'free'}:${normalizedSectorIndices.join(',')}:${selected}`;
  const existing = waypointIcons.get(key);
  if (existing !== undefined) return existing;

  const icon = divIcon({
    className: 'waypoint-marker-icon',
    html: sourceShape === 'reporting-point'
      ? reportingPointMarkerSvg(normalizedSectorIndices, 26, selected, 'waypoint')
      : `<span class="${[
          'waypoint-marker',
          ...(sourceShape === null ? [] : ['waypoint-marker--anchored']),
          ...(sourceShape === null ? [] : [`waypoint-marker--source-${sourceShape}`]),
          ...(selected ? ['waypoint-marker--selected'] : []),
        ].join(' ')}" style="--waypoint-marker-fill: ${fill}"></span>`,
    iconAnchor: [13, 13],
    iconSize: [26, 26],
  });
  waypointIcons.set(key, icon);
  return icon;
}

const shapingPointIcons = new Map<string, ReturnType<typeof divIcon>>();

function shapingPointIcon(
  anchoredToReportingPoint: boolean,
  sectorIndices: readonly number[],
  selected: boolean,
): ReturnType<typeof divIcon> {
  const normalizedSectorIndices = uniqueSectorIndices(sectorIndices);
  const fill = sectorFill(sectorColors(normalizedSectorIndices));
  const key = `${anchoredToReportingPoint}:${normalizedSectorIndices.join(',')}:${selected}`;
  const existing = shapingPointIcons.get(key);
  if (existing !== undefined) return existing;

  const icon = divIcon({
    className: 'route-shaping-marker-icon',
    html: anchoredToReportingPoint
      ? reportingPointMarkerSvg(
          normalizedSectorIndices,
          18,
          selected,
          'shaping-point',
        )
      : `<span class="${[
          'route-shaping-marker',
          ...(selected ? ['route-shaping-marker--selected'] : []),
        ].join(' ')}" style="--route-shaping-marker-fill: ${fill}"></span>`,
    iconAnchor: [9, 9],
    iconSize: [18, 18],
  });
  shapingPointIcons.set(key, icon);
  return icon;
}

export interface RoutePointMarkersProps {
  flightPlan: FlightPlan;
  showWaypoints: boolean;
  showWaypointNames: boolean;
  showShapingPoints: boolean;
  selectedRoutePoint: MapSelection | null;
  draggedPoint: DraggedRoutePointPosition | null;
  pendingShapingPoint: PendingRouteShapingPoint | null;
  geometryEditingEnabled: boolean;
  addingWaypointMode: boolean;
  onDraggedPointChange: (
    draggedPoint: DraggedRoutePointPosition | null,
  ) => void;
  onMoveWaypoint: (id: string, position: Position) => void;
  onAddWaypoint: (position: Position) => void;
  aeronauticalPointFeatures: readonly AeronauticalPointFeature[];
  onAttachWaypoint: (id: string, feature: AeronauticalPointFeature) => void;
  onAddAnchoredWaypoint: (feature: AeronauticalPointFeature) => void;
  onMoveShapingPoint: (id: string, position: Position) => void;
  onAttachShapingPoint: (id: string, feature: AeronauticalPointFeature) => void;
  onSelectRoutePoint: (selection: SelectedRoutePoint) => void;
}

function markerPosition(marker: LeafletMarker): Position {
  const position = marker.getLatLng();
  return { latitude: position.lat, longitude: position.lng };
}

function routeLegKey(fromWaypointId: string, toWaypointId: string): string {
  return `${fromWaypointId}\u0000${toWaypointId}`;
}

function reportingPointAnchorKey(
  point: FlightPlan['legShapes'][number]['points'][number],
): string | null {
  const anchor = point.anchor;
  if (anchor?.feature.featureKind !== 'reporting-point') return null;

  return [
    anchor.feature.dataset.datasetId,
    anchor.feature.featureKind,
    anchor.feature.featureId,
    anchor.feature.featureVersionId ?? '',
  ].join('\u0000');
}

function anchoredWaypointSourceFeature(
  waypoint: FlightPlan['waypoints'][number],
): AeronauticalPointFeature | null {
  const anchor = waypoint.anchor;
  if (anchor === undefined) return null;
  const pointKind = anchor.feature.featureKind;
  if (
    pointKind !== 'aerodrome' &&
    pointKind !== 'reporting-point' &&
    pointKind !== 'navaid' &&
    pointKind !== 'designated-point'
  ) {
    return null;
  }

  return {
    geometryType: 'point',
    pointKind,
    ref: anchor.feature,
    identifier: anchor.publishedIdentifier,
    suggestedWaypointName: anchor.publishedIdentifier,
    ...(anchor.publishedName === undefined ? {} : { name: anchor.publishedName }),
    position: waypoint.position,
  };
}

export function RoutePointMarkers({
  flightPlan,
  showWaypoints,
  showWaypointNames,
  showShapingPoints,
  selectedRoutePoint,
  draggedPoint,
  pendingShapingPoint,
  geometryEditingEnabled,
  addingWaypointMode,
  onDraggedPointChange,
  onMoveWaypoint,
  onAddWaypoint,
  aeronauticalPointFeatures,
  onAttachWaypoint,
  onAddAnchoredWaypoint,
  onMoveShapingPoint,
  onAttachShapingPoint,
  onSelectRoutePoint,
}: RoutePointMarkersProps) {
  const map = useMap();
  const sectorIndexByLegKey = new Map(
    buildRouteDisplayLegs(flightPlan, null, null).map((leg) => [
      routeLegKey(leg.fromWaypointId, leg.toWaypointId),
      leg.sectorIndex,
    ]),
  );
  const sectorIndicesByReportingPointAnchor = new Map<string, number[]>();
  flightPlan.legShapes.forEach((shape) => {
    const sectorIndex = sectorIndexByLegKey.get(
      routeLegKey(shape.fromWaypointId, shape.toWaypointId),
    ) ?? 0;
    shape.points.forEach((point) => {
      const anchorKey = reportingPointAnchorKey(point);
      if (anchorKey === null) return;

      const sectorIndices = sectorIndicesByReportingPointAnchor.get(anchorKey) ?? [];
      if (!sectorIndices.includes(sectorIndex)) {
        sectorIndices.push(sectorIndex);
        sectorIndicesByReportingPointAnchor.set(anchorKey, sectorIndices);
      }
    });
  });
  let currentSectorIndex = 0;
  const sectorIndexByWaypointId = new Map<string, number>();
  flightPlan.waypoints.forEach((waypoint, index) => {
    sectorIndexByWaypointId.set(waypoint.id, currentSectorIndex);
    if (
      index > 0 &&
      (flightPlan.sectorBoundaryWaypointIds ?? []).includes(waypoint.id)
    ) {
      currentSectorIndex += 1;
    }
  });

  return (
    <>
      {!showWaypoints ? null : flightPlan.waypoints.map((waypoint) => {
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
        const sourceShape: WaypointSourceShape =
          waypoint.anchor?.feature.featureKind === 'aerodrome'
            ? 'aerodrome'
            : waypoint.anchor?.feature.featureKind === 'reporting-point'
              ? 'reporting-point'
              : null;
        const sectorIndex = sectorIndexByWaypointId.get(waypoint.id) ?? 0;
        const sharedSectorIndices = [
          ...new Set(
            flightPlan.waypoints
              .filter(
                (candidate) =>
                  candidate.position.latitude === waypoint.position.latitude &&
                  candidate.position.longitude === waypoint.position.longitude,
              )
              .map(
                (candidate) => sectorIndexByWaypointId.get(candidate.id) ?? 0,
              ),
          ),
        ];

        return (
          <Marker
            key={`${waypoint.id}:${isAnchored ? 'anchored' : 'free'}:${waypoint.name}`}
            position={[displayPosition.latitude, displayPosition.longitude]}
            icon={waypointIcon(
              sourceShape,
              sharedSectorIndices.length === 0
                ? [sectorIndex]
                : sharedSectorIndices,
              isSelected,
            )}
            draggable={!isAnchored && geometryEditingEnabled}
            bubblingMouseEvents={false}
            zIndexOffset={500}
            title={`${waypoint.name}${isAnchored ? ' — anchored' : ''}`}
            alt={waypoint.name}
            eventHandlers={{
              click: () => {
                if (addingWaypointMode) {
                  const sourceFeature = anchoredWaypointSourceFeature(waypoint);
                  if (sourceFeature !== null) {
                    onAddAnchoredWaypoint(sourceFeature);
                  } else {
                    onAddWaypoint(waypoint.position);
                  }
                  return;
                }
                onSelectRoutePoint({ kind: 'waypoint', id: waypoint.id });
              },
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
                      const waypointTarget = findRouteWaypointSnapTarget(
                        position,
                        flightPlan.waypoints,
                        waypoint.id,
                        (candidatePosition) =>
                          map.latLngToContainerPoint([
                            candidatePosition.latitude,
                            candidatePosition.longitude,
                          ]),
                      );
                      if (waypointTarget !== null) {
                        const sourceFeature =
                          anchoredWaypointSourceFeature(waypointTarget);
                        if (sourceFeature === null) {
                          onMoveWaypoint(waypoint.id, waypointTarget.position);
                        } else {
                          onAttachWaypoint(waypoint.id, sourceFeature);
                        }
                        onDraggedPointChange(null);
                        return;
                      }
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
            {!showWaypointNames ? null : <Tooltip
              pane="tooltipPane"
              className="waypoint-label"
              direction="top"
              offset={[0, -14]}
              opacity={1}
              permanent
            >
              {waypoint.name}
              {isAnchored ? <span className="waypoint-label__anchor" role="img" aria-label="anchored"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="2.75" r="1.35" /><path d="M8 4.5v8.25M4.25 7.5h7.5M2.5 10.5c.45 2.1 2.35 3.75 5.5 3.75s5.05-1.65 5.5-3.75M2.5 10.5l1.7 1.35M2.5 10.5l.6-2.05M13.5 10.5l-1.7 1.35M13.5 10.5l-.6-2.05" /></svg></span> : null}
            </Tooltip>}
          </Marker>
        );
      })}

      {!showShapingPoints ? null : flightPlan.legShapes.flatMap((shape) =>
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
          const reportingPointAnchor = reportingPointAnchorKey(point);
          const sectorIndex =
            sectorIndexByLegKey.get(
              routeLegKey(shape.fromWaypointId, shape.toWaypointId),
            ) ?? 0;
          const sharedSectorIndices = reportingPointAnchor === null
            ? [sectorIndex]
            : sectorIndicesByReportingPointAnchor.get(reportingPointAnchor) ?? [sectorIndex];

          return (
            <Marker
              key={point.id}
              position={[displayPosition.latitude, displayPosition.longitude]}
              icon={shapingPointIcon(
                reportingPointAnchor !== null,
                sharedSectorIndices,
                isSelected,
              )}
              draggable={geometryEditingEnabled}
              bubblingMouseEvents={false}
              title={point.anchor !== undefined
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

      {!showShapingPoints || pendingShapingPoint === null ? null : (
        <Marker
          position={[
            pendingShapingPoint.point.position.latitude,
            pendingShapingPoint.point.position.longitude,
          ]}
          icon={shapingPointIcon(
            false,
            [
              sectorIndexByLegKey.get(
                routeLegKey(
                  pendingShapingPoint.fromWaypointId,
                  pendingShapingPoint.toWaypointId,
                ),
              ) ?? 0,
            ],
            true,
          )}
          interactive={false}
        />
      )}
    </>
  );
}
