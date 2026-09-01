import { useEffect, useMemo, useState } from 'react';

import type { AeronauticalDataRepository } from '../../aeronautical';
import {
  allocateCommunicationChangesToLegs,
  calculateCommunicationRoutePlan,
} from '../../calculations';
import type {
  CalculatedPerformanceRoute,
  CommunicationChange,
  CommunicationRoutePlan,
} from '../../calculations';
import type {
  AeronauticalAreaFeature,
  CommunicationService,
  Wgs84Bounds,
} from '../../domain';

export interface CommunicationPlanState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly plan: CommunicationRoutePlan | null;
  readonly changesByLeg: ReadonlyMap<string, readonly CommunicationChange[]>;
}

const EMPTY_CHANGES = new Map<string, readonly CommunicationChange[]>();

function routeBounds(
  route: Extract<CalculatedPerformanceRoute, { status: 'ok' }>,
): Wgs84Bounds | null {
  const positions = route.legs.flatMap(({ geometry }) => geometry);
  if (positions.length === 0) return null;
  return positions.reduce<Wgs84Bounds>((bounds, position) => ({
    south: Math.min(bounds.south, position.latitude),
    west: Math.min(bounds.west, position.longitude),
    north: Math.max(bounds.north, position.latitude),
    east: Math.max(bounds.east, position.longitude),
  }), {
    south: Number.POSITIVE_INFINITY,
    west: Number.POSITIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
  });
}

/** Loads only route-bounds candidates; all selection remains pure derived data. */
export function useCommunicationPlan(
  repository: AeronauticalDataRepository,
  performanceRoute: CalculatedPerformanceRoute | null,
): CommunicationPlanState {
  const [state, setState] = useState<CommunicationPlanState>({
    status: 'idle',
    plan: null,
    changesByLeg: EMPTY_CHANGES,
  });
  const bounds = useMemo(
    () => performanceRoute?.status === 'ok' ? routeBounds(performanceRoute) : null,
    [performanceRoute],
  );

  useEffect(() => {
    if (performanceRoute?.status !== 'ok' || bounds === null) {
      setState({ status: 'idle', plan: null, changesByLeg: EMPTY_CHANGES });
      return undefined;
    }
    const route = performanceRoute;
    const controller = new AbortController();
    setState((current) => ({ ...current, status: 'loading' }));

    void Promise.all([
      repository.queryFeatures({
        bounds,
        featureKinds: ['ctr', 'tiz', 'tia', 'tma', 'cta'],
      }, { signal: controller.signal }),
      repository.queryAtsServiceAreas({ bounds }, { signal: controller.signal }),
    ]).then(async ([features, serviceAreas]) => {
      const airspaces = features.filter(
        (feature): feature is AeronauticalAreaFeature => feature.geometryType === 'area',
      );
      const featureDetails = (await Promise.all(airspaces.map((feature) =>
        repository.getFeatureDetails(feature.ref, { signal: controller.signal }),
      ))).flatMap((details) => details === null ? [] : [details]);
      const directlyAssociated = await repository.queryCommunicationServices(
        { featureIds: airspaces.map(({ ref }) => ref.featureId) },
        { signal: controller.signal },
      );
      const serviceIds = new Set([
        ...directlyAssociated.map(({ id }) => id),
        ...serviceAreas.map(({ communicationServiceId }) => communicationServiceId),
      ]);
      const services: CommunicationService[] = [...directlyAssociated];
      const existingIds = new Set(services.map(({ id }) => id));
      const additional = await Promise.all([...serviceIds]
        .filter((id) => !existingIds.has(id))
        .map((id) => repository.getCommunicationService(
          id,
          { signal: controller.signal },
        )));
      services.push(...additional.flatMap((service) => service === null ? [] : [service]));
      if (controller.signal.aborted) return;
      const plan = calculateCommunicationRoutePlan(route, {
        airspaces,
        featureDetails,
        serviceAreas,
        services,
      });
      setState({
        status: 'ready',
        plan,
        changesByLeg: allocateCommunicationChangesToLegs(route, plan.changes),
      });
    }).catch(() => {
      if (!controller.signal.aborted) {
        setState({ status: 'error', plan: null, changesByLeg: EMPTY_CHANGES });
      }
    });
    return () => controller.abort();
  }, [bounds, performanceRoute, repository]);

  return state;
}
