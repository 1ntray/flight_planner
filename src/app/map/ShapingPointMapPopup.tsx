import type { RouteShapingPoint } from '../../domain';
import { StableMapPopup } from './StableMapPopup';

export interface ShapingPointMapPopupProps {
  point: RouteShapingPoint;
  onDelete: () => void;
  onDetach: () => void;
  onClose: () => void;
}

export function ShapingPointMapPopup({
  point,
  onDelete,
  onDetach,
  onClose,
}: ShapingPointMapPopupProps) {
  return (
    <StableMapPopup
      position={point.position}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="route-point-map-popup"
    >
      <p><strong>Route-shaping point</strong></p>
      <p>Changes distance and geometry without creating a navlog waypoint.</p>
      {point.anchor === undefined ? null : (
        <p>
          Attached to reporting point <strong>{point.anchor.publishedIdentifier}</strong>.
          Drag away or detach to make it free again.
        </p>
      )}
      <div className="map-popup-actions map-popup-actions--two">
        {point.anchor === undefined ? null : (
          <button type="button" className="button" onClick={onDetach}>
            Detach reporting point
          </button>
        )}
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
