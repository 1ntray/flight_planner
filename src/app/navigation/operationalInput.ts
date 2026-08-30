import { MAX_SUPPORTED_PLANNING_ALTITUDE_FT } from '../../domain';
import type {
  AircraftDefinition,
  OperationalPlanningInputs,
  Waypoint,
} from '../../domain';

export interface SectorOperationInputDraft {
  waypointId: string;
  kind: 'touch-and-go' | 'full-stop';
  departureFuelOnboardLitres: string;
}

export interface OperationalInputDraft {
  fuelOnboardLitres: string;
  leftSeatMassKg: string;
  rightSeatMassKg: string;
  baggageMassKg: string;
  extraFuelLitres: string;
  finalReserveLitres: string;
  sectorOperations: readonly SectorOperationInputDraft[];
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
    fuelOnboardLitres: '224',
    leftSeatMassKg: '56',
    rightSeatMassKg: '0',
    baggageMassKg: '15',
    extraFuelLitres: '18',
    finalReserveLitres: '36',
    sectorOperations: [],
    alternateEnabled: false,
    alternateWaypoint: null,
    alternatePlannedAltitudeFtMsl: '2500',
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

export function createOperationalInputDraft(
  inputs: OperationalPlanningInputs,
): OperationalInputDraft {
  const alternate = inputs.alternate;
  return {
    fuelOnboardLitres: String(inputs.fuelOnboardLitres),
    leftSeatMassKg: String(inputs.leftSeatMassKg),
    rightSeatMassKg: String(inputs.rightSeatMassKg),
    baggageMassKg: String(inputs.baggageMassKg),
    extraFuelLitres: String(inputs.extraFuelLitres),
    finalReserveLitres: String(inputs.finalReserveLitres),
    sectorOperations: inputs.sectorOperations.map((operation) => ({
      waypointId: operation.waypointId,
      kind: operation.kind,
      departureFuelOnboardLitres:
        operation.departureFuelOnboardLitres === undefined
          ? ''
          : String(operation.departureFuelOnboardLitres),
    })),
    alternateEnabled: alternate !== null,
    alternateWaypoint: alternate?.waypoint ?? null,
    alternatePlannedAltitudeFtMsl:
      alternate === null ? '2500' : String(alternate.plannedAltitudeFtMsl),
    alternateDistanceNm: alternate === null ? '' : String(alternate.distanceNm),
    alternateTimeMinutes: alternate === null ? '' : String(alternate.timeMinutes),
    alternateFuelLitres: alternate === null ? '' : String(alternate.fuelLitres),
  };
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
): OperationalInputParseResult {
  const operationalStarted =
    [
      draft.fuelOnboardLitres,
      draft.leftSeatMassKg,
      draft.rightSeatMassKg,
      draft.baggageMassKg,
    ].some((value) => value.trim() !== '') || draft.alternateEnabled;

  if (!operationalStarted) {
    return { status: 'empty' };
  }
  if (aircraft.fuelSystem === undefined || aircraft.weightBalance === undefined) {
    return {
      status: 'invalid',
      message: 'The selected aircraft has no operational loading definition',
    };
  }

  const fields = [
    [draft.fuelOnboardLitres, 'Fuel onboard'],
    [draft.leftSeatMassKg, 'Left-seat mass'],
    [draft.rightSeatMassKg, 'Right-seat mass'],
    [draft.baggageMassKg, 'Baggage mass'],
    [draft.extraFuelLitres, 'Extra fuel'],
    [draft.finalReserveLitres, 'Final reserve'],
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

  let alternate: OperationalPlanningInputs['alternate'] = null;
  if (draft.alternateEnabled) {
    const alternateFields = [
      [draft.alternatePlannedAltitudeFtMsl, 'Alternate planned altitude', 0],
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
      alternate,
    },
  };
}
