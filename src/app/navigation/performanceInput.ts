import type {
  AircraftPerformancePlanInputs,
  LegAltitudePlan,
} from '../../domain';
import { MAX_SUPPORTED_PLANNING_ALTITUDE_FT } from '../../domain';

export const DEFAULT_PLANNING_QNH_HPA = 1013;
export const DEFAULT_PLANNING_ISA_DEVIATION_C = 0;
export const DEFAULT_PLANNING_PATTERN_HEIGHT_AGL_FT = 1000;

export interface SectorStopInputDraft {
  waypointId: string;
  elevationFtMsl: string;
  qnhHpa: string;
  isaDeviationC: string;
  stopDurationMinutes: string;
  /** Preserved only while editing a schema-v4 plan that used a fixed UTC departure. */
  legacyOnwardDepartureTimeUtcMs?: number;
}

export interface PerformanceInputDraft {
  massKg: string;
  defaultAltitudeFtMsl: string;
  departureElevationFtMsl: string;
  destinationElevationFtMsl: string;
  patternHeightAglFt: string;
  departureQnhHpa: string;
  departureIsaDeviationC: string;
  destinationQnhHpa: string;
  destinationIsaDeviationC: string;
  legAltitudePlans: readonly LegAltitudePlan[];
  sectorStopPlans: readonly SectorStopInputDraft[];
}

/** Values used only while their corresponding user-editable field is blank. */
export interface PerformanceInputDefaults {
  readonly departureElevationFtMsl?: number;
  readonly destinationElevationFtMsl?: number;
  readonly sectorStopElevationFtMslByWaypointId?: Readonly<
    Record<string, number>
  >;
}

export type PerformanceInputParseResult =
  | { status: 'empty' }
  | { status: 'valid'; value: AircraftPerformancePlanInputs }
  | { status: 'invalid'; message: string };

export function createEmptyPerformanceInputDraft(): PerformanceInputDraft {
  return {
    massKg: '',
    defaultAltitudeFtMsl: '2500',
    departureElevationFtMsl: '',
    destinationElevationFtMsl: '',
    patternHeightAglFt: '',
    departureQnhHpa: '',
    departureIsaDeviationC: '',
    destinationQnhHpa: '',
    destinationIsaDeviationC: '',
    legAltitudePlans: [],
    sectorStopPlans: [],
  };
}

export function createPerformanceInputDraft(
  inputs: AircraftPerformancePlanInputs,
): PerformanceInputDraft {
  return {
    massKg: String(inputs.massKg),
    defaultAltitudeFtMsl: String(inputs.defaultAltitudeFtMsl),
    departureElevationFtMsl: String(inputs.departureElevationFtMsl),
    destinationElevationFtMsl: String(inputs.destinationElevationFtMsl),
    patternHeightAglFt: String(inputs.patternHeightAglFt),
    departureQnhHpa: String(inputs.departureWeather.qnhHpa),
    departureIsaDeviationC: String(
      inputs.departureWeather.isaDeviationC,
    ),
    destinationQnhHpa: String(inputs.destinationWeather.qnhHpa),
    destinationIsaDeviationC: String(
      inputs.destinationWeather.isaDeviationC,
    ),
    legAltitudePlans: inputs.legAltitudePlans,
    sectorStopPlans: (inputs.sectorStopPlans ?? []).map((stop) => ({
      waypointId: stop.waypointId,
      elevationFtMsl: String(stop.elevationFtMsl),
      qnhHpa: String(stop.weather.qnhHpa),
      isaDeviationC: String(stop.weather.isaDeviationC),
      stopDurationMinutes:
        stop.stopDurationMinutes === undefined
          ? ''
          : String(stop.stopDurationMinutes),
      ...(stop.onwardDepartureTimeUtcMs === undefined
        ? {}
        : { legacyOnwardDepartureTimeUtcMs: stop.onwardDepartureTimeUtcMs }),
    })),
  };
}

export function createEmptySectorStopInputDraft(
  waypointId: string,
): SectorStopInputDraft {
  return {
    waypointId,
    elevationFtMsl: '',
    qnhHpa: '',
    isaDeviationC: '',
    stopDurationMinutes: '',
  };
}

function parseNumber(
  value: string,
  label: string,
  minimum: number | null,
  maximum: number | null = null,
): number | string {
  if (value.trim() === '') {
    return `${label} is required`;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return `${label} must be a number`;
  }

  if (minimum !== null && parsed < minimum) {
    return `${label} must be at least ${minimum}`;
  }

  if (maximum !== null && parsed > maximum) {
    return `${label} must not exceed ${maximum}`;
  }

  return parsed;
}

function resolveDefaultValue(
  value: string,
  defaultValue: number | undefined,
): string {
  return value.trim() === '' &&
    defaultValue !== undefined &&
    Number.isFinite(defaultValue) &&
    defaultValue >= 0
    ? String(defaultValue)
    : value;
}

function validateLegAltitudePlans(
  plans: readonly LegAltitudePlan[],
): string | null {
  const keys = new Set<string>();

  for (const plan of plans) {
    const key = `${plan.fromWaypointId}\0${plan.toWaypointId}`;

    if (keys.has(key)) {
      return 'Each leg may have only one altitude plan';
    }
    keys.add(key);

    if (
      plan.altitudeFtMsl !== undefined &&
      (!Number.isFinite(plan.altitudeFtMsl) ||
        plan.altitudeFtMsl < 0 ||
        plan.altitudeFtMsl > MAX_SUPPORTED_PLANNING_ALTITUDE_FT)
    ) {
      return `Leg altitude must be between 0 and ${MAX_SUPPORTED_PLANNING_ALTITUDE_FT}`;
    }

    if (
      plan.targetPlacement?.mode === 'distance-along-leg' &&
      (!Number.isFinite(plan.targetPlacement.distanceFromStartNm) ||
        plan.targetPlacement.distanceFromStartNm < 0)
    ) {
      return 'Altitude target distance must be a non-negative number';
    }
    if (
      plan.endAltitudeFtMsl !== undefined &&
      (!Number.isFinite(plan.endAltitudeFtMsl) ||
        plan.endAltitudeFtMsl < 0 ||
        plan.endAltitudeFtMsl > MAX_SUPPORTED_PLANNING_ALTITUDE_FT)
    ) {
      return `Leg end altitude must be between 0 and ${MAX_SUPPORTED_PLANNING_ALTITUDE_FT}`;
    }
    if (
      plan.endTargetPlacement !== undefined &&
      plan.endAltitudeFtMsl === undefined
    ) {
      return 'End-altitude target requires a leg end altitude';
    }
    if (
      plan.endTargetPlacement?.mode === 'distance-along-leg' &&
      (!Number.isFinite(plan.endTargetPlacement.distanceFromStartNm) ||
        plan.endTargetPlacement.distanceFromStartNm < 0)
    ) {
      return 'End-altitude target distance must be a non-negative number';
    }
  }

  return null;
}

export function parsePerformanceInputDraft(
  draft: PerformanceInputDraft,
  sectorBoundaryWaypointIds: readonly string[] = [],
  derivedMassKg?: number,
  defaults: PerformanceInputDefaults = {},
): PerformanceInputParseResult {
  const legPlanError = validateLegAltitudePlans(draft.legAltitudePlans);

  if (legPlanError !== null) {
    return { status: 'invalid', message: legPlanError };
  }

  const scalarValues = [
    derivedMassKg === undefined ? draft.massKg : String(derivedMassKg),
    draft.departureElevationFtMsl,
    draft.destinationElevationFtMsl,
    draft.departureQnhHpa,
    draft.departureIsaDeviationC,
    draft.destinationQnhHpa,
    draft.destinationIsaDeviationC,
  ];

  if (
    scalarValues.every((value) => value.trim() === '') &&
    (draft.defaultAltitudeFtMsl === '' || draft.defaultAltitudeFtMsl === '2500') &&
    draft.legAltitudePlans.length === 0 &&
    draft.sectorStopPlans.every((stop) =>
      [
        stop.elevationFtMsl,
        stop.qnhHpa,
        stop.isaDeviationC,
        stop.stopDurationMinutes,
      ].every((value) => value.trim() === ''),
    )
  ) {
    return { status: 'empty' };
  }

  const fields = [
    ['massKg', derivedMassKg === undefined ? draft.massKg : String(derivedMassKg), 'Aircraft mass', null, null],
    ['defaultAltitudeFtMsl', draft.defaultAltitudeFtMsl, 'Default altitude', 0, MAX_SUPPORTED_PLANNING_ALTITUDE_FT],
    [
      'departureElevationFtMsl',
      resolveDefaultValue(
        draft.departureElevationFtMsl,
        defaults.departureElevationFtMsl,
      ),
      'Departure elevation',
      0,
      MAX_SUPPORTED_PLANNING_ALTITUDE_FT,
    ],
    [
      'destinationElevationFtMsl',
      resolveDefaultValue(
        draft.destinationElevationFtMsl,
        defaults.destinationElevationFtMsl,
      ),
      'Destination elevation',
      0,
      MAX_SUPPORTED_PLANNING_ALTITUDE_FT,
    ],
    [
      'patternHeightAglFt',
      String(DEFAULT_PLANNING_PATTERN_HEIGHT_AGL_FT),
      'Pattern height',
      0,
      MAX_SUPPORTED_PLANNING_ALTITUDE_FT,
    ],
    [
      'departureQnhHpa',
      resolveDefaultValue(draft.departureQnhHpa, DEFAULT_PLANNING_QNH_HPA),
      'Departure QNH',
      null,
      null,
    ],
    [
      'departureIsaDeviationC',
      resolveDefaultValue(
        draft.departureIsaDeviationC,
        DEFAULT_PLANNING_ISA_DEVIATION_C,
      ),
      'Departure ISA deviation',
      null,
      null,
    ],
    [
      'destinationQnhHpa',
      resolveDefaultValue(draft.destinationQnhHpa, DEFAULT_PLANNING_QNH_HPA),
      'Destination QNH',
      null,
      null,
    ],
    [
      'destinationIsaDeviationC',
      resolveDefaultValue(
        draft.destinationIsaDeviationC,
        DEFAULT_PLANNING_ISA_DEVIATION_C,
      ),
      'Destination ISA deviation',
      null,
      null,
    ],
  ] as const;
  const parsed = new Map<string, number>();

  for (const [field, value, label, minimum, maximum] of fields) {
    const result = parseNumber(value, label, minimum, maximum);

    if (typeof result === 'string') {
      return { status: 'invalid', message: result };
    }

    parsed.set(field, result);
  }

  if (parsed.get('massKg')! <= 0) {
    return { status: 'invalid', message: 'Aircraft mass must be greater than zero' };
  }

  if (parsed.get('departureQnhHpa')! <= 0) {
    return { status: 'invalid', message: 'Departure QNH must be greater than zero' };
  }

  if (parsed.get('destinationQnhHpa')! <= 0) {
    return { status: 'invalid', message: 'Destination QNH must be greater than zero' };
  }

  const stopWaypointIds = new Set<string>();
  const sectorStopPlans = [];

  for (const [index, stop] of draft.sectorStopPlans.entries()) {
    if (stopWaypointIds.has(stop.waypointId)) {
      return { status: 'invalid', message: 'Each sector stop may appear only once' };
    }
    stopWaypointIds.add(stop.waypointId);

    const elevationFtMsl = parseNumber(
      resolveDefaultValue(
        stop.elevationFtMsl,
        defaults.sectorStopElevationFtMslByWaypointId?.[stop.waypointId],
      ),
      `Sector stop ${index + 1} elevation`,
      0,
      MAX_SUPPORTED_PLANNING_ALTITUDE_FT,
    );
    const qnhHpa = parseNumber(
      resolveDefaultValue(stop.qnhHpa, DEFAULT_PLANNING_QNH_HPA),
      `Sector stop ${index + 1} QNH`,
      null,
    );
    const isaDeviationC = parseNumber(
      resolveDefaultValue(
        stop.isaDeviationC,
        DEFAULT_PLANNING_ISA_DEVIATION_C,
      ),
      `Sector stop ${index + 1} ISA deviation`,
      null,
    );

    if (typeof elevationFtMsl === 'string') {
      return { status: 'invalid', message: elevationFtMsl };
    }
    if (typeof qnhHpa === 'string') {
      return { status: 'invalid', message: qnhHpa };
    }
    if (qnhHpa <= 0) {
      return {
        status: 'invalid',
        message: `Sector stop ${index + 1} QNH must be greater than zero`,
      };
    }
    if (typeof isaDeviationC === 'string') {
      return { status: 'invalid', message: isaDeviationC };
    }

    const stopDurationMinutes =
      stop.stopDurationMinutes.trim() === ''
        ? undefined
        : parseNumber(
            stop.stopDurationMinutes,
            `Sector stop ${index + 1} duration`,
            0,
          );

    if (typeof stopDurationMinutes === 'string') {
      return { status: 'invalid', message: stopDurationMinutes };
    }

    sectorStopPlans.push({
      waypointId: stop.waypointId,
      elevationFtMsl,
      weather: { qnhHpa, isaDeviationC },
      ...(stopDurationMinutes === undefined
        ? stop.legacyOnwardDepartureTimeUtcMs === undefined
          ? {}
          : { onwardDepartureTimeUtcMs: stop.legacyOnwardDepartureTimeUtcMs }
        : { stopDurationMinutes }),
    });
  }

  const requiredStopIds = new Set(sectorBoundaryWaypointIds);

  if (
    sectorStopPlans.some((stop) => !requiredStopIds.has(stop.waypointId)) ||
    sectorStopPlans.length !== requiredStopIds.size
  ) {
    return {
      status: 'invalid',
      message: 'Enter elevation and weather for every intermediate airport',
    };
  }

  return {
    status: 'valid',
    value: {
      massKg: parsed.get('massKg')!,
      defaultAltitudeFtMsl: parsed.get('defaultAltitudeFtMsl')!,
      departureElevationFtMsl: parsed.get('departureElevationFtMsl')!,
      destinationElevationFtMsl: parsed.get('destinationElevationFtMsl')!,
      patternHeightAglFt: parsed.get('patternHeightAglFt')!,
      departureWeather: {
        qnhHpa: parsed.get('departureQnhHpa')!,
        isaDeviationC: parsed.get('departureIsaDeviationC')!,
      },
      destinationWeather: {
        qnhHpa: parsed.get('destinationQnhHpa')!,
        isaDeviationC: parsed.get('destinationIsaDeviationC')!,
      },
      legAltitudePlans: draft.legAltitudePlans,
      sectorStopPlans,
    },
  };
}
