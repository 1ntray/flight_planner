import type { VacChartManifest } from '../domain';

export function validateVacChartManifest(manifest: VacChartManifest): readonly string[] {
  const errors: string[] = [];
  if (manifest.targetCrs !== 'EPSG:3857') errors.push('VAC tiles must be prepared in EPSG:3857');
  if (manifest.minimumZoom > manifest.maximumZoom) errors.push('VAC minimumZoom must not exceed maximumZoom');
  if (manifest.defaultOpacity < 0 || manifest.defaultOpacity > 1) errors.push('VAC defaultOpacity must be between 0 and 1');
  if (manifest.bounds.south >= manifest.bounds.north) errors.push('VAC bounds must have south below north');
  if (manifest.bounds.west >= manifest.bounds.east) errors.push('VAC bounds must have west left of east');
  if (!manifest.tileUrlTemplate.includes('{z}') || !manifest.tileUrlTemplate.includes('{x}') || !manifest.tileUrlTemplate.includes('{y}')) {
    errors.push('VAC tile URL must contain {z}, {x}, and {y}');
  }
  if (manifest.groundControlPoints.length < 4) errors.push('VAC preparation must retain at least four ground-control points');
  return errors;
}
