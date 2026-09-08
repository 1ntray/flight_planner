import type {
  AvinorEaipBatchEditionConfig,
  AvinorEaipImportConfig,
} from './types';

export type AvinorEaipEditionConfig = Omit<
  AvinorEaipImportConfig,
  'retrievedAtUtc' | 'importedAtUtc'
>;

/**
 * This is the reviewed, explicitly approved eAIP edition. Discovery may
 * prepare a pull request, but only merging that pull request changes this pin.
 */
export const NORWAY_EAIP_EDITION: AvinorEaipBatchEditionConfig = {
  datasetId: "avinor-eaip-2026-09-03",
  editionLabel: "2026-09-03-AIRAC",
  // Avinor's publication history does not expose a cycle number, so none is inferred.
  airacCycle: null,
  effectiveFromUtc: "2026-09-03T00:00:00Z",
  revisionId: "AIP AMDT 05/2026",
  indexUrl:
    "https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-1.3-en-GB.html",
  enr21Url:
    "https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-ENR-2.1-en-GB.html",
  enr22Url:
    "https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-ENR-2.2-en-GB.html",
};

export const ENDU_EAIP_EDITION: AvinorEaipEditionConfig = {
  ...NORWAY_EAIP_EDITION,
  sourceAerodrome: 'ENDU',
  sourceUrl:
    "https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-2.ENDU-en-GB.html",
};
