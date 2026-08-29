import type {
  AircraftDefinition,
  OperationalPlanningInputs,
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
  finalReserveMinutes: string;
  sectorOperations: readonly SectorOperationInputDraft[];
  alternateEnabled: boolean;
  alternateWaypointId: string;
  alternateName: string;
  alternateLatitude: string;
  alternateLongitude: string;
  alternateElevationFtMsl: string;
  alternateQnhHpa: string;
  alternateIsaDeviationC: string;
  alternateAltitudeFtMsl: string;
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
    extraFuelLitres: '18',
    finalReserveMinutes: '60',
    sectorOperations: [],
    alternateEnabled: false,
    alternateWaypointId: 'alternate',
    alternateName: '',
    alternateLatitude: '',
    alternateLongitude: '',
    alternateElevationFtMsl: '',
    alternateQnhHpa: '',
    alternateIsaDeviationC: '',
    alternateAltitudeFtMsl: '',
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
    finalReserveMinutes: String(inputs.finalReserveMinutes),
    sectorOperations: inputs.sectorOperations.map((operation) => ({
      waypointId: operation.waypointId,
      kind: operation.kind,
      departureFuelOnboardLitres:
        operation.departureFuelOnboardLitres === undefined
          ? ''
          : String(operation.departureFuelOnboardLitres),
    })),
    alternateEnabled: alternate !== null,
    alternateWaypointId: alternate?.waypoint.id ?? 'alternate',
    alternateName: alternate?.waypoint.name ?? '',
    alternateLatitude: alternate === null
      ? ''
      : String(alternate.waypoint.position.latitude),
    alternateLongitude: alternate === null
      ? ''
      : String(alternate.waypoint.position.longitude),
    alternateElevationFtMsl: alternate === null
      ? ''
      : String(alternate.elevationFtMsl),
    alternateQnhHpa: alternate === null
      ? ''
      : String(alternate.weather.qnhHpa),
    alternateIsaDeviationC: alternate === null
      ? ''
      : String(alternate.weather.isaDeviationC),
    alternateAltitudeFtMsl: alternate === null
      ? ''
      : String(alternate.altitudeFtMsl),
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
    [draft.finalReserveMinutes, 'Final reserve'],
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
    finalReserveMinutes,
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
    if (draft.alternateName.trim() === '') {
      return { status: 'invalid', message: 'Alternate name is required' };
    }
    const alternateFields = [
      [draft.alternateLatitude, 'Alternate latitude', -90],
      [draft.alternateLongitude, 'Alternate longitude', -180],
      [draft.alternateElevationFtMsl, 'Alternate elevation', 0],
      [draft.alternateQnhHpa, 'Alternate QNH', 0.1],
      [draft.alternateIsaDeviationC, 'Alternate ISA deviation', -100],
      [draft.alternateAltitudeFtMsl, 'Alternate altitude', 0],
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
      latitude,
      longitude,
      elevationFtMsl,
      qnhHpa,
      isaDeviationC,
      altitudeFtMsl,
    ] = alternateParsed as [number, number, number, number, number, number];
    if (latitude > 90) {
      return { status: 'invalid', message: 'Alternate latitude must be between -90 and 90' };
    }
    if (longitude > 180) {
      return { status: 'invalid', message: 'Alternate longitude must be between -180 and 180' };
    }
    alternate = {
      waypoint: {
        id: draft.alternateWaypointId,
        name: draft.alternateName.trim(),
        position: { latitude, longitude },
      },
      elevationFtMsl,
      weather: { qnhHpa, isaDeviationC },
      altitudeFtMsl,
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
      finalReserveMinutes,
      sectorOperations,
      alternate,
    },
  };
}
