import type { PerformanceInputDraft } from './performanceInput';

type Endpoint = 'departure' | 'destination';

export interface EndpointAerodromeElevation {
  readonly waypointId: string;
  readonly elevationFt: number;
}

export interface EndpointAerodromeElevations {
  readonly departure: EndpointAerodromeElevation | null;
  readonly destination: EndpointAerodromeElevation | null;
}

export interface AerodromeElevationAutofillState {
  readonly departure: EndpointAerodromeElevation | null;
  readonly destination: EndpointAerodromeElevation | null;
}

export const EMPTY_AERODROME_ELEVATION_AUTOFILL_STATE: AerodromeElevationAutofillState = {
  departure: null,
  destination: null,
};

export interface AerodromeElevationAutofillResult {
  readonly draft: PerformanceInputDraft;
  readonly state: AerodromeElevationAutofillState;
}

function fieldForEndpoint(endpoint: Endpoint): keyof Pick<
  PerformanceInputDraft,
  'departureElevationFtMsl' | 'destinationElevationFtMsl'
> {
  return endpoint === 'departure'
    ? 'departureElevationFtMsl'
    : 'destinationElevationFtMsl';
}

function elevationText(source: EndpointAerodromeElevation): string {
  return String(source.elevationFt);
}

function shouldReplaceValue(
  currentValue: string,
  previousAutomaticSource: EndpointAerodromeElevation | null,
): boolean {
  return (
    currentValue === '' ||
    (previousAutomaticSource !== null &&
      currentValue === elevationText(previousAutomaticSource))
  );
}

/**
 * Adds published endpoint elevations only to blank fields or values that this
 * helper previously supplied. Any different user-entered value remains a
 * manual override when the route endpoint changes.
 */
export function applyAerodromeElevationAutofill(
  draft: PerformanceInputDraft,
  sources: EndpointAerodromeElevations,
  previousState: AerodromeElevationAutofillState,
): AerodromeElevationAutofillResult {
  let nextDraft = draft;
  let nextState = previousState;

  for (const endpoint of ['departure', 'destination'] as const) {
    const field = fieldForEndpoint(endpoint);
    const source = sources[endpoint];
    const previousAutomaticSource = previousState[endpoint];
    const currentValue = draft[field];

    if (source === null) {
      if (
        previousAutomaticSource !== null &&
        currentValue !== elevationText(previousAutomaticSource)
      ) {
        nextState = { ...nextState, [endpoint]: null };
      }
      continue;
    }

    if (shouldReplaceValue(currentValue, previousAutomaticSource)) {
      const nextValue = elevationText(source);
      if (nextValue !== currentValue) {
        nextDraft = { ...nextDraft, [field]: nextValue };
      }
      nextState = { ...nextState, [endpoint]: source };
    } else {
      nextState = { ...nextState, [endpoint]: null };
    }
  }

  return { draft: nextDraft, state: nextState };
}
