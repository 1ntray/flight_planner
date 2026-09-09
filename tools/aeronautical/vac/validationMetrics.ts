import { createRequire } from 'node:module';
import type { VacPointResidual, VacValidationMetrics } from './types';

// The package is CommonJS at Node runtime even though the browser bundler
// exposes named exports. Use Node's loader here because this module is tooling-only.
const { Geodesic } = createRequire(import.meta.url)('geographiclib-geodesic') as {
  readonly Geodesic: {
    readonly WGS84: {
      Inverse(lat1: number, lon1: number, lat2: number, lon2: number): { readonly s12?: number };
    };
  };
};

function rms(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

export function calculateVacValidationMetrics(
  residuals: readonly VacPointResidual[],
  fitPointCount: number,
): VacValidationMetrics {
  if (fitPointCount < 4) throw new Error('VAC validation requires at least four fit points');
  if (residuals.length < 2) throw new Error('VAC validation requires at least two independent validation points');
  for (const residual of residuals) {
    if (!Number.isFinite(residual.horizontalErrorMeters) || residual.horizontalErrorMeters < 0 ||
        !Number.isFinite(residual.pixelError) || residual.pixelError < 0) {
      throw new Error(`VAC validation residual for ${residual.label} is invalid`);
    }
  }
  return {
    residualRmsPixels: rms(residuals.map(({ pixelError }) => pixelError)),
    maximumResidualPixels: Math.max(...residuals.map(({ pixelError }) => pixelError)),
    residualRmsMeters: rms(residuals.map(({ horizontalErrorMeters }) => horizontalErrorMeters)),
    maximumResidualMeters: Math.max(...residuals.map(({ horizontalErrorMeters }) => horizontalErrorMeters)),
    fitPointCount,
    validationPointCount: residuals.length,
    residuals,
  };
}

export function geodesicErrorMeters(
  expected: { readonly latitude: number; readonly longitude: number },
  predicted: { readonly latitude: number; readonly longitude: number },
): number {
  const distance = Geodesic.WGS84.Inverse(
    expected.latitude,
    expected.longitude,
    predicted.latitude,
    predicted.longitude,
  ).s12;
  if (distance === undefined || !Number.isFinite(distance)) {
    throw new Error('WGS84 validation calculation returned no finite distance');
  }
  return distance;
}
