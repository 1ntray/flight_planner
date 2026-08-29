import normalizedAvinorDataset from './data/avinor-eaip-2026-06-11.json';
import { createNormalizedAeronauticalRepository } from './normalizedDataset';
import type { NormalizedAeronauticalDataset } from './normalizedDataset';

const AVINOR_DATASET =
  normalizedAvinorDataset as unknown as NormalizedAeronauticalDataset;

/** Local normalized data only; no Avinor request occurs in the browser. */
export const AVINOR_EAIP_REPOSITORY =
  createNormalizedAeronauticalRepository(AVINOR_DATASET);
