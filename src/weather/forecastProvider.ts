import type { WindForecastModelId } from '../domain';
import { getWindForecastModel } from './forecastModels';
import { fetchOpenMeteoLegWinds } from './openMeteoClient';
import type { ForecastLegWind, WeatherSampleRequest } from './types';

/**
 * Provider boundary consumed by React forecast hooks. New providers (for
 * example a MET Norway backend) only need to normalize into ForecastLegWind.
 */
export interface WindForecastProvider {
  readonly id: string;
  fetchWinds(
    model: WindForecastModelId,
    requests: readonly WeatherSampleRequest[],
    signal: AbortSignal,
  ): Promise<readonly ForecastLegWind[]>;
}

const openMeteoWindForecastProvider: WindForecastProvider = {
  id: 'open-meteo',
  fetchWinds: (model, requests, signal) => fetchOpenMeteoLegWinds(requests, signal, model),
};

export function getWindForecastProvider(
  model: WindForecastModelId,
): WindForecastProvider {
  const definition = getWindForecastModel(model);
  if (definition.provider === 'open-meteo') return openMeteoWindForecastProvider;
  throw new RangeError(`No wind forecast provider is configured for ${model}`);
}
