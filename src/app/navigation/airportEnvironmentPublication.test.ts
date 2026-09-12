import { describe, expect, it } from 'vitest';

import type { EffectiveAirportPlanningEnvironment } from '../../weather';
import {
  airportPlanningEnvironmentsEqual,
  isAirportWeatherContextStale,
  shouldPublishAirportEnvironment,
} from './airportEnvironmentPublication';

const environment: EffectiveAirportPlanningEnvironment = {
  qnhHpa: 1013,
  isaDeviationC: 0,
  windSource: 'manual',
  pressureSource: 'manual',
  temperatureSource: 'manual',
  unavailable: [],
};

describe('airport environment publication', () => {
  it('does not republish an unchanged derived environment', () => {
    expect(shouldPublishAirportEnvironment(
      { waypointId: 'ENDU', environment },
      'ENDU',
      { ...environment, unavailable: [] },
    )).toBe(false);
  });

  it('publishes real environment changes and route-key reassignment', () => {
    expect(shouldPublishAirportEnvironment(
      { waypointId: 'ENDU', environment },
      'ENDU',
      { ...environment, qnhHpa: 1004 },
    )).toBe(true);
    expect(shouldPublishAirportEnvironment(
      { waypointId: 'ENDU', environment },
      'ENTC',
      environment,
    )).toBe(true);
  });

  it('compares null and wind-bearing environments semantically', () => {
    expect(airportPlanningEnvironmentsEqual(null, null)).toBe(true);
    expect(airportPlanningEnvironmentsEqual(null, environment)).toBe(false);
    expect(airportPlanningEnvironmentsEqual(
      {
        ...environment,
        wind: { kind: 'fixed', directionFromTrueDeg: 180, speedKt: 12 },
      },
      {
        ...environment,
        wind: { kind: 'fixed', directionFromTrueDeg: 190, speedKt: 12 },
      },
    )).toBe(false);
  });

  it('does not invalidate airport weather solely because its selected route wind refined ETA', () => {
    const loadedAt = Date.UTC(2026, 8, 12, 8, 0);
    expect(isAirportWeatherContextStale(loadedAt, loadedAt + 6 * 60 * 1000, false)).toBe(true);
    expect(isAirportWeatherContextStale(loadedAt, loadedAt + 6 * 60 * 1000, true)).toBe(false);
    expect(isAirportWeatherContextStale(loadedAt, loadedAt + 2 * 60 * 1000, false)).toBe(false);
  });
});
