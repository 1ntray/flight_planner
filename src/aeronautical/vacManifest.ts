import type { VacChartManifest } from '../domain';

export function validateVacChartManifest(manifest: VacChartManifest): readonly string[] {
  const errors: string[] = [];
  if (!manifest.id.trim() || !manifest.aerodromeFeatureId.trim() || !manifest.title.trim()) {
    errors.push('VAC manifest identity and title must be present');
  }
  if (Number.isNaN(Date.parse(`${manifest.chartDate}T00:00:00Z`))) errors.push('VAC chartDate must be a valid date');
  if (manifest.targetCrs !== 'EPSG:3857') errors.push('VAC tiles must be prepared in EPSG:3857');
  if (!Number.isInteger(manifest.minimumZoom) || !Number.isInteger(manifest.maximumZoom) || manifest.minimumZoom < 0 || manifest.minimumZoom > manifest.maximumZoom) errors.push('VAC zooms must be non-negative integers and minimumZoom must not exceed maximumZoom');
  if (!Number.isFinite(manifest.defaultOpacity) || manifest.defaultOpacity < 0 || manifest.defaultOpacity > 1) errors.push('VAC defaultOpacity must be between 0 and 1');
  if (![manifest.bounds.south, manifest.bounds.west, manifest.bounds.north, manifest.bounds.east].every(Number.isFinite) || manifest.bounds.south < -90 || manifest.bounds.north > 90 || manifest.bounds.south >= manifest.bounds.north) errors.push('VAC bounds must contain valid ordered WGS84 latitudes');
  if (manifest.bounds.west < -180 || manifest.bounds.east > 180 || manifest.bounds.west >= manifest.bounds.east) errors.push('VAC bounds must contain valid ordered WGS84 longitudes');
  const hasImage = typeof manifest.imageUrl === 'string' && manifest.imageUrl.trim().length > 0;
  const hasTiles = typeof manifest.tileUrlTemplate === 'string' && manifest.tileUrlTemplate.trim().length > 0;
  if (hasImage === hasTiles) errors.push('VAC manifest must contain exactly one raster source');
  if (hasTiles && (!manifest.tileUrlTemplate!.includes('{z}') || !manifest.tileUrlTemplate!.includes('{x}') || !manifest.tileUrlTemplate!.includes('{y}'))) {
    errors.push('VAC tile URL must contain {z}, {x}, and {y}');
  }
  if (manifest.groundControlPoints.length < 4) errors.push('VAC preparation must retain at least four ground-control points');
  if (manifest.groundControlPoints.some((point) =>
    ![point.pixelX, point.pixelY, point.latitude, point.longitude].every(Number.isFinite) ||
    point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180,
  )) errors.push('VAC ground-control points must contain finite pixels and valid WGS84 coordinates');
  const validation = manifest.validation;
  if (validation !== undefined) {
    const metrics = [
      validation.residualRmsPixels,
      validation.maximumResidualPixels,
      validation.residualRmsMeters,
      validation.maximumResidualMeters,
    ].filter((value): value is number => value !== undefined);
    if (metrics.some((value) => !Number.isFinite(value) || value < 0)) {
      errors.push('VAC validation residuals must be finite and non-negative');
    }
    if ((validation.fitPointCount !== undefined && (!Number.isInteger(validation.fitPointCount) || validation.fitPointCount < 0)) ||
        (validation.validationPointCount !== undefined && (!Number.isInteger(validation.validationPointCount) || validation.validationPointCount < 0))) {
      errors.push('VAC validation point counts must be non-negative integers');
    }
    if (validation.qualityThresholds !== undefined &&
        (![validation.qualityThresholds.maximumRmsMeters, validation.qualityThresholds.maximumErrorMeters].every(Number.isFinite) ||
          validation.qualityThresholds.maximumRmsMeters <= 0 || validation.qualityThresholds.maximumErrorMeters <= 0)) {
      errors.push('VAC quality thresholds must be finite and positive');
    }
  }
  return errors;
}

/** Fail-closed checks for charts that may be exposed by the runtime repository. */
export function validateProductionVacChartManifest(manifest: VacChartManifest): readonly string[] {
  const errors = [...validateVacChartManifest(manifest)];
  if (!/^[a-f0-9]{64}$/i.test(manifest.sourcePdfSha256 ?? '')) {
    errors.push('Production VAC charts must retain a valid source PDF SHA-256');
  }
  if (!manifest.sourceReferences.some(({ sourceType }) => sourceType === 'vac-pdf')) {
    errors.push('Production VAC charts must retain a VAC PDF source reference');
  }
  const validation = manifest.validation;
  if (validation === undefined) {
    errors.push('Production VAC charts must include independent validation results');
    return errors;
  }
  if ((validation.fitPointCount ?? 0) < 4) errors.push('Production VAC charts require at least four fit points');
  if ((validation.validationPointCount ?? 0) < 2) errors.push('Production VAC charts require at least two independent validation points');
  if (validation.residualRmsMeters === undefined || validation.maximumResidualMeters === undefined) {
    errors.push('Production VAC charts must include validation error in metres');
  }
  if (validation.qualityThresholds === undefined) {
    errors.push('Production VAC charts must declare quality thresholds');
  } else {
    if (
    validation.residualRmsMeters !== undefined &&
    validation.residualRmsMeters > validation.qualityThresholds.maximumRmsMeters
    ) errors.push('VAC validation RMS exceeds the production threshold');
    if (
    validation.maximumResidualMeters !== undefined &&
    validation.maximumResidualMeters > validation.qualityThresholds.maximumErrorMeters
    ) errors.push('VAC validation maximum error exceeds the production threshold');
  }
  return errors;
}
