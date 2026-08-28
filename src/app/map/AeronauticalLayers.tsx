import { divIcon, DomEvent } from 'leaflet';
import type { LatLngTuple, LeafletMouseEvent } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  Marker,
  Pane,
  Polygon,
  Popup,
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
import type { AeronauticalLayerVisibility } from './aeronauticalLayerConfig';

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
  onAnchorPoint: (feature: AeronauticalPointFeature) => void;
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

export function AeronauticalLayers({
  repository,
  visibility,
  onAnchorPoint,
  onDatasetChange,
  onStatusChange,
}: AeronauticalLayersProps) {
  const [features, setFeatures] = useState<readonly AeronauticalFeature[]>([]);
  const [viewport, setViewport] = useState(() => ({
    zoom: 0,
    bounds: { south: -90, west: -180, north: 90, east: 180 },
  }));
  const map = useMapEvents({
    moveend() {
      setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) });
    },
    zoomend() {
      setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) });
    },
  });

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
    () => getVisibleAeronauticalFeatureKinds(visibility, viewport.zoom),
    [visibility, viewport.zoom],
  );
  const featureKindKey = featureKinds.join('\u0000');

  useEffect(() => {
    const controller = new AbortController();

    if (featureKinds.length === 0) {
      setFeatures([]);
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
        onStatusChange('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setFeatures([]);
          onStatusChange('error');
        }
      });

    return () => controller.abort();
  }, [
    featureKindKey,
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

  return (
    <>
      <Pane name="aeronautical-airspace" style={{ zIndex: 350 }}>
        {areaFeatures.map((feature) => (
          <Polygon
            key={`${feature.ref.dataset.datasetId}:${feature.ref.featureId}`}
            positions={areaPositions(feature)}
            bubblingMouseEvents={false}
            pathOptions={{
              color: '#8a4f9f',
              fillColor: '#b783c7',
              fillOpacity: 0.09,
              opacity: 0.78,
              weight: 2,
            }}
            eventHandlers={{
              click: (event) => {
                stopMapClick(event);
                event.target.openPopup(event.latlng);
              },
            }}
          >
            <Tooltip sticky>{feature.name}</Tooltip>
            <Popup>
              <strong>{feature.name}</strong>
              <br />
              {feature.identifier ?? feature.areaKind}
              <br />
              Information only — not a waypoint anchor
            </Popup>
          </Polygon>
        ))}
      </Pane>

      <Pane name="aeronautical-points" style={{ zIndex: 450 }}>
        {pointFeatures.map((feature) => (
          <Marker
            key={`${feature.ref.dataset.datasetId}:${feature.ref.featureId}`}
            position={toLatLng(feature.position)}
            pane="aeronautical-points"
            icon={pointIconByKind[feature.pointKind]}
            bubblingMouseEvents={false}
            title={`${feature.identifier} — click to add anchored waypoint`}
            alt={feature.identifier}
            eventHandlers={{
              click: (event) => {
                stopMapClick(event);
                onAnchorPoint(feature);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              {feature.identifier}
              {feature.name === undefined ? '' : ` — ${feature.name}`}
            </Tooltip>
          </Marker>
        ))}
      </Pane>
    </>
  );
}
