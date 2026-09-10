import type { VacPreparationConfig, VacPreparationPoint } from '../types';

const reviewedTriangle = 'Published coordinate table matched to the centre of the corresponding vector triangle in the plan view.';
const point = (
  label: string,
  sourcePointX: number,
  sourcePointY: number,
  publishedLatitude: string,
  publishedLongitude: string,
): VacPreparationPoint => ({
  label, sourcePointX, sourcePointY, publishedLatitude, publishedLongitude,
  reviewNote: reviewedTriangle,
});

/**
 * Manually reviewed source control for Avinor AD 2 ENDU 6-1.
 * Pixel-independent PDF-point coordinates make the same review reusable at
 * any render DPI. Fit and validation sets are deliberately disjoint.
 */
export const ENDU_VAC_PREPARATION: VacPreparationConfig = {
  configVersion: 1,
  preparationRevision: 3,
  id: 'vac:ENDU:2026-05-14',
  icao: 'ENDU',
  aerodromeFeatureId: 'aerodrome:ENDU',
  title: 'Bardufoss Visual Approach Chart - ICAO',
  chartDate: '2026-05-14',
  sourceUrl: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623256.pdf',
  sourcePdfSha256: 'f93dd046804a5e00cf2b8a5baa76d5e5a4083a077fa6ff2429e2e88930e9b966',
  page: 1,
  renderDpi: 1200,
  cropPdfPoints: { left: 63.6094, top: 130.543, right: 534.296, bottom: 684.56 },
  transformOrder: 2,
  minimumZoom: 9,
  maximumZoom: 13,
  defaultOpacity: 0.75,
  outputFormat: 'webp-image',
  webpQuality: 92,
  qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
  fitPoints: [
    point('FINNSNES', 140.655, 288.809, '691425N', '0175754E'),
    point('ROSSVOLL', 310.248, 334.3497, '691042N', '0183000E'),
    point('TAKVATN', 482.321, 384.1463, '690635N', '0190220E'),
    point('TILLERMO', 527.62, 481.6453, '685944N', '0190943E'),
    point('SODA', 464.529, 541.343, '685557N', '0185700E'),
    point('SAFT', 377.691, 518.8713, '685751N', '0184048E'),
    point('SARA', 324.516, 484.347, '690025N', '0183105E'),
    point('GOMPEN', 141.328, 454.4167, '690307N', '0175630E'),
  ],
  validationPoints: [
    point('FINNFJORD', 178.134, 299.909, '691332N', '0180500E'),
    point('REINELV', 228.887, 313.1683, '691227N', '0181437E'),
    point('STEINVANN', 287.263, 389.9097, '690700N', '0182500E'),
    point('ROGNMO', 384.019, 401.8707, '690548N', '0184321E'),
    point('NORA', 349.115, 400.5373, '690602N', '0183642E'),
    point('WERA', 285.557, 437.6637, '690345N', '0182410E'),
    point('ELLA', 361.139, 458.987, '690200N', '0183820E'),
    point('RUNDHAUG', 443.472, 466.147, '690110N', '0185355E'),
    point('SØRREISA', 217.71, 385.1097, '690735N', '0181145E'),
  ],
  sourceReferences: [
    {
      sourceType: 'vac-pdf',
      sourceAerodrome: 'ENDU',
      sourceDocument: 'Visual Approach Chart - ICAO AD 2 ENDU 6-1',
      aipSection: 'AD 2 ENDU 6-1',
      sourcePage: '1',
      publishedIdentifier: 'ENDU VAC',
      sourceReference: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623256.pdf',
    },
    {
      sourceType: 'eAIP-html',
      sourceAerodrome: 'ENDU',
      sourceDocument: 'AD 2 ENDU',
      aipSection: 'AD 2.24',
      sourceReference: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-2.ENDU-en-GB.html',
    },
  ],
};
