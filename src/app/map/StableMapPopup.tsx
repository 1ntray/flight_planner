import type { Popup as LeafletPopup } from 'leaflet';
import { useLayoutEffect, useRef } from 'react';
import { Popup } from 'react-leaflet';
import type { PopupProps } from 'react-leaflet';

import type { Position } from '../../domain';

export interface StableMapPopupProps extends Omit<PopupProps, 'position'> {
  position: Position;
}

export function StableMapPopup({
  position,
  ...popupProps
}: StableMapPopupProps) {
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

  return (
    <Popup
      {...popupProps}
      ref={popupRef}
      position={initialPositionRef.current}
    />
  );
}
