import { describe, expect, it } from 'vitest';

import {
  buildLocationforecastUrl,
  deriveIsaDeviationC,
  extractCurrentTafmetarTac,
  parseMetarTac,
  parseTafTac,
  resolveEffectiveAirportPlanningEnvironment,
  resolveTafWind,
  selectSurfaceForecast,
} from './airportOperationalWeather';
import type { AirportOperationalWeather, AirportWeatherRequest } from './airportOperationalWeather';

const request: AirportWeatherRequest = {
  airportKey: 'ENDU', icaoIdentifier: 'ENDU', position: { latitude: 69.2747123, longitude: 17.4280123 }, elevationFtMsl: 254, plannedTimeUtcMs: Date.UTC(2026, 8, 9, 12, 30), context: 'departure',
};

describe('narrow METAR parsing', () => {
  it('reads the actual namespaced Tafmetar XML text fields and selects current products', () => {
    const xml = `<metno:aviationProducts xmlns:metno="http://api.met.no"><metno:terminalAerodromeForecast><metno:validPeriod><gml:beginPosition xmlns:gml="x">2026-09-09T12:00:00</gml:beginPosition><gml:endPosition xmlns:gml="x">2026-09-10T12:00:00</gml:endPosition></metno:validPeriod><metno:tafText>ENDU 091100Z 0912/1012 22010KT=</metno:tafText></metno:terminalAerodromeForecast><metno:meteorologicalAerodromeReport><metno:metarText>ENDU 091220Z 23010KT 05/01 Q1006=</metno:metarText></metno:meteorologicalAerodromeReport></metno:aviationProducts>`;
    expect(extractCurrentTafmetarTac(xml, Date.UTC(2026, 8, 9, 13))).toEqual({ metarTac: 'ENDU 091220Z 23010KT 05/01 Q1006=', tafTac: 'ENDU 091100Z 0912/1012 22010KT=' });
  });
  it('retains raw TAC while parsing AUTO, corrected report, gust, negative temperature, and QNH', () => {
    const metar = parseMetarTac('METAR ENDU 091220Z AUTO COR 23012G20KT 9999 M05/M10 Q1006=');
    expect(metar).toMatchObject({ rawTac: 'METAR ENDU 091220Z AUTO COR 23012G20KT 9999 M05/M10 Q1006=', isAuto: true, isCorrected: true, temperatureC: -5, qnhHpa: 1006 });
    expect(metar.wind).toMatchObject({ kind: 'fixed', directionFromTrueDeg: 230, speedKt: 12, gustKt: 20 });
  });
  it('keeps variable wind ambiguous and parses calm wind without inventing a direction', () => {
    expect(parseMetarTac('SPECI ENDU 091220Z VRB03KT 10/05 Q1012=').wind).toEqual({ kind: 'variable', speedKt: 3 });
    expect(parseMetarTac('METAR ENDU 091220Z 00000KT 10/05 Q1012=').wind).toEqual({ kind: 'calm', speedKt: 0 });
  });
});

describe('time-aware TAF wind', () => {
  it('uses the applicable FM group rather than the first wind', () => {
    const taf = parseTafTac('TAF ENDU 091100Z 0912/1012 22010KT FM091400 32015G25KT=', Date.UTC(2026, 8, 9, 11));
    expect(resolveTafWind(taf, Date.UTC(2026, 8, 9, 13)).status).toBe('available');
    expect(resolveTafWind(taf, Date.UTC(2026, 8, 9, 15))).toMatchObject({ status: 'available', wind: { directionFromTrueDeg: 320, speedKt: 15, gustKt: 25 } });
  });
  it('does not flatten TEMPO or variable winds into a deterministic forecast', () => {
    const taf = parseTafTac('TAF ENDU 091100Z 0912/1012 22010KT TEMPO 0912/0918 30020KT=', Date.UTC(2026, 8, 9, 11));
    expect(resolveTafWind(taf, Date.UTC(2026, 8, 9, 15)).status).toBe('ambiguous');
  });
});

describe('Locationforecast surface selection', () => {
  it('constructs a ground-elevation, four-decimal request and interpolates wind vectors through north', () => {
    const url = new URL(buildLocationforecastUrl(request));
    expect(url.searchParams.get('lat')).toBe('69.2747');
    expect(url.searchParams.get('lon')).toBe('17.4280');
    expect(url.searchParams.get('altitude')).toBe('77');
    const forecast = selectSurfaceForecast({ properties: { timeseries: [
      { time: '2026-09-09T12:00:00Z', data: { instant: { details: { air_temperature: 2, air_pressure_at_sea_level: 1000, wind_from_direction: 350, wind_speed: 5 } } } },
      { time: '2026-09-09T13:00:00Z', data: { instant: { details: { air_temperature: 4, air_pressure_at_sea_level: 1004, wind_from_direction: 10, wind_speed: 5 } } } },
    ] } }, request.plannedTimeUtcMs);
    expect(forecast?.temperatureC).toBe(3);
    expect(forecast?.pressureMslHpa).toBe(1002);
    expect(forecast?.wind).toMatchObject({ kind: 'fixed', directionFromTrueDeg: expect.closeTo(0, 6) });
  });
  it('does not extrapolate outside the available horizon', () => {
    expect(selectSurfaceForecast({ properties: { timeseries: [] } }, request.plannedTimeUtcMs)).toBeUndefined();
  });
});

describe('source selection', () => {
  it('keeps independent choices and derives ISA from selected temperature and aerodrome elevation', () => {
    const weather: AirportOperationalWeather = { request, metar: { status: 'available', retrievedAtUtcMs: 1, value: parseMetarTac('METAR ENDU 091220Z 23010KT 05/01 Q1006=') }, taf: { status: 'unavailable', message: 'none' }, forecast: { status: 'available', retrievedAtUtcMs: 1, value: { validTimeUtcMs: request.plannedTimeUtcMs, temperatureC: 8, pressureMslHpa: 1003, wind: { kind: 'fixed', directionFromTrueDeg: 240, speedKt: 12 } } } };
    const effective = resolveEffectiveAirportPlanningEnvironment({ qnhHpa: 1013, isaDeviationC: 0 }, weather, { wind: 'metar', pressure: 'forecast', temperature: 'forecast' });
    expect(effective.windSource).toBe('metar');
    expect(effective.qnhHpa).toBe(1003);
    expect(effective.isaDeviationC).toBeCloseTo(deriveIsaDeviationC(8, 254), 12);
  });
});
