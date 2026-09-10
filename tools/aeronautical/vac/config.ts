import type { VacPreparationConfig, VacPreparationPoint } from './types';

const SHA_256 = /^[a-f0-9]{64}$/i;
const PUBLISHED_COORDINATE = /^\d{6}[NS]$|^\d{7}[EW]$/;

export function parsePublishedDms(value: string): number {
  if (!PUBLISHED_COORDINATE.test(value)) throw new Error(`Malformed published DMS coordinate: ${value}`);
  const hemisphere = value.at(-1)!;
  const digits = value.slice(0, -1);
  const degreeDigits = hemisphere === 'N' || hemisphere === 'S' ? 2 : 3;
  const degrees = Number(digits.slice(0, degreeDigits));
  const minutes = Number(digits.slice(degreeDigits, degreeDigits + 2));
  const seconds = Number(digits.slice(degreeDigits + 2));
  if (minutes >= 60 || seconds >= 60) throw new Error(`Malformed published DMS coordinate: ${value}`);
  const sign = hemisphere === 'S' || hemisphere === 'W' ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function validatePoint(point: VacPreparationPoint, label: string): void {
  if (!point.label.trim()) throw new Error(`${label} requires a label`);
  if (!Number.isFinite(point.sourcePointX) || !Number.isFinite(point.sourcePointY)) {
    throw new Error(`${label} requires finite PDF point coordinates`);
  }
  const hasPublishedPair = point.publishedLatitude !== undefined || point.publishedLongitude !== undefined;
  const hasDecimalPair = point.latitude !== undefined || point.longitude !== undefined;
  if (hasPublishedPair === hasDecimalPair) {
    throw new Error(`${label} requires exactly one published DMS pair or reviewed decimal pair`);
  }
  if (hasPublishedPair) {
    if (point.publishedLatitude === undefined || point.publishedLongitude === undefined) {
      throw new Error(`${label} requires both published DMS coordinates`);
    }
    parsePublishedDms(point.publishedLatitude);
    parsePublishedDms(point.publishedLongitude);
  } else if (point.latitude === undefined || point.longitude === undefined ||
      !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) {
    throw new Error(`${label} requires a finite reviewed WGS84 coordinate pair`);
  }
}

export function validateVacPreparationConfig(config: VacPreparationConfig): VacPreparationConfig {
  if (config.configVersion !== 1) throw new Error(`Unsupported VAC preparation config version: ${String(config.configVersion)}`);
  if (!Number.isInteger(config.preparationRevision) || config.preparationRevision < 1) {
    throw new Error('VAC preparationRevision must be a positive integer');
  }
  if (!SHA_256.test(config.sourcePdfSha256)) throw new Error('VAC sourcePdfSha256 must contain 64 hexadecimal characters');
  if (!config.id.trim() || !config.icao.match(/^[A-Z]{4}$/) || !config.aerodromeFeatureId.trim() || !config.title.trim()) {
    throw new Error('VAC preparation identity, four-letter ICAO, aerodrome feature, and title are required');
  }
  let sourceUrl: URL;
  try { sourceUrl = new URL(config.sourceUrl); } catch { throw new Error('VAC sourceUrl must be a valid HTTPS URL'); }
  if (sourceUrl.protocol !== 'https:') throw new Error('VAC sourceUrl must be a valid HTTPS URL');
  if (Number.isNaN(Date.parse(`${config.chartDate}T00:00:00Z`))) throw new Error('VAC chartDate must be a valid date');
  if (config.page < 1 || !Number.isInteger(config.page)) throw new Error('VAC page must be a positive integer');
  if (config.renderDpi < 72 || !Number.isInteger(config.renderDpi)) throw new Error('VAC renderDpi must be an integer of at least 72');
  if (config.minimumZoom > config.maximumZoom) throw new Error('VAC minimumZoom must not exceed maximumZoom');
  if (config.defaultOpacity < 0 || config.defaultOpacity > 1) throw new Error('VAC defaultOpacity must be between zero and one');
  if (config.outputFormat !== undefined && !['xyz-tiles', 'webp-image'].includes(config.outputFormat)) {
    throw new Error('VAC outputFormat must be xyz-tiles or webp-image');
  }
  if (config.webpQuality !== undefined && (!Number.isInteger(config.webpQuality) || config.webpQuality < 1 || config.webpQuality > 100)) {
    throw new Error('VAC webpQuality must be an integer from 1 to 100');
  }
  if (config.cropPdfPoints.left >= config.cropPdfPoints.right || config.cropPdfPoints.top >= config.cropPdfPoints.bottom) {
    throw new Error('VAC crop rectangle is invalid');
  }
  if (config.fitPoints.length < 4) throw new Error('VAC preparation requires at least four fit points');
  if (config.validationPoints.length < 2) throw new Error('VAC preparation requires at least two independent validation points');
  config.fitPoints.forEach((point, index) => validatePoint(point, `fitPoints[${index}]`));
  config.validationPoints.forEach((point, index) => validatePoint(point, `validationPoints[${index}]`));
  // Reviewed JSON rounds PDF-point coordinates to six decimals. Permit only
  // that sub-pixel serialization tolerance at the exact chart-frame edge.
  const cropTolerance = 0.000001;
  for (const point of [...config.fitPoints, ...config.validationPoints]) {
    if (point.sourcePointX < config.cropPdfPoints.left - cropTolerance || point.sourcePointX > config.cropPdfPoints.right + cropTolerance ||
        point.sourcePointY < config.cropPdfPoints.top - cropTolerance || point.sourcePointY > config.cropPdfPoints.bottom + cropTolerance) {
      throw new Error(`VAC preparation point ${point.label} lies outside the configured chart crop`);
    }
  }
  const fitLabels = new Set(config.fitPoints.map(({ label }) => label));
  const overlap = config.validationPoints.filter(({ label }) => fitLabels.has(label));
  if (overlap.length > 0) throw new Error(`Validation points must be independent of fit points: ${overlap.map(({ label }) => label).join(', ')}`);
  const fitWidth = Math.max(...config.fitPoints.map(({ sourcePointX }) => sourcePointX)) - Math.min(...config.fitPoints.map(({ sourcePointX }) => sourcePointX));
  const fitHeight = Math.max(...config.fitPoints.map(({ sourcePointY }) => sourcePointY)) - Math.min(...config.fitPoints.map(({ sourcePointY }) => sourcePointY));
  const minimumSpan = config.minimumControlSpanFraction ?? 0.4;
  if (!Number.isFinite(minimumSpan) || minimumSpan < 0.3 || minimumSpan > 1) {
    throw new Error('VAC minimumControlSpanFraction must be between 0.3 and 1');
  }
  if (fitWidth < (config.cropPdfPoints.right - config.cropPdfPoints.left) * minimumSpan ||
      fitHeight < (config.cropPdfPoints.bottom - config.cropPdfPoints.top) * minimumSpan) {
    throw new Error(`VAC fit points must span at least ${Math.round(minimumSpan * 100)}% of the chart crop in both dimensions`);
  }
  if (config.qualityThresholds.maximumRmsMeters <= 0 || config.qualityThresholds.maximumErrorMeters <= 0) {
    throw new Error('VAC quality thresholds must be positive');
  }
  return config;
}
