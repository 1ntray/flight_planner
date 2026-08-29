import type {
  AeronauticalDatasetRef,
  AeronauticalFeatureKind,
  AeronauticalWaypointAnchor,
  AircraftDefinition,
  AircraftPerformancePlanInputs,
  AircraftPerformanceProfile,
  FlightPlan,
  FlightPlanningDocument,
  LegShape,
  LegacyAircraftPerformanceProfileV2,
  NavigationPlanInputs,
  OperationalPlanningInputs,
  Position,
  RoutePlanningInputs,
  RouteShapingPoint,
  Waypoint,
} from '../domain';
import {
  FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
  LEGACY_AIRCRAFT_DEFINITION_DOCUMENT_SCHEMA_VERSION,
  LEGACY_AIRCRAFT_PROFILE_DOCUMENT_SCHEMA_VERSION,
  LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
  LEGACY_SECTOR_DEPARTURE_DOCUMENT_SCHEMA_VERSION,
  LEGACY_STOP_DURATION_DOCUMENT_SCHEMA_VERSION,
  MAX_WAYPOINT_NAME_LENGTH,
  PROJECT_AIRCRAFT_DEFINITION,
  PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
} from '../domain';

type JsonRecord = Record<string, unknown>;

const AERONAUTICAL_FEATURE_KINDS = new Set<AeronauticalFeatureKind>([
  'aerodrome',
  'reporting-point',
  'navaid',
  'designated-point',
  'ctr',
  'tma',
  'restricted-area',
  'danger-area',
  'prohibited-area',
  'other-airspace',
]);
const ANCHORABLE_FEATURE_KINDS = new Set<AeronauticalFeatureKind>([
  'aerodrome',
  'reporting-point',
  'navaid',
  'designated-point',
]);

function requireRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RangeError(`${path} must be an object`);
  }

  return value as JsonRecord;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new RangeError(`${path} must be an array`);
  }

  return value;
}

function requireString(
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {},
): string {
  if (typeof value !== 'string') {
    throw new RangeError(`${path} must be a string`);
  }

  if (options.allowEmpty !== true && value.trim() === '') {
    throw new RangeError(`${path} must not be empty`);
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new RangeError(
      `${path} must not exceed ${options.maxLength} characters`,
    );
  }

  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requireString(value, path);
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : requireString(value, path);
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }

  return value;
}

function requirePosition(value: unknown, path: string): Position {
  const record = requireRecord(value, path);
  const latitude = requireFiniteNumber(record.latitude, `${path}.latitude`);
  const longitude = requireFiniteNumber(record.longitude, `${path}.longitude`);

  if (latitude < -90 || latitude > 90) {
    throw new RangeError(`${path}.latitude must be between -90 and 90`);
  }

  if (longitude < -180 || longitude > 180) {
    throw new RangeError(`${path}.longitude must be between -180 and 180`);
  }

  return { latitude, longitude };
}

function requireDatasetRef(
  value: unknown,
  path: string,
): AeronauticalDatasetRef {
  const record = requireRecord(value, path);
  const revisionId = optionalString(record.revisionId, `${path}.revisionId`);

  return {
    datasetId: requireString(record.datasetId, `${path}.datasetId`),
    providerId: requireString(record.providerId, `${path}.providerId`),
    sourceName: requireString(record.sourceName, `${path}.sourceName`),
    airacCycle: nullableString(record.airacCycle, `${path}.airacCycle`),
    effectiveFromUtc: requireString(
      record.effectiveFromUtc,
      `${path}.effectiveFromUtc`,
    ),
    effectiveToUtc: nullableString(
      record.effectiveToUtc,
      `${path}.effectiveToUtc`,
    ),
    ...(revisionId === undefined ? {} : { revisionId }),
  };
}

function requireFeatureKind(
  value: unknown,
  path: string,
): AeronauticalFeatureKind {
  const featureKind = requireString(value, path) as AeronauticalFeatureKind;

  if (!AERONAUTICAL_FEATURE_KINDS.has(featureKind)) {
    throw new RangeError(`${path} is not a supported aeronautical feature kind`);
  }

  return featureKind;
}

function requireAnchor(
  value: unknown,
  path: string,
): AeronauticalWaypointAnchor {
  const record = requireRecord(value, path);

  if (record.kind !== 'aeronautical-feature') {
    throw new RangeError(`${path}.kind must be aeronautical-feature`);
  }

  const featureRecord = requireRecord(record.feature, `${path}.feature`);
  const featureKind = requireFeatureKind(
    featureRecord.featureKind,
    `${path}.feature.featureKind`,
  );

  if (!ANCHORABLE_FEATURE_KINDS.has(featureKind)) {
    throw new RangeError(`${path}.feature.featureKind must identify a point feature`);
  }

  const featureVersionId = optionalString(
    featureRecord.featureVersionId,
    `${path}.feature.featureVersionId`,
  );
  const publishedName = optionalString(
    record.publishedName,
    `${path}.publishedName`,
  );

  return {
    kind: 'aeronautical-feature',
    feature: {
      dataset: requireDatasetRef(
        featureRecord.dataset,
        `${path}.feature.dataset`,
      ),
      featureId: requireString(
        featureRecord.featureId,
        `${path}.feature.featureId`,
      ),
      featureKind,
      ...(featureVersionId === undefined ? {} : { featureVersionId }),
    },
    publishedIdentifier: requireString(
      record.publishedIdentifier,
      `${path}.publishedIdentifier`,
    ),
    ...(publishedName === undefined ? {} : { publishedName }),
  };
}

function requireWaypoint(value: unknown, path: string): Waypoint {
  const record = requireRecord(value, path);
  const anchor =
    record.anchor === undefined
      ? undefined
      : requireAnchor(record.anchor, `${path}.anchor`);

  const name = requireString(record.name, `${path}.name`).trim();

  if (name.length > MAX_WAYPOINT_NAME_LENGTH) {
    throw new RangeError(
      `${path}.name must not exceed ${MAX_WAYPOINT_NAME_LENGTH} characters`,
    );
  }

  return {
    id: requireString(record.id, `${path}.id`),
    name,
    position: requirePosition(record.position, `${path}.position`),
    ...(anchor === undefined ? {} : { anchor }),
  };
}

function requireShapingPoint(
  value: unknown,
  path: string,
): RouteShapingPoint {
  const record = requireRecord(value, path);

  return {
    id: requireString(record.id, `${path}.id`),
    position: requirePosition(record.position, `${path}.position`),
  };
}

function requireLegShape(value: unknown, path: string): LegShape {
  const record = requireRecord(value, path);
  const points = requireArray(record.points, `${path}.points`).map(
    (point, index) => requireShapingPoint(point, `${path}.points[${index}]`),
  );

  if (points.length === 0) {
    throw new RangeError(`${path}.points must contain at least one shaping point`);
  }

  return {
    fromWaypointId: requireString(
      record.fromWaypointId,
      `${path}.fromWaypointId`,
    ),
    toWaypointId: requireString(record.toWaypointId, `${path}.toWaypointId`),
    points,
  };
}

function legKey(fromWaypointId: string, toWaypointId: string): string {
  return `${fromWaypointId}\u0000${toWaypointId}`;
}

function requireFlightPlan(
  value: unknown,
  path: string,
  requireSectorBoundaries: boolean,
): FlightPlan {
  const record = requireRecord(value, path);
  const waypoints = requireArray(record.waypoints, `${path}.waypoints`).map(
    (waypoint, index) =>
      requireWaypoint(waypoint, `${path}.waypoints[${index}]`),
  );
  const legShapes = requireArray(record.legShapes, `${path}.legShapes`).map(
    (shape, index) => requireLegShape(shape, `${path}.legShapes[${index}]`),
  );
  const sectorBoundaryWaypointIds =
    record.sectorBoundaryWaypointIds === undefined && !requireSectorBoundaries
      ? []
      : requireArray(
          record.sectorBoundaryWaypointIds,
          `${path}.sectorBoundaryWaypointIds`,
        ).map((waypointId, index) =>
          requireString(
            waypointId,
            `${path}.sectorBoundaryWaypointIds[${index}]`,
          ),
        );
  const routePointIds = new Set<string>();

  for (const waypoint of waypoints) {
    if (routePointIds.has(waypoint.id)) {
      throw new RangeError(`Duplicate route point ID ${waypoint.id}`);
    }
    routePointIds.add(waypoint.id);
  }

  const adjacentLegKeys = new Set(
    waypoints.slice(1).map((waypoint, index) =>
      legKey(waypoints[index]!.id, waypoint.id),
    ),
  );
  const shapedLegKeys = new Set<string>();

  for (const shape of legShapes) {
    const key = legKey(shape.fromWaypointId, shape.toWaypointId);

    if (!adjacentLegKeys.has(key)) {
      throw new RangeError(
        `Route shape ${shape.fromWaypointId} to ${shape.toWaypointId} does not match an adjacent waypoint leg`,
      );
    }

    if (shapedLegKeys.has(key)) {
      throw new RangeError(
        `Duplicate route shape for leg ${shape.fromWaypointId} to ${shape.toWaypointId}`,
      );
    }
    shapedLegKeys.add(key);

    for (const point of shape.points) {
      if (routePointIds.has(point.id)) {
        throw new RangeError(`Duplicate route point ID ${point.id}`);
      }
      routePointIds.add(point.id);
    }
  }

  const boundaryIds = new Set<string>();

  for (const waypointId of sectorBoundaryWaypointIds) {
    if (boundaryIds.has(waypointId)) {
      throw new RangeError(`Duplicate sector boundary waypoint ${waypointId}`);
    }

    const waypointIndex = waypoints.findIndex(
      (waypoint) => waypoint.id === waypointId,
    );

    if (waypointIndex <= 0 || waypointIndex >= waypoints.length - 1) {
      throw new RangeError(
        `Sector boundary ${waypointId} must identify an intermediate waypoint`,
      );
    }
    boundaryIds.add(waypointId);
  }

  return { waypoints, legShapes, sectorBoundaryWaypointIds };
}

function requirePlanningInputs(
  value: unknown,
  path: string,
): NavigationPlanInputs {
  const record = requireRecord(value, path);
  const departureTimeUtcMs = requireFiniteNumber(
    record.departureTimeUtcMs,
    `${path}.departureTimeUtcMs`,
  );
  const trueAirspeedKt = requireFiniteNumber(
    record.trueAirspeedKt,
    `${path}.trueAirspeedKt`,
  );
  const plannedAltitudeFtMsl = requireFiniteNumber(
    record.plannedAltitudeFtMsl,
    `${path}.plannedAltitudeFtMsl`,
  );
  const magneticVariationDegEast = requireFiniteNumber(
    record.magneticVariationDegEast,
    `${path}.magneticVariationDegEast`,
  );
  const windRecord = requireRecord(record.wind, `${path}.wind`);
  const directionFromTrueDeg = requireFiniteNumber(
    windRecord.directionFromTrueDeg,
    `${path}.wind.directionFromTrueDeg`,
  );
  const speedKt = requireFiniteNumber(
    windRecord.speedKt,
    `${path}.wind.speedKt`,
  );

  if (!Number.isFinite(new Date(departureTimeUtcMs).getTime())) {
    throw new RangeError(`${path}.departureTimeUtcMs must be a valid UTC timestamp`);
  }
  if (trueAirspeedKt <= 0) {
    throw new RangeError(`${path}.trueAirspeedKt must be greater than zero`);
  }
  if (plannedAltitudeFtMsl < 0) {
    throw new RangeError(`${path}.plannedAltitudeFtMsl must not be negative`);
  }
  if (
    magneticVariationDegEast < -180 ||
    magneticVariationDegEast > 180
  ) {
    throw new RangeError(
      `${path}.magneticVariationDegEast must be between -180 and 180`,
    );
  }
  if (directionFromTrueDeg < 0 || directionFromTrueDeg >= 360) {
    throw new RangeError(
      `${path}.wind.directionFromTrueDeg must be in [0, 360)`,
    );
  }
  if (speedKt < 0) {
    throw new RangeError(`${path}.wind.speedKt must not be negative`);
  }

  return {
    departureTimeUtcMs,
    trueAirspeedKt,
    plannedAltitudeFtMsl,
    magneticVariationDegEast,
    wind: { directionFromTrueDeg, speedKt },
  };
}

function requireRoutePlanningInputs(
  value: unknown,
  path: string,
): RoutePlanningInputs {
  const record = requireRecord(value, path);
  const departureTimeUtcMs = requireFiniteNumber(
    record.departureTimeUtcMs,
    `${path}.departureTimeUtcMs`,
  );
  const magneticVariationDegEast = requireFiniteNumber(
    record.magneticVariationDegEast,
    `${path}.magneticVariationDegEast`,
  );
  const windRecord = requireRecord(record.wind, `${path}.wind`);
  const directionFromTrueDeg = requireFiniteNumber(
    windRecord.directionFromTrueDeg,
    `${path}.wind.directionFromTrueDeg`,
  );
  const speedKt = requireFiniteNumber(
    windRecord.speedKt,
    `${path}.wind.speedKt`,
  );

  if (!Number.isFinite(new Date(departureTimeUtcMs).getTime())) {
    throw new RangeError(`${path}.departureTimeUtcMs must be a valid UTC timestamp`);
  }
  if (
    magneticVariationDegEast < -180 ||
    magneticVariationDegEast > 180
  ) {
    throw new RangeError(
      `${path}.magneticVariationDegEast must be between -180 and 180`,
    );
  }
  if (directionFromTrueDeg < 0 || directionFromTrueDeg >= 360) {
    throw new RangeError(
      `${path}.wind.directionFromTrueDeg must be in [0, 360)`,
    );
  }
  if (speedKt < 0) {
    throw new RangeError(`${path}.wind.speedKt must not be negative`);
  }

  return {
    departureTimeUtcMs,
    magneticVariationDegEast,
    wind: { directionFromTrueDeg, speedKt },
  };
}

function requirePositiveNumber(value: unknown, path: string): number {
  const result = requireFiniteNumber(value, path);

  if (result <= 0) {
    throw new RangeError(`${path} must be greater than zero`);
  }

  return result;
}

function requireNonNegativeNumber(value: unknown, path: string): number {
  const result = requireFiniteNumber(value, path);

  if (result < 0) {
    throw new RangeError(`${path} must not be negative`);
  }

  return result;
}

function requireLegacyAircraftPerformanceProfileV2(
  value: unknown,
  path: string,
): LegacyAircraftPerformanceProfileV2 {
  const record = requireRecord(value, path);
  const revision = requireFiniteNumber(record.revision, `${path}.revision`);

  if (!Number.isInteger(revision) || revision <= 0) {
    throw new RangeError(`${path}.revision must be a positive integer`);
  }

  return {
    profileId: requireString(record.profileId, `${path}.profileId`),
    revision,
    climbIasKt: requirePositiveNumber(record.climbIasKt, `${path}.climbIasKt`),
    cruiseIasKt: requirePositiveNumber(record.cruiseIasKt, `${path}.cruiseIasKt`),
    descentIasKt: requirePositiveNumber(record.descentIasKt, `${path}.descentIasKt`),
    climbFuelFlowLph: requireNonNegativeNumber(
      record.climbFuelFlowLph,
      `${path}.climbFuelFlowLph`,
    ),
    cruiseFuelFlowLph: requireNonNegativeNumber(
      record.cruiseFuelFlowLph,
      `${path}.cruiseFuelFlowLph`,
    ),
    descentFuelFlowLph: requireNonNegativeNumber(
      record.descentFuelFlowLph,
      `${path}.descentFuelFlowLph`,
    ),
    descentRateFtPerMin: requirePositiveNumber(
      record.descentRateFtPerMin,
      `${path}.descentRateFtPerMin`,
    ),
  };
}

function requireAircraftPerformanceProfile(
  value: unknown,
  path: string,
): AircraftPerformanceProfile {
  const record = requireRecord(value, path);
  const climb = requireRecord(record.climb, `${path}.climb`);
  const cruise = requireRecord(record.cruise, `${path}.cruise`);
  const descent = requireRecord(record.descent, `${path}.descent`);
  const rateModel = requireRecord(
    climb.rateModel,
    `${path}.climb.rateModel`,
  );

  if (rateModel.kind !== 'effective-altitude-linear-mass') {
    throw new RangeError(`${path}.climb.rateModel.kind is not supported`);
  }

  return {
    climb: {
      iasKt: requirePositiveNumber(climb.iasKt, `${path}.climb.iasKt`),
      fuelFlowLph: requireNonNegativeNumber(
        climb.fuelFlowLph,
        `${path}.climb.fuelFlowLph`,
      ),
      rateModel: {
        kind: 'effective-altitude-linear-mass',
        isaAltitudeFactorFtPerC: requireFiniteNumber(
          rateModel.isaAltitudeFactorFtPerC,
          `${path}.climb.rateModel.isaAltitudeFactorFtPerC`,
        ),
        referenceMassKg: requirePositiveNumber(
          rateModel.referenceMassKg,
          `${path}.climb.rateModel.referenceMassKg`,
        ),
        baseRateFtPerMin: requireFiniteNumber(
          rateModel.baseRateFtPerMin,
          `${path}.climb.rateModel.baseRateFtPerMin`,
        ),
        altitudeCoefficientPerFt: requireFiniteNumber(
          rateModel.altitudeCoefficientPerFt,
          `${path}.climb.rateModel.altitudeCoefficientPerFt`,
        ),
        massCoefficientPerKg: requireFiniteNumber(
          rateModel.massCoefficientPerKg,
          `${path}.climb.rateModel.massCoefficientPerKg`,
        ),
        altitudeMassCoefficientPerFtKg: requireFiniteNumber(
          rateModel.altitudeMassCoefficientPerFtKg,
          `${path}.climb.rateModel.altitudeMassCoefficientPerFtKg`,
        ),
      },
    },
    cruise: {
      iasKt: requirePositiveNumber(cruise.iasKt, `${path}.cruise.iasKt`),
      fuelFlowLph: requireNonNegativeNumber(
        cruise.fuelFlowLph,
        `${path}.cruise.fuelFlowLph`,
      ),
    },
    descent: {
      iasKt: requirePositiveNumber(descent.iasKt, `${path}.descent.iasKt`),
      fuelFlowLph: requireNonNegativeNumber(
        descent.fuelFlowLph,
        `${path}.descent.fuelFlowLph`,
      ),
      rateFtPerMin: requirePositiveNumber(
        descent.rateFtPerMin,
        `${path}.descent.rateFtPerMin`,
      ),
    },
  };
}

function requireAircraftDefinition(
  value: unknown,
  path: string,
): AircraftDefinition {
  const record = requireRecord(value, path);
  const revision = requireFiniteNumber(record.revision, `${path}.revision`);

  if (!Number.isInteger(revision) || revision <= 0) {
    throw new RangeError(`${path}.revision must be a positive integer`);
  }

  let fuelSystem: AircraftDefinition['fuelSystem'];
  if (record.fuelSystem !== undefined) {
    const fuel = requireRecord(record.fuelSystem, `${path}.fuelSystem`);
    const main = requireRecord(fuel.main, `${path}.fuelSystem.main`);
    const auxiliary = requireRecord(
      fuel.auxiliary,
      `${path}.fuelSystem.auxiliary`,
    );
    const allowance = requireRecord(
      fuel.groundDepartureAllowance,
      `${path}.fuelSystem.groundDepartureAllowance`,
    );
    const order = requireArray(
      fuel.consumptionOrder,
      `${path}.fuelSystem.consumptionOrder`,
    );
    if (order.length !== 2 || order[0] !== 'auxiliary' || order[1] !== 'main') {
      throw new RangeError(
        `${path}.fuelSystem.consumptionOrder must be auxiliary then main`,
      );
    }
    fuelSystem = {
      densityKgPerLitre: requirePositiveNumber(
        fuel.densityKgPerLitre,
        `${path}.fuelSystem.densityKgPerLitre`,
      ),
      main: {
        usableCapacityLitres: requirePositiveNumber(
          main.usableCapacityLitres,
          `${path}.fuelSystem.main.usableCapacityLitres`,
        ),
        armM: requireFiniteNumber(main.armM, `${path}.fuelSystem.main.armM`),
      },
      auxiliary: {
        usableCapacityLitres: requirePositiveNumber(
          auxiliary.usableCapacityLitres,
          `${path}.fuelSystem.auxiliary.usableCapacityLitres`,
        ),
        armM: requireFiniteNumber(
          auxiliary.armM,
          `${path}.fuelSystem.auxiliary.armM`,
        ),
      },
      consumptionOrder: ['auxiliary', 'main'],
      groundDepartureAllowance: {
        fuelLitres: requireNonNegativeNumber(
          allowance.fuelLitres,
          `${path}.fuelSystem.groundDepartureAllowance.fuelLitres`,
        ),
        planningTimeMinutes: requireNonNegativeNumber(
          allowance.planningTimeMinutes,
          `${path}.fuelSystem.groundDepartureAllowance.planningTimeMinutes`,
        ),
      },
      reserveFuelFlowLph: requirePositiveNumber(
        fuel.reserveFuelFlowLph,
        `${path}.fuelSystem.reserveFuelFlowLph`,
      ),
    };
  }

  let weightBalance: AircraftDefinition['weightBalance'];
  if (record.weightBalance !== undefined) {
    const loading = requireRecord(
      record.weightBalance,
      `${path}.weightBalance`,
    );
    weightBalance = {
      basicEmptyMassKg: requirePositiveNumber(
        loading.basicEmptyMassKg,
        `${path}.weightBalance.basicEmptyMassKg`,
      ),
      basicEmptyMomentKgm: requireFiniteNumber(
        loading.basicEmptyMomentKgm,
        `${path}.weightBalance.basicEmptyMomentKgm`,
      ),
      leftSeatArmM: requireFiniteNumber(
        loading.leftSeatArmM,
        `${path}.weightBalance.leftSeatArmM`,
      ),
      rightSeatArmM: requireFiniteNumber(
        loading.rightSeatArmM,
        `${path}.weightBalance.rightSeatArmM`,
      ),
      baggageArmM: requireFiniteNumber(
        loading.baggageArmM,
        `${path}.weightBalance.baggageArmM`,
      ),
      maximumBaggageMassKg: requireNonNegativeNumber(
        loading.maximumBaggageMassKg,
        `${path}.weightBalance.maximumBaggageMassKg`,
      ),
      maximumTakeoffMassKg: requirePositiveNumber(
        loading.maximumTakeoffMassKg,
        `${path}.weightBalance.maximumTakeoffMassKg`,
      ),
      maximumLandingMassKg: requirePositiveNumber(
        loading.maximumLandingMassKg,
        `${path}.weightBalance.maximumLandingMassKg`,
      ),
    };
  }

  return {
    aircraftId: requireString(record.aircraftId, `${path}.aircraftId`),
    revision,
    displayName: requireString(record.displayName, `${path}.displayName`),
    ...(record.registration === undefined
      ? {}
      : { registration: requireString(record.registration, `${path}.registration`) }),
    performance: requireAircraftPerformanceProfile(
      record.performance,
      `${path}.performance`,
    ),
    ...(fuelSystem === undefined ? {} : { fuelSystem }),
    ...(weightBalance === undefined ? {} : { weightBalance }),
  };
}

function migrateLegacyAircraftProfile(
  profile: LegacyAircraftPerformanceProfileV2,
): AircraftDefinition {
  const isProjectProfile = profile.profileId === 'project-aircraft-performance';

  return {
    ...(isProjectProfile ? PROJECT_AIRCRAFT_DEFINITION : {}),
    aircraftId: isProjectProfile
      ? PROJECT_AIRCRAFT_DEFINITION.aircraftId
      : profile.profileId,
    revision: profile.revision,
    displayName: isProjectProfile
      ? PROJECT_AIRCRAFT_DEFINITION.displayName
      : `Imported ${profile.profileId}`,
    performance: {
      climb: {
        iasKt: profile.climbIasKt,
        fuelFlowLph: profile.climbFuelFlowLph,
        rateModel: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE.climb.rateModel,
      },
      cruise: {
        iasKt: profile.cruiseIasKt,
        fuelFlowLph: profile.cruiseFuelFlowLph,
      },
      descent: {
        iasKt: profile.descentIasKt,
        fuelFlowLph: profile.descentFuelFlowLph,
        rateFtPerMin: profile.descentRateFtPerMin,
      },
    },
  };
}

function requirePlanningWeather(value: unknown, path: string) {
  const record = requireRecord(value, path);

  return {
    qnhHpa: requirePositiveNumber(record.qnhHpa, `${path}.qnhHpa`),
    isaDeviationC: requireFiniteNumber(
      record.isaDeviationC,
      `${path}.isaDeviationC`,
    ),
  };
}

function requirePerformanceInputs(
  value: unknown,
  path: string,
  flightPlan: FlightPlan,
  requireSectorStopPlans: boolean,
): AircraftPerformancePlanInputs | null {
  if (value === null) {
    return null;
  }

  const record = requireRecord(value, path);
  const legPlans = requireArray(
    record.legAltitudePlans,
    `${path}.legAltitudePlans`,
  );
  const adjacentLegKeys = new Set(
    flightPlan.waypoints.slice(1).map((waypoint, index) =>
      legKey(flightPlan.waypoints[index]!.id, waypoint.id),
    ),
  );
  const seenLegKeys = new Set<string>();
  const legAltitudePlans = legPlans.map((value, index) => {
    const legPath = `${path}.legAltitudePlans[${index}]`;
    const legRecord = requireRecord(value, legPath);
    const fromWaypointId = requireString(
      legRecord.fromWaypointId,
      `${legPath}.fromWaypointId`,
    );
    const toWaypointId = requireString(
      legRecord.toWaypointId,
      `${legPath}.toWaypointId`,
    );
    const key = legKey(fromWaypointId, toWaypointId);

    if (!adjacentLegKeys.has(key)) {
      throw new RangeError(
        `${legPath} does not match an adjacent waypoint leg`,
      );
    }
    if (seenLegKeys.has(key)) {
      throw new RangeError(`${legPath} duplicates an altitude plan`);
    }
    seenLegKeys.add(key);

    const altitudeFtMsl =
      legRecord.altitudeFtMsl === undefined
        ? undefined
        : requireNonNegativeNumber(
            legRecord.altitudeFtMsl,
            `${legPath}.altitudeFtMsl`,
          );
    let targetPlacement;

    if (legRecord.targetPlacement !== undefined) {
      const placement = requireRecord(
        legRecord.targetPlacement,
        `${legPath}.targetPlacement`,
      );

      if (placement.mode === 'automatic') {
        targetPlacement = { mode: 'automatic' as const };
      } else if (placement.mode === 'distance-along-leg') {
        targetPlacement = {
          mode: 'distance-along-leg' as const,
          distanceFromStartNm: requireNonNegativeNumber(
            placement.distanceFromStartNm,
            `${legPath}.targetPlacement.distanceFromStartNm`,
          ),
        };
      } else {
        throw new RangeError(
          `${legPath}.targetPlacement.mode is not supported`,
        );
      }
    }

    return {
      fromWaypointId,
      toWaypointId,
      ...(altitudeFtMsl === undefined ? {} : { altitudeFtMsl }),
      ...(targetPlacement === undefined ? {} : { targetPlacement }),
    };
  });
  const rawSectorStopPlans =
    record.sectorStopPlans === undefined && !requireSectorStopPlans
      ? []
      : requireArray(record.sectorStopPlans, `${path}.sectorStopPlans`);
  const boundaryIds = new Set(flightPlan.sectorBoundaryWaypointIds ?? []);
  const seenStopIds = new Set<string>();
  const sectorStopPlans = rawSectorStopPlans.map((value, index) => {
    const stopPath = `${path}.sectorStopPlans[${index}]`;
    const stopRecord = requireRecord(value, stopPath);
    const waypointId = requireString(
      stopRecord.waypointId,
      `${stopPath}.waypointId`,
    );

    if (!boundaryIds.has(waypointId)) {
      throw new RangeError(`${stopPath} is not a route sector boundary`);
    }
    if (seenStopIds.has(waypointId)) {
      throw new RangeError(`${stopPath} duplicates a sector stop plan`);
    }
    seenStopIds.add(waypointId);

    let onwardDepartureTimeUtcMs: number | undefined;
    let stopDurationMinutes: number | undefined;

    if (stopRecord.stopDurationMinutes !== undefined) {
      stopDurationMinutes = requireNonNegativeNumber(
        stopRecord.stopDurationMinutes,
        `${stopPath}.stopDurationMinutes`,
      );
    }

    if (stopRecord.onwardDepartureTimeUtcMs !== undefined) {
      onwardDepartureTimeUtcMs = requireFiniteNumber(
        stopRecord.onwardDepartureTimeUtcMs,
        `${stopPath}.onwardDepartureTimeUtcMs`,
      );

      if (!Number.isFinite(new Date(onwardDepartureTimeUtcMs).getTime())) {
        throw new RangeError(
          `${stopPath}.onwardDepartureTimeUtcMs must be a valid UTC timestamp`,
        );
      }
    }

    if (
      stopDurationMinutes !== undefined &&
      onwardDepartureTimeUtcMs !== undefined
    ) {
      throw new RangeError(
        `${stopPath} cannot contain both stopDurationMinutes and onwardDepartureTimeUtcMs`,
      );
    }

    return {
      waypointId,
      elevationFtMsl: requireNonNegativeNumber(
        stopRecord.elevationFtMsl,
        `${stopPath}.elevationFtMsl`,
      ),
      weather: requirePlanningWeather(
        stopRecord.weather,
        `${stopPath}.weather`,
      ),
      ...(stopDurationMinutes === undefined ? {} : { stopDurationMinutes }),
      ...(onwardDepartureTimeUtcMs === undefined
        ? {}
        : { onwardDepartureTimeUtcMs }),
    };
  });

  if (
    requireSectorStopPlans &&
    sectorStopPlans.length !== (flightPlan.sectorBoundaryWaypointIds ?? []).length
  ) {
    throw new RangeError(
      `${path}.sectorStopPlans must provide every route sector boundary`,
    );
  }

  return {
    massKg: requirePositiveNumber(record.massKg, `${path}.massKg`),
    defaultAltitudeFtMsl: requireNonNegativeNumber(
      record.defaultAltitudeFtMsl,
      `${path}.defaultAltitudeFtMsl`,
    ),
    departureElevationFtMsl: requireNonNegativeNumber(
      record.departureElevationFtMsl,
      `${path}.departureElevationFtMsl`,
    ),
    destinationElevationFtMsl: requireNonNegativeNumber(
      record.destinationElevationFtMsl,
      `${path}.destinationElevationFtMsl`,
    ),
    patternHeightAglFt: requireNonNegativeNumber(
      record.patternHeightAglFt,
      `${path}.patternHeightAglFt`,
    ),
    departureWeather: requirePlanningWeather(
      record.departureWeather,
      `${path}.departureWeather`,
    ),
    destinationWeather: requirePlanningWeather(
      record.destinationWeather,
      `${path}.destinationWeather`,
    ),
    legAltitudePlans,
    sectorStopPlans,
  };
}

function requireOperationalInputs(
  value: unknown,
  path: string,
  flightPlan: FlightPlan,
  aircraft: AircraftDefinition,
): OperationalPlanningInputs | null {
  if (value === null) {
    return null;
  }

  const record = requireRecord(value, path);
  const fuelOnboardLitres = requireNonNegativeNumber(
    record.fuelOnboardLitres,
    `${path}.fuelOnboardLitres`,
  );
  const baggageMassKg = requireNonNegativeNumber(
    record.baggageMassKg,
    `${path}.baggageMassKg`,
  );

  if (aircraft.fuelSystem === undefined || aircraft.weightBalance === undefined) {
    throw new RangeError(
      `${path} requires an aircraft fuel-system and weight-and-balance definition`,
    );
  }

  const usableCapacityLitres =
    aircraft.fuelSystem.main.usableCapacityLitres +
    aircraft.fuelSystem.auxiliary.usableCapacityLitres;
  if (fuelOnboardLitres > usableCapacityLitres) {
    throw new RangeError(
      `${path}.fuelOnboardLitres must not exceed ${usableCapacityLitres}`,
    );
  }
  if (baggageMassKg > aircraft.weightBalance.maximumBaggageMassKg) {
    throw new RangeError(
      `${path}.baggageMassKg must not exceed ${aircraft.weightBalance.maximumBaggageMassKg}`,
    );
  }

  const boundaryIds = new Set(flightPlan.sectorBoundaryWaypointIds ?? []);
  const seenOperationIds = new Set<string>();
  const sectorOperations = requireArray(
    record.sectorOperations,
    `${path}.sectorOperations`,
  ).map((value, index) => {
    const operationPath = `${path}.sectorOperations[${index}]`;
    const operation = requireRecord(value, operationPath);
    const waypointId = requireString(
      operation.waypointId,
      `${operationPath}.waypointId`,
    );
    if (!boundaryIds.has(waypointId)) {
      throw new RangeError(`${operationPath} is not a route sector boundary`);
    }
    if (seenOperationIds.has(waypointId)) {
      throw new RangeError(`${operationPath} duplicates a sector operation`);
    }
    seenOperationIds.add(waypointId);

    if (operation.kind !== 'touch-and-go' && operation.kind !== 'full-stop') {
      throw new RangeError(`${operationPath}.kind is not supported`);
    }
    const departureFuelOnboardLitres =
      operation.departureFuelOnboardLitres === undefined
        ? undefined
        : requireNonNegativeNumber(
            operation.departureFuelOnboardLitres,
            `${operationPath}.departureFuelOnboardLitres`,
          );
    if (
      operation.kind === 'touch-and-go' &&
      departureFuelOnboardLitres !== undefined
    ) {
      throw new RangeError(
        `${operationPath} cannot refuel during a touch-and-go`,
      );
    }
    if (
      departureFuelOnboardLitres !== undefined &&
      departureFuelOnboardLitres > usableCapacityLitres
    ) {
      throw new RangeError(
        `${operationPath}.departureFuelOnboardLitres must not exceed ${usableCapacityLitres}`,
      );
    }

    return {
      waypointId,
      kind: operation.kind as 'touch-and-go' | 'full-stop',
      ...(departureFuelOnboardLitres === undefined
        ? {}
        : { departureFuelOnboardLitres }),
    };
  });

  if (sectorOperations.length !== boundaryIds.size) {
    throw new RangeError(
      `${path}.sectorOperations must provide every route sector boundary`,
    );
  }

  let alternate: OperationalPlanningInputs['alternate'];
  if (record.alternate === null) {
    alternate = null;
  } else {
    const alternateRecord = requireRecord(record.alternate, `${path}.alternate`);
    const waypoint = requireWaypoint(
      alternateRecord.waypoint,
      `${path}.alternate.waypoint`,
    );
    if (flightPlan.waypoints.some(({ id }) => id === waypoint.id)) {
      throw new RangeError(`${path}.alternate.waypoint.id must be route-unique`);
    }
    alternate = {
      waypoint,
      elevationFtMsl: requireNonNegativeNumber(
        alternateRecord.elevationFtMsl,
        `${path}.alternate.elevationFtMsl`,
      ),
      weather: requirePlanningWeather(
        alternateRecord.weather,
        `${path}.alternate.weather`,
      ),
      altitudeFtMsl: requireNonNegativeNumber(
        alternateRecord.altitudeFtMsl,
        `${path}.alternate.altitudeFtMsl`,
      ),
    };
  }

  return {
    fuelOnboardLitres,
    leftSeatMassKg: requireNonNegativeNumber(
      record.leftSeatMassKg,
      `${path}.leftSeatMassKg`,
    ),
    rightSeatMassKg: requireNonNegativeNumber(
      record.rightSeatMassKg,
      `${path}.rightSeatMassKg`,
    ),
    baggageMassKg,
    extraFuelLitres: requireNonNegativeNumber(
      record.extraFuelLitres,
      `${path}.extraFuelLitres`,
    ),
    finalReserveMinutes: requireNonNegativeNumber(
      record.finalReserveMinutes,
      `${path}.finalReserveMinutes`,
    ),
    sectorOperations,
    alternate,
  };
}

export function parseFlightPlanningDocument(
  value: unknown,
): FlightPlanningDocument {
  const record = requireRecord(value, 'document');

  if (
    record.schemaVersion !== FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION &&
    record.schemaVersion !== LEGACY_STOP_DURATION_DOCUMENT_SCHEMA_VERSION &&
    record.schemaVersion !== LEGACY_SECTOR_DEPARTURE_DOCUMENT_SCHEMA_VERSION &&
    record.schemaVersion !== LEGACY_AIRCRAFT_DEFINITION_DOCUMENT_SCHEMA_VERSION &&
    record.schemaVersion !== LEGACY_AIRCRAFT_PROFILE_DOCUMENT_SCHEMA_VERSION &&
    record.schemaVersion !== LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION
  ) {
    throw new RangeError(
      `Unsupported flight-planning document schema version ${String(record.schemaVersion)}`,
    );
  }

  if (typeof record.useForecastWinds !== 'boolean') {
    throw new RangeError('document.useForecastWinds must be a boolean');
  }

  const flightPlan = requireFlightPlan(
    record.flightPlan,
    'document.flightPlan',
    record.schemaVersion === FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION ||
      record.schemaVersion === LEGACY_STOP_DURATION_DOCUMENT_SCHEMA_VERSION ||
      record.schemaVersion === LEGACY_SECTOR_DEPARTURE_DOCUMENT_SCHEMA_VERSION,
  );

  if (record.schemaVersion === LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION) {
    const legacyPlanning = requirePlanningInputs(
      record.planningInputs,
      'document.planningInputs',
    );

    return {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: {
        departureTimeUtcMs: legacyPlanning.departureTimeUtcMs,
        magneticVariationDegEast: legacyPlanning.magneticVariationDegEast,
        wind: legacyPlanning.wind,
      },
      aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
      performanceInputs: null,
      operationalInputs: null,
      useForecastWinds: record.useForecastWinds,
    };
  }

  if (
    record.schemaVersion === LEGACY_AIRCRAFT_PROFILE_DOCUMENT_SCHEMA_VERSION
  ) {
    return {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: requireRoutePlanningInputs(
        record.planningInputs,
        'document.planningInputs',
      ),
      aircraftDefinition: migrateLegacyAircraftProfile(
        requireLegacyAircraftPerformanceProfileV2(
          record.aircraftPerformanceProfile,
          'document.aircraftPerformanceProfile',
        ),
      ),
      performanceInputs: requirePerformanceInputs(
        record.performanceInputs,
        'document.performanceInputs',
        flightPlan,
        false,
      ),
      operationalInputs: null,
      useForecastWinds: record.useForecastWinds,
    };
  }

  if (
    record.schemaVersion ===
    LEGACY_AIRCRAFT_DEFINITION_DOCUMENT_SCHEMA_VERSION
  ) {
    return {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: requireRoutePlanningInputs(
        record.planningInputs,
        'document.planningInputs',
      ),
      aircraftDefinition: requireAircraftDefinition(
        record.aircraftDefinition,
        'document.aircraftDefinition',
      ),
      performanceInputs: requirePerformanceInputs(
        record.performanceInputs,
        'document.performanceInputs',
        flightPlan,
        false,
      ),
      operationalInputs: null,
      useForecastWinds: record.useForecastWinds,
    };
  }

  if (
    record.schemaVersion === LEGACY_SECTOR_DEPARTURE_DOCUMENT_SCHEMA_VERSION
  ) {
    return {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: requireRoutePlanningInputs(
        record.planningInputs,
        'document.planningInputs',
      ),
      aircraftDefinition: requireAircraftDefinition(
        record.aircraftDefinition,
        'document.aircraftDefinition',
      ),
      performanceInputs: requirePerformanceInputs(
        record.performanceInputs,
        'document.performanceInputs',
        flightPlan,
        true,
      ),
      operationalInputs: null,
      useForecastWinds: record.useForecastWinds,
    };
  }

  if (record.schemaVersion === LEGACY_STOP_DURATION_DOCUMENT_SCHEMA_VERSION) {
    return {
      schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
      flightPlan,
      planningInputs: requireRoutePlanningInputs(
        record.planningInputs,
        'document.planningInputs',
      ),
      aircraftDefinition: requireAircraftDefinition(
        record.aircraftDefinition,
        'document.aircraftDefinition',
      ),
      performanceInputs: requirePerformanceInputs(
        record.performanceInputs,
        'document.performanceInputs',
        flightPlan,
        true,
      ),
      operationalInputs: null,
      useForecastWinds: record.useForecastWinds,
    };
  }

  const aircraftDefinition = requireAircraftDefinition(
    record.aircraftDefinition,
    'document.aircraftDefinition',
  );

  return {
    schemaVersion: FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION,
    flightPlan,
    planningInputs: requireRoutePlanningInputs(
      record.planningInputs,
      'document.planningInputs',
    ),
    aircraftDefinition,
    performanceInputs: requirePerformanceInputs(
      record.performanceInputs,
      'document.performanceInputs',
      flightPlan,
      true,
    ),
    operationalInputs: requireOperationalInputs(
      record.operationalInputs,
      'document.operationalInputs',
      flightPlan,
      aircraftDefinition,
    ),
    useForecastWinds: record.useForecastWinds,
  };
}

export function parseFlightPlanningDocumentJson(
  json: string,
): FlightPlanningDocument {
  let value: unknown;

  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new RangeError('Flight-planning document is not valid JSON');
  }

  return parseFlightPlanningDocument(value);
}

export function serializeFlightPlanningDocument(
  document: FlightPlanningDocument,
): string {
  const validatedDocument = parseFlightPlanningDocument(document);
  return `${JSON.stringify(validatedDocument, null, 2)}\n`;
}
