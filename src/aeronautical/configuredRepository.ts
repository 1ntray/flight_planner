import { AVINOR_EAIP_REPOSITORY } from './avinorRepository';
import { DEMO_AERONAUTICAL_REPOSITORY } from './demoRepository';
import type { AeronauticalDataRepository } from './repository';

export function getConfiguredAeronauticalRepository(
  locationSearch: string,
): AeronauticalDataRepository {
  return new URLSearchParams(locationSearch).get('aeroDemo') === '1'
    ? DEMO_AERONAUTICAL_REPOSITORY
    : AVINOR_EAIP_REPOSITORY;
}
