import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Pane, Polygon, Tooltip, useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';

import type { Position } from '../../domain';
import { buildCirclingMeasurement } from './circlingMeasurement';

interface CircleCursorState {
  readonly center: Position;
  readonly edge: Position;
}

function toPosition(event: LeafletMouseEvent): Position {
  return { latitude: event.latlng.lat, longitude: event.latlng.lng };
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  // Sequential altitude, MSA and wind entry deliberately keeps a numeric
  // field focused while the map follows the selected leg. `g` cannot be a
  // valid numeric value, so allow the held measurement shortcut there while
  // continuing to protect normal text editing (notably waypoint naming).
  if (target instanceof HTMLInputElement && target.type === 'number') {
    return false;
  }

  return target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT';
}

/**
 * A transient, hold-to-measure map aid. Its state intentionally never leaves
 * this component, so it cannot affect the route or any planning calculation.
 */
export function CirclingMeasurement() {
  const pointerPosition = useRef<Position | null>(null);
  const pointerIsOverMap = useRef(false);
  const circling = useRef(false);
  const [cursorState, setCursorState] = useState<CircleCursorState | null>(null);
  const map = useMapEvents({
    mousemove(event) {
      const position = toPosition(event);
      pointerPosition.current = position;
      if (circling.current) {
        setCursorState((current) =>
          current === null ? null : { ...current, edge: position },
        );
      }
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    const clear = () => {
      circling.current = false;
      setCursorState(null);
    };
    const enter = () => { pointerIsOverMap.current = true; };
    const leave = () => {
      pointerIsOverMap.current = false;
      clear();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'g' ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTextEntryTarget(event.target) ||
        !pointerIsOverMap.current ||
        pointerPosition.current === null ||
        circling.current
      ) {
        return;
      }

      event.preventDefault();
      circling.current = true;
      setCursorState({
        center: pointerPosition.current,
        edge: pointerPosition.current,
      });
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'g') clear();
    };

    container.addEventListener('mouseenter', enter);
    container.addEventListener('mouseleave', leave);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clear);
    return () => {
      container.removeEventListener('mouseenter', enter);
      container.removeEventListener('mouseleave', leave);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
    };
  }, [map]);

  const measurement = useMemo(
    () => cursorState === null
      ? null
      : buildCirclingMeasurement(cursorState.center, cursorState.edge),
    [cursorState],
  );

  if (measurement === null) return null;

  return (
    <Pane name="circling-measurement" style={{ zIndex: 525 }}>
      <Polygon
        positions={measurement.ring.map(
          ({ latitude, longitude }) => [latitude, longitude] as [number, number],
        )}
        pathOptions={{
          color: '#176da5',
          weight: 2,
          opacity: 0.9,
          fillColor: '#3e73a7',
          fillOpacity: 0.12,
          dashArray: '5 4',
        }}
        interactive={false}
      />
      <CircleMarker
        center={[measurement.center.latitude, measurement.center.longitude]}
        radius={3}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#176da5', fillOpacity: 1 }}
        interactive={false}
      />
      <CircleMarker
        center={[measurement.edge.latitude, measurement.edge.longitude]}
        radius={3}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#176da5', fillOpacity: 1 }}
        interactive={false}
      >
        <Tooltip
          permanent
          direction="top"
          offset={[0, -5]}
          className="circling-measurement__label"
        >
          Radius {measurement.radiusNm.toFixed(1)} NM
        </Tooltip>
      </CircleMarker>
    </Pane>
  );
}
