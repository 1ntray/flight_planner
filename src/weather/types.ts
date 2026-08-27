import type { LegWindOverride } from '../calculations';
import type { Position } from '../domain';

export interface WeatherSampleRequest {
  fromId: string;
  toId: string;
  position: Position;
  timeUtcMs: number;
  altitudeFtMsl: number;
}

export interface ForecastLegWind extends LegWindOverride {
  source: 'forecast';
  provider: 'open-meteo';
  model: 'ecmwf_ifs025';
  retrievedAtUtcMs: number;
  sampledPosition: Position;
  sampledTimeUtcMs: number;
  altitudeFtMsl: number;
  effectiveAltitudeMetersMsl: number;
  altitudeClamped: boolean;
  pressureLevelRangeHpa: readonly [number, number];
  geopotentialHeightRangeMetersMsl: readonly [number, number];
}
