import { useCallback, useState } from 'react';

import { getConfiguredAeronauticalRepository } from '../aeronautical';
import type {
  AeronauticalPointFeature,
  FlightPlan,
  Position,
  RouteShapingPoint,
} from '../domain';
import { FlightMap } from './map/FlightMap';
import type { SelectedRoutePoint } from './map/routeDisplay';
import {
  insertWaypointIntoFlightPlan,
} from './route/routeInsertion';
import type {
  RouteWaypointInsertionCandidate,
} from './route/routeInsertion';
import { NavigationLog } from './navigation/NavigationLog';
import {
  appendAnchoredWaypointToFlightPlan,
  appendWaypointToFlightPlan,
  detachWaypointInFlightPlan,
  insertRouteShapingPoint,
  moveRouteShapingPoint,
  moveWaypointInFlightPlan,
  removeRouteShapingPoint,
  removeWaypointFromFlightPlan,
} from './route/flightPlanState';

const aeronauticalRepository = getConfiguredAeronauticalRepository(
  window.location.search,
);

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

  const addAnchoredWaypoint = useCallback(
    (feature: AeronauticalPointFeature) => {
      const id = crypto.randomUUID();
      setFlightPlan((currentFlightPlan) =>
        appendAnchoredWaypointToFlightPlan(currentFlightPlan, feature, id),
      );
      setSelectedRoutePoint({ kind: 'waypoint', id });
    },
    [],
  );

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

  const insertWaypoint = useCallback(
    (candidate: RouteWaypointInsertionCandidate) => {
      const id = crypto.randomUUID();
      setFlightPlan((currentFlightPlan) =>
        insertWaypointIntoFlightPlan(currentFlightPlan, candidate, id),
      );
      setSelectedRoutePoint({ kind: 'waypoint', id });
    },
    [],
  );

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
  const selectedWaypoint =
    selectedRoutePoint?.kind === 'waypoint'
      ? flightPlan.waypoints.find(
          (waypoint) => waypoint.id === selectedRoutePoint.id,
        )
      : undefined;
  const detachSelectedWaypoint = () => {
    if (selectedWaypoint?.anchor === undefined) {
      return;
    }

    setFlightPlan((currentFlightPlan) =>
      detachWaypointInFlightPlan(currentFlightPlan, selectedWaypoint.id),
    );
  };
  const shapingPointCount = flightPlan.legShapes.reduce(
    (total, shape) => total + shape.points.length,
    0,
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MVP 0.8</p>
          <h1>Flight Planner</h1>
        </div>
        <p className="app-instructions">
          Click empty map to add a free waypoint. Click an aeronautical point
          to anchor it. Click a route line to insert a waypoint, or drag it to
          shape the leg.
        </p>
      </header>

      <div className="planner-workspace">
        <section className="map-panel" aria-label="Flight planning map">
          <FlightMap
            flightPlan={flightPlan}
            aeronauticalRepository={aeronauticalRepository}
            selectedRoutePoint={selectedRoutePoint}
            onAddWaypoint={addWaypoint}
            onAddAnchoredWaypoint={addAnchoredWaypoint}
            onMoveWaypoint={moveWaypoint}
            onAddShapingPoint={addShapingPoint}
            onMoveShapingPoint={moveShapingPoint}
            onInsertWaypoint={insertWaypoint}
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
              disabled={selectedWaypoint?.anchor === undefined}
              onClick={detachSelectedWaypoint}
            >
              Detach waypoint
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
