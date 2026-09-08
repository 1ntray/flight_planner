import type { WindForecastModelId } from '../domain';
import type { OpenMeteoPressureLevel } from './openMeteoForecast';

export interface WindForecastModelDefinition {
  readonly id: WindForecastModelId;
  readonly label: string;
  readonly provider: 'open-meteo';
  readonly providerLabel: 'Open-Meteo';
  /** Open-Meteo model selector documented for the generic forecast endpoint. */
  readonly openMeteoModel: 'ecmwf_ifs025' | 'icon_eu';
  readonly pressureLevels: readonly OpenMeteoPressureLevel[];
}

export const OPEN_METEO_PRESSURE_LEVELS: readonly OpenMeteoPressureLevel[] = [
  { pressureHpa: 1000, approximateAltitudeMeters: 110 },
  { pressureHpa: 975, approximateAltitudeMeters: 320 },
  { pressureHpa: 950, approximateAltitudeMeters: 500 },
  { pressureHpa: 925, approximateAltitudeMeters: 800 },
  { pressureHpa: 900, approximateAltitudeMeters: 1000 },
  { pressureHpa: 850, approximateAltitudeMeters: 1500 },
  { pressureHpa: 800, approximateAltitudeMeters: 1900 },
  { pressureHpa: 700, approximateAltitudeMeters: 3000 },
  { pressureHpa: 600, approximateAltitudeMeters: 4200 },
  { pressureHpa: 500, approximateAltitudeMeters: 5600 },
  { pressureHpa: 400, approximateAltitudeMeters: 7200 },
  { pressureHpa: 300, approximateAltitudeMeters: 9200 },
  { pressureHpa: 250, approximateAltitudeMeters: 10400 },
  { pressureHpa: 200, approximateAltitudeMeters: 11800 },
  { pressureHpa: 150, approximateAltitudeMeters: 13600 },
  { pressureHpa: 100, approximateAltitudeMeters: 15800 },
  { pressureHpa: 70, approximateAltitudeMeters: 17700 },
  { pressureHpa: 50, approximateAltitudeMeters: 19300 },
  { pressureHpa: 30, approximateAltitudeMeters: 22000 },
];

export const WIND_FORECAST_MODELS: readonly WindForecastModelDefinition[] = [
  {
    id: 'ecmwf_ifs025', label: 'ECMWF IFS 0.25°', provider: 'open-meteo',
    providerLabel: 'Open-Meteo', openMeteoModel: 'ecmwf_ifs025', pressureLevels: OPEN_METEO_PRESSURE_LEVELS,
  },
  {
    id: 'icon_eu', label: 'DWD ICON-EU', provider: 'open-meteo',
    providerLabel: 'Open-Meteo', openMeteoModel: 'icon_eu', pressureLevels: OPEN_METEO_PRESSURE_LEVELS,
  },
];

export const DEFAULT_WIND_FORECAST_MODEL: WindForecastModelId = 'ecmwf_ifs025';

export function getWindForecastModel(
  model: WindForecastModelId,
): WindForecastModelDefinition {
  const definition = WIND_FORECAST_MODELS.find(({ id }) => id === model);
  if (definition === undefined) throw new RangeError(`Unsupported wind forecast model ${model}`);
  return definition;
}
