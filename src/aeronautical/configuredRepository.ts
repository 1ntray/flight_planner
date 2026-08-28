import { DEMO_AERONAUTICAL_REPOSITORY } from './demoRepository';
import { EMPTY_AERONAUTICAL_REPOSITORY } from './inMemoryRepository';
import type { AeronauticalDataRepository } from './repository';

export function getConfiguredAeronauticalRepository(
  locationSearch: string,
): AeronauticalDataRepository {
  return new URLSearchParams(locationSearch).get('aeroDemo') === '1'
    ? DEMO_AERONAUTICAL_REPOSITORY
    : EMPTY_AERONAUTICAL_REPOSITORY;
}

