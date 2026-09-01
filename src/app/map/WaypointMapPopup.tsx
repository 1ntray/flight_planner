import { DomEvent } from 'leaflet';

import type { Position, Waypoint } from '../../domain';
import { WaypointEditor } from '../route/WaypointEditor';
import { StableMapPopup } from './StableMapPopup';
import type {
  SharedPositionWaypointUse,
  WaypointSectorContext,
} from './waypointSelection';

export interface WaypointMapPopupProps {
  waypoint: Waypoint;
  position: Position;
  nameFocusRequest: number;
  canBeSectorBoundary: boolean;
  isSectorBoundary: boolean;
  sharedPositionUses: readonly SharedPositionWaypointUse[];
  sharedPositionUseIndex: number;
  sectorContexts: readonly WaypointSectorContext[];
  onRename: (id: string, name: string) => void;
  onDetach: (id: string) => void;
  onShowSourceAerodrome: (waypoint: Waypoint) => void;
  onToggleSectorBoundary: (id: string) => void;
  onSelectSharedPositionUse: (id: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function WaypointMapPopup({
  waypoint,
  position,
  nameFocusRequest,
  canBeSectorBoundary,
  isSectorBoundary,
  sharedPositionUses,
  sharedPositionUseIndex,
  sectorContexts,
  onRename,
  onDetach,
  onShowSourceAerodrome,
  onToggleSectorBoundary,
  onSelectSharedPositionUse,
  onDelete,
  onClose,
}: WaypointMapPopupProps) {
  return (
    <StableMapPopup
      position={position}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="waypoint-map-popup"
    >
      <WaypointEditor
        waypoint={waypoint}
        nameFocusRequest={nameFocusRequest}
        onRename={onRename}
      />
      {sharedPositionUses.length <= 1 ? null : (
        <div
          className="waypoint-map-popup__use-pager"
          aria-label="Waypoint uses at this position"
        >
          <button
            type="button"
            className="button"
            aria-label="Previous use at this position"
            onClick={() =>
              onSelectSharedPositionUse(
                sharedPositionUses[
                  (sharedPositionUseIndex - 1 + sharedPositionUses.length) %
                    sharedPositionUses.length
                ]!.id,
              )
            }
          >
            ‹
          </button>
          <span>
            Use {sharedPositionUseIndex + 1} of {sharedPositionUses.length}
          </span>
          <button
            type="button"
            className="button"
            aria-label="Next use at this position"
            onClick={() =>
              onSelectSharedPositionUse(
                sharedPositionUses[
                  (sharedPositionUseIndex + 1) % sharedPositionUses.length
                ]!.id,
              )
            }
          >
            ›
          </button>
        </div>
      )}
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
        {sectorContexts.length === 0 ? null : (
          <div>
            <dt>{sectorContexts.length === 1 ? 'Sector' : 'Sectors'}</dt>
            <dd className="waypoint-map-popup__sector-contexts">
              {sectorContexts.map((context) => (
                <span key={context.sectorIndex}>
                  {context.departureName} → {context.destinationName}
                  {' · '}{context.role}
                </span>
              ))}
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
          {isSectorBoundary ? 'Remove landing' : 'Mark landing'} <kbd>L</kbd>
        </button>
        <button
          type="button"
          className="button"
          disabled={waypoint.anchor === undefined}
          onClick={() => onDetach(waypoint.id)}
        >
          Detach
        </button>
        {waypoint.anchor?.feature.featureKind !== 'aerodrome' ? null : (
          <button
            type="button"
            className="button"
            onClick={(event) => {
              // The popup sits inside the Leaflet map. Without stopping this
              // native event, the map's Select-mode click handler immediately
              // clears the information popup opened below.
              DomEvent.stop(event.nativeEvent);
              onShowSourceAerodrome(waypoint);
            }}
          >
            Aerodrome info
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
