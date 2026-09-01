import type {
  AeronauticalAreaFeature,
  AeronauticalFeatureDetails,
  AtsServiceArea,
  CommunicationFrequencyAssignment,
  CommunicationService,
  CommunicationServiceType,
  Position,
  VerticalLimit,
} from '../domain';
import type { CalculatedPerformanceRouteSuccess } from './performanceRoute';
import { polygonsContainPosition } from './airspaceContainment';
import { calculatePositionAlongGeometry } from './routeProgress';

const DISPLAY_MIN_MHZ = 118;
const DISPLAY_MAX_MHZ = 137;
const EMERGENCY_FREQUENCY_MHZ = '121.500';
const SAMPLE_INTERVAL_NM = 1;
export const MAX_COMMUNICATION_ROUTE_SAMPLES = 2_500;
const TRANSITION_REFINEMENT_ITERATIONS = 10;

export type CommunicationSelectionBasis =
  | 'inside-airspace'
  | 'closest-airspace-above'
  | 'ats-service-area';

export interface SelectedCommunicationService {
  readonly serviceId: string;
  readonly serviceType: CommunicationServiceType;
  readonly publishedServiceType: string;
  readonly callsign: string | null;
  readonly frequencies: readonly CommunicationFrequencyAssignment[];
}

export interface CommunicationSelection {
  readonly basis: CommunicationSelectionBasis;
  readonly services: readonly SelectedCommunicationService[];
  readonly airspaceFeatureIds: readonly string[];
  readonly serviceAreaIds: readonly string[];
  /** Stable derived key used to detect an actual radio-service change. */
  readonly key: string;
}

export interface CommunicationChange {
  readonly legFromId: string;
  readonly legToId: string;
  readonly distanceFromLegStartNm: number;
  readonly position: Position;
  readonly selection: CommunicationSelection;
}

export interface CommunicationRoutePlan {
  readonly changes: readonly CommunicationChange[];
  readonly sampleCount: number;
  readonly sampleIntervalNm: number;
}

export interface CommunicationPlanningData {
  readonly airspaces: readonly AeronauticalAreaFeature[];
  readonly featureDetails: readonly AeronauticalFeatureDetails[];
  readonly serviceAreas: readonly AtsServiceArea[];
  readonly services: readonly CommunicationService[];
}

function isDisplayedFrequency(
  frequency: CommunicationFrequencyAssignment,
): boolean {
  const value = Number(frequency.valueMHz);
  return Number.isFinite(value) &&
    value >= DISPLAY_MIN_MHZ &&
    value <= DISPLAY_MAX_MHZ &&
    frequency.valueMHz !== EMERGENCY_FREQUENCY_MHZ;
}

function comparableLimitFt(limit: VerticalLimit): number | null {
  switch (limit.kind) {
    case 'surface':
    case 'mean-sea-level':
      return 0;
    case 'distance':
      if (limit.reference === 'AGL') return null;
      return limit.unit === 'FT' ? limit.value : limit.value * 3.280839895;
    case 'flight-level':
      // Used only for ordering published volumes against the planned altitude.
      // The original FL semantic remains intact in the domain/provenance.
      return limit.level * 100;
    case 'unlimited':
      return Number.POSITIVE_INFINITY;
    case 'unresolved':
      return null;
  }
}

function altitudeIsWithin(
  altitudeFtMsl: number,
  lower: VerticalLimit | null,
  upper: VerticalLimit | null,
): boolean {
  if (lower === null || upper === null) return false;
  const lowerFt = comparableLimitFt(lower);
  const upperFt = comparableLimitFt(upper);
  return lowerFt !== null && upperFt !== null &&
    altitudeFtMsl >= lowerFt && altitudeFtMsl <= upperFt;
}

function selectedServices(
  serviceIds: readonly string[],
  servicesById: ReadonlyMap<string, CommunicationService>,
): readonly SelectedCommunicationService[] {
  return [...new Set(serviceIds)]
    .flatMap((serviceId) => {
      const service = servicesById.get(serviceId);
      if (service === undefined) return [];
      const frequencies = service.frequencies.filter(isDisplayedFrequency);
      return frequencies.length === 0
        ? []
        : [{
            serviceId,
            serviceType: service.serviceType,
            publishedServiceType: service.publishedServiceType,
            callsign: service.callsign ?? null,
            frequencies,
          }];
    })
    .sort((left, right) => left.serviceId.localeCompare(right.serviceId));
}

function selection(
  basis: CommunicationSelectionBasis,
  services: readonly SelectedCommunicationService[],
  airspaceFeatureIds: readonly string[],
  serviceAreaIds: readonly string[],
): CommunicationSelection | null {
  if (services.length === 0) return null;
  const key = services
    .flatMap((service) => service.frequencies.map(
      (frequency) => `${service.serviceId}:${frequency.valueMHz}`,
    ))
    .sort()
    .join('|');
  return { basis, services, airspaceFeatureIds, serviceAreaIds, key };
}

interface PreparedArea {
  readonly feature: AeronauticalAreaFeature;
  readonly lowerLimit: VerticalLimit | null;
  readonly upperLimit: VerticalLimit | null;
  readonly serviceIds: readonly string[];
}

const LOCAL_PRIORITY: Readonly<Record<'ctr' | 'tiz' | 'tia' | 'tma', number>> = {
  ctr: 0,
  tiz: 0,
  tia: 1,
  tma: 2,
};

export function createCommunicationResolver(data: CommunicationPlanningData) {
  const servicesById = new Map(data.services.map((service) => [service.id, service]));
  const detailsById = new Map(
    data.featureDetails
      .filter((details) => details.detailKind === 'airspace')
      .map((details) => [details.ref.featureId, details]),
  );
  const localAreas: PreparedArea[] = data.airspaces.flatMap((feature) => {
    if (!(['ctr', 'tiz', 'tia', 'tma'] as const).includes(
      feature.areaKind as 'ctr' | 'tiz' | 'tia' | 'tma',
    )) return [];
    const details = detailsById.get(feature.ref.featureId);
    if (details?.detailKind !== 'airspace') return [];
    return [{
      feature,
      lowerLimit: details.lowerLimit,
      upperLimit: details.upperLimit,
      serviceIds: details.communicationServiceIds,
    }];
  });

  return (position: Position, altitudeFtMsl: number): CommunicationSelection | null => {
    const horizontalLocal = localAreas.filter(({ feature }) =>
      polygonsContainPosition(feature.polygons, position),
    );
    const containing = horizontalLocal.filter(({ lowerLimit, upperLimit }) =>
      altitudeIsWithin(altitudeFtMsl, lowerLimit, upperLimit),
    );
    if (containing.length > 0) {
      const priority = Math.min(...containing.map(({ feature }) =>
        LOCAL_PRIORITY[feature.areaKind as keyof typeof LOCAL_PRIORITY],
      ));
      const selectedAreas = containing.filter(({ feature }) =>
        LOCAL_PRIORITY[feature.areaKind as keyof typeof LOCAL_PRIORITY] === priority,
      );
      const services = selectedServices(
        selectedAreas.flatMap(({ serviceIds }) => serviceIds),
        servicesById,
      );
      const result = selection(
        'inside-airspace',
        services,
        selectedAreas.map(({ feature }) => feature.ref.featureId),
        [],
      );
      if (result !== null) return result;
    }

    const above = horizontalLocal
      .filter(({ feature }) => feature.areaKind === 'tma' || feature.areaKind === 'tia')
      .flatMap((area) => {
        const lowerFt = area.lowerLimit === null
          ? null
          : comparableLimitFt(area.lowerLimit);
        return lowerFt !== null && lowerFt > altitudeFtMsl
          ? [{ area, lowerFt }]
          : [];
      });
    if (above.length > 0) {
      const closestLowerFt = Math.min(...above.map(({ lowerFt }) => lowerFt));
      const selectedAreas = above
        .filter(({ lowerFt }) => Math.abs(lowerFt - closestLowerFt) < 1e-6)
        .map(({ area }) => area);
      const services = selectedServices(
        selectedAreas.flatMap(({ serviceIds }) => serviceIds),
        servicesById,
      );
      const result = selection(
        'closest-airspace-above',
        services,
        selectedAreas.map(({ feature }) => feature.ref.featureId),
        [],
      );
      if (result !== null) return result;
    }

    const horizontalSectorAreas = data.serviceAreas.filter((area) =>
      area.geometryStatus === 'resolved' &&
      polygonsContainPosition(area.polygons, position),
    );
    const containingSectorAreas = horizontalSectorAreas.filter((area) =>
      altitudeIsWithin(altitudeFtMsl, area.lowerLimit, area.upperLimit),
    );
    const overlyingSectorAreas = containingSectorAreas.length > 0
      ? []
      : horizontalSectorAreas.flatMap((area) => {
          const lowerFt = comparableLimitFt(area.lowerLimit);
          return lowerFt !== null && lowerFt > altitudeFtMsl
            ? [{ area, lowerFt }]
            : [];
        });
    const closestOverlyingLowerFt = overlyingSectorAreas.length === 0
      ? null
      : Math.min(...overlyingSectorAreas.map(({ lowerFt }) => lowerFt));
    const sectorAreas = containingSectorAreas.length > 0
      ? containingSectorAreas
      : overlyingSectorAreas
          .filter(({ lowerFt }) => lowerFt === closestOverlyingLowerFt)
          .map(({ area }) => area);
    return selection(
      'ats-service-area',
      selectedServices(
        sectorAreas.map(({ communicationServiceId }) => communicationServiceId),
        servicesById,
      ),
      [],
      sectorAreas.map(({ ref }) => ref.serviceAreaId),
    );
  };
}

export function selectCommunicationAtPosition(
  data: CommunicationPlanningData,
  position: Position,
  altitudeFtMsl: number,
): CommunicationSelection | null {
  return createCommunicationResolver(data)(position, altitudeFtMsl);
}

function altitudeAtDistance(
  leg: CalculatedPerformanceRouteSuccess['legs'][number],
  distanceNm: number,
): number {
  const step = leg.steps.find((candidate) =>
    distanceNm >= candidate.startDistanceFromLegNm - 1e-9 &&
    distanceNm <= candidate.endDistanceFromLegNm + 1e-9,
  ) ?? leg.steps.at(-1);
  if (step === undefined || step.endDistanceFromLegNm <= step.startDistanceFromLegNm) {
    return leg.targetAltitudeFtMsl;
  }
  const fraction = Math.max(0, Math.min(1,
    (distanceNm - step.startDistanceFromLegNm) /
      (step.endDistanceFromLegNm - step.startDistanceFromLegNm),
  ));
  return step.startAltitudeFtMsl +
    (step.endAltitudeFtMsl - step.startAltitudeFtMsl) * fraction;
}

export function calculateCommunicationRoutePlan(
  route: CalculatedPerformanceRouteSuccess,
  data: CommunicationPlanningData,
): CommunicationRoutePlan {
  const resolver = createCommunicationResolver(data);
  const totalDistanceNm = route.legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  const sampleIntervalNm = Math.max(
    SAMPLE_INTERVAL_NM,
    totalDistanceNm / Math.max(1, MAX_COMMUNICATION_ROUTE_SAMPLES - route.legs.length),
  );
  const changes: CommunicationChange[] = [];
  let previousSelection: CommunicationSelection | null | undefined;
  let sampleCount = 0;

  for (const leg of route.legs) {
    const distances = new Set<number>([0, leg.distanceNm]);
    for (let distance = sampleIntervalNm; distance < leg.distanceNm; distance += sampleIntervalNm) {
      distances.add(distance);
    }
    leg.steps.forEach((step) => {
      distances.add(step.startDistanceFromLegNm);
      distances.add(step.endDistanceFromLegNm);
    });
    let previousDistance = 0;
    for (const distance of [...distances].sort((a, b) => a - b)) {
      const position = calculatePositionAlongGeometry(leg.geometry, distance).position;
      const current = resolver(position, altitudeAtDistance(leg, distance));
      sampleCount += 1;
      if (previousSelection === undefined || current?.key !== previousSelection?.key) {
        if (current !== null) {
          let transitionDistance = distance;
          if (previousSelection !== undefined && distance > previousDistance) {
            let lower = previousDistance;
            let upper = distance;
            for (let iteration = 0; iteration < TRANSITION_REFINEMENT_ITERATIONS; iteration += 1) {
              const midpoint = (lower + upper) / 2;
              const midpointPosition = calculatePositionAlongGeometry(leg.geometry, midpoint).position;
              const midpointSelection = resolver(
                midpointPosition,
                altitudeAtDistance(leg, midpoint),
              );
              sampleCount += 1;
              if (midpointSelection?.key === previousSelection?.key) lower = midpoint;
              else upper = midpoint;
            }
            transitionDistance = upper;
          }
          changes.push({
            legFromId: leg.fromId,
            legToId: leg.toId,
            distanceFromLegStartNm: transitionDistance,
            position: calculatePositionAlongGeometry(
              leg.geometry,
              transitionDistance,
            ).position,
            selection: current,
          });
        }
        previousSelection = current;
      }
      previousDistance = distance;
    }
  }
  return { changes, sampleCount, sampleIntervalNm };
}

export function allocateCommunicationChangesToLegs(
  route: CalculatedPerformanceRouteSuccess,
  changes: readonly CommunicationChange[],
): ReadonlyMap<string, readonly CommunicationChange[]> {
  const allocations = new Map<string, CommunicationChange[]>();
  if (route.legs.length === 0) return allocations;
  let nextAvailableIndex = 0;
  for (const change of changes) {
    const desiredIndex = Math.max(0, route.legs.findIndex((leg) =>
      leg.fromId === change.legFromId && leg.toId === change.legToId,
    ));
    const allocatedIndex = Math.min(
      route.legs.length - 1,
      Math.max(desiredIndex, nextAvailableIndex),
    );
    const leg = route.legs[allocatedIndex]!;
    const key = `${leg.fromId}\0${leg.toId}`;
    allocations.set(key, [...(allocations.get(key) ?? []), change]);
    nextAvailableIndex = allocatedIndex + 1;
  }
  return allocations;
}
