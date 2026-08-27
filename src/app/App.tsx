import { useCallback, useState } from 'react';

import type { FlightPlan, Position, RouteShapingPoint } from '../domain';
import { FlightMap } from './map/FlightMap';
import type { SelectedRoutePoint } from './map/FlightMap';
import { NavigationLog } from './navigation/NavigationLog';
import {
  appendWaypointToFlightPlan,
  insertRouteShapingPoint,
  moveRouteShapingPoint,
  moveWaypointInFlightPlan,
  removeRouteShapingPoint,
  removeWaypointFromFlightPlan,
} from './route/flightPlanState';

export function App() {
  const [flightPlan, setFlightPlan] = useState<FlightPlan>({
    waypoints: [],
    legShapes: [],
  });
  const [selectedRoutePoint, setSelectedRoutePoint] =
    useState<SelectedRoutePoint | null>(null);

  const addWaypoint = useCallback((position: Position) => {
    const id = crypto.randomUUID();
    setFlightPlan((currentFlightPlan) =>
      appendWaypointToFlightPlan(currentFlightPlan, position, id),
    );
  }, []);

  const moveWaypoint = useCallback((id: string, position: Position) => {
    setFlightPlan((currentFlightPlan) =>
      moveWaypointInFlightPlan(currentFlightPlan, id, position),
    );
  }, []);

  const addShapingPoint = useCallback(
    (
      fromWaypointId: string,
      toWaypointId: string,
      insertionIndex: number,
      point: RouteShapingPoint,
    ) => {
      setFlightPlan((currentFlightPlan) =>
        insertRouteShapingPoint(
          currentFlightPlan,
          fromWaypointId,
          toWaypointId,
          insertionIndex,
          point,
        ),
      );
    },
    [],
  );

  const moveShapingPoint = useCallback((id: string, position: Position) => {
    setFlightPlan((currentFlightPlan) =>
      moveRouteShapingPoint(currentFlightPlan, id, position),
    );
  }, []);

  const deleteSelectedRoutePoint = () => {
    if (selectedRoutePoint === null) {
      return;
    }

    setFlightPlan((currentFlightPlan) =>
      selectedRoutePoint.kind === 'waypoint'
        ? removeWaypointFromFlightPlan(
            currentFlightPlan,
            selectedRoutePoint.id,
          )
        : removeRouteShapingPoint(
            currentFlightPlan,
            selectedRoutePoint.id,
          ),
    );
    setSelectedRoutePoint(null);
  };

  const clearRoute = () => {
    setFlightPlan({ waypoints: [], legShapes: [] });
    setSelectedRoutePoint(null);
  };
  const shapingPointCount = flightPlan.legShapes.reduce(
    (total, shape) => total + shape.points.length,
    0,
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MVP 0.5</p>
          <h1>Flight Planner</h1>
        </div>
        <p className="app-instructions">
          Click the map to add waypoints. Drag the route line to shape a leg.
        </p>
      </header>

      <div className="planner-workspace">
        <section className="map-panel" aria-label="Flight planning map">
          <FlightMap
            flightPlan={flightPlan}
            selectedRoutePoint={selectedRoutePoint}
            onAddWaypoint={addWaypoint}
            onMoveWaypoint={moveWaypoint}
            onAddShapingPoint={addShapingPoint}
            onMoveShapingPoint={moveShapingPoint}
            onSelectRoutePoint={setSelectedRoutePoint}
          />
        </section>

        <aside className="route-panel" aria-labelledby="route-heading">
          <div className="route-panel__header">
            <div>
              <p className="eyebrow">Route</p>
              <h2 id="route-heading">Navigation log</h2>
            </div>
            <span className="waypoint-count">
              {flightPlan.waypoints.length}{' '}
              {flightPlan.waypoints.length === 1 ? 'waypoint' : 'waypoints'}
              {shapingPointCount === 0
                ? ''
                : ` · ${shapingPointCount} ${shapingPointCount === 1 ? 'shaping point' : 'shaping points'}`}
            </span>
          </div>

          <div className="route-controls">
            <button
              type="button"
              className="button button--danger"
              disabled={selectedRoutePoint === null}
              onClick={deleteSelectedRoutePoint}
            >
              {selectedRoutePoint?.kind === 'shaping-point'
                ? 'Delete shaping point'
                : 'Delete waypoint'}
            </button>
            <button
              type="button"
              className="button"
              disabled={flightPlan.waypoints.length === 0}
              onClick={clearRoute}
            >
              Clear route
            </button>
          </div>

          <NavigationLog flightPlan={flightPlan} />
        </aside>
      </div>
    </main>
  );
}
