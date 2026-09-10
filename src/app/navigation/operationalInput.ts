import { MAX_SUPPORTED_PLANNING_ALTITUDE_FT } from '../../domain';
import type {
  AircraftDefinition,
  OperationalInputOverrides,
  OperationalPlanningInputs,
  Waypoint,
} from '../../domain';

export const DEFAULT_FUEL_ONBOARD_LITRES = 224;
export const DEFAULT_LEFT_SEAT_MASS_KG = 56;
export const DEFAULT_RIGHT_SEAT_MASS_KG = 0;
export const DEFAULT_BAGGAGE_MASS_KG = 15;
export const DEFAULT_EXTRA_FUEL_LITRES = 18;
export const DEFAULT_FINAL_RESERVE_LITRES = 36;
export const DEFAULT_ALTERNATE_PLANNED_ALTITUDE_FT_MSL = 2500;

export interface SectorOperationInputDraft {
  waypointId: string;
  kind: 'touch-and-go' | 'full-stop';
  departureFuelOnboardLitres: string;
}

export interface AerodromePatternInputDraft {
  waypointId: string;
  patternCount: string;
  /** Omitted means the standard arrival buffer is enabled. */
  arrivalBufferEnabled?: boolean;
}

export interface OperationalInputDraft {
  fuelOnboardLitres: string;
  leftSeatMassKg: string;
  rightSeatMassKg: string;
  baggageMassKg: string;
  extraFuelLitres: string;
  finalReserveLitres: string;
  sectorOperations: readonly SectorOperationInputDraft[];
  patternPlans: readonly AerodromePatternInputDraft[];
  alternateEnabled: boolean;
  /** Snapshot chosen from an aerodrome feature; never a primary route waypoint. */
  alternateWaypoint: Waypoint | null;
  alternatePlannedAltitudeFtMsl: string;
  alternateDistanceNm: string;
  alternateTimeMinutes: string;
  alternateFuelLitres: string;
}

export type OperationalInputParseResult =
  | { status: 'empty' }
  | { status: 'valid'; value: OperationalPlanningInputs }
  | { status: 'invalid'; message: string };

export function createEmptyOperationalInputDraft(): OperationalInputDraft {
  return {
    fuelOnboardLitres: '',
    leftSeatMassKg: '',
    rightSeatMassKg: '',
    baggageMassKg: '',
    extraFuelLitres: '',
    finalReserveLitres: '',
    sectorOperations: [],
    patternPlans: [],
    alternateEnabled: false,
    alternateWaypoint: null,
    alternatePlannedAltitudeFtMsl: '',
    alternateDistanceNm: '',
    alternateTimeMinutes: '',
    alternateFuelLitres: '',
  };
}

export function createEmptySectorOperationInputDraft(
  waypointId: string,
): SectorOperationInputDraft {
  return {
    waypointId,
    kind: 'touch-and-go',
    departureFuelOnboardLitres: '',
  };
}

export function createEmptyAerodromePatternInputDraft(
  waypointId: string,
): AerodromePatternInputDraft {
  return { waypointId, patternCount: '', arrivalBufferEnabled: true };
}

export function createOperationalInputDraft(
  inputs: OperationalPlanningInputs,
  overrides: OperationalInputOverrides | null | undefined = undefined,
): OperationalInputDraft {
  const alternate = inputs.alternate;
  const isExplicit = (field: keyof OperationalInputOverrides) =>
    overrides === undefined || overrides?.[field] === true;
  const valueOrDefault = (
    value: number,
    defaultValue: number,
    explicit: boolean,
  ) => explicit && value !== defaultValue ? String(value) : '';

  return {
    fuelOnboardLitres: valueOrDefault(
      inputs.fuelOnboardLitres,
      DEFAULT_FUEL_ONBOARD_LITRES,
      isExplicit('fuelOnboardLitres'),
    ),
    leftSeatMassKg: valueOrDefault(
      inputs.leftSeatMassKg,
      DEFAULT_LEFT_SEAT_MASS_KG,
      isExplicit('leftSeatMassKg'),
    ),
    rightSeatMassKg: valueOrDefault(
      inputs.rightSeatMassKg,
      DEFAULT_RIGHT_SEAT_MASS_KG,
      isExplicit('rightSeatMassKg'),
    ),
    baggageMassKg: valueOrDefault(
      inputs.baggageMassKg,
      DEFAULT_BAGGAGE_MASS_KG,
      isExplicit('baggageMassKg'),
    ),
    extraFuelLitres: valueOrDefault(
      inputs.extraFuelLitres,
      DEFAULT_EXTRA_FUEL_LITRES,
      isExplicit('extraFuelLitres'),
    ),
    finalReserveLitres: valueOrDefault(
      inputs.finalReserveLitres,
      DEFAULT_FINAL_RESERVE_LITRES,
      isExplicit('finalReserveLitres'),
    ),
    sectorOperations: inputs.sectorOperations.map((operation) => ({
      waypointId: operation.waypointId,
      kind: operation.kind,
      departureFuelOnboardLitres:
        operation.departureFuelOnboardLitres === undefined
          ? ''
          : String(operation.departureFuelOnboardLitres),
    })),
    patternPlans: (inputs.patternPlans ?? []).map((plan) => ({
      waypointId: plan.waypointId,
      patternCount: String(plan.patternCount),
      arrivalBufferEnabled: plan.arrivalBufferEnabled ?? true,
    })),
    alternateEnabled: alternate !== null,
    alternateWaypoint: alternate?.waypoint ?? null,
    alternatePlannedAltitudeFtMsl:
      alternate === null
        ? ''
        : valueOrDefault(
            alternate.plannedAltitudeFtMsl,
            DEFAULT_ALTERNATE_PLANNED_ALTITUDE_FT_MSL,
            isExplicit('alternatePlannedAltitudeFtMsl'),
          ),
    alternateDistanceNm: alternate === null ? '' : String(alternate.distanceNm),
    alternateTimeMinutes: alternate === null ? '' : String(alternate.timeMinutes),
    alternateFuelLitres: alternate === null ? '' : String(alternate.fuelLitres),
  };
}

/** Captures user changes while leaving standard loading values as defaults. */
export function createOperationalInputOverrides(
  draft: OperationalInputDraft,
): OperationalInputOverrides | null {
  const isEntered = (value: string) => value.trim() !== '';
  const overrides: OperationalInputOverrides = {
    ...(isEntered(draft.fuelOnboardLitres) ? { fuelOnboardLitres: true } : {}),
    ...(isEntered(draft.leftSeatMassKg) ? { leftSeatMassKg: true } : {}),
    ...(isEntered(draft.rightSeatMassKg) ? { rightSeatMassKg: true } : {}),
    ...(isEntered(draft.baggageMassKg) ? { baggageMassKg: true } : {}),
    ...(isEntered(draft.extraFuelLitres) ? { extraFuelLitres: true } : {}),
    ...(isEntered(draft.finalReserveLitres) ? { finalReserveLitres: true } : {}),
    ...(isEntered(draft.alternatePlannedAltitudeFtMsl)
      ? { alternatePlannedAltitudeFtMsl: true }
      : {}),
  };
  return Object.keys(overrides).length === 0 ? null : overrides;
}

function parseNumber(
  value: string,
  label: string,
  minimum = 0,
): number | string {
  if (value.trim() === '') {
    return `${label} is required`;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return `${label} must be a number`;
  }
  if (parsed < minimum) {
    return `${label} must be at least ${minimum}`;
  }
  return parsed;
}

export function parseOperationalInputDraft(
  draft: OperationalInputDraft,
  aircraft: AircraftDefinition,
  sectorBoundaryWaypointIds: readonly string[] = [],
  landingWaypointIds: readonly string[] = sectorBoundaryWaypointIds,
): OperationalInputParseResult {
  if (aircraft.fuelSystem === undefined || aircraft.weightBalance === undefined) {
    return {
      status: 'invalid',
      message: 'The selected aircraft has no operational loading definition',
    };
  }

  const fields = [
    [
      draft.fuelOnboardLitres.trim() === ''
        ? String(DEFAULT_FUEL_ONBOARD_LITRES)
        : draft.fuelOnboardLitres,
      'Fuel onboard',
    ],
    [
      draft.leftSeatMassKg.trim() === ''
        ? String(DEFAULT_LEFT_SEAT_MASS_KG)
        : draft.leftSeatMassKg,
      'Left-seat mass',
    ],
    [
      draft.rightSeatMassKg.trim() === ''
        ? String(DEFAULT_RIGHT_SEAT_MASS_KG)
        : draft.rightSeatMassKg,
      'Right-seat mass',
    ],
    [
      draft.baggageMassKg.trim() === ''
        ? String(DEFAULT_BAGGAGE_MASS_KG)
        : draft.baggageMassKg,
      'Baggage mass',
    ],
    [
      draft.extraFuelLitres.trim() === ''
        ? String(DEFAULT_EXTRA_FUEL_LITRES)
        : draft.extraFuelLitres,
      'Extra fuel',
    ],
    [
      draft.finalReserveLitres.trim() === ''
        ? String(DEFAULT_FINAL_RESERVE_LITRES)
        : draft.finalReserveLitres,
      'Final reserve',
    ],
  ] as const;
  const parsed: number[] = [];
  for (const [value, label] of fields) {
    const result = parseNumber(value, label);
    if (typeof result === 'string') {
      return { status: 'invalid', message: result };
    }
    parsed.push(result);
  }
  const [
    fuelOnboardLitres,
    leftSeatMassKg,
    rightSeatMassKg,
    baggageMassKg,
    extraFuelLitres,
    finalReserveLitres,
  ] = parsed as [number, number, number, number, number, number];
  const capacity =
    aircraft.fuelSystem.main.usableCapacityLitres +
    aircraft.fuelSystem.auxiliary.usableCapacityLitres;
  if (fuelOnboardLitres > capacity) {
    return {
      status: 'invalid',
      message: `Fuel onboard must not exceed ${capacity} L`,
    };
  }
  if (fuelOnboardLitres < aircraft.fuelSystem.groundDepartureAllowance.fuelLitres) {
    return {
      status: 'invalid',
      message: `Fuel onboard must cover the ${aircraft.fuelSystem.groundDepartureAllowance.fuelLitres} L ground allowance`,
    };
  }
  if (baggageMassKg > aircraft.weightBalance.maximumBaggageMassKg) {
    return {
      status: 'invalid',
      message: `Baggage must not exceed ${aircraft.weightBalance.maximumBaggageMassKg} kg`,
    };
  }

  const requiredBoundaryIds = new Set(sectorBoundaryWaypointIds);
  const operationsById = new Map(
    draft.sectorOperations.map((operation) => [operation.waypointId, operation]),
  );
  if (
    operationsById.size !== requiredBoundaryIds.size ||
    [...operationsById.keys()].some((id) => !requiredBoundaryIds.has(id))
  ) {
    return {
      status: 'invalid',
      message: 'Choose an operation for every intermediate airport',
    };
  }

  const sectorOperations = [];
  for (const waypointId of sectorBoundaryWaypointIds) {
    const operation = operationsById.get(waypointId)!;
    if (operation.kind === 'touch-and-go') {
      sectorOperations.push({ waypointId, kind: 'touch-and-go' as const });
      continue;
    }
    const departureFuelOnboardLitres =
      operation.departureFuelOnboardLitres.trim() === ''
        ? undefined
        : parseNumber(
            operation.departureFuelOnboardLitres,
            'Full-stop fuel onboard',
          );
    if (typeof departureFuelOnboardLitres === 'string') {
      return { status: 'invalid', message: departureFuelOnboardLitres };
    }
    if (
      departureFuelOnboardLitres !== undefined &&
      departureFuelOnboardLitres > capacity
    ) {
      return {
        status: 'invalid',
        message: `Full-stop fuel onboard must not exceed ${capacity} L`,
      };
    }
    if (
      departureFuelOnboardLitres !== undefined &&
      departureFuelOnboardLitres <
        aircraft.fuelSystem.groundDepartureAllowance.fuelLitres
    ) {
      return {
        status: 'invalid',
        message: `Full-stop fuel onboard must cover the ${aircraft.fuelSystem.groundDepartureAllowance.fuelLitres} L ground allowance`,
      };
    }
    sectorOperations.push({
      waypointId,
      kind: 'full-stop' as const,
      ...(departureFuelOnboardLitres === undefined
        ? {}
        : { departureFuelOnboardLitres }),
    });
  }

  const allowedPatternWaypointIds = new Set(landingWaypointIds);
  const seenPatternWaypointIds = new Set<string>();
  const patternPlans = [];
  for (const plan of draft.patternPlans) {
    if (!allowedPatternWaypointIds.has(plan.waypointId)) {
      return {
        status: 'invalid',
        message: `Pattern plan ${plan.waypointId} is not a route landing airport`,
      };
    }
    if (seenPatternWaypointIds.has(plan.waypointId)) {
      return {
        status: 'invalid',
        message: `Pattern plan ${plan.waypointId} is duplicated`,
      };
    }
    seenPatternWaypointIds.add(plan.waypointId);
    const patternCount = plan.patternCount.trim() === ''
      ? 0
      : parseNumber(plan.patternCount, 'Pattern count');
    if (typeof patternCount === 'string') {
      return { status: 'invalid', message: patternCount };
    }
    if (!Number.isInteger(patternCount)) {
      return { status: 'invalid', message: 'Pattern count must be a whole number' };
    }
    const arrivalBufferEnabled = plan.arrivalBufferEnabled ?? true;
    if (patternCount > 0 || !arrivalBufferEnabled) {
      patternPlans.push({
        waypointId: plan.waypointId,
        patternCount,
        ...(arrivalBufferEnabled ? {} : { arrivalBufferEnabled: false }),
      });
    }
  }

  let alternate: OperationalPlanningInputs['alternate'] = null;
  if (draft.alternateEnabled) {
    const alternateFields = [
      [
        draft.alternatePlannedAltitudeFtMsl.trim() === ''
          ? String(DEFAULT_ALTERNATE_PLANNED_ALTITUDE_FT_MSL)
          : draft.alternatePlannedAltitudeFtMsl,
        'Alternate planned altitude',
        0,
      ],
      [draft.alternateDistanceNm, 'Alternate distance', 0],
      [draft.alternateTimeMinutes, 'Alternate time', 0],
      [draft.alternateFuelLitres, 'Alternate fuel', 0],
    ] as const;
    const alternateParsed: number[] = [];
    for (const [value, label, minimum] of alternateFields) {
      const result = parseNumber(value, label, minimum);
      if (typeof result === 'string') {
        return { status: 'invalid', message: result };
      }
      alternateParsed.push(result);
    }
    const [
      plannedAltitudeFtMsl,
      distanceNm,
      timeMinutes,
      fuelLitres,
    ] = alternateParsed as [number, number, number, number];
    if (plannedAltitudeFtMsl > MAX_SUPPORTED_PLANNING_ALTITUDE_FT) {
      return {
        status: 'invalid',
        message: `Alternate planned altitude must not exceed ${MAX_SUPPORTED_PLANNING_ALTITUDE_FT} ft`,
      };
    }
    if (draft.alternateWaypoint === null) {
      return {
        status: 'invalid',
        message: 'Choose an alternate aerodrome by ICAO code',
      };
    }
    alternate = {
      waypoint: draft.alternateWaypoint,
      plannedAltitudeFtMsl,
      distanceNm,
      timeMinutes,
      fuelLitres,
    };
  }

  return {
    status: 'valid',
    value: {
      fuelOnboardLitres,
      leftSeatMassKg,
      rightSeatMassKg,
      baggageMassKg,
      extraFuelLitres,
      finalReserveLitres,
      sectorOperations,
      patternPlans,
      alternate,
    },
  };
}
