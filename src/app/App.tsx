import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getConfiguredAeronauticalRepository } from '../aeronautical';
import type {
  AeronauticalPointFeature,
  AircraftDefinition,
  FlightPlan,
  FlightPlanningDocument,
  Position,
  RouteShapingPoint,
} from '../domain';
import {
  FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
  PROJECT_AIRCRAFT_DEFINITION,
} from '../domain';
import {
  clearLocalDraft,
  loadLocalDraft,
  saveLocalDraft,
  serializeFlightPlanningDocument,
} from '../persistence';
import type { LocalDraftStorage } from '../persistence';
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
  createDefaultNavigationInputDraft,
  createNavigationInputDraft,
  parseNavigationInputDraft,
} from './navigation/navigationInput';
import type { NavigationInputDraft } from './navigation/navigationInput';
import {
  createEmptyPerformanceInputDraft,
  createPerformanceInputDraft,
  parsePerformanceInputDraft,
} from './navigation/performanceInput';
import type { PerformanceInputDraft } from './navigation/performanceInput';
import {
  removeAltitudePlansTouchingWaypoint,
  setLegAltitudeTargetDistance,
  splitLegAltitudePlanForWaypointInsertion,
} from './navigation/altitudePlanState';
import type { AltitudePlacementLeg } from './navigation/altitudePlanState';
import { usePlanningCalculations } from './navigation/usePlanningCalculations';
import { FlightPlanFileControls } from './persistence/FlightPlanFileControls';
import type { LocalDraftStatus } from './persistence/FlightPlanFileControls';
import {
  appendAnchoredWaypointToFlightPlan,
  appendWaypointToFlightPlan,
  detachWaypointInFlightPlan,
  insertRouteShapingPoint,
  moveRouteShapingPoint,
  moveWaypointInFlightPlan,
  renameWaypointInFlightPlan,
  removeRouteShapingPoint,
  removeWaypointFromFlightPlan,
} from './route/flightPlanState';
import { WaypointEditor } from './route/WaypointEditor';

const aeronauticalRepository = getConfiguredAeronauticalRepository(
  window.location.search,
);

const LOCAL_DRAFT_SAVE_DELAY_MS = 600;
const browserLocalDraftStorage: LocalDraftStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

interface PlanningState {
  flightPlan: FlightPlan;
  aircraftDefinition: AircraftDefinition;
  navigationInputDraft: NavigationInputDraft;
  performanceInputDraft: PerformanceInputDraft;
  useForecastWinds: boolean;
  document: FlightPlanningDocument;
}

interface InitialPlanningState extends PlanningState {
  localDraftStatus: LocalDraftStatus;
  restoredFromLocalDraft: boolean;
}

function createFreshPlanningState(nowUtcMs = Date.now()): PlanningState {
  const flightPlan: FlightPlan = { waypoints: [], legShapes: [] };
  const navigationInputDraft = createDefaultNavigationInputDraft(nowUtcMs);
  const performanceInputDraft = createEmptyPerformanceInputDraft();
  const parsedPlanningInputs = parseNavigationInputDraft(
    navigationInputDraft,
  );

  if (parsedPlanningInputs.status !== 'valid') {
    throw new Error('Default navigation inputs must be valid');
  }

  return {
    flightPlan,
    aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
    navigationInputDraft,
    performanceInputDraft,
    useForecastWinds: false,
    document: {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: parsedPlanningInputs.value,
      aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
      performanceInputs: null,
      useForecastWinds: false,
    },
  };
}

function createInitialPlanningState(): InitialPlanningState {
  const result = loadLocalDraft(browserLocalDraftStorage);

  if (result.status === 'loaded') {
    return {
      flightPlan: result.document.flightPlan,
      aircraftDefinition: result.document.aircraftDefinition,
      navigationInputDraft: createNavigationInputDraft(
        result.document.planningInputs,
      ),
      performanceInputDraft:
        result.document.performanceInputs === null
          ? createEmptyPerformanceInputDraft()
          : createPerformanceInputDraft(result.document.performanceInputs),
      useForecastWinds: result.document.useForecastWinds,
      document: result.document,
      restoredFromLocalDraft: true,
      localDraftStatus: {
        kind: 'success',
        message: 'Restored the local working draft.',
      },
    };
  }

  const freshState = createFreshPlanningState();

  return {
    ...freshState,
    restoredFromLocalDraft: false,
    localDraftStatus:
      result.status === 'error'
        ? {
            kind: 'error',
            message: `${result.message}. The stored data was left unchanged.`,
          }
        : {
            kind: 'neutral',
            message: 'Changes will be saved locally.',
          },
  };
}

const initialPlanningState = createInitialPlanningState();

export function App() {
  const [flightPlan, setFlightPlan] = useState<FlightPlan>(
    initialPlanningState.flightPlan,
  );
  const [aircraftDefinition, setAircraftDefinition] =
    useState<AircraftDefinition>(initialPlanningState.aircraftDefinition);
  const [selectedRoutePoint, setSelectedRoutePoint] =
    useState<SelectedRoutePoint | null>(null);
  const [navigationInputDraft, setNavigationInputDraft] =
    useState<NavigationInputDraft>(
      initialPlanningState.navigationInputDraft,
    );
  const [useForecastWinds, setUseForecastWinds] = useState(
    initialPlanningState.useForecastWinds,
  );
  const [performanceInputDraft, setPerformanceInputDraft] =
    useState<PerformanceInputDraft>(
      initialPlanningState.performanceInputDraft,
    );
  const [altitudePlacementLeg, setAltitudePlacementLeg] =
    useState<AltitudePlacementLeg | null>(null);
  const [localDraftStatus, setLocalDraftStatus] =
    useState<LocalDraftStatus>(initialPlanningState.localDraftStatus);
  const lastSavedDocumentJsonRef = useRef<string | null>(
    initialPlanningState.restoredFromLocalDraft
      ? serializeFlightPlanningDocument(initialPlanningState.document)
      : null,
  );
  const untouchedFreshDocumentJsonRef = useRef<string | null>(
    initialPlanningState.restoredFromLocalDraft
      ? null
      : serializeFlightPlanningDocument(initialPlanningState.document),
  );
  const parsedPlanningInputs = useMemo(
    () => parseNavigationInputDraft(navigationInputDraft),
    [navigationInputDraft],
  );
  const parsedPerformanceInputs = useMemo(
    () => parsePerformanceInputDraft(performanceInputDraft),
    [performanceInputDraft],
  );
  const calculations = usePlanningCalculations({
    flightPlan,
    aircraftDefinition,
    navigationDraft: navigationInputDraft,
    performanceDraft: performanceInputDraft,
    useForecastWinds,
  });
  const planningDocument = useMemo<FlightPlanningDocument | null>(
    () =>
      parsedPlanningInputs.status === 'valid' &&
      parsedPerformanceInputs.status !== 'invalid'
        ? {
            schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
            flightPlan,
            planningInputs: parsedPlanningInputs.value,
            aircraftDefinition,
            performanceInputs:
              parsedPerformanceInputs.status === 'valid'
                ? parsedPerformanceInputs.value
                : null,
            useForecastWinds,
          }
        : null,
    [
      flightPlan,
      aircraftDefinition,
      parsedPerformanceInputs,
      parsedPlanningInputs,
      useForecastWinds,
    ],
  );

  useEffect(() => {
    if (planningDocument === null) {
      setLocalDraftStatus({
        kind: 'neutral',
        message:
          lastSavedDocumentJsonRef.current === null
            ? 'Current invalid inputs are not saved.'
            : 'Current invalid edit is not saved; the last valid draft is retained.',
      });
      return undefined;
    }

    const documentJson = serializeFlightPlanningDocument(planningDocument);

    if (
      documentJson === lastSavedDocumentJsonRef.current ||
      documentJson === untouchedFreshDocumentJsonRef.current
    ) {
      return undefined;
    }

    setLocalDraftStatus({ kind: 'neutral', message: 'Saving locally…' });

    const timeoutId = window.setTimeout(() => {
      const result = saveLocalDraft(
        browserLocalDraftStorage,
        planningDocument,
      );

      if (result.status === 'success') {
        lastSavedDocumentJsonRef.current = documentJson;
        untouchedFreshDocumentJsonRef.current = null;
        setLocalDraftStatus({
          kind: 'success',
          message: 'Saved locally.',
        });
      } else {
        setLocalDraftStatus({ kind: 'error', message: result.message });
      }
    }, LOCAL_DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [planningDocument]);

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

  const renameWaypoint = useCallback((id: string, name: string) => {
    setFlightPlan((currentFlightPlan) =>
      renameWaypointInFlightPlan(currentFlightPlan, id, name),
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
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: splitLegAltitudePlanForWaypointInsertion(
          currentDraft.legAltitudePlans,
          flightPlan,
          candidate,
          id,
        ),
      }));
      setFlightPlan(insertWaypointIntoFlightPlan(flightPlan, candidate, id));
      setSelectedRoutePoint({ kind: 'waypoint', id });
      setAltitudePlacementLeg(null);
    },
    [flightPlan],
  );

  const deleteSelectedRoutePoint = () => {
    if (selectedRoutePoint === null) {
      return;
    }

    if (
      selectedRoutePoint.kind === 'waypoint' &&
      performanceInputDraft.legAltitudePlans.some(
        (plan) =>
          plan.fromWaypointId === selectedRoutePoint.id ||
          plan.toWaypointId === selectedRoutePoint.id,
      ) &&
      !window.confirm(
        'Deleting this waypoint will also remove its adjacent leg altitude settings. Continue?',
      )
    ) {
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
    if (selectedRoutePoint.kind === 'waypoint') {
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: removeAltitudePlansTouchingWaypoint(
          currentDraft.legAltitudePlans,
          selectedRoutePoint.id,
        ),
      }));
    }
    setSelectedRoutePoint(null);
    setAltitudePlacementLeg(null);
  };

  const clearRoute = () => {
    setFlightPlan({ waypoints: [], legShapes: [] });
    setPerformanceInputDraft((currentDraft) => ({
      ...currentDraft,
      legAltitudePlans: [],
    }));
    setSelectedRoutePoint(null);
    setAltitudePlacementLeg(null);
  };
  const startNewPlan = useCallback(() => {
    const freshState = createFreshPlanningState();
    const freshDocumentJson = serializeFlightPlanningDocument(
      freshState.document,
    );
    const clearResult = clearLocalDraft(browserLocalDraftStorage);

    lastSavedDocumentJsonRef.current = null;
    untouchedFreshDocumentJsonRef.current = freshDocumentJson;
    setFlightPlan(freshState.flightPlan);
    setAircraftDefinition(freshState.aircraftDefinition);
    setNavigationInputDraft(freshState.navigationInputDraft);
    setPerformanceInputDraft(freshState.performanceInputDraft);
    setUseForecastWinds(freshState.useForecastWinds);
    setSelectedRoutePoint(null);
    setAltitudePlacementLeg(null);
    setLocalDraftStatus(
      clearResult.status === 'success'
        ? {
            kind: 'success',
            message: 'New plan started; the local draft was removed.',
          }
        : {
            kind: 'error',
            message: `New plan started, but ${clearResult.message}.`,
          },
    );
  }, []);
  const importPlanningDocument = useCallback(
    (document: FlightPlanningDocument) => {
      setFlightPlan(document.flightPlan);
      setAircraftDefinition(document.aircraftDefinition);
      setNavigationInputDraft(
        createNavigationInputDraft(document.planningInputs),
      );
      setPerformanceInputDraft(
        document.performanceInputs === null
          ? createEmptyPerformanceInputDraft()
          : createPerformanceInputDraft(document.performanceInputs),
      );
      setUseForecastWinds(document.useForecastWinds);
      setSelectedRoutePoint(null);
      setAltitudePlacementLeg(null);
    },
    [],
  );
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
  const setAltitudeTarget = useCallback(
    (
      fromWaypointId: string,
      toWaypointId: string,
      distanceFromStartNm: number,
    ) => {
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: setLegAltitudeTargetDistance(
          currentDraft.legAltitudePlans,
          fromWaypointId,
          toWaypointId,
          distanceFromStartNm,
        ),
      }));
      setAltitudePlacementLeg(null);
    },
    [],
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MVP 0.13</p>
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
            altitudePlans={performanceInputDraft.legAltitudePlans}
            altitudePlacementLeg={altitudePlacementLeg}
            performanceRoute={calculations.performanceRoute}
            onAddWaypoint={addWaypoint}
            onAddAnchoredWaypoint={addAnchoredWaypoint}
            onMoveWaypoint={moveWaypoint}
            onAddShapingPoint={addShapingPoint}
            onMoveShapingPoint={moveShapingPoint}
            onInsertWaypoint={insertWaypoint}
            onSelectRoutePoint={setSelectedRoutePoint}
            onSetAltitudeTarget={setAltitudeTarget}
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

          <FlightPlanFileControls
            document={planningDocument}
            localDraftStatus={localDraftStatus}
            onImport={importPlanningDocument}
            onNewPlan={startNewPlan}
          />

          {selectedWaypoint === undefined ? null : (
            <WaypointEditor
              waypoint={selectedWaypoint}
              onRename={renameWaypoint}
            />
          )}

          <NavigationLog
            flightPlan={flightPlan}
            aircraftDefinition={aircraftDefinition}
            draft={navigationInputDraft}
            performanceDraft={performanceInputDraft}
            useForecastWinds={useForecastWinds}
            onDraftChange={setNavigationInputDraft}
            onAircraftDefinitionChange={setAircraftDefinition}
            onPerformanceDraftChange={setPerformanceInputDraft}
            onUseForecastWindsChange={setUseForecastWinds}
            altitudePlacementLeg={altitudePlacementLeg}
            onAltitudePlacementLegChange={setAltitudePlacementLeg}
            calculations={calculations}
          />
        </aside>
      </div>
    </main>
  );
}
