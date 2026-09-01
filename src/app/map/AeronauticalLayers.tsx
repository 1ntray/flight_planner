import { divIcon, DomEvent } from 'leaflet';
import type { LatLngTuple, LeafletMouseEvent } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Marker,
  Pane,
  Polygon,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';

import type { AeronauticalDataRepository } from '../../aeronautical';
import type {
  AeronauticalAreaFeature,
  AeronauticalDatasetRef,
  AeronauticalFeature,
  AeronauticalPointFeature,
  AeronauticalPointKind,
  Position,
  Wgs84Bounds,
} from '../../domain';
import {
  getVisibleAeronauticalFeatureKinds,
} from './aeronauticalLayerConfig';
import type {
  AeronauticalLayerVisibility,
  AirspaceCategoryVisibility,
} from './aeronauticalLayerConfig';
import { AirspacePopupContent } from './AirspacePopupContent';
import { BoundedLayerPopup } from './BoundedLayerPopup';
import { StableMapPopup } from './StableMapPopup';
import { airspacesAtPosition } from './airspacesAtPosition';

const pointIconByKind: Readonly<Record<AeronauticalPointKind, ReturnType<typeof divIcon>>> =
  {
    aerodrome: divIcon({
      className: 'aeronautical-feature-marker aeronautical-feature-marker--aerodrome',
      iconAnchor: [9, 9],
      iconSize: [18, 18],
    }),
    'reporting-point': divIcon({
      className:
        'aeronautical-feature-marker aeronautical-feature-marker--reporting-point',
      iconAnchor: [9, 9],
      iconSize: [18, 18],
    }),
    navaid: divIcon({
      className: 'aeronautical-feature-marker aeronautical-feature-marker--navaid',
      iconAnchor: [9, 9],
      iconSize: [18, 18],
    }),
    'designated-point': divIcon({
      className:
        'aeronautical-feature-marker aeronautical-feature-marker--designated-point',
      iconAnchor: [9, 9],
      iconSize: [18, 18],
    }),
  };

export type AeronauticalLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AeronauticalLayersProps {
  repository: AeronauticalDataRepository;
  visibility: AeronauticalLayerVisibility;
  airspaceCategoryVisibility: AirspaceCategoryVisibility;
  anchoringEnabled: boolean;
  onAddFreeWaypoint: (position: Position) => void;
  onAnchorPoint: (feature: AeronauticalPointFeature) => void;
  onSelectAerodromeInformation: (feature: AeronauticalPointFeature) => void;
  alternateAerodromeSelectionEnabled: boolean;
  onSelectAlternateAerodrome: (feature: AeronauticalPointFeature) => void;
  onPointFeaturesChange: (
    features: readonly AeronauticalPointFeature[],
  ) => void;
  onDatasetChange: (dataset: AeronauticalDatasetRef | null) => void;
  onStatusChange: (status: AeronauticalLoadStatus) => void;
}

function mapBounds(map: ReturnType<typeof useMapEvents>): Wgs84Bounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

function toLatLng(position: Position): LatLngTuple {
  return [position.latitude, position.longitude];
}

function areaPositions(feature: AeronauticalAreaFeature): LatLngTuple[][][] {
  return feature.polygons.map((polygon) => [
    polygon.outerRing.map(toLatLng),
    ...polygon.holes.map((ring) => ring.map(toLatLng)),
  ]);
}

function stopMapClick(event: LeafletMouseEvent): void {
  DomEvent.stopPropagation(event.originalEvent);
}

function pointerPosition(event: LeafletMouseEvent): Position {
  return { latitude: event.latlng.lat, longitude: event.latlng.lng };
}

function sameFeatureIds(
  left: readonly AeronauticalAreaFeature[],
  right: readonly AeronauticalAreaFeature[],
): boolean {
  return left.length === right.length && left.every(
    (feature, index) => feature.ref.featureId === right[index]?.ref.featureId,
  );
}

interface SelectedAirspaceStack {
  readonly selectionId: number;
  readonly position: Position;
  readonly features: readonly AeronauticalAreaFeature[];
}

export function AeronauticalLayers({
  repository,
  visibility,
  airspaceCategoryVisibility,
  anchoringEnabled,
  onAddFreeWaypoint,
  onAnchorPoint,
  onSelectAerodromeInformation,
  alternateAerodromeSelectionEnabled,
  onSelectAlternateAerodrome,
  onPointFeaturesChange,
  onDatasetChange,
  onStatusChange,
}: AeronauticalLayersProps) {
  const [features, setFeatures] = useState<readonly AeronauticalFeature[]>([]);
  const [hoveredAirspaces, setHoveredAirspaces] = useState<
    readonly AeronauticalAreaFeature[]
  >([]);
  const [selectedAirspaces, setSelectedAirspaces] =
    useState<SelectedAirspaceStack | null>(null);
  const nextAirspaceSelectionId = useRef(0);
  const [viewport, setViewport] = useState(() => ({
    zoom: 0,
    bounds: { south: -90, west: -180, north: 90, east: 180 },
  }));
  const map = useMapEvents({
    click() {
      setSelectedAirspaces(null);
    },
    moveend() {
      setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) });
    },
    zoomend() {
      setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) });
    },
  });

  useEffect(() => {
    if (selectedAirspaces === null) {
      return;
    }

    const closeAirspacePopupOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      // The global planner shortcut intentionally ignores keys from form
      // fields. Consume Escape here so a previously focused planning input
      // cannot prevent an open airspace popup from closing.
      event.preventDefault();
      event.stopPropagation();
      setSelectedAirspaces(null);
    };

    window.addEventListener('keydown', closeAirspacePopupOnEscape, true);
    return () => window.removeEventListener(
      'keydown',
      closeAirspacePopupOnEscape,
      true,
    );
  }, [selectedAirspaces]);

  useEffect(() => {
    setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) });
  }, [map]);

  useEffect(() => {
    const controller = new AbortController();

    repository
      .getDatasetMetadata({ signal: controller.signal })
      .then(onDatasetChange)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          onDatasetChange(null);
          onStatusChange('error');
        }
      });

    return () => controller.abort();
  }, [onDatasetChange, onStatusChange, repository]);

  const featureKinds = useMemo(
    () => getVisibleAeronauticalFeatureKinds(
      visibility,
      airspaceCategoryVisibility,
      viewport.zoom,
    ),
    [airspaceCategoryVisibility, visibility, viewport.zoom],
  );
  const featureKindKey = featureKinds.join('\u0000');

  useEffect(() => {
    const controller = new AbortController();

    if (featureKinds.length === 0) {
      setFeatures([]);
      onPointFeaturesChange([]);
      onStatusChange('ready');
      return () => controller.abort();
    }

    onStatusChange('loading');
    repository
      .queryFeatures(
        { bounds: viewport.bounds, featureKinds },
        { signal: controller.signal },
      )
      .then((result) => {
        setFeatures(result);
        onPointFeaturesChange(
          result.filter(
            (feature): feature is AeronauticalPointFeature =>
              feature.geometryType === 'point',
          ),
        );
        onStatusChange('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setFeatures([]);
          onPointFeaturesChange([]);
          onStatusChange('error');
        }
      });

    return () => controller.abort();
  }, [
    featureKindKey,
    onPointFeaturesChange,
    onStatusChange,
    repository,
    viewport.bounds,
  ]);

  const pointFeatures = features.filter(
    (feature): feature is AeronauticalPointFeature =>
      feature.geometryType === 'point',
  );
  const areaFeatures = features.filter(
    (feature): feature is AeronauticalAreaFeature =>
      feature.geometryType === 'area',
  );

  const updateHoveredAirspaces = (event: LeafletMouseEvent): void => {
    const next = airspacesAtPosition(areaFeatures, pointerPosition(event));
    setHoveredAirspaces((current) => sameFeatureIds(current, next) ? current : next);
  };

  return (
    <>
      <Pane name="aeronautical-airspace" style={{ zIndex: 350 }}>
        {areaFeatures.map((feature) => (
          <Polygon
            key={`${feature.ref.dataset.datasetId}:${feature.ref.featureId}`}
            positions={areaPositions(feature)}
            bubblingMouseEvents={false}
            pathOptions={{
              className: 'aeronautical-airspace-path',
              color: '#8a4f9f',
              fillColor: '#b783c7',
              fillOpacity: 0.09,
              opacity: 0.78,
              weight: 2,
            }}
            eventHandlers={{
              mouseover: updateHoveredAirspaces,
              mousemove: updateHoveredAirspaces,
              mouseout: () => setHoveredAirspaces([]),
              click: (event) => {
                stopMapClick(event);
                const position = pointerPosition(event);
                if (anchoringEnabled) {
                  // Area overlays are information-only. In Add waypoint mode,
                  // their polygon must not intercept an otherwise ordinary map
                  // click; it creates one free waypoint at the clicked WGS84
                  // position rather than opening an airspace popup.
                  setSelectedAirspaces(null);
                  onAddFreeWaypoint(position);
                  return;
                }
                const stack = airspacesAtPosition(areaFeatures, position);
                nextAirspaceSelectionId.current += 1;
                setSelectedAirspaces({
                  selectionId: nextAirspaceSelectionId.current,
                  position,
                  features: stack.length === 0 ? [feature] : stack,
                });
              },
            }}
          >
            <Tooltip pane="tooltipPane" sticky>
              {(hoveredAirspaces.length === 0 ? [feature] : hoveredAirspaces).map(
                (hoveredFeature, index, stack) => (
                  <span key={hoveredFeature.ref.featureId}>
                    {hoveredFeature.name}
                    {index === stack.length - 1 ? null : <br />}
                  </span>
                ),
              )}
            </Tooltip>
          </Polygon>
        ))}
      </Pane>

      {selectedAirspaces === null ? null : (
        <StableMapPopup
          key={selectedAirspaces.selectionId}
          position={selectedAirspaces.position}
          eventHandlers={{
            remove: () => {
              // Replacing one airspace popup removes the previous Leaflet
              // instance. Ignore that stale event if a newer selection has
              // already been committed.
              setSelectedAirspaces((current) =>
                current?.selectionId === selectedAirspaces.selectionId
                  ? null
                  : current,
              );
            },
          }}
        >
          <div className="airspace-stack-popup">
            {selectedAirspaces.features.map((feature) => (
              <AirspacePopupContent
                key={feature.ref.featureId}
                feature={feature}
                repository={repository}
                position={selectedAirspaces.position}
              />
            ))}
          </div>
        </StableMapPopup>
      )}

      <Pane
        name="aeronautical-points"
        style={{ zIndex: anchoringEnabled ? 700 : 450 }}
      >
        {pointFeatures.map((feature) => (
          <Marker
            key={`${feature.ref.dataset.datasetId}:${feature.ref.featureId}`}
            position={toLatLng(feature.position)}
            pane="aeronautical-points"
            icon={pointIconByKind[feature.pointKind]}
            bubblingMouseEvents={false}
            title={`${feature.identifier} — ${alternateAerodromeSelectionEnabled && feature.pointKind === 'aerodrome' ? 'click to choose alternate' : anchoringEnabled ? 'click to add anchored waypoint' : 'aeronautical feature'}`}
            alt={feature.identifier}
            eventHandlers={{
              click: (event) => {
                stopMapClick(event);
                if (
                  alternateAerodromeSelectionEnabled &&
                  feature.pointKind === 'aerodrome'
                ) {
                  onSelectAlternateAerodrome(feature);
                } else if (anchoringEnabled) {
                  onAnchorPoint(feature);
                } else if (feature.pointKind === 'aerodrome') {
                  onSelectAerodromeInformation(feature);
                } else {
                  event.target.openPopup();
                }
              },
            }}
          >
            <Tooltip pane="tooltipPane" direction="top" offset={[0, -10]}>
              {feature.identifier}
              {feature.name === undefined ? '' : ` — ${feature.name}`}
            </Tooltip>
            {feature.pointKind === 'aerodrome' ||
            feature.pointKind === 'reporting-point' ||
            anchoringEnabled ? null : (
              <BoundedLayerPopup pane="popupPane">
                <strong>{feature.identifier}</strong>
                {feature.name === undefined ? null : <><br />{feature.name}</>}
                <br />
                {alternateAerodromeSelectionEnabled
                  ? 'Choose an aerodrome as the alternate in this mode'
                  : 'Switch to Add waypoint mode to use this feature'}
              </BoundedLayerPopup>
            )}
          </Marker>
        ))}
      </Pane>
    </>
  );
}
