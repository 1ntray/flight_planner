import type {
  CommunicationFrequencyAssignment,
  CommunicationService,
} from '../domain';

export const COMMUNICATION_DISPLAY_MIN_MHZ = 118;
export const COMMUNICATION_DISPLAY_MAX_MHZ = 137;
export const COMMUNICATION_EMERGENCY_FREQUENCY_MHZ = '121.500';

export interface CommunicationPreferences {
  readonly preferredFrequencyByServiceId: Readonly<Record<string, string>>;
}

export const EMPTY_COMMUNICATION_PREFERENCES: CommunicationPreferences = {
  preferredFrequencyByServiceId: {},
};

export interface OperatingFrequencyCandidate {
  readonly serviceId: string;
  readonly callsign: string | null;
  readonly publishedServiceType: string;
  readonly frequency: CommunicationFrequencyAssignment;
}

export type OperatingFrequencyChoice =
  | {
      readonly status: 'selected';
      readonly candidate: OperatingFrequencyCandidate;
      readonly candidates: readonly OperatingFrequencyCandidate[];
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly OperatingFrequencyCandidate[];
    };

export function isDisplayedCommunicationFrequency(
  frequency: CommunicationFrequencyAssignment,
): boolean {
  if (!/^\d{3}\.\d{3}$/.test(frequency.valueMHz)) return false;
  const value = Number(frequency.valueMHz);
  return Number.isFinite(value) &&
    value >= COMMUNICATION_DISPLAY_MIN_MHZ &&
    value <= COMMUNICATION_DISPLAY_MAX_MHZ &&
    frequency.valueMHz !== COMMUNICATION_EMERGENCY_FREQUENCY_MHZ;
}

export function isEligibleVfrPlanningFrequency(
  frequency: CommunicationFrequencyAssignment,
): boolean {
  return isDisplayedCommunicationFrequency(frequency) &&
    frequency.planningUse !== 'ifr-only' &&
    frequency.planningUse !== 'contingency';
}

export function eligibleVfrPlanningFrequencies(
  service: Pick<CommunicationService, 'frequencies'>,
): readonly CommunicationFrequencyAssignment[] {
  return service.frequencies.filter(isEligibleVfrPlanningFrequency);
}

function candidatesFor(
  services: readonly CommunicationService[],
): readonly OperatingFrequencyCandidate[] {
  return services.flatMap((service) =>
    eligibleVfrPlanningFrequencies(service).map((frequency) => ({
      serviceId: service.id,
      callsign: service.callsign ?? null,
      publishedServiceType: service.publishedServiceType,
      frequency,
    })),
  );
}

function uniqueFrequencyCandidates(
  candidates: readonly OperatingFrequencyCandidate[],
): readonly OperatingFrequencyCandidate[] {
  const byValue = new Map<string, OperatingFrequencyCandidate>();
  for (const candidate of candidates) {
    if (!byValue.has(candidate.frequency.valueMHz)) {
      byValue.set(candidate.frequency.valueMHz, candidate);
    }
  }
  return [...byValue.values()];
}

export function chooseOperatingFrequency(
  services: readonly CommunicationService[],
  preferences: CommunicationPreferences = EMPTY_COMMUNICATION_PREFERENCES,
): OperatingFrequencyChoice | null {
  const candidates = candidatesFor(services);
  if (candidates.length === 0) return null;

  const preferred = uniqueFrequencyCandidates(candidates.filter((candidate) =>
    preferences.preferredFrequencyByServiceId[candidate.serviceId] ===
      candidate.frequency.valueMHz,
  ));
  if (preferred.length === 1) {
    return { status: 'selected', candidate: preferred[0]!, candidates };
  }
  if (preferred.length > 1) return { status: 'ambiguous', candidates: preferred };

  const vfr = uniqueFrequencyCandidates(candidates.filter(
    ({ frequency }) => frequency.planningUse === 'vfr',
  ));
  if (vfr.length === 1) {
    return { status: 'selected', candidate: vfr[0]!, candidates };
  }

  const unique = uniqueFrequencyCandidates(candidates);
  return unique.length === 1
    ? { status: 'selected', candidate: unique[0]!, candidates }
    : { status: 'ambiguous', candidates: unique };
}
