import { ROUTE_LAYER_DEFINITIONS } from './routeLayerConfig';
import type { RouteLayerId, RouteLayerVisibility } from './routeLayerConfig';

export interface RouteLayerControlProps {
  visibility: RouteLayerVisibility;
  onVisibilityChange: (layerId: RouteLayerId, visible: boolean) => void;
}

export function RouteLayerControl({
  visibility,
  onVisibilityChange,
}: RouteLayerControlProps) {
  return (
    <fieldset className="route-layer-control">
      <legend>Route layers</legend>
      <div className="route-layer-control__layer">
        <label>
          <input
            type="checkbox"
            checked={visibility.route}
            onChange={(event) =>
              onVisibilityChange('route', event.currentTarget.checked)
            }
          />
          <span>Route</span>
        </label>
        <div
          className="route-layer-control__subfilters"
          role="group"
          aria-label="Route layers"
        >
          {ROUTE_LAYER_DEFINITIONS.map((definition) => (
            <label key={definition.id}>
              <input
                type="checkbox"
                checked={visibility[definition.id]}
                disabled={!visibility.route}
                onChange={(event) =>
                  onVisibilityChange(
                    definition.id,
                    event.currentTarget.checked,
                  )
                }
              />
              <span>{definition.label}</span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
