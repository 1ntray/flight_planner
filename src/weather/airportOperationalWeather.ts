import type { Position } from '../domain';

/** Live airport data is deliberately separate from upper-air route winds and AIRAC data. */
export type AirportWeatherProduct<T> =
  | { readonly status: 'not-loaded' | 'loading' }
  | { readonly status: 'unavailable'; readonly message: string }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'available'; readonly value: T; readonly retrievedAtUtcMs: number };

export interface AirportWeatherRequest {
  readonly airportKey: string;
  readonly icaoIdentifier: string;
  readonly position: Position;
  readonly elevationFtMsl: number;
  readonly plannedTimeUtcMs: number;
  readonly context: 'departure' | 'arrival' | 'onward-departure' | 'destination';
}

export type AirportWind =
  | { readonly kind: 'calm'; readonly speedKt: 0; readonly gustKt?: number }
  | { readonly kind: 'fixed'; readonly directionFromTrueDeg: number; readonly speedKt: number; readonly gustKt?: number }
  | { readonly kind: 'variable'; readonly speedKt: number; readonly gustKt?: number };

export interface MetarReport {
  readonly rawTac: string;
  readonly reportType: 'METAR' | 'SPECI';
  readonly observationTimeUtcMs?: number;
  readonly isAuto: boolean;
  readonly isCorrected: boolean;
  readonly wind?: AirportWind;
  readonly temperatureC?: number;
  readonly qnhHpa?: number;
}

export type TafChangeKind = 'base' | 'FM' | 'BECMG' | 'TEMPO' | 'PROB30' | 'PROB40' | 'PROB_TEMPO';
export interface TafWindGroup {
  readonly kind: TafChangeKind;
  readonly wind?: AirportWind;
  readonly startUtcMs?: number;
  readonly endUtcMs?: number;
}
export interface TafReport {
  readonly rawTac: string;
  readonly issueTimeUtcMs?: number;
  readonly validFromUtcMs?: number;
  readonly validToUtcMs?: number;
  readonly groups: readonly TafWindGroup[];
}
export type TafWindResolution =
  | { readonly status: 'unavailable'; readonly message: string }
  | { readonly status: 'available'; readonly wind: AirportWind; readonly applicableGroup: TafChangeKind }
  | { readonly status: 'ambiguous'; readonly prevailing?: AirportWind; readonly alternatives: readonly TafWindGroup[]; readonly message: string };

export interface SurfaceForecast {
  readonly validTimeUtcMs: number;
  readonly temperatureC?: number;
  readonly pressureMslHpa?: number;
  readonly wind?: AirportWind;
}
export interface AirportOperationalWeather {
  readonly request: AirportWeatherRequest;
  readonly metar: AirportWeatherProduct<MetarReport>;
  readonly taf: AirportWeatherProduct<TafReport>;
  readonly forecast: AirportWeatherProduct<SurfaceForecast>;
}

export interface AirportWeatherSelection {
  readonly wind: 'manual' | 'metar' | 'taf';
  readonly pressure: 'manual' | 'metar' | 'forecast';
  readonly temperature: 'manual' | 'metar' | 'forecast';
}
export const MANUAL_AIRPORT_WEATHER_SELECTION: AirportWeatherSelection = {
  wind: 'manual', pressure: 'manual', temperature: 'manual',
};

export interface EffectiveAirportPlanningEnvironment {
  readonly wind?: AirportWind;
  readonly qnhHpa: number;
  readonly isaDeviationC: number;
  readonly windSource: AirportWeatherSelection['wind'];
  readonly pressureSource: AirportWeatherSelection['pressure'];
  readonly temperatureSource: AirportWeatherSelection['temperature'];
  readonly unavailable: readonly string[];
}

const KNOTS_PER_METRE_PER_SECOND = 1.943844492;
const HPA_PER_INHG = 33.8638866667;
const WEATHER_CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAtUtcMs: number; value: AirportOperationalWeather }>();
const inFlight = new Map<string, Promise<AirportOperationalWeather>>();

function parseDayTime(token: string, referenceUtcMs: number): number | undefined {
  const match = /^(\d{2})(\d{2})(\d{2})Z?$/.exec(token);
  if (!match) return undefined;
  const reference = new Date(referenceUtcMs);
  const day = Number(match[1]); const hour = Number(match[2]); const minute = Number(match[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return undefined;
  let result = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), day, hour, minute);
  // Reports around a month boundary may refer to the adjacent month.
  if (result - referenceUtcMs > 15 * 24 * 60 * 60 * 1000) result = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, day, hour, minute);
  if (referenceUtcMs - result > 15 * 24 * 60 * 60 * 1000) result = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, day, hour, minute);
  return result;
}

function parseWind(token: string): AirportWind | undefined {
  const calm = /^00000(?:KT|MPS)$/.test(token);
  if (calm) return { kind: 'calm', speedKt: 0 };
  const match = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(token);
  if (!match) return undefined;
  const factor = match[4] === 'MPS' ? KNOTS_PER_METRE_PER_SECOND : 1;
  const speedKt = Number(match[2]) * factor;
  const gustKt = match[3] === undefined ? undefined : Number(match[3]) * factor;
  return match[1] === 'VRB'
    ? { kind: 'variable', speedKt, ...(gustKt === undefined ? {} : { gustKt }) }
    : { kind: 'fixed', directionFromTrueDeg: Number(match[1]), speedKt, ...(gustKt === undefined ? {} : { gustKt }) };
}

function parseTemperature(token: string): number | undefined {
  const match = /^(M?\d{2})\/(M?\d{2}|\/\/)$/.exec(token);
  if (!match) return undefined;
  return Number(match[1]!.replace('M', '-'));
}

/** Narrow, lossless parser: TAC is always retained even if individual groups are absent. */
export function parseMetarTac(rawTac: string, referenceUtcMs = Date.now()): MetarReport {
  const tokens = rawTac.trim().replace(/=$/, '').split(/\s+/);
  const reportType = tokens[0] === 'SPECI' ? 'SPECI' : 'METAR';
  const timestamp = tokens.find((token) => /^\d{6}Z$/.test(token));
  const windToken = tokens.find((token) => /^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?(?:KT|MPS)$/.test(token) || /^00000(?:KT|MPS)$/.test(token));
  const temperatureToken = tokens.find((token) => /^(?:M?\d{2})\/(?:M?\d{2}|\/\/)$/.test(token));
  const qnh = tokens.find((token) => /^Q\d{4}$/.test(token));
  const altimeter = tokens.find((token) => /^A\d{4}$/.test(token));
  const qnhHpa = qnh === undefined ? (altimeter === undefined ? undefined : Number(altimeter.slice(1)) / 100 * HPA_PER_INHG) : Number(qnh.slice(1));
  const observationTimeUtcMs = timestamp === undefined ? undefined : parseDayTime(timestamp, referenceUtcMs);
  const wind = windToken === undefined ? undefined : parseWind(windToken);
  const temperatureC = temperatureToken === undefined ? undefined : parseTemperature(temperatureToken);
  return {
    rawTac,
    reportType,
    ...(observationTimeUtcMs === undefined ? {} : { observationTimeUtcMs }),
    isAuto: tokens.includes('AUTO'), isCorrected: tokens.includes('COR'),
    ...(wind === undefined ? {} : { wind }),
    ...(temperatureC === undefined ? {} : { temperatureC }),
    ...(qnhHpa === undefined ? {} : { qnhHpa }),
  };
}

function parseTafRange(token: string, referenceUtcMs: number): readonly [number, number] | undefined {
  const match = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(token);
  if (!match) return undefined;
  const start = parseDayTime(`${match[1]}${match[2]}00Z`, referenceUtcMs);
  if (start === undefined) return undefined;
  let end = parseDayTime(`${match[3]}${match[4]}00Z`, start);
  if (end !== undefined && end <= start) end += 24 * 60 * 60 * 1000;
  return end === undefined ? undefined : [start, end];
}

/** Parses wind-bearing TAF changes only; phenomena and minima stay in the raw TAC. */
export function parseTafTac(rawTac: string, referenceUtcMs = Date.now()): TafReport {
  const tokens = rawTac.trim().replace(/=$/, '').split(/\s+/);
  const issue = tokens.find((token) => /^\d{6}Z$/.test(token));
  const validityIndex = tokens.findIndex((token) => /^\d{4}\/\d{4}$/.test(token));
  const validity = validityIndex < 0 ? undefined : parseTafRange(tokens[validityIndex]!, referenceUtcMs);
  const groups: TafWindGroup[] = [];
  let kind: TafChangeKind = 'base'; let range = validity;
  for (let index = Math.max(validityIndex + 1, 0); index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (/^FM\d{6}$/.test(token)) { kind = 'FM'; const time = parseDayTime(`${token.slice(2)}Z`, referenceUtcMs); range = time === undefined ? undefined : [time, validity?.[1] ?? time]; continue; }
    if (token === 'BECMG' || token === 'TEMPO') { kind = token as 'BECMG' | 'TEMPO'; const candidate = tokens[index + 1]; range = candidate === undefined ? validity : parseTafRange(candidate, referenceUtcMs) ?? validity; continue; }
    if (token === 'PROB30' || token === 'PROB40') { kind = token as 'PROB30' | 'PROB40'; const candidate = tokens[index + 1]; if (candidate === 'TEMPO') { kind = 'PROB_TEMPO'; index += 1; } range = parseTafRange(tokens[index + 1] ?? '', referenceUtcMs) ?? validity; continue; }
    const wind = parseWind(token); if (wind !== undefined) groups.push({ kind, wind, ...(range === undefined ? {} : { startUtcMs: range[0], endUtcMs: range[1] }) });
  }
  const issueTimeUtcMs = issue === undefined ? undefined : parseDayTime(issue, referenceUtcMs);
  return { rawTac, ...(issueTimeUtcMs === undefined ? {} : { issueTimeUtcMs }), ...(validity === undefined ? {} : { validFromUtcMs: validity[0], validToUtcMs: validity[1] }), groups };
}

export function resolveTafWind(taf: TafReport, plannedTimeUtcMs: number): TafWindResolution {
  if (taf.validFromUtcMs !== undefined && taf.validToUtcMs !== undefined && (plannedTimeUtcMs < taf.validFromUtcMs || plannedTimeUtcMs > taf.validToUtcMs)) return { status: 'unavailable', message: 'Planned time is outside TAF validity.' };
  const applicable = taf.groups.filter((group) => group.wind !== undefined && (group.startUtcMs === undefined || group.endUtcMs === undefined || (plannedTimeUtcMs >= group.startUtcMs && plannedTimeUtcMs <= group.endUtcMs)));
  const alternatives = applicable.filter((group) => group.kind === 'TEMPO' || group.kind === 'PROB30' || group.kind === 'PROB40' || group.kind === 'PROB_TEMPO');
  const prevailing = applicable.filter((group) => group.kind === 'base' || group.kind === 'FM' || group.kind === 'BECMG').at(-1);
  if (alternatives.length > 0 || prevailing?.kind === 'BECMG' || prevailing?.wind?.kind === 'variable') return { status: 'ambiguous', ...(prevailing?.wind === undefined ? {} : { prevailing: prevailing.wind }), alternatives, message: 'TAF includes temporary, probabilistic, transitional, or variable wind.' };
  if (prevailing?.wind === undefined) return { status: 'unavailable', message: 'No applicable deterministic TAF wind.' };
  return { status: 'available', wind: prevailing.wind, applicableGroup: prevailing.kind };
}

interface LocationforecastTimeseries { readonly time: string; readonly data?: { readonly instant?: { readonly details?: Record<string, unknown> } } }
function numeric(details: Record<string, unknown> | undefined, key: string): number | undefined { const value = details?.[key]; return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function vectorToWind(east: number, north: number, gustKt?: number): AirportWind {
  const speedKt = Math.hypot(east, north); if (speedKt < 0.05) return { kind: 'calm', speedKt: 0, ...(gustKt === undefined ? {} : { gustKt }) };
  return { kind: 'fixed', directionFromTrueDeg: (Math.atan2(-east, -north) * 180 / Math.PI + 360) % 360, speedKt, ...(gustKt === undefined ? {} : { gustKt }) };
}
function windVector(wind: AirportWind | undefined): readonly [number, number] | undefined { if (wind?.kind !== 'fixed') return undefined; const radians = wind.directionFromTrueDeg * Math.PI / 180; return [-Math.sin(radians) * wind.speedKt, -Math.cos(radians) * wind.speedKt]; }

/** Time interpolation uses vectors for wind so north crossings never go through 180 degrees. */
export function selectSurfaceForecast(value: unknown, plannedTimeUtcMs: number): SurfaceForecast | undefined {
  const series = (value as { properties?: { timeseries?: readonly LocationforecastTimeseries[] } })?.properties?.timeseries;
  if (!Array.isArray(series)) return undefined;
  const samples = series.flatMap((entry) => { const time = Date.parse(entry.time); const details = entry.data?.instant?.details; return Number.isFinite(time) && details !== undefined ? [{ time, temperatureC: numeric(details, 'air_temperature'), pressureMslHpa: numeric(details, 'air_pressure_at_sea_level'), wind: (() => { const direction = numeric(details, 'wind_from_direction'); const speed = numeric(details, 'wind_speed'); if (direction === undefined || speed === undefined) return undefined; return { kind: 'fixed' as const, directionFromTrueDeg: direction, speedKt: speed * KNOTS_PER_METRE_PER_SECOND, ...(numeric(details, 'wind_speed_of_gust') === undefined ? {} : { gustKt: numeric(details, 'wind_speed_of_gust')! * KNOTS_PER_METRE_PER_SECOND }) }; })() }] : []; });
  const after = samples.find((sample) => sample.time >= plannedTimeUtcMs); const before = [...samples].reverse().find((sample) => sample.time <= plannedTimeUtcMs);
  if (before === undefined || after === undefined) return undefined;
  if (before.time === after.time) return { validTimeUtcMs: before.time, ...(before.temperatureC === undefined ? {} : { temperatureC: before.temperatureC }), ...(before.pressureMslHpa === undefined ? {} : { pressureMslHpa: before.pressureMslHpa }), ...(before.wind === undefined ? {} : { wind: before.wind }) };
  const fraction = (plannedTimeUtcMs - before.time) / (after.time - before.time); const firstVector = windVector(before.wind); const secondVector = windVector(after.wind);
  const interpolatedWind = firstVector === undefined || secondVector === undefined ? undefined : vectorToWind(firstVector[0] + (secondVector[0] - firstVector[0]) * fraction, firstVector[1] + (secondVector[1] - firstVector[1]) * fraction, before.wind?.gustKt === undefined || after.wind?.gustKt === undefined ? undefined : before.wind.gustKt + (after.wind.gustKt - before.wind.gustKt) * fraction);
  return { validTimeUtcMs: plannedTimeUtcMs, ...(before.temperatureC === undefined || after.temperatureC === undefined ? {} : { temperatureC: before.temperatureC + (after.temperatureC - before.temperatureC) * fraction }), ...(before.pressureMslHpa === undefined || after.pressureMslHpa === undefined ? {} : { pressureMslHpa: before.pressureMslHpa + (after.pressureMslHpa - before.pressureMslHpa) * fraction }), ...(interpolatedWind === undefined ? {} : { wind: interpolatedWind }) };
}

export function deriveIsaDeviationC(temperatureC: number, elevationFtMsl: number): number { return temperatureC - (15 - 0.0019812 * elevationFtMsl); }

export function resolveEffectiveAirportPlanningEnvironment(manual: { qnhHpa: number; isaDeviationC: number }, weather: AirportOperationalWeather, selection: AirportWeatherSelection): EffectiveAirportPlanningEnvironment {
  const unavailable: string[] = []; const metar = weather.metar.status === 'available' ? weather.metar.value : undefined; const forecast = weather.forecast.status === 'available' ? weather.forecast.value : undefined; const taf = weather.taf.status === 'available' ? resolveTafWind(weather.taf.value, weather.request.plannedTimeUtcMs) : undefined;
  const wind = selection.wind === 'metar' ? metar?.wind : selection.wind === 'taf' && taf?.status === 'available' ? taf.wind : undefined;
  if (selection.wind !== 'manual' && wind === undefined) unavailable.push(`${selection.wind.toUpperCase()} wind unavailable or ambiguous`);
  const qnh = selection.pressure === 'metar' ? metar?.qnhHpa : selection.pressure === 'forecast' ? forecast?.pressureMslHpa : undefined;
  if (selection.pressure !== 'manual' && qnh === undefined) unavailable.push(`${selection.pressure} pressure unavailable`);
  const temperature = selection.temperature === 'metar' ? metar?.temperatureC : selection.temperature === 'forecast' ? forecast?.temperatureC : undefined;
  if (selection.temperature !== 'manual' && temperature === undefined) unavailable.push(`${selection.temperature} temperature unavailable`);
  return { ...(wind === undefined ? {} : { wind }), qnhHpa: qnh ?? manual.qnhHpa, isaDeviationC: temperature === undefined ? manual.isaDeviationC : deriveIsaDeviationC(temperature, weather.request.elevationFtMsl), windSource: selection.wind, pressureSource: selection.pressure, temperatureSource: selection.temperature, unavailable };
}

function textContent(xml: string, tag: string): readonly string[] { const expression = new RegExp(`<(?:(?:[\\w-]+):)?${tag}[^>]*>([\\s\\S]*?)</(?:(?:[\\w-]+):)?${tag}>`, 'gi'); return [...xml.matchAll(expression)].map((match) => match[1]!.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').trim()); }
function blocks(xml: string, element: string): readonly string[] { const expression = new RegExp(`<(?:(?:[\\w-]+):)?${element}[^>]*>([\\s\\S]*?)</(?:(?:[\\w-]+):)?${element}>`, 'gi'); return [...xml.matchAll(expression)].map((match) => match[1]!); }
function isoTime(block: string, tag: 'beginPosition' | 'endPosition'): number | undefined { const value = textContent(block, tag)[0]; const parsed = value === undefined ? Number.NaN : Date.parse(`${value}Z`); return Number.isFinite(parsed) ? parsed : undefined; }
/** The endpoint returns history; retain only the latest METAR and the TAF valid now. */
export function extractCurrentTafmetarTac(xml: string, nowUtcMs = Date.now()): { readonly metarTac?: string; readonly tafTac?: string } {
  const metarTac = blocks(xml, 'meteorologicalAerodromeReport').map((block) => textContent(block, 'metarText')[0]).filter((value): value is string => value !== undefined).at(-1);
  const tafCandidates = blocks(xml, 'terminalAerodromeForecast').flatMap((block) => {
    const tafTac = textContent(block, 'tafText')[0]; const from = isoTime(block, 'beginPosition'); const to = isoTime(block, 'endPosition');
    return tafTac === undefined ? [] : [{ tafTac, from, to }];
  });
  const tafTac = tafCandidates.filter((candidate) => candidate.from !== undefined && candidate.to !== undefined && candidate.from <= nowUtcMs && nowUtcMs <= candidate.to).at(-1)?.tafTac ?? tafCandidates.at(-1)?.tafTac;
  return { ...(metarTac === undefined ? {} : { metarTac }), ...(tafTac === undefined ? {} : { tafTac }) };
}
function product<T>(value: T | undefined, message: string, retrievedAtUtcMs: number): AirportWeatherProduct<T> { return value === undefined ? { status: 'unavailable', message } : { status: 'available', value, retrievedAtUtcMs }; }
function settledMessage(result: PromiseSettledResult<unknown>, fallback: string): string { return result.status === 'rejected' && result.reason instanceof Error ? result.reason.message : fallback; }
export function buildLocationforecastUrl(request: AirportWeatherRequest): string { const params = new URLSearchParams({ lat: request.position.latitude.toFixed(4), lon: request.position.longitude.toFixed(4), altitude: String(Math.round(request.elevationFtMsl * 0.3048)) }); return `https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`; }

/**
 * The surface forecast is selected for a particular planned visit, not merely
 * for the physical aerodrome. Include that time in the runtime cache key so a
 * later visit to the same aerodrome cannot receive an earlier visit's sample.
 */
export function buildAirportWeatherRequestKey(request: AirportWeatherRequest): string {
  return [
    request.icaoIdentifier,
    request.position.latitude.toFixed(4),
    request.position.longitude.toFixed(4),
    Math.round(request.elevationFtMsl),
    request.plannedTimeUtcMs,
  ].join(':');
}

export async function fetchAirportOperationalWeather(request: AirportWeatherRequest, signal: AbortSignal, refresh = false): Promise<AirportOperationalWeather> {
  const key = buildAirportWeatherRequestKey(request); const now = Date.now(); const cached = cache.get(key); if (!refresh && cached !== undefined && cached.expiresAtUtcMs > now) return cached.value; const existing = inFlight.get(key); if (existing !== undefined) return existing;
  const promise = (async () => { const [tafmetarResult, forecastResult] = await Promise.allSettled([fetch(`https://api.met.no/weatherapi/tafmetar/1.0/tafmetar.xml?icao=${encodeURIComponent(request.icaoIdentifier)}`, { signal }).then(async (response) => { if (!response.ok) throw new Error(`METAR/TAF HTTP ${response.status}`); return response.text(); }), fetch(buildLocationforecastUrl(request), { signal }).then(async (response) => { if (!response.ok) throw new Error(`Locationforecast HTTP ${response.status}`); return response.json() as Promise<unknown>; })]); const retrievedAtUtcMs = Date.now(); const xml = tafmetarResult.status === 'fulfilled' ? tafmetarResult.value : undefined; const tac = xml === undefined ? {} : extractCurrentTafmetarTac(xml, retrievedAtUtcMs); const result: AirportOperationalWeather = { request, metar: xml === undefined ? { status: 'error', message: settledMessage(tafmetarResult, 'METAR request failed') } : product(tac.metarTac === undefined ? undefined : parseMetarTac(tac.metarTac, retrievedAtUtcMs), 'No usable current METAR.', retrievedAtUtcMs), taf: xml === undefined ? { status: 'error', message: settledMessage(tafmetarResult, 'TAF request failed') } : product(tac.tafTac === undefined ? undefined : parseTafTac(tac.tafTac, retrievedAtUtcMs), 'No usable current TAF.', retrievedAtUtcMs), forecast: forecastResult.status === 'fulfilled' ? product(selectSurfaceForecast(forecastResult.value, request.plannedTimeUtcMs), 'Forecast unavailable at planned time.', retrievedAtUtcMs) : { status: 'error', message: settledMessage(forecastResult, 'Forecast request failed') } }; cache.set(key, { expiresAtUtcMs: retrievedAtUtcMs + WEATHER_CACHE_MS, value: result }); return result; })(); inFlight.set(key, promise); try { return await promise; } finally { inFlight.delete(key); }
}
