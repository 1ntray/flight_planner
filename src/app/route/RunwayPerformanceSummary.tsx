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
  runwayDesignatorHeadingDeg,
} from '../../calculations';
import { runwayOperationKey } from '../../domain';
import type { AerodromeDetails, RunwayOperationKind } from '../../domain';
import type { EffectiveAirportPlanningEnvironment } from '../../weather';
import {
  runwayPerformanceOperationDraftKey,
} from '../navigation/operationalInput';
import { createRunwayPerformanceOperationInputDraft } from '../navigation/operationalInput';
import type { OperationalInputDraft } from '../navigation/operationalInput';

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
  const runwayHeadingDeg = direction === undefined ? null : runwayDesignatorHeadingDeg(direction.designator);
  const windComponents = runwayHeadingDeg === null || props.environment?.wind === undefined
    ? undefined : calculateRunwayWindComponents(runwayHeadingDeg, props.environment.wind);
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
    ...(direction !== undefined && runwayHeadingDeg === null ? ['Runway designator cannot be converted to a nominal heading'] : []),
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
    : `${baseCrosswind} kt${gustCrosswind === undefined ? '' : ` / G${gustCrosswind} kt`}`;
  const crosswindWarning = effectiveLimit === undefined || effectiveLimit === null || baseCrosswind === undefined
    ? null
    : baseCrosswind > effectiveLimit || (gustCrosswind !== undefined && gustCrosswind > effectiveLimit)
      ? `Crosswind limit ${effectiveLimit} kt exceeded${gustCrosswind !== undefined && gustCrosswind > effectiveLimit ? ' by gust' : ''}.`
      : `Crosswind within ${effectiveLimit} kt limit.`;
  const runwayState = operation.runwayCondition.trim() !== ''
    ? operation.runwayCondition
    : rccRule?.runwayCondition ?? '—';
  const operationLabel = props.kind === 'takeoff' ? 'DEP. AERODROME' : 'DEST. AERODROME';
  const uncorrectedLabel = props.kind === 'takeoff'
    ? 'Uncorrected take-off distance'
    : 'Uncorrected landing distance';
  const correctedLabel = props.kind === 'takeoff'
    ? 'Corrected take-off distance'
    : 'Corrected landing distance';
  const requiredLabel = props.kind === 'takeoff' ? 'Req. TOD' : 'Req. LD';
  const availableLabel = props.kind === 'takeoff' ? 'TODA' : 'LDA';

  return (
    <div
      className="runway-performance__operation"
      data-runway-performance-status={blocking.length === 0 ? 'ready' : 'blocked'}
    >
      <div className="runway-performance__title">
        <h5>{operationLabel}</h5>
        <span>{props.aerodromeName}</span>
      </div>
      <table className="operational-summary__table runway-performance__table runway-performance__airport-table">
        <colgroup>
          <col className="runway-performance__label-column" />
          <col className="runway-performance__value-column" />
          <col className="runway-performance__label-column" />
          <col className="runway-performance__value-column" />
          <col className="runway-performance__label-column" />
          <col className="runway-performance__value-column" />
        </colgroup>
        <tbody>
          <tr>
            <th scope="row">RWY</th><td>{direction?.designator ?? '—'}</td>
            <th scope="row">Elevation</th><td>{elevation == null ? '—' : `${Math.round(elevation)} ft`}</td>
            <th scope="row">Flaps</th><td>{props.kind === 'takeoff' ? 'TO' : 'LND'}</td>
          </tr>
          <tr>
            <th scope="row">W/V</th><td>{formatWind(props.environment)}</td>
            <th scope="row">X-Wind</th><td>{crosswindText}</td>
            <th scope="row">Press ALT.</th><td>{pressureAltitude === undefined ? '—' : `${Math.round(pressureAltitude)} ft`}</td>
          </tr>
          <tr>
            <th scope="row">QNH</th><td>{props.environment === undefined ? '—' : `${props.environment.qnhHpa.toFixed(0)} hPa`}</td>
            <th scope="row">Temp.</th><td>{oat === undefined ? '—' : `${oat.toFixed(1)}°C`}</td>
            <th scope="row">Dens ALT.</th><td>{densityAltitude === undefined ? '—' : `${Math.round(densityAltitude)} ft`}</td>
          </tr>
        </tbody>
      </table>
      <div className="runway-performance__worksheet-wrap">
        <table className="operational-summary__table runway-performance__table runway-performance__worksheet">
          <colgroup>
            <col className="runway-performance__label-column" />
            <col className="runway-performance__value-column" />
            <col className="runway-performance__label-column" />
            <col className="runway-performance__value-column" />
            <col className="runway-performance__label-column" />
            <col className="runway-performance__value-column" />
          </colgroup>
          <tbody>
            <tr><th scope="row" colSpan={5}>{uncorrectedLabel}</th><td>—</td></tr>
            <tr><th scope="row">H-Wind</th><td colSpan={5}>{components === undefined ? '—' : `${components.parallelKt} kt`}</td></tr>
            <tr>
              <th scope="row">RWY stat</th><td>{runwayState}</td>
              <th scope="row">Brk action</th><td>{rcc ?? '—'}</td>
              <th scope="row">Corr.</th><td>{props.kind === 'takeoff' ? '0%' : rccRule?.landingCorrectionFraction == null ? '—' : `${rccRule.landingCorrectionFraction * 100}%`}</td>
            </tr>
            {[0, 1, 2, 3].map((row) => <tr key={row} className="runway-performance__worksheet-row" aria-hidden="true"><td colSpan={6}></td></tr>)}
            <tr><th scope="row" colSpan={5}>{correctedLabel}</th><td>—</td></tr>
            <tr>
              <th scope="row" colSpan={2}>Performance factor</th><td>{props.kind === 'takeoff' ? '25%' : '43%'}</td>
              <th scope="row" colSpan={2} className="runway-performance__dark-cell">{requiredLabel}</th><td>—</td>
            </tr>
            <tr>
              <td colSpan={4}></td>
              <th scope="row" className="runway-performance__dark-cell">{availableLabel}</th><td>{valueM(availableDistance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {crosswindWarning === null ? null : <p className={crosswindWarning.includes('exceeded') ? 'runway-performance__warning' : 'operational-summary__note'}>{crosswindWarning}</p>}
      <ul className="sr-only" aria-label="Runway performance availability issues">
        {blocking.map((message) => <li key={message}>{message}</li>)}
      </ul>
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
  modelSupported: boolean;
}

export function RunwayPerformanceSummary(props: RunwayPerformanceSummaryProps) {
  const takeoffKey = runwayOperationKey('takeoff', props.sectorFromWaypointId, props.sectorToWaypointId);
  const landingKey = runwayOperationKey('landing', props.sectorFromWaypointId, props.sectorToWaypointId);
  return (
    <div className="runway-performance">
      <OperationPanel kind="takeoff" sectorFromWaypointId={props.sectorFromWaypointId} sectorToWaypointId={props.sectorToWaypointId} aerodromeWaypointId={props.sectorFromWaypointId} aerodromeName={props.fromName} massKg={props.takeoffMassKg} modelSupported={props.modelSupported} {...(props.detailsByWaypointId.get(props.sectorFromWaypointId) === undefined ? {} : { details: props.detailsByWaypointId.get(props.sectorFromWaypointId)! })} {...(props.environments.get(takeoffKey) === undefined ? {} : { environment: props.environments.get(takeoffKey)! })} draft={props.draft} />
      <OperationPanel kind="landing" sectorFromWaypointId={props.sectorFromWaypointId} sectorToWaypointId={props.sectorToWaypointId} aerodromeWaypointId={props.sectorToWaypointId} aerodromeName={props.toName} massKg={props.landingMassKg} modelSupported={props.modelSupported} {...(props.detailsByWaypointId.get(props.sectorToWaypointId) === undefined ? {} : { details: props.detailsByWaypointId.get(props.sectorToWaypointId)! })} {...(props.environments.get(landingKey) === undefined ? {} : { environment: props.environments.get(landingKey)! })} draft={props.draft} />
    </div>
  );
}
