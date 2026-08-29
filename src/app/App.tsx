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
import { calculateInitialTakeoffLoading } from '../calculations';
import {
  clearLocalDraft,
  loadLocalDraft,
  saveLocalDraft,
  serializeFlightPlanningDocument,
} from '../persistence';
import type { LocalDraftStorage } from '../persistence';
import { FlightMap } from './map/FlightMap';
import type {
  MapSelection,
  MapTool,
  SelectedRoutePoint,
} from './map/routeDisplay';
import {
  insertWaypointIntoFlightPlan,
} from './route/routeInsertion';
import type {
  RouteWaypointInsertionCandidate,
} from './route/routeInsertion';
import type { NavigationLogProps } from './navigation/NavigationLog';
import {
  createDefaultNavigationInputDraft,
  createNavigationInputDraft,
  parseNavigationInputDraft,
} from './navigation/navigationInput';
import type { NavigationInputDraft } from './navigation/navigationInput';
import {
  createEmptyPerformanceInputDraft,
  createEmptySectorStopInputDraft,
  createPerformanceInputDraft,
  parsePerformanceInputDraft,
} from './navigation/performanceInput';
import type { PerformanceInputDraft } from './navigation/performanceInput';
import {
  createEmptyOperationalInputDraft,
  createEmptySectorOperationInputDraft,
  createOperationalInputDraft,
  parseOperationalInputDraft,
} from './navigation/operationalInput';
import type { OperationalInputDraft } from './navigation/operationalInput';
import {
  removeAltitudePlansTouchingWaypoint,
  setLegAltitudeOverride,
  setLegAltitudeTargetDistance,
  setLegEndAltitudeOverride,
  setLegEndAltitudeTargetDistance,
  splitLegAltitudePlanForWaypointInsertion,
} from './navigation/altitudePlanState';
import type { AltitudePlacementLeg } from './navigation/altitudePlanState';
import { usePlanningCalculations } from './navigation/usePlanningCalculations';
import type { LocalDraftStatus } from './persistence/FlightPlanFileControls';
import { usePlannerShortcuts } from './interaction/usePlannerShortcuts';
import type { PlannerShortcutAction } from './interaction/plannerShortcuts';
import { PlannerSidebar } from './layout/PlannerSidebar';
import { NavlogDock } from './layout/NavlogDock';
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
  setWaypointSectorBoundary,
} from './route/flightPlanState';

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
  operationalInputDraft: OperationalInputDraft;
  useForecastWinds: boolean;
  document: FlightPlanningDocument;
}

interface InitialPlanningState extends PlanningState {
  localDraftStatus: LocalDraftStatus;
  restoredFromLocalDraft: boolean;
}

function createFreshPlanningState(nowUtcMs = Date.now()): PlanningState {
  const flightPlan: FlightPlan = {
    waypoints: [],
    legShapes: [],
    sectorBoundaryWaypointIds: [],
  };
  const navigationInputDraft = createDefaultNavigationInputDraft(nowUtcMs);
  const performanceInputDraft = createEmptyPerformanceInputDraft();
  const operationalInputDraft = createEmptyOperationalInputDraft();
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
    operationalInputDraft,
    useForecastWinds: false,
    document: {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: parsedPlanningInputs.value,
      aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
      performanceInputs: null,
      operationalInputs: null,
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
      operationalInputDraft:
        result.document.operationalInputs === null
          ? createEmptyOperationalInputDraft()
          : createOperationalInputDraft(result.document.operationalInputs),
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
  const [mapSelection, setMapSelection] = useState<MapSelection | null>(null);
  const [mapTool, setMapTool] = useState<MapTool>({ kind: 'select' });
  const [activeSidebarTab, setActiveSidebarTab] =
    useState<'planning' | 'shortcuts'>('planning');
  const [altitudeFocusRequest, setAltitudeFocusRequest] = useState(0);
  const [waypointNameFocusRequest, setWaypointNameFocusRequest] = useState(0);
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
  const [operationalInputDraft, setOperationalInputDraft] =
    useState<OperationalInputDraft>(
      initialPlanningState.operationalInputDraft,
    );
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
  const parsedOperationalInputs = useMemo(
    () => parseOperationalInputDraft(
      operationalInputDraft,
      aircraftDefinition,
      flightPlan.sectorBoundaryWaypointIds ?? [],
    ),
    [
      aircraftDefinition,
      flightPlan.sectorBoundaryWaypointIds,
      operationalInputDraft,
    ],
  );
  const operationalTakeoffMassKg = useMemo(() => {
    if (parsedOperationalInputs.status !== 'valid') {
      return undefined;
    }

    try {
      return calculateInitialTakeoffLoading(
        aircraftDefinition,
        parsedOperationalInputs.value,
      ).totalMassKg;
    } catch {
      return undefined;
    }
  }, [aircraftDefinition, parsedOperationalInputs]);
  const parsedPerformanceInputs = useMemo(
    () => parsePerformanceInputDraft(
      performanceInputDraft,
      flightPlan.sectorBoundaryWaypointIds ?? [],
      operationalTakeoffMassKg,
    ),
    [
      flightPlan.sectorBoundaryWaypointIds,
      operationalTakeoffMassKg,
      performanceInputDraft,
    ],
  );
  const calculations = usePlanningCalculations({
    flightPlan,
    aircraftDefinition,
    navigationDraft: navigationInputDraft,
    performanceDraft: performanceInputDraft,
    operationalDraft: operationalInputDraft,
    useForecastWinds,
  });
  const planningDocument = useMemo<FlightPlanningDocument | null>(
    () =>
      parsedPlanningInputs.status === 'valid' &&
      parsedPerformanceInputs.status !== 'invalid' &&
      parsedOperationalInputs.status !== 'invalid'
        ? {
            schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
            flightPlan,
            planningInputs: parsedPlanningInputs.value,
            aircraftDefinition,
            performanceInputs:
              parsedPerformanceInputs.status === 'valid'
                ? parsedPerformanceInputs.value
                : null,
            operationalInputs:
              parsedOperationalInputs.status === 'valid'
                ? parsedOperationalInputs.value
                : null,
            useForecastWinds,
          }
        : null,
    [
      flightPlan,
      aircraftDefinition,
      parsedPerformanceInputs,
      parsedOperationalInputs,
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
      setMapSelection({ kind: 'waypoint', id });
      setMapTool({ kind: 'select' });
    },
    [flightPlan],
  );

  const deleteSelectedRoutePoint = useCallback(() => {
    if (
      mapSelection === null ||
      mapSelection.kind === 'leg'
    ) {
      return;
    }

    const selectedRoutePoint: SelectedRoutePoint = mapSelection;

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
        sectorStopPlans: currentDraft.sectorStopPlans.filter(
          (stop) => stop.waypointId !== selectedRoutePoint.id,
        ),
      }));
      setOperationalInputDraft((currentDraft) => ({
        ...currentDraft,
        sectorOperations: currentDraft.sectorOperations.filter(
          (operation) => operation.waypointId !== selectedRoutePoint.id,
        ),
      }));
    }
    setMapSelection(null);
    setMapTool({ kind: 'select' });
  }, [mapSelection, performanceInputDraft.legAltitudePlans]);

  const clearRoute = () => {
    setFlightPlan({
      waypoints: [],
      legShapes: [],
      sectorBoundaryWaypointIds: [],
    });
    setPerformanceInputDraft((currentDraft) => ({
      ...currentDraft,
      legAltitudePlans: [],
      sectorStopPlans: [],
    }));
    setOperationalInputDraft((currentDraft) => ({
      ...currentDraft,
      sectorOperations: [],
      alternateEnabled: false,
    }));
    setMapSelection(null);
    setMapTool({ kind: 'select' });
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
    setOperationalInputDraft(freshState.operationalInputDraft);
    setUseForecastWinds(freshState.useForecastWinds);
    setMapSelection(null);
    setMapTool({ kind: 'select' });
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
      setOperationalInputDraft(
        document.operationalInputs === null
          ? createEmptyOperationalInputDraft()
          : createOperationalInputDraft(document.operationalInputs),
      );
      setUseForecastWinds(document.useForecastWinds);
      setMapSelection(null);
      setMapTool({ kind: 'select' });
    },
    [],
  );
  const selectedWaypoint =
    mapSelection?.kind === 'waypoint'
      ? flightPlan.waypoints.find(
          (waypoint) => waypoint.id === mapSelection.id,
        )
      : undefined;
  const selectedWaypointIndex = selectedWaypoint === undefined
    ? -1
    : flightPlan.waypoints.findIndex(
        (waypoint) => waypoint.id === selectedWaypoint.id,
      );
  const selectedWaypointCanBeSectorBoundary =
    selectedWaypointIndex > 0 &&
    selectedWaypointIndex < flightPlan.waypoints.length - 1;
  const toggleWaypointSectorBoundary = useCallback((waypointId: string) => {
    const waypointIndex = flightPlan.waypoints.findIndex(
      ({ id }) => id === waypointId,
    );

    if (waypointIndex <= 0 || waypointIndex >= flightPlan.waypoints.length - 1) {
      return;
    }

    const enabled = !(flightPlan.sectorBoundaryWaypointIds ?? []).includes(
      waypointId,
    );
    setFlightPlan((currentFlightPlan) =>
      setWaypointSectorBoundary(currentFlightPlan, waypointId, enabled),
    );
    setPerformanceInputDraft((currentDraft) => ({
      ...currentDraft,
      sectorStopPlans: enabled
        ? currentDraft.sectorStopPlans.some(
            (stop) => stop.waypointId === waypointId,
          )
          ? currentDraft.sectorStopPlans
          : [
              ...currentDraft.sectorStopPlans,
              createEmptySectorStopInputDraft(waypointId),
            ]
        : currentDraft.sectorStopPlans.filter(
            (stop) => stop.waypointId !== waypointId,
          ),
    }));
    setOperationalInputDraft((currentDraft) => ({
      ...currentDraft,
      sectorOperations: enabled
        ? currentDraft.sectorOperations.some(
            (operation) => operation.waypointId === waypointId,
          )
          ? currentDraft.sectorOperations
          : [
              ...currentDraft.sectorOperations,
              createEmptySectorOperationInputDraft(waypointId),
            ]
        : currentDraft.sectorOperations.filter(
            (operation) => operation.waypointId !== waypointId,
          ),
    }));
  }, [flightPlan]);
  const detachWaypoint = useCallback((waypointId: string) => {
    const waypoint = flightPlan.waypoints.find(({ id }) => id === waypointId);

    if (waypoint?.anchor === undefined) {
      return;
    }

    setFlightPlan((currentFlightPlan) =>
      detachWaypointInFlightPlan(currentFlightPlan, waypointId),
    );
  }, [flightPlan.waypoints]);
  const shapingPointCount = flightPlan.legShapes.reduce(
    (total, shape) => total + shape.points.length,
    0,
  );
  const setAltitudeTarget = useCallback(
    (
      fromWaypointId: string,
      toWaypointId: string,
      distanceFromStartNm: number,
      target: 'primary' | 'end',
    ) => {
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: (target === 'primary'
          ? setLegAltitudeTargetDistance
          : setLegEndAltitudeTargetDistance)(
          currentDraft.legAltitudePlans,
          fromWaypointId,
          toWaypointId,
          distanceFromStartNm,
        ),
      }));
      setMapTool({ kind: 'select' });
    },
    [],
  );
  const setLegEndAltitude = useCallback(
    (
      fromWaypointId: string,
      toWaypointId: string,
      altitudeFtMsl: number | null,
    ) => {
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: setLegEndAltitudeOverride(
          currentDraft.legAltitudePlans,
          fromWaypointId,
          toWaypointId,
          altitudeFtMsl,
        ),
      }));
    },
    [],
  );
  const setLegAltitude = useCallback(
    (
      fromWaypointId: string,
      toWaypointId: string,
      altitudeFtMsl: number | null,
    ) => {
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: setLegAltitudeOverride(
          currentDraft.legAltitudePlans,
          fromWaypointId,
          toWaypointId,
          altitudeFtMsl,
        ),
      }));
    },
    [],
  );
  const resetAltitudeTarget = useCallback(
    (
      fromWaypointId: string,
      toWaypointId: string,
      target: 'primary' | 'end',
    ) => {
      setPerformanceInputDraft((currentDraft) => ({
        ...currentDraft,
        legAltitudePlans: (target === 'primary'
          ? setLegAltitudeTargetDistance
          : setLegEndAltitudeTargetDistance)(
          currentDraft.legAltitudePlans,
          fromWaypointId,
          toWaypointId,
          null,
        ),
      }));
    },
    [],
  );
  const altitudePlacementLeg: AltitudePlacementLeg | null =
    mapTool.kind === 'place-altitude-target'
      ? {
          fromWaypointId: mapTool.fromWaypointId,
          toWaypointId: mapTool.toWaypointId,
          target: mapTool.target,
        }
      : null;
  const setAltitudePlacementLeg = useCallback(
    (leg: AltitudePlacementLeg | null) => {
      setMapTool(
        leg === null
          ? { kind: 'select' }
          : { kind: 'place-altitude-target', ...leg },
      );
    },
    [],
  );
  const changeMapTool = useCallback((tool: MapTool) => {
    setMapTool(tool);
    if (tool.kind === 'add-waypoint') {
      setMapSelection(null);
    }
  }, []);
  const handlePlannerShortcut = useCallback(
    (action: PlannerShortcutAction) => {
      switch (action) {
        case 'cancel':
          if (mapTool.kind !== 'select') {
            setMapTool({ kind: 'select' });
          } else {
            setMapSelection(null);
          }
          break;
        case 'delete-selection':
          deleteSelectedRoutePoint();
          break;
        case 'insert-waypoint':
          if (mapSelection?.kind === 'leg') {
            insertWaypoint(mapSelection.candidate);
          }
          break;
        case 'edit-waypoint-name':
          if (mapSelection?.kind === 'waypoint') {
            setMapTool({ kind: 'select' });
            setWaypointNameFocusRequest((current) => current + 1);
          }
          break;
        case 'edit-altitude':
          if (mapSelection?.kind === 'leg') {
            setMapTool({ kind: 'select' });
            setAltitudeFocusRequest((current) => current + 1);
          }
          break;
        case 'place-altitude-target':
          if (mapSelection?.kind === 'leg') {
            setMapTool({
              kind: 'place-altitude-target',
              fromWaypointId: mapSelection.candidate.fromWaypointId,
              toWaypointId: mapSelection.candidate.toWaypointId,
              target: 'primary',
            });
          }
          break;
        case 'toggle-add-waypoint':
          changeMapTool(
            mapTool.kind === 'add-waypoint'
              ? { kind: 'select' }
              : { kind: 'add-waypoint' },
          );
          break;
        case 'select-mode':
          setMapTool({ kind: 'select' });
          break;
        case 'toggle-landing':
          if (selectedWaypointCanBeSectorBoundary && selectedWaypoint !== undefined) {
            toggleWaypointSectorBoundary(selectedWaypoint.id);
          }
          break;
        case 'show-shortcuts':
          setActiveSidebarTab('shortcuts');
          break;
      }
    },
    [
      changeMapTool,
      deleteSelectedRoutePoint,
      insertWaypoint,
      mapSelection,
      mapTool.kind,
      selectedWaypoint,
      selectedWaypointCanBeSectorBoundary,
      toggleWaypointSectorBoundary,
    ],
  );

  usePlannerShortcuts({
    selection: mapSelection,
    tool: mapTool,
    onAction: handlePlannerShortcut,
  });
  const navigationLogProps = {
    flightPlan,
    aircraftDefinition,
    draft: navigationInputDraft,
    performanceDraft: performanceInputDraft,
    operationalDraft: operationalInputDraft,
    useForecastWinds,
    onDraftChange: setNavigationInputDraft,
    onAircraftDefinitionChange: setAircraftDefinition,
    onPerformanceDraftChange: setPerformanceInputDraft,
    onOperationalDraftChange: setOperationalInputDraft,
    onUseForecastWindsChange: setUseForecastWinds,
    altitudePlacementLeg,
    onAltitudePlacementLegChange: setAltitudePlacementLeg,
    calculations,
  } satisfies Omit<NavigationLogProps, 'section'>;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MVP 0.18</p>
          <h1>Flight Planner</h1>
        </div>
        <p className="app-instructions">
          Select/edit is the safe default. Press W to add waypoints, click a
          route leg to edit it, or drag the line to shape it.
        </p>
      </header>

      <div className="planner-workspace">
        <section className="map-panel" aria-label="Flight planning map">
          <FlightMap
            flightPlan={flightPlan}
            aeronauticalRepository={aeronauticalRepository}
            selection={mapSelection}
            tool={mapTool}
            altitudePlans={performanceInputDraft.legAltitudePlans}
            defaultAltitudeFtMsl={performanceInputDraft.defaultAltitudeFtMsl}
            altitudeFocusRequest={altitudeFocusRequest}
            waypointNameFocusRequest={waypointNameFocusRequest}
            performanceRoute={calculations.performanceRoute}
            {...(calculations.parsedOperational.status === 'valid' &&
            calculations.parsedOperational.value.alternate !== null
              ? {
                  alternateWaypoint:
                    calculations.parsedOperational.value.alternate.waypoint,
                }
              : {})}
            onAddWaypoint={addWaypoint}
            onAddAnchoredWaypoint={addAnchoredWaypoint}
            onMoveWaypoint={moveWaypoint}
            onAddShapingPoint={addShapingPoint}
            onMoveShapingPoint={moveShapingPoint}
            onInsertWaypoint={insertWaypoint}
            onSelectionChange={setMapSelection}
            onToolChange={changeMapTool}
            onRenameWaypoint={renameWaypoint}
            onDeleteSelection={deleteSelectedRoutePoint}
            onDetachWaypoint={detachWaypoint}
            onToggleWaypointSectorBoundary={toggleWaypointSectorBoundary}
            onSetLegAltitude={setLegAltitude}
            onSetLegEndAltitude={setLegEndAltitude}
            onResetAltitudeTarget={resetAltitudeTarget}
            onSetAltitudeTarget={setAltitudeTarget}
          />
        </section>

        <PlannerSidebar
          activeTab={activeSidebarTab}
          waypointCount={flightPlan.waypoints.length}
          shapingPointCount={shapingPointCount}
          planningDocument={planningDocument}
          localDraftStatus={localDraftStatus}
          navigationLogProps={navigationLogProps}
          onActiveTabChange={setActiveSidebarTab}
          onClearRoute={clearRoute}
          onImport={importPlanningDocument}
          onNewPlan={startNewPlan}
        />

        <NavlogDock
          waypointCount={flightPlan.waypoints.length}
          navigationLogProps={navigationLogProps}
        />
      </div>
    </main>
  );
}
