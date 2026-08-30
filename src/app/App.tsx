import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getConfiguredAeronauticalRepository } from '../aeronautical';
import type {
  AeronauticalFeatureRef,
  AeronauticalPointFeature,
  AircraftDefinition,
  FlightPlan,
  FlightPlanningDocument,
  Position,
  RouteShapingPoint,
  Waypoint,
} from '../domain';
import {
  FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
  MAX_WAYPOINT_NAME_LENGTH,
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
import type {
  PerformanceInputDefaults,
  PerformanceInputDraft,
} from './navigation/performanceInput';
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
import { BatchEntryBar } from './interaction/BatchEntryBar';
import { CommandPalette } from './interaction/CommandPalette';
import { usePlanningHistory } from './interaction/usePlanningHistory';
import {
  selectRouteLegAt,
  traverseRouteSelection,
} from './interaction/selectionTraversal';
import { PlannerSidebar } from './layout/PlannerSidebar';
import { NavlogDock } from './layout/NavlogDock';
import {
  appendAnchoredWaypointToFlightPlan,
  appendWaypointToFlightPlan,
  attachWaypointToAeronauticalFeatureInFlightPlan,
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

interface EndpointAerodromeReference {
  readonly waypointId: string;
  readonly feature: AeronauticalFeatureRef;
  readonly key: string;
}

interface EndpointAerodromeElevation {
  readonly waypointId: string;
  readonly endpointKey: string;
  readonly elevationFt: number;
}

interface EndpointAerodromeElevations {
  readonly departure: EndpointAerodromeElevation | null;
  readonly destination: EndpointAerodromeElevation | null;
}

const EMPTY_ENDPOINT_AERODROME_ELEVATIONS: EndpointAerodromeElevations = {
  departure: null,
  destination: null,
};

type BatchEntryMode =
  | { readonly kind: 'naming'; readonly index: number }
  | { readonly kind: 'altitude'; readonly index: number };

function getEndpointAerodromeReference(
  waypoint: Waypoint | undefined,
): EndpointAerodromeReference | null {
  const feature = waypoint?.anchor?.feature;

  if (waypoint === undefined || feature?.featureKind !== 'aerodrome') {
    return null;
  }

  return {
    waypointId: waypoint.id,
    feature,
    key: [
      waypoint.id,
      feature.dataset.datasetId,
      feature.featureId,
      feature.featureVersionId ?? '',
    ].join('\u0000'),
  };
}

function createAlternateAerodromeWaypoint(
  feature: AeronauticalPointFeature,
): Waypoint {
  return {
    id: `alternate-${crypto.randomUUID()}`,
    name: feature.suggestedWaypointName,
    position: feature.position,
    anchor: {
      kind: 'aeronautical-feature',
      feature: feature.ref,
      publishedIdentifier: feature.identifier,
      ...(feature.name === undefined ? {} : { publishedName: feature.name }),
    },
  };
}

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

type PlanningHistorySnapshot = Omit<PlanningState, 'document'>;

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
  const [batchEntryMode, setBatchEntryMode] = useState<BatchEntryMode | null>(
    null,
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [navigationInputDraft, setNavigationInputDraft] =
    useState<NavigationInputDraft>(
      initialPlanningState.navigationInputDraft,
    );
  const [useForecastWinds, setUseForecastWinds] = useState(
    initialPlanningState.useForecastWinds,
  );
  const [forecastRequestKey, setForecastRequestKey] = useState(0);
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
  const [endpointAerodromeElevations, setEndpointAerodromeElevations] =
    useState<EndpointAerodromeElevations>(
      EMPTY_ENDPOINT_AERODROME_ELEVATIONS,
    );
  const [sectorStopAerodromeElevations, setSectorStopAerodromeElevations] =
    useState<readonly EndpointAerodromeElevation[]>([]);
  const planningHistorySnapshot = useMemo<PlanningHistorySnapshot>(
    () => ({
      flightPlan,
      aircraftDefinition,
      navigationInputDraft,
      performanceInputDraft,
      operationalInputDraft,
      useForecastWinds,
    }),
    [
      aircraftDefinition,
      flightPlan,
      navigationInputDraft,
      operationalInputDraft,
      performanceInputDraft,
      useForecastWinds,
    ],
  );
  const restorePlanningHistorySnapshot = useCallback(
    (snapshot: PlanningHistorySnapshot) => {
      setFlightPlan(snapshot.flightPlan);
      setAircraftDefinition(snapshot.aircraftDefinition);
      setNavigationInputDraft(snapshot.navigationInputDraft);
      setPerformanceInputDraft(snapshot.performanceInputDraft);
      setOperationalInputDraft(snapshot.operationalInputDraft);
      setUseForecastWinds(snapshot.useForecastWinds);
      setMapSelection(null);
      setMapTool({ kind: 'select' });
      setBatchEntryMode(null);
    },
    [],
  );
  const planningHistory = usePlanningHistory(
    planningHistorySnapshot,
    restorePlanningHistorySnapshot,
  );
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
  const endpointAerodromeReferences = useMemo(
    () => ({
      departure: getEndpointAerodromeReference(flightPlan.waypoints[0]),
      destination: getEndpointAerodromeReference(flightPlan.waypoints.at(-1)),
    }),
    [
      flightPlan.waypoints[0]?.anchor,
      flightPlan.waypoints[0]?.id,
      flightPlan.waypoints.at(-1)?.anchor,
      flightPlan.waypoints.at(-1)?.id,
    ],
  );
  const sectorStopAerodromeReferences = useMemo(() => {
    const boundaryIds = new Set(
      flightPlan.sectorBoundaryWaypointIds ?? [],
    );

    return flightPlan.waypoints.flatMap((waypoint) => {
      if (!boundaryIds.has(waypoint.id)) {
        return [];
      }

      const reference = getEndpointAerodromeReference(waypoint);
      return reference === null ? [] : [reference];
    });
  }, [flightPlan.sectorBoundaryWaypointIds, flightPlan.waypoints]);
  const performanceInputDefaults = useMemo<PerformanceInputDefaults>(
    () => {
      const departure = endpointAerodromeElevations.departure;
      const destination = endpointAerodromeElevations.destination;
      const departureElevationFtMsl =
        departure !== null &&
        departure.endpointKey === endpointAerodromeReferences.departure?.key
          ? departure.elevationFt
          : undefined;
      const destinationElevationFtMsl =
        destination !== null &&
        destination.endpointKey === endpointAerodromeReferences.destination?.key
          ? destination.elevationFt
          : undefined;
      const stopReferencesByWaypointId = new Map(
        sectorStopAerodromeReferences.map((reference) => [
          reference.waypointId,
          reference,
        ]),
      );
      const sectorStopElevationFtMslByWaypointId = Object.fromEntries(
        sectorStopAerodromeElevations.flatMap((elevation) => {
          const reference = stopReferencesByWaypointId.get(
            elevation.waypointId,
          );

          return reference?.key === elevation.endpointKey
            ? [[elevation.waypointId, elevation.elevationFt] as const]
            : [];
        }),
      );

      return {
        ...(departureElevationFtMsl === undefined
          ? {}
          : { departureElevationFtMsl }),
        ...(destinationElevationFtMsl === undefined
          ? {}
          : { destinationElevationFtMsl }),
        ...(Object.keys(sectorStopElevationFtMslByWaypointId).length === 0
          ? {}
          : { sectorStopElevationFtMslByWaypointId }),
      };
    },
    [
      endpointAerodromeElevations,
      endpointAerodromeReferences,
      sectorStopAerodromeElevations,
      sectorStopAerodromeReferences,
    ],
  );
  const parsedPerformanceInputs = useMemo(
    () => parsePerformanceInputDraft(
      performanceInputDraft,
      flightPlan.sectorBoundaryWaypointIds ?? [],
      operationalTakeoffMassKg,
      performanceInputDefaults,
    ),
    [
      flightPlan.sectorBoundaryWaypointIds,
      operationalTakeoffMassKg,
      performanceInputDraft,
      performanceInputDefaults,
    ],
  );
  const calculations = usePlanningCalculations({
    flightPlan,
    aircraftDefinition,
    navigationDraft: navigationInputDraft,
    performanceDraft: performanceInputDraft,
    performanceInputDefaults,
    operationalDraft: operationalInputDraft,
    useForecastWinds,
    forecastRequestKey,
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

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const resolveElevation = async (
      endpoint: EndpointAerodromeReference | null,
    ): Promise<EndpointAerodromeElevation | null> => {
      if (endpoint === null) {
        return null;
      }

      try {
        const details = await aeronauticalRepository.getFeatureDetails(
          endpoint.feature,
          { signal: controller.signal },
        );

        return details?.detailKind === 'aerodrome' &&
          details.elevationFt !== null
          ? {
              waypointId: endpoint.waypointId,
              endpointKey: endpoint.key,
              elevationFt: details.elevationFt,
            }
          : null;
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          return null;
        }

        return null;
      }
    };

    void Promise.all([
      resolveElevation(endpointAerodromeReferences.departure),
      resolveElevation(endpointAerodromeReferences.destination),
      Promise.all(sectorStopAerodromeReferences.map(resolveElevation)),
    ]).then(([departure, destination, sectorStops]) => {
      if (cancelled) {
        return;
      }

      setEndpointAerodromeElevations({ departure, destination });
      setSectorStopAerodromeElevations(
        sectorStops.filter(
          (elevation): elevation is EndpointAerodromeElevation =>
            elevation !== null,
        ),
      );
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [endpointAerodromeReferences, sectorStopAerodromeReferences]);


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

  const selectAlternateAerodrome = useCallback(
    (feature: AeronauticalPointFeature) => {
      if (feature.pointKind !== 'aerodrome') {
        return;
      }

      setOperationalInputDraft((currentDraft) => ({
        ...currentDraft,
        alternateEnabled: true,
        alternateWaypoint: createAlternateAerodromeWaypoint(feature),
      }));
      setMapTool({ kind: 'select' });
    },
    [],
  );

  const chooseAlternateAerodromeByIcao = useCallback(
    async (icaoIdentifier: string): Promise<string | null> => {
      const normalizedIdentifier = icaoIdentifier.trim().toUpperCase();
      if (normalizedIdentifier === '') {
        return 'Enter an alternate ICAO code.';
      }

      try {
        const feature = await aeronauticalRepository.findAerodromeByIdentifier(
          normalizedIdentifier,
        );
        if (feature === null) {
          return `No aerodrome with ICAO code ${normalizedIdentifier} was found in the loaded dataset.`;
        }

        setOperationalInputDraft((currentDraft) => ({
          ...currentDraft,
          alternateEnabled: true,
          alternateWaypoint: createAlternateAerodromeWaypoint(feature),
        }));
        return null;
      } catch {
        return 'The alternate aerodrome could not be looked up.';
      }
    },
    [],
  );

  const attachWaypoint = useCallback(
    (id: string, feature: AeronauticalPointFeature) => {
      setFlightPlan((currentFlightPlan) =>
        attachWaypointToAeronauticalFeatureInFlightPlan(
          currentFlightPlan,
          id,
          feature,
        ),
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
      setMapTool({ kind: 'edit-route' });
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
    if (mapTool.kind !== 'edit-route') {
      setMapTool({ kind: 'select' });
    }
  }, [mapSelection, performanceInputDraft.legAltitudePlans, mapTool.kind]);

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
    setEndpointAerodromeElevations(EMPTY_ENDPOINT_AERODROME_ELEVATIONS);
    setSectorStopAerodromeElevations([]);
    setOperationalInputDraft(freshState.operationalInputDraft);
    setUseForecastWinds(freshState.useForecastWinds);
    setForecastRequestKey(0);
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
      setEndpointAerodromeElevations(EMPTY_ENDPOINT_AERODROME_ELEVATIONS);
      setSectorStopAerodromeElevations([]);
      setOperationalInputDraft(
        document.operationalInputs === null
          ? createEmptyOperationalInputDraft()
          : createOperationalInputDraft(document.operationalInputs),
      );
      setUseForecastWinds(document.useForecastWinds);
      setForecastRequestKey(0);
      setMapSelection(null);
      if (mapTool.kind !== 'edit-route') {
        setMapTool({ kind: 'select' });
      }
    },
    [mapTool.kind],
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
      // Target-marker dragging is part of Edit route. Only the explicit
      // one-shot map-placement tool returns to Select after a placement.
      if (mapTool.kind !== 'edit-route') {
        setMapTool({ kind: 'select' });
      }
    },
    [mapTool.kind],
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
  const startBatchNaming = useCallback(() => {
    if (flightPlan.waypoints.length === 0) {
      return;
    }

    const selectedIndex =
      mapSelection?.kind === 'waypoint'
        ? flightPlan.waypoints.findIndex(
            (waypoint) => waypoint.id === mapSelection.id,
          )
        : -1;
    const index = selectedIndex < 0 ? 0 : selectedIndex;
    setMapSelection({ kind: 'waypoint', id: flightPlan.waypoints[index]!.id });
    setMapTool({ kind: 'select' });
    setBatchEntryMode({ kind: 'naming', index });
  }, [flightPlan.waypoints, mapSelection]);
  const startBatchAltitude = useCallback(() => {
    const legCount = flightPlan.waypoints.length - 1;
    if (legCount <= 0) {
      return;
    }

    const selectedIndex =
      mapSelection?.kind === 'leg'
        ? flightPlan.waypoints.findIndex(
            (waypoint) =>
              waypoint.id === mapSelection.candidate.fromWaypointId,
          )
        : -1;
    const index = selectedIndex < 0 ? 0 : selectedIndex;
    const legSelection = selectRouteLegAt(flightPlan, index);
    if (legSelection === null) {
      return;
    }
    setMapSelection(legSelection);
    setMapTool({ kind: 'select' });
    setBatchEntryMode({ kind: 'altitude', index });
  }, [flightPlan, mapSelection]);
  const moveBatchEntry = useCallback(
    (direction: -1 | 1) => {
      setBatchEntryMode((current) => {
        if (current === null) {
          return null;
        }
        const itemCount =
          current.kind === 'naming'
            ? flightPlan.waypoints.length
            : flightPlan.waypoints.length - 1;
        if (itemCount <= 0) {
          return null;
        }
        const index =
          (current.index + direction + itemCount) % itemCount;
        if (current.kind === 'naming') {
          setMapSelection({
            kind: 'waypoint',
            id: flightPlan.waypoints[index]!.id,
          });
        } else {
          const legSelection = selectRouteLegAt(flightPlan, index);
          if (legSelection !== null) {
            setMapSelection(legSelection);
          }
        }
        return { ...current, index };
      });
    },
    [flightPlan],
  );
  const handlePlannerShortcut = useCallback(
    (action: PlannerShortcutAction) => {
      switch (action) {
        case 'cancel':
          if (commandPaletteOpen) {
            setCommandPaletteOpen(false);
          } else if (batchEntryMode !== null) {
            setBatchEntryMode(null);
          } else if (mapTool.kind !== 'select') {
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
        case 'place-end-altitude-target':
          if (mapSelection?.kind === 'leg') {
            setMapTool({
              kind: 'place-altitude-target',
              fromWaypointId: mapSelection.candidate.fromWaypointId,
              toWaypointId: mapSelection.candidate.toWaypointId,
              target: 'end',
            });
          }
          break;
        case 'reset-altitude-target':
          if (mapSelection?.kind === 'leg') {
            resetAltitudeTarget(
              mapSelection.candidate.fromWaypointId,
              mapSelection.candidate.toWaypointId,
              'primary',
            );
          }
          break;
        case 'reset-end-altitude-target':
          if (mapSelection?.kind === 'leg') {
            resetAltitudeTarget(
              mapSelection.candidate.fromWaypointId,
              mapSelection.candidate.toWaypointId,
              'end',
            );
          }
          break;
        case 'toggle-add-waypoint':
          changeMapTool(
            mapTool.kind === 'add-waypoint'
              ? { kind: 'select' }
              : { kind: 'add-waypoint' },
          );
          break;
        case 'toggle-edit-route':
          changeMapTool(
            mapTool.kind === 'edit-route'
              ? { kind: 'select' }
              : { kind: 'edit-route' },
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
        case 'previous-selection':
          setMapSelection(
            traverseRouteSelection(flightPlan, mapSelection, -1),
          );
          break;
        case 'next-selection':
          setMapSelection(
            traverseRouteSelection(flightPlan, mapSelection, 1),
          );
          break;
        case 'start-naming-mode':
          startBatchNaming();
          break;
        case 'start-altitude-mode':
          startBatchAltitude();
          break;
        case 'undo':
          planningHistory.undo();
          break;
        case 'redo':
          planningHistory.redo();
          break;
        case 'show-command-palette':
          setCommandPaletteOpen(true);
          break;
        case 'show-shortcuts':
          setActiveSidebarTab('shortcuts');
          break;
      }
    },
    [
      changeMapTool,
      batchEntryMode,
      commandPaletteOpen,
      deleteSelectedRoutePoint,
      insertWaypoint,
      mapSelection,
      mapTool.kind,
      flightPlan,
      resetAltitudeTarget,
      selectedWaypoint,
      selectedWaypointCanBeSectorBoundary,
      toggleWaypointSectorBoundary,
      startBatchAltitude,
      startBatchNaming,
      planningHistory,
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
    performanceInputDefaults,
    operationalDraft: operationalInputDraft,
    useForecastWinds,
    onDraftChange: setNavigationInputDraft,
    onAircraftDefinitionChange: setAircraftDefinition,
    onPerformanceDraftChange: setPerformanceInputDraft,
    onOperationalDraftChange: setOperationalInputDraft,
    onUseForecastWindsChange: setUseForecastWinds,
    onLoadForecastWinds: () => {
      setUseForecastWinds(true);
      setForecastRequestKey((current) => current + 1);
    },
    onChooseAlternateByIcao: chooseAlternateAerodromeByIcao,
    altitudePlacementLeg,
    onAltitudePlacementLegChange: setAltitudePlacementLeg,
    calculations,
  } satisfies Omit<NavigationLogProps, 'section'>;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MVP 0.20</p>
          <h1>Flight Planner</h1>
        </div>
        <p className="app-instructions">
          Select is the safe default. Press W to add waypoints, E to edit route
          geometry, or ? to see every shortcut.
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
            suppressSelectionPopups={batchEntryMode !== null}
            canUndo={planningHistory.canUndo}
            canRedo={planningHistory.canRedo}
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
            onSelectAlternateAerodrome={selectAlternateAerodrome}
            onAttachWaypoint={attachWaypoint}
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
            onUndo={planningHistory.undo}
            onRedo={planningHistory.redo}
          />
          {batchEntryMode?.kind === 'naming' ? (() => {
            const waypoint = flightPlan.waypoints[batchEntryMode.index];
            if (waypoint === undefined) {
              return null;
            }
            return (
              <BatchEntryBar
                title="Sequential waypoint naming"
                itemLabel={`${batchEntryMode.index + 1} of ${flightPlan.waypoints.length} · ${waypoint.name}`}
                initialValue={waypoint.name}
                placeholder="Waypoint name"
                inputMode="text"
                onCommit={(value) => {
                  const name = value.trim();
                  if (name === '') {
                    return 'Enter a waypoint name.';
                  }
                  if (name.length > MAX_WAYPOINT_NAME_LENGTH) {
                    return `Use ${MAX_WAYPOINT_NAME_LENGTH} characters or fewer.`;
                  }
                  renameWaypoint(waypoint.id, name);
                  return null;
                }}
                onMove={moveBatchEntry}
                onClose={() => setBatchEntryMode(null)}
              />
            );
          })() : null}
          {batchEntryMode?.kind === 'altitude' ? (() => {
            const from = flightPlan.waypoints[batchEntryMode.index];
            const to = flightPlan.waypoints[batchEntryMode.index + 1];
            if (from === undefined || to === undefined) {
              return null;
            }
            const plan = performanceInputDraft.legAltitudePlans.find(
              (candidate) =>
                candidate.fromWaypointId === from.id &&
                candidate.toWaypointId === to.id,
            );
            return (
              <BatchEntryBar
                title="Sequential altitude entry"
                itemLabel={`${batchEntryMode.index + 1} of ${flightPlan.waypoints.length - 1} · ${from.name} → ${to.name}`}
                initialValue={plan?.altitudeFtMsl === undefined ? '' : String(plan.altitudeFtMsl)}
                placeholder={performanceInputDraft.defaultAltitudeFtMsl || 'Global altitude'}
                inputMode="numeric"
                unit="ft MSL"
                onCommit={(value) => {
                  if (value.trim() === '') {
                    setLegAltitude(from.id, to.id, null);
                    return null;
                  }
                  const altitudeFtMsl = Number(value);
                  if (!Number.isFinite(altitudeFtMsl) || altitudeFtMsl < 0) {
                    return 'Enter a non-negative altitude or leave it blank for the global preset.';
                  }
                  setLegAltitude(from.id, to.id, altitudeFtMsl);
                  return null;
                }}
                onMove={moveBatchEntry}
                onClose={() => setBatchEntryMode(null)}
              />
            );
          })() : null}
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
      {commandPaletteOpen ? (
        <CommandPalette
          commands={[
            { id: 'select-mode', label: 'Select mode', shortcut: 'V' },
            { id: 'toggle-edit-route', label: 'Toggle Edit route mode', shortcut: 'E' },
            { id: 'toggle-add-waypoint', label: 'Toggle Add waypoint mode', shortcut: 'W' },
            { id: 'start-naming-mode', label: 'Sequential waypoint naming', shortcut: 'Shift+N' },
            { id: 'start-altitude-mode', label: 'Sequential altitude entry', shortcut: 'Shift+A' },
            { id: 'toggle-landing', label: 'Toggle intermediate landing', shortcut: 'L' },
            { id: 'undo', label: 'Undo', shortcut: 'Ctrl/Cmd+Z' },
            { id: 'redo', label: 'Redo', shortcut: 'Ctrl/Cmd+Shift+Z' },
            { id: 'show-shortcuts', label: 'Open shortcut reference', shortcut: '?' },
          ]}
          onRun={(command) => {
            setCommandPaletteOpen(false);
            handlePlannerShortcut(command as PlannerShortcutAction);
          }}
          onClose={() => setCommandPaletteOpen(false)}
        />
      ) : null}
    </main>
  );
}
