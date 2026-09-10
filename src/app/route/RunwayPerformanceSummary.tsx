import {
  calculateRunwayWindComponents,
  calculateUtsaDensityAltitudeFt,
  calculateUtsaIsaDeviationC,
  calculateUtsaPressureAltitudeFt,
  calculateZ242HotBrakesLandingDistanceFrom50Ft,
  calculateZ242TakeoffDistanceTo50Ft,
  DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT,
  effectiveCrosswindLimitKt,
  getRccPerformanceRule,
  resolveRunwayDirection,
} from '../../calculations';
import { runwayOperationKey } from '../../domain';
import type { AerodromeDetails, RunwayOperationKind } from '../../domain';
import type { EffectiveAirportPlanningEnvironment } from '../../weather';
import {
  createRunwayPerformanceOperationInputDraft,
  runwayPerformanceOperationDraftKey,
} from '../navigation/operationalInput';
import type {
  OperationalInputDraft,
  RunwayPerformanceOperationInputDraft,
} from '../navigation/operationalInput';

interface OperationPanelProps {
  kind: RunwayOperationKind;
  sectorFromWaypointId: string;
  sectorToWaypointId: string;
  aerodromeWaypointId: string;
  aerodromeName: string;
  massKg: number;
  modelSupported: boolean;
  details?: AerodromeDetails;
  environment?: EffectiveAirportPlanningEnvironment;
  draft: OperationalInputDraft;
  onDraftChange: (draft: OperationalInputDraft) => void;
}

function formatWind(environment: EffectiveAirportPlanningEnvironment | undefined): string {
  const wind = environment?.wind;
  if (wind === undefined) return '—';
  if (wind.kind === 'calm') return 'CALM';
  if (wind.kind === 'variable') return `VRB/${Math.round(wind.speedKt)}${wind.gustKt === undefined ? '' : `G${Math.round(wind.gustKt)}`}`;
  return `${Math.round(wind.directionFromTrueDeg).toString().padStart(3, '0')}/${Math.round(wind.speedKt)}${wind.gustKt === undefined ? '' : `G${Math.round(wind.gustKt)}`}`;
}

function valueM(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)} m`;
}

function OperationPanel(props: OperationPanelProps) {
  const key = runwayOperationKey(props.kind, props.sectorFromWaypointId, props.sectorToWaypointId);
  const operation = props.draft.runwayPerformanceOperations.find(
    (candidate) => runwayPerformanceOperationDraftKey(candidate) === key,
  ) ?? createRunwayPerformanceOperationInputDraft(
    props.kind, props.sectorFromWaypointId, props.sectorToWaypointId, props.aerodromeWaypointId,
  );
  const update = (changes: Partial<RunwayPerformanceOperationInputDraft>) => {
    const updated = { ...operation, ...changes };
    props.onDraftChange({
      ...props.draft,
      runwayPerformanceOperations: props.draft.runwayPerformanceOperations.some((candidate) => runwayPerformanceOperationDraftKey(candidate) === key)
        ? props.draft.runwayPerformanceOperations.map((candidate) => runwayPerformanceOperationDraftKey(candidate) === key ? updated : candidate)
        : [...props.draft.runwayPerformanceOperations, updated],
    });
  };
  const resolved = operation.runwayDesignator === '' || props.details === undefined
    ? null
    : resolveRunwayDirection(props.details.runways, operation.runwayDesignator);
  const direction = resolved?.direction;
  const rcc = operation.rcc === '' ? undefined : Number(operation.rcc) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const rccRule = rcc === undefined ? undefined : getRccPerformanceRule(rcc);
  const elevation = props.details?.elevationFt;
  const oat = props.environment?.temperatureC;
  const pressureAltitude = elevation === null || elevation === undefined || props.environment === undefined
    ? undefined
    : calculateUtsaPressureAltitudeFt(elevation, props.environment.qnhHpa);
  const isaDeviation = oat === undefined ? undefined : calculateUtsaIsaDeviationC(oat);
  const densityAltitude = pressureAltitude === undefined || isaDeviation === undefined
    ? undefined : calculateUtsaDensityAltitudeFt(pressureAltitude, isaDeviation);
  const windComponents = direction?.trueBearingDeg === null || direction?.trueBearingDeg === undefined || props.environment?.wind === undefined
    ? undefined : calculateRunwayWindComponents(direction.trueBearingDeg, props.environment.wind);
  const components = windComponents?.status === 'available' ? windComponents.components : undefined;
  const personalLimit = props.draft.personalCrosswindLimitKt.trim() === ''
    ? DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT : Number(props.draft.personalCrosswindLimitKt);
  const effectiveLimit = rcc === undefined || !Number.isFinite(personalLimit)
    ? undefined : effectiveCrosswindLimitKt(personalLimit, props.draft.instructor, rcc);
  const baseCrosswind = components === undefined ? undefined : Math.abs(components.crosswindKt);
  const gustCrosswind = components?.gustCrosswindKt === undefined ? undefined : Math.abs(components.gustCrosswindKt);
  const availableDistance = props.kind === 'takeoff'
    ? direction?.declaredDistances.todaM : direction?.declaredDistances.ldaM;
  const afmInput = pressureAltitude === undefined || isaDeviation === undefined
    ? null : { pressureAltitudeFt: pressureAltitude, isaDeviationC: isaDeviation, massKg: props.massKg };
  const afm = !props.modelSupported || afmInput === null ? null : props.kind === 'takeoff'
    ? calculateZ242TakeoffDistanceTo50Ft(afmInput)
    : calculateZ242HotBrakesLandingDistanceFrom50Ft(afmInput);
  const blocking = [
    ...(props.details === undefined ? ['Aerodrome data unavailable'] : []),
    ...(operation.runwayDesignator === '' ? ['Runway not selected'] : []),
    ...(direction?.trueBearingDeg === null ? ['Published true bearing unavailable'] : []),
    ...(availableDistance === null ? [`Published ${props.kind === 'takeoff' ? 'TODA' : 'LDA'} unavailable`] : []),
    ...(rcc === undefined ? ['RCC not selected'] : []),
    ...(rcc === 0 ? ['RCC 0: operation unsupported'] : []),
    ...(resolved?.runway.widthM !== undefined && resolved.runway.widthM !== null && resolved.runway.widthM < 24 ? ['Runway width below 24 m: unsupported'] : []),
    ...(props.environment?.wind === undefined ? ['Surface wind unavailable'] : []),
    ...(windComponents?.status === 'unavailable' ? ['Variable wind: components unavailable'] : []),
    ...(oat === undefined ? ['OAT unavailable'] : []),
    ...(!props.modelSupported ? ['Selected aircraft has no approved Z242L/UTSA runway profile'] : []),
    ...(afm?.status === 'unavailable' ? ['Reviewed AFM graph digitization required'] : []),
  ];
  const crosswindText = baseCrosswind === undefined
    ? '—'
    : `${baseCrosswind.toFixed(1)} kt${gustCrosswind === undefined ? '' : ` / G${gustCrosswind.toFixed(1)} kt`}`;
  const crosswindWarning = effectiveLimit === undefined || effectiveLimit === null || baseCrosswind === undefined
    ? null
    : baseCrosswind > effectiveLimit || (gustCrosswind !== undefined && gustCrosswind > effectiveLimit)
      ? `Crosswind limit ${effectiveLimit} kt exceeded${gustCrosswind !== undefined && gustCrosswind > effectiveLimit ? ' by gust' : ''}.`
      : `Crosswind within ${effectiveLimit} kt limit.`;

  return (
    <div className="runway-performance__operation">
      <h5>{props.kind === 'takeoff' ? 'DEP.' : 'DEST.'} AERODROME · {props.aerodromeName}</h5>
      <div className="runway-performance__controls">
        <label>RWY<select value={operation.runwayDesignator} onChange={(event) => update({ runwayDesignator: event.currentTarget.value })}>
          <option value="">Select</option>
          {(props.details?.runways.flatMap((runway) => runway.directions) ?? []).map((candidate) => <option key={candidate.designator} value={candidate.designator}>{candidate.designator}</option>)}
        </select></label>
        <label>RCC<select value={operation.rcc} onChange={(event) => update({ rcc: event.currentTarget.value })}>
          <option value="">Select</option>{[6, 5, 4, 3, 2, 1, 0].map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>RWY stat<input value={operation.runwayCondition} placeholder={rccRule?.runwayCondition ?? ''} onChange={(event) => update({ runwayCondition: event.currentTarget.value })} /></label>
      </div>
      <table className="operational-summary__table runway-performance__table">
        <tbody>
          <tr><th>RWY</th><td>{direction?.designator ?? '—'}</td><th>Elevation</th><td>{elevation == null ? '—' : `${Math.round(elevation)} ft`}</td></tr>
          <tr><th>Flaps {props.kind === 'takeoff' ? 'TO' : 'LND'}</th><td></td><th>Mass</th><td>{props.massKg.toFixed(1)} kg</td></tr>
          <tr><th>W/V</th><td>{formatWind(props.environment)}</td><th>X-Wind</th><td>{crosswindText}</td></tr>
          <tr><th>QNH</th><td>{props.environment === undefined ? '—' : `${props.environment.qnhHpa.toFixed(0)} hPa`}</td><th>Press ALT.</th><td>{pressureAltitude === undefined ? '—' : `${Math.round(pressureAltitude)} ft`}</td></tr>
          <tr><th>Temp.</th><td>{oat === undefined ? '—' : `${oat.toFixed(1)}°C`}</td><th>Dens ALT.</th><td>{densityAltitude === undefined ? '—' : `${Math.round(densityAltitude)} ft`}</td></tr>
          <tr><th>Uncorrected {props.kind === 'takeoff' ? 'TOD' : 'LD'}</th><td>—</td><th>H-Wind</th><td>{components === undefined ? '—' : `${components.parallelKt.toFixed(1)} kt`}</td></tr>
          <tr><th>Brk action</th><td>{rccRule?.brakingAction ?? '—'}</td><th>Corr.</th><td>{props.kind === 'takeoff' ? '0%' : rccRule?.landingCorrectionFraction == null ? '—' : `${rccRule.landingCorrectionFraction * 100}%`}</td></tr>
          <tr><th>Corrected {props.kind === 'takeoff' ? 'TOD' : 'LD'}</th><td>—</td><th>Performance factor</th><td>{props.kind === 'takeoff' ? '25%' : '43%'}</td></tr>
          <tr><th>Req. {props.kind === 'takeoff' ? 'TOD' : 'LD'}</th><td>—</td><th>{props.kind === 'takeoff' ? 'TODA' : 'LDA'}</th><td>{valueM(availableDistance)}</td></tr>
        </tbody>
      </table>
      {crosswindWarning === null ? null : <p className={crosswindWarning.includes('exceeded') ? 'runway-performance__warning' : 'operational-summary__note'}>{crosswindWarning}</p>}
      <ul className="runway-performance__issues">{blocking.map((message) => <li key={message}>{message}</li>)}</ul>
    </div>
  );
}

export interface RunwayPerformanceSummaryProps {
  sectorFromWaypointId: string;
  sectorToWaypointId: string;
  fromName: string;
  toName: string;
  takeoffMassKg: number;
  landingMassKg: number;
  detailsByWaypointId: ReadonlyMap<string, AerodromeDetails>;
  environments: ReadonlyMap<string, EffectiveAirportPlanningEnvironment>;
  draft: OperationalInputDraft;
  onDraftChange: (draft: OperationalInputDraft) => void;
  modelSupported: boolean;
}

export function RunwayPerformanceSummary(props: RunwayPerformanceSummaryProps) {
  const takeoffKey = runwayOperationKey('takeoff', props.sectorFromWaypointId, props.sectorToWaypointId);
  const landingKey = runwayOperationKey('landing', props.sectorFromWaypointId, props.sectorToWaypointId);
  return (
    <div className="runway-performance">
      <div className="runway-performance__global-controls">
        <label>Personal X-wind <input type="number" min="0" step="1" placeholder={`${DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT}`} value={props.draft.personalCrosswindLimitKt} onChange={(event) => props.onDraftChange({ ...props.draft, personalCrosswindLimitKt: event.currentTarget.value })} /> kt</label>
        <label><input type="checkbox" checked={props.draft.instructor} onChange={(event) => props.onDraftChange({ ...props.draft, instructor: event.currentTarget.checked })} /> Instructor RCC limits</label>
      </div>
      <OperationPanel kind="takeoff" sectorFromWaypointId={props.sectorFromWaypointId} sectorToWaypointId={props.sectorToWaypointId} aerodromeWaypointId={props.sectorFromWaypointId} aerodromeName={props.fromName} massKg={props.takeoffMassKg} modelSupported={props.modelSupported} {...(props.detailsByWaypointId.get(props.sectorFromWaypointId) === undefined ? {} : { details: props.detailsByWaypointId.get(props.sectorFromWaypointId)! })} {...(props.environments.get(takeoffKey) === undefined ? {} : { environment: props.environments.get(takeoffKey)! })} draft={props.draft} onDraftChange={props.onDraftChange} />
      <OperationPanel kind="landing" sectorFromWaypointId={props.sectorFromWaypointId} sectorToWaypointId={props.sectorToWaypointId} aerodromeWaypointId={props.sectorToWaypointId} aerodromeName={props.toName} massKg={props.landingMassKg} modelSupported={props.modelSupported} {...(props.detailsByWaypointId.get(props.sectorToWaypointId) === undefined ? {} : { details: props.detailsByWaypointId.get(props.sectorToWaypointId)! })} {...(props.environments.get(landingKey) === undefined ? {} : { environment: props.environments.get(landingKey)! })} draft={props.draft} onDraftChange={props.onDraftChange} />
    </div>
  );
}
