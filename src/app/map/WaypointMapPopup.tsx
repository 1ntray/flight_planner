import { Popup } from 'react-leaflet';

import type { Waypoint } from '../../domain';
import { WaypointEditor } from '../route/WaypointEditor';

export interface WaypointMapPopupProps {
  waypoint: Waypoint;
  canBeSectorBoundary: boolean;
  isSectorBoundary: boolean;
  onRename: (id: string, name: string) => void;
  onDetach: (id: string) => void;
  onToggleSectorBoundary: (id: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function WaypointMapPopup({
  waypoint,
  canBeSectorBoundary,
  isSectorBoundary,
  onRename,
  onDetach,
  onToggleSectorBoundary,
  onDelete,
  onClose,
}: WaypointMapPopupProps) {
  return (
    <Popup
      position={[waypoint.position.latitude, waypoint.position.longitude]}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="waypoint-map-popup"
    >
      <WaypointEditor waypoint={waypoint} onRename={onRename} />
      <dl className="waypoint-map-popup__details">
        <div>
          <dt>Position</dt>
          <dd>
            {waypoint.position.latitude.toFixed(5)}, {waypoint.position.longitude.toFixed(5)}
          </dd>
        </div>
        {waypoint.anchor === undefined ? null : (
          <div>
            <dt>Source</dt>
            <dd>
              {waypoint.anchor.publishedIdentifier}
              {waypoint.anchor.publishedName === undefined
                ? ''
                : ` — ${waypoint.anchor.publishedName}`}
            </dd>
          </div>
        )}
      </dl>
      <div className="map-popup-actions">
        <button
          type="button"
          className={`button${isSectorBoundary ? ' button--active' : ''}`}
          disabled={!canBeSectorBoundary}
          aria-keyshortcuts="L"
          onClick={() => onToggleSectorBoundary(waypoint.id)}
        >
          {isSectorBoundary ? 'Remove landing' : 'Mark landing'}
        </button>
        <button
          type="button"
          className="button"
          disabled={waypoint.anchor === undefined}
          onClick={() => onDetach(waypoint.id)}
        >
          Detach
        </button>
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
