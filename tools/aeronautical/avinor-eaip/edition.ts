import type { AvinorEaipImportConfig } from './types';

export type AvinorEaipEditionConfig = Omit<
  AvinorEaipImportConfig,
  'retrievedAtUtc' | 'importedAtUtc'
>;

export const ENDU_EAIP_EDITION: AvinorEaipEditionConfig = {
  sourceAerodrome: 'ENDU',
  datasetId: 'avinor-eaip-2026-06-11',
  editionLabel: '2026-06-11-AIRAC',
  // The inspected page leaves EM.AIRAC blank, so no cycle number is inferred.
  airacCycle: null,
  effectiveFromUtc: '2026-06-11T00:00:00Z',
  revisionId: 'AIP AMDT 04/2026',
  sourceUrl:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-2.ENDU-en-GB.html',
};
