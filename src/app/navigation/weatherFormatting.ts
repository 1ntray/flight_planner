import type { ForecastLegWind } from '../../weather';
import {
  FEET_TO_METERS,
  OPEN_METEO_FORECAST_MODEL_LABEL,
  OPEN_METEO_FORECAST_PROVIDER_LABEL,
} from '../../weather';
import { formatUtcDateTime } from '../route/routeFormatting';

export const FORECAST_SOURCE_LABEL =
  `${OPEN_METEO_FORECAST_MODEL_LABEL} via ${OPEN_METEO_FORECAST_PROVIDER_LABEL}`;

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

  return `${FORECAST_SOURCE_LABEL}; valid ${formatUtcDateTime(forecast.sampledTimeUtcMs)}; ${altitudeDescription}; retrieved ${formatUtcDateTime(forecast.retrievedAtUtcMs)}`;
}
