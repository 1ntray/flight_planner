import { useCallback, useState } from 'react';

import type { Position, Waypoint } from '../domain';
import { FlightMap } from './map/FlightMap';
import { RouteTable } from './route/RouteTable';
import {
  appendWaypoint,
  moveWaypointById,
  removeWaypointById,
} from './route/waypointState';

export function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    null,
  );

  const addWaypoint = useCallback((position: Position) => {
    const id = crypto.randomUUID();
    setWaypoints((currentWaypoints) =>
      appendWaypoint(currentWaypoints, position, id),
    );
  }, []);

  const moveWaypoint = useCallback((id: string, position: Position) => {
    setWaypoints((currentWaypoints) =>
      moveWaypointById(currentWaypoints, id, position),
    );
  }, []);

  const deleteSelectedWaypoint = () => {
    if (selectedWaypointId === null) {
      return;
    }

    setWaypoints((currentWaypoints) =>
      removeWaypointById(currentWaypoints, selectedWaypointId),
    );
    setSelectedWaypointId(null);
  };

  const clearRoute = () => {
    setWaypoints([]);
    setSelectedWaypointId(null);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MVP 0.1</p>
          <h1>Flight Planner</h1>
        </div>
        <p className="app-instructions">
          Click the map to add waypoints. Drag markers to adjust the route.
        </p>
      </header>

      <div className="planner-workspace">
        <section className="map-panel" aria-label="Flight planning map">
          <FlightMap
            waypoints={waypoints}
            selectedWaypointId={selectedWaypointId}
            onAddWaypoint={addWaypoint}
            onMoveWaypoint={moveWaypoint}
            onSelectWaypoint={setSelectedWaypointId}
          />
        </section>

        <aside className="route-panel" aria-labelledby="route-heading">
          <div className="route-panel__header">
            <div>
              <p className="eyebrow">Route</p>
              <h2 id="route-heading">Navigation log</h2>
            </div>
            <span className="waypoint-count">
              {waypoints.length} {waypoints.length === 1 ? 'waypoint' : 'waypoints'}
            </span>
          </div>

          <div className="route-controls">
            <button
              type="button"
              className="button button--danger"
              disabled={selectedWaypointId === null}
              onClick={deleteSelectedWaypoint}
            >
              Delete waypoint
            </button>
            <button
              type="button"
              className="button"
              disabled={waypoints.length === 0}
              onClick={clearRoute}
            >
              Clear route
            </button>
          </div>

          <RouteTable waypoints={waypoints} />
        </aside>
      </div>
    </main>
  );
}
