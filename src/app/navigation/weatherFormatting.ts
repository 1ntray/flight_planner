import type { ForecastLegWind } from '../../weather';
import { FEET_TO_METERS } from '../../weather';
import { formatUtcDateTime } from '../route/routeFormatting';

export function formatForecastSourceLabel(
  forecasts: readonly ForecastLegWind[],
): string {
  const forecast = forecasts[0];
  return forecast === undefined
    ? 'Forecast'
    : `${forecast.modelLabel} via ${forecast.providerLabel}`;
}

/** Backwards-compatible ECMWF label for existing callers and documents. */
export const FORECAST_SOURCE_LABEL = 'ECMWF IFS 0.25° via Open-Meteo';

function formatRounded(value: number): string {
  return Math.round(value).toString();
}

function formatPressureAndHeightRange(forecast: ForecastLegWind): string {
  const [lowerPressure, upperPressure] = forecast.pressureLevelRangeHpa;
  const [lowerHeight, upperHeight] =
    forecast.geopotentialHeightRangeMetersMsl;

  if (lowerPressure === upperPressure) {
    return `${lowerPressure} hPa (${formatRounded(lowerHeight)} m geopotential height)`;
  }

  return `${lowerPressure}–${upperPressure} hPa (${formatRounded(lowerHeight)}–${formatRounded(upperHeight)} m geopotential height)`;
}

export function formatForecastValidTimeRange(
  forecasts: readonly ForecastLegWind[],
): string {
  if (forecasts.length === 0) {
    return '—';
  }

  const times = forecasts.map((forecast) => forecast.sampledTimeUtcMs);
  const first = Math.min(...times);
  const last = Math.max(...times);

  return first === last
    ? formatUtcDateTime(first)
    : `${formatUtcDateTime(first)} – ${formatUtcDateTime(last)}`;
}

export function formatForecastRetrievalTime(
  forecasts: readonly ForecastLegWind[],
): string {
  if (forecasts.length === 0) {
    return '—';
  }

  return formatUtcDateTime(
    Math.max(...forecasts.map((forecast) => forecast.retrievedAtUtcMs)),
  );
}

export function formatForecastWindDetails(
  forecast: ForecastLegWind,
): string {
  const requestedAltitudeFt = formatRounded(forecast.altitudeFtMsl);
  const levelDescription = formatPressureAndHeightRange(forecast);
  const altitudeDescription = forecast.altitudeClamped
    ? `requested ${requestedAltitudeFt} ft MSL, clamped to ${formatRounded(forecast.effectiveAltitudeMetersMsl / FEET_TO_METERS)} ft MSL at ${levelDescription}`
    : `requested ${requestedAltitudeFt} ft MSL, vertically interpolated using ${levelDescription}`;

  return `${formatForecastSourceLabel([forecast])}; valid ${formatUtcDateTime(forecast.sampledTimeUtcMs)}; ${altitudeDescription}; retrieved ${formatUtcDateTime(forecast.retrievedAtUtcMs)}`;
}

export function formatForecastWindCollectionDetails(
  forecasts: readonly ForecastLegWind[],
): string {
  if (forecasts.length === 0) {
    return '—';
  }

  if (forecasts.length === 1) {
    return formatForecastWindDetails(forecasts[0]!);
  }

  return `${formatForecastSourceLabel(forecasts)}; ${forecasts.length} performance samples across this leg; valid ${formatForecastValidTimeRange(forecasts)}; retrieved ${formatForecastRetrievalTime(forecasts)}`;
}
