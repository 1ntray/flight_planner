import type { Popup as LeafletPopup, PopupEvent } from 'leaflet';
import { useEffect, useRef } from 'react';
import { Popup, useMap } from 'react-leaflet';
import type { PopupProps } from 'react-leaflet';

import { calculatePopupCollisionPan } from './mapPopupAutoPanPadding';
import type { Rectangle } from './mapPopupAutoPanPadding';

function rectangleFromElement(element: Element): Rectangle {
  const { top, right, bottom, left } = element.getBoundingClientRect();
  return { top, right, bottom, left };
}

/**
 * A layer-bound popup with one-shot, bounded viewport placement.
 *
 * React-Leaflet updates an open popup whenever its children rerender. Leaving
 * Leaflet auto-pan enabled can therefore create a popup update -> map moveend
 * -> React render loop at a map edge. Placement here is deliberately finite.
 */
export function BoundedLayerPopup(popupProps: PopupProps) {
  const map = useMap();
  const popupRef = useRef<LeafletPopup | null>(null);

  useEffect(() => {
    let contentFrame = 0;
    let collisionFrame = 0;

    const cancelPlacement = () => {
      window.cancelAnimationFrame(contentFrame);
      window.cancelAnimationFrame(collisionFrame);
    };
    const placePopup = () => {
      cancelPlacement();
      contentFrame = window.requestAnimationFrame(() => {
        collisionFrame = window.requestAnimationFrame(() => {
          const popupElement = popupRef.current?.getElement();
          const mapContainer = map.getContainer();
          const mapPanel = mapContainer.parentElement;
          if (
            popupElement === undefined ||
            popupElement === null ||
            mapPanel === null
          ) {
            return;
          }

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
    };
    const onPopupOpen = (event: PopupEvent) => {
      if (event.popup === popupRef.current) {
        placePopup();
      }
    };

    map.on('popupopen', onPopupOpen);
    return () => {
      map.off('popupopen', onPopupOpen);
      cancelPlacement();
    };
  }, [map]);

  return (
    <Popup
      {...popupProps}
      ref={popupRef}
      pane={popupProps.pane ?? 'popupPane'}
      autoPan={false}
    />
  );
}
