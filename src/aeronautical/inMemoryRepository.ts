import type {
  AeronauticalAreaFeature,
  AeronauticalDatasetMetadata,
  AeronauticalFeature,
  AeronauticalFeatureDetails,
  AeronauticalFeatureRef,
  AeronauticalPointFeature,
  AtsServiceArea,
  AtsUnit,
  CommunicationService,
  Position,
  VacChartManifest,
  Wgs84Bounds,
} from '../domain';
import type {
  AeronauticalDataRepository,
  AeronauticalFeatureQuery,
  AeronauticalQueryOptions,
  AtsServiceAreaQuery,
  CommunicationServiceQuery,
  VacChartQuery,
} from './repository';

function longitudeIntervals(bounds: Wgs84Bounds): readonly [number, number][] {
  return bounds.west <= bounds.east
    ? [[bounds.west, bounds.east]]
    : [
        [bounds.west, 180],
        [-180, bounds.east],
      ];
}

function longitudeIsWithin(longitude: number, bounds: Wgs84Bounds): boolean {
  return longitudeIntervals(bounds).some(
    ([west, east]) => longitude >= west && longitude <= east,
  );
}

function positionIsWithin(position: Position, bounds: Wgs84Bounds): boolean {
  return (
    position.latitude >= bounds.south &&
    position.latitude <= bounds.north &&
    longitudeIsWithin(position.longitude, bounds)
  );
}

function areaBounds(feature: AeronauticalAreaFeature): Wgs84Bounds | null {
  const positions = feature.polygons.flatMap((polygon) => [
    ...polygon.outerRing,
    ...polygon.holes.flat(),
  ]);

  if (positions.length === 0) {
    return null;
  }

  return positions.reduce<Wgs84Bounds>(
    (bounds, position) => ({
      south: Math.min(bounds.south, position.latitude),
      west: Math.min(bounds.west, position.longitude),
      north: Math.max(bounds.north, position.latitude),
      east: Math.max(bounds.east, position.longitude),
    }),
    {
      south: Number.POSITIVE_INFINITY,
      west: Number.POSITIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
    },
  );
}

function boundsIntersect(first: Wgs84Bounds, second: Wgs84Bounds): boolean {
  if (first.north < second.south || first.south > second.north) {
    return false;
  }

  return longitudeIntervals(first).some(([firstWest, firstEast]) =>
    longitudeIntervals(second).some(
      ([secondWest, secondEast]) =>
        firstWest <= secondEast && firstEast >= secondWest,
    ),
  );
}

function featureIsWithin(
  feature: AeronauticalFeature,
  bounds: Wgs84Bounds,
): boolean {
  if (feature.geometryType === 'point') {
    return positionIsWithin(feature.position, bounds);
  }

  const featureBounds = areaBounds(feature);
  return featureBounds !== null && boundsIntersect(featureBounds, bounds);
}

function featureRefMatches(
  featureRef: AeronauticalFeatureRef,
  requestedRef: AeronauticalFeatureRef,
): boolean {
  return (
    featureRef.dataset.providerId === requestedRef.dataset.providerId &&
    featureRef.dataset.datasetId === requestedRef.dataset.datasetId &&
    featureRef.featureId === requestedRef.featureId &&
    featureRef.featureVersionId === requestedRef.featureVersionId &&
    featureRef.featureKind === requestedRef.featureKind
  );
}

export class InMemoryAeronauticalRepository
  implements AeronauticalDataRepository
{
  constructor(
    private readonly dataset: AeronauticalDatasetMetadata | null,
    private readonly features: readonly AeronauticalFeature[],
    private readonly featureDetails: readonly AeronauticalFeatureDetails[] = [],
    private readonly atsServiceAreas: readonly AtsServiceArea[] = [],
    private readonly atsUnits: readonly AtsUnit[] = [],
    private readonly communicationServices: readonly CommunicationService[] = [],
    private readonly vacCharts: readonly VacChartManifest[] = [],
  ) {}

  async getDatasetMetadata(
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalDatasetMetadata | null> {
    options?.signal?.throwIfAborted();
    return this.dataset;
  }

  async queryFeatures(
    query: AeronauticalFeatureQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly AeronauticalFeature[]> {
    options?.signal?.throwIfAborted();
    const kinds = new Set(query.featureKinds);

    return this.features.filter(
      (feature) =>
        kinds.has(feature.ref.featureKind) &&
        featureIsWithin(feature, query.bounds),
    );
  }

  async getFeature(
    ref: AeronauticalFeatureRef,
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalFeature | null> {
    options?.signal?.throwIfAborted();
    return (
      this.features.find((feature) => featureRefMatches(feature.ref, ref)) ?? null
    );
  }

  async getFeatureDetails(
    ref: AeronauticalFeatureRef,
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalFeatureDetails | null> {
    options?.signal?.throwIfAborted();
    return (
      this.featureDetails.find((details) =>
        featureRefMatches(details.ref, ref),
      ) ?? null
    );
  }

  async findAerodromeByIdentifier(
    identifier: string,
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalPointFeature | null> {
    options?.signal?.throwIfAborted();
    const normalizedIdentifier = identifier.trim().toUpperCase();
    if (normalizedIdentifier === '') {
      return null;
    }

    return this.features.find(
      (feature): feature is AeronauticalPointFeature =>
        feature.geometryType === 'point' &&
        feature.pointKind === 'aerodrome' &&
        feature.identifier.trim().toUpperCase() === normalizedIdentifier,
    ) ?? null;
  }

  async queryCommunicationServices(
    query: CommunicationServiceQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly CommunicationService[]> {
    options?.signal?.throwIfAborted();
    const featureIds = new Set(query.featureIds);
    return this.communicationServices.filter((service) =>
      service.associations.some(({ featureId }) => featureIds.has(featureId)),
    );
  }

  async getCommunicationService(
    id: string,
    options?: AeronauticalQueryOptions,
  ): Promise<CommunicationService | null> {
    options?.signal?.throwIfAborted();
    return this.communicationServices.find((service) => service.id === id) ?? null;
  }

  async queryAtsServiceAreas(
    query: AtsServiceAreaQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly AtsServiceArea[]> {
    options?.signal?.throwIfAborted();
    return this.atsServiceAreas.filter((area) => {
      const positions = area.polygons.flatMap((polygon) => [
        ...polygon.outerRing,
        ...polygon.holes.flat(),
      ]);
      if (positions.length === 0) return false;
      const bounds = positions.reduce<Wgs84Bounds>(
        (current, position) => ({
          south: Math.min(current.south, position.latitude),
          west: Math.min(current.west, position.longitude),
          north: Math.max(current.north, position.latitude),
          east: Math.max(current.east, position.longitude),
        }),
        {
          south: Number.POSITIVE_INFINITY,
          west: Number.POSITIVE_INFINITY,
          north: Number.NEGATIVE_INFINITY,
          east: Number.NEGATIVE_INFINITY,
        },
      );
      return boundsIntersect(bounds, query.bounds);
    });
  }

  async getAtsUnit(
    id: string,
    options?: AeronauticalQueryOptions,
  ): Promise<AtsUnit | null> {
    options?.signal?.throwIfAborted();
    return this.atsUnits.find((unit) => unit.id === id) ?? null;
  }

  async queryVacCharts(
    query: VacChartQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly VacChartManifest[]> {
    options?.signal?.throwIfAborted();
    const aerodromeFeatureIds =
      query.aerodromeFeatureIds === undefined
        ? null
        : new Set(query.aerodromeFeatureIds);

    return this.vacCharts.filter(
      (chart) =>
        (aerodromeFeatureIds === null ||
          aerodromeFeatureIds.has(chart.aerodromeFeatureId)) &&
        (query.bounds === undefined || boundsIntersect(chart.bounds, query.bounds)),
    );
  }
}

export const EMPTY_AERONAUTICAL_REPOSITORY: AeronauticalDataRepository =
  new InMemoryAeronauticalRepository(null, []);
