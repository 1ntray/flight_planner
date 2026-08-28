import type {
  CalculatedPerformanceLeg,
  CalculatedPerformanceRoute,
} from '../../calculations';

export type VerticalPhase = 'climb' | 'descent';
export type PhaseBoundaryKind = 'start' | 'end';

export interface PerformancePhaseBoundary {
  readonly key: string;
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly phase: VerticalPhase;
  readonly boundary: PhaseBoundaryKind;
  readonly label: 'BOC' | 'TOC' | 'TOD' | 'BOD';
  readonly distanceFromLegStartNm: number;
  readonly altitudeFtMsl: number;
}

function deriveLegBoundaries(
  leg: CalculatedPerformanceLeg,
): PerformancePhaseBoundary[] {
  const boundaries: PerformancePhaseBoundary[] = [];
  let index = 0;

  while (index < leg.steps.length) {
    const first = leg.steps[index]!;

    if (first.phase === 'cruise') {
      index += 1;
      continue;
    }

    let endIndex = index;
    while (leg.steps[endIndex + 1]?.phase === first.phase) {
      endIndex += 1;
    }
    const last = leg.steps[endIndex]!;
    const phase = first.phase;
    const prefix = `${leg.fromId}:${leg.toId}:${index}:${phase}`;

    boundaries.push({
      key: `${prefix}:start`,
      fromWaypointId: leg.fromId,
      toWaypointId: leg.toId,
      phase,
      boundary: 'start',
      label: phase === 'climb' ? 'BOC' : 'TOD',
      distanceFromLegStartNm: first.startDistanceFromLegNm,
      altitudeFtMsl: first.startAltitudeFtMsl,
    });
    boundaries.push({
      key: `${prefix}:end`,
      fromWaypointId: leg.fromId,
      toWaypointId: leg.toId,
      phase,
      boundary: 'end',
      label: phase === 'climb' ? 'TOC' : 'BOD',
      distanceFromLegStartNm: last.endDistanceFromLegNm,
      altitudeFtMsl: last.endAltitudeFtMsl,
    });
    index = endIndex + 1;
  }

  return boundaries;
}

export function derivePerformancePhaseBoundaries(
  route: CalculatedPerformanceRoute | null,
): PerformancePhaseBoundary[] {
  return route?.status === 'ok'
    ? route.legs.flatMap(deriveLegBoundaries)
    : [];
}
