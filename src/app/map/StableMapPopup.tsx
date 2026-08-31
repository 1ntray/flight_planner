import type { Popup as LeafletPopup } from 'leaflet';
import { useLayoutEffect, useRef } from 'react';
import { Popup, useMap } from 'react-leaflet';
import type { PopupProps } from 'react-leaflet';

import type { Position } from '../../domain';
import { calculatePopupCollisionPan } from './mapPopupAutoPanPadding';
import type { MapPopupAutoPanPadding, Rectangle } from './mapPopupAutoPanPadding';

export interface StableMapPopupProps extends Omit<PopupProps, 'position'> {
  position: Position;
}

const FALLBACK_AUTO_PAN_PADDING: MapPopupAutoPanPadding = {
  topLeft: [12, 12],
  bottomRight: [12, 12],
};

function rectangleFromElement(element: Element): Rectangle {
  const { top, right, bottom, left } = element.getBoundingClientRect();
  return { top, right, bottom, left };
}

export function StableMapPopup({
  position,
  ...popupProps
}: StableMapPopupProps) {
  const map = useMap();
  const popupRef = useRef<LeafletPopup | null>(null);
  const initialPositionRef = useRef<[number, number]>([
    position.latitude,
    position.longitude,
  ]);
  useLayoutEffect(() => {
    // React-Leaflet reopens a map-level Popup whenever its position prop gets a
    // new array identity. Keep that prop stable and move the existing Leaflet
    // instance directly so drag renders cannot make the popup flash.
    popupRef.current?.setLatLng([position.latitude, position.longitude]);
  }, [position.latitude, position.longitude]);

  useLayoutEffect(() => {
    const mapContainer = map.getContainer();
    const mapPanel = mapContainer.parentElement;
    if (mapPanel === null) return undefined;

    let collisionFrame = 0;
    const contentFrame = window.requestAnimationFrame(() => {
      // Aerodrome details and frequencies resolve asynchronously. Wait for a
      // second layout frame, then make one bounded collision correction. Do
      // not continuously measure or pan the popup as its layout changes.
      collisionFrame = window.requestAnimationFrame(() => {
        const popupElement = popupRef.current?.getElement();
        if (popupElement === undefined || popupElement === null) return;

        const protectedAreas = [
          ...mapPanel.querySelectorAll(
            '.map-tool-control, .map-layer-controls, .batch-entry-bar, .leaflet-control-container .leaflet-control',
          ),
        ].map(rectangleFromElement);
        const offset = calculatePopupCollisionPan(
          rectangleFromElement(mapContainer),
          rectangleFromElement(popupElement),
          protectedAreas,
        );
        if (offset !== null) {
          map.panBy([offset.x, offset.y], { animate: false });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(contentFrame);
      window.cancelAnimationFrame(collisionFrame);
    };
  }, [map, position.latitude, position.longitude]);

  return (
    <Popup
      {...popupProps}
      ref={popupRef}
      pane="popupPane"
      position={initialPositionRef.current}
      autoPanPaddingTopLeft={FALLBACK_AUTO_PAN_PADDING.topLeft}
      autoPanPaddingBottomRight={FALLBACK_AUTO_PAN_PADDING.bottomRight}
    />
  );
}
