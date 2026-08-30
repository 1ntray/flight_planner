import type { Position } from '../../domain';
import { StableMapPopup } from './StableMapPopup';

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
    <StableMapPopup
      position={position}
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
          Delete <kbd>Del</kbd>
        </button>
        <button type="button" className="button" aria-keyshortcuts="Escape" onClick={onClose}>
          Close <kbd>Esc</kbd>
        </button>
      </div>
    </StableMapPopup>
  );
}
