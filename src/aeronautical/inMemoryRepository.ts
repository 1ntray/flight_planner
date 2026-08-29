import type {
  AeronauticalAreaFeature,
  AeronauticalDatasetMetadata,
  AeronauticalFeature,
  AeronauticalFeatureDetails,
  AeronauticalFeatureRef,
  Position,
  Wgs84Bounds,
} from '../domain';
import type {
  AeronauticalDataRepository,
  AeronauticalFeatureQuery,
  AeronauticalQueryOptions,
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
}

export const EMPTY_AERONAUTICAL_REPOSITORY: AeronauticalDataRepository =
  new InMemoryAeronauticalRepository(null, []);
