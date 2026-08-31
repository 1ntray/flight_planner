import { useEffect, useState } from 'react';
import { Pane, TileLayer, useMapEvents } from 'react-leaflet';
import type { AeronauticalDataRepository } from '../../aeronautical';
import { validateVacChartManifest } from '../../aeronautical';
import type { VacChartManifest, Wgs84Bounds } from '../../domain';

export interface VacChartLayersProps {
  repository: AeronauticalDataRepository;
  visible: boolean;
  opacity: number;
}

function mapBounds(map: ReturnType<typeof useMapEvents>): Wgs84Bounds {
  const bounds = map.getBounds();
  return { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() };
}

/** Renders only offline-prepared Web Mercator VAC tiles near the current viewport. */
export function VacChartLayers({ repository, visible, opacity }: VacChartLayersProps) {
  const [viewport, setViewport] = useState<{ zoom: number; bounds: Wgs84Bounds }>(() => ({
    zoom: 0, bounds: { south: -90, west: -180, north: 90, east: 180 },
  }));
  const [charts, setCharts] = useState<readonly VacChartManifest[]>([]);
  const map = useMapEvents({
    moveend: () => setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) }),
    zoomend: () => setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) }),
  });

  useEffect(() => {
    setViewport({ zoom: map.getZoom(), bounds: mapBounds(map) });
  }, [map]);

  useEffect(() => {
    const controller = new AbortController();
    if (!visible) {
      setCharts([]);
      return () => controller.abort();
    }
    void repository.queryVacCharts({ bounds: viewport.bounds }, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setCharts(result.filter((chart) => viewport.zoom >= chart.minimumZoom && validateVacChartManifest(chart).length === 0));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCharts([]);
      });
    return () => controller.abort();
  }, [repository, visible, viewport]);

  if (!visible || charts.length === 0) return null;
  return (
    <Pane name="vac-charts" style={{ zIndex: 325 }}>
      {charts.map((chart) => (
        <TileLayer
          key={chart.id}
          pane="vac-charts"
          url={chart.tileUrlTemplate}
          minZoom={chart.minimumZoom}
          maxNativeZoom={chart.maximumZoom}
          maxZoom={18}
          opacity={opacity}
          bounds={[[chart.bounds.south, chart.bounds.west], [chart.bounds.north, chart.bounds.east]]}
          attribution="© Avinor"
        />
      ))}
    </Pane>
  );
}
