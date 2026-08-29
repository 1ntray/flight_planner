import normalizedEnduDataset from './data/avinor-eaip-2026-06-11.json';
import { createNormalizedAeronauticalRepository } from './normalizedDataset';
import type { NormalizedAeronauticalDataset } from './normalizedDataset';

const ENDU_DATASET =
  normalizedEnduDataset as unknown as NormalizedAeronauticalDataset;

/** Local normalized data only; no Avinor request occurs in the browser. */
export const AVINOR_EAIP_REPOSITORY =
  createNormalizedAeronauticalRepository(ENDU_DATASET);
