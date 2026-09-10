import type {
  AirportWind,
  EffectiveAirportPlanningEnvironment,
} from '../../weather';

export interface PublishedAirportEnvironment {
  readonly waypointId: string;
  readonly environment: EffectiveAirportPlanningEnvironment | null;
}

function windsEqual(
  first: AirportWind | undefined,
  second: AirportWind | undefined,
): boolean {
  return first?.kind === second?.kind &&
    first?.speedKt === second?.speedKt &&
    first?.gustKt === second?.gustKt &&
    (first?.kind !== 'fixed' || second?.kind !== 'fixed' ||
      first.directionFromTrueDeg === second.directionFromTrueDeg);
}

function unavailableReasonsEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  return first.length === second.length &&
    first.every((reason, index) => reason === second[index]);
}

export function airportPlanningEnvironmentsEqual(
  first: EffectiveAirportPlanningEnvironment | null,
  second: EffectiveAirportPlanningEnvironment | null,
): boolean {
  if (first === null || second === null) return first === second;
  return first.qnhHpa === second.qnhHpa &&
    first.isaDeviationC === second.isaDeviationC &&
    first.temperatureC === second.temperatureC &&
    first.windSource === second.windSource &&
    first.pressureSource === second.pressureSource &&
    first.temperatureSource === second.temperatureSource &&
    windsEqual(first.wind, second.wind) &&
    unavailableReasonsEqual(first.unavailable, second.unavailable);
}

export function shouldPublishAirportEnvironment(
  previous: PublishedAirportEnvironment | undefined,
  waypointId: string,
  environment: EffectiveAirportPlanningEnvironment | null,
): boolean {
  return previous === undefined ||
    previous.waypointId !== waypointId ||
    !airportPlanningEnvironmentsEqual(previous.environment, environment);
}
