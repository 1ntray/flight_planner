import { Popup } from 'react-leaflet';

import type { Position } from '../../domain';

export interface ShapingPointMapPopupProps {
  position: Position;
  onDelete: () => void;
  onClose: () => void;
}

export function ShapingPointMapPopup({
  position,
  onDelete,
  onClose,
}: ShapingPointMapPopupProps) {
  return (
    <Popup
      position={[position.latitude, position.longitude]}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="route-point-map-popup"
    >
      <p><strong>Route-shaping point</strong></p>
      <p>Changes distance and geometry without creating a navlog waypoint.</p>
      <div className="map-popup-actions map-popup-actions--two">
        <button
          type="button"
          className="button button--danger"
          aria-keyshortcuts="Delete"
          onClick={onDelete}
        >
          Delete
        </button>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Popup>
  );
}
