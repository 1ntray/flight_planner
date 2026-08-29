import type {
  CalculatedFuelRequirementLine,
  CalculatedLoadingState,
  CalculatedSectorOperationalFlightPlan,
} from '../../calculations';
import type { AircraftDefinition, OperationalPlanningInputs } from '../../domain';

export interface OperationalSectorSummaryProps {
  sector: CalculatedSectorOperationalFlightPlan;
  aircraft: AircraftDefinition;
  inputs: OperationalPlanningInputs;
}

function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) {
    return '—';
  }
  const roundedMinutes = Math.round(totalMinutes);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = Math.abs(roundedMinutes % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;
}

function RequirementRow({
  label,
  line,
}: {
  label: string;
  line: CalculatedFuelRequirementLine;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{line.litres.toFixed(1)}</td>
      <td>{line.kilograms.toFixed(1)}</td>
      <td>{formatMinutes(line.timeMinutes)}</td>
    </tr>
  );
}

function LoadingTotals({
  label,
  loading,
}: {
  label: string;
  loading: CalculatedLoadingState;
}) {
  return (
    <tr className="operational-summary__total-row">
      <th scope="row">{label}</th>
      <td>—</td>
      <td>{loading.totalMassKg.toFixed(1)}</td>
      <td>{loading.totalMomentKgm.toFixed(1)}</td>
      <td>{loading.armM.toFixed(3)}</td>
    </tr>
  );
}

export function OperationalSectorSummary({
  sector,
  aircraft,
  inputs,
}: OperationalSectorSummaryProps) {
  const system = aircraft.fuelSystem!;
  const loading = aircraft.weightBalance!;
  const fuelMass = (litres: number) => litres * system.densityKgPerLitre;
  const minimumFlightTime =
    sector.minimumFlight.status === 'not-required'
      ? '0'
      : sector.minimumFlight.status === 'reachable'
        ? formatMinutes(sector.minimumFlight.timeMinutes)
        : '—';
  const minimumFlightFuel =
    sector.minimumFlight.status === 'not-required'
      ? '—'
      : sector.minimumFlight.requiredFuelRemainingLitres === null
        ? '—'
        : `${sector.minimumFlight.requiredFuelRemainingLitres.toFixed(1)} L`;
  const auxiliaryFuelUsedLitres =
    sector.takeoffLoading.fuel.auxiliaryLitres -
    sector.landingLoading.fuel.auxiliaryLitres;
  const mainFuelUsedLitres =
    sector.takeoffLoading.fuel.mainLitres -
    sector.landingLoading.fuel.mainLitres;
  const usedValue = (value: number) =>
    Math.abs(value) < 1e-9 ? '0.0' : `-${value.toFixed(1)}`;

  return (
    <section className="operational-summary" aria-label="OFP fuel and mass and balance">
      <div className="operational-summary__grid">
        <div>
          <h4>Remaining fuel plan</h4>
          <table className="operational-summary__table">
            <thead>
              <tr><th>Item</th><th>L</th><th>kg</th><th>HH:MM</th></tr>
            </thead>
            <tbody>
              <RequirementRow label="Trip incl. remaining taxi" line={sector.tripFuel} />
              <RequirementRow label="Alternate" line={sector.alternateFuel} />
              <RequirementRow label="Extra" line={sector.extraFuel} />
              <RequirementRow label="Final reserve" line={sector.finalReserve} />
              <RequirementRow label="Total required" line={sector.totalFuelRequired} />
              <tr>
                <th scope="row">Fuel onboard</th>
                <td>{sector.fuelOnboardBeforeDepartureLitres.toFixed(1)}</td>
                <td>{fuelMass(sector.fuelOnboardBeforeDepartureLitres).toFixed(1)}</td>
                <td>—</td>
              </tr>
              <tr className="operational-summary__total-row">
                <th scope="row">Endurance</th><td colSpan={2}>—</td>
                <td>{formatMinutes(sector.enduranceMinutes)}</td>
              </tr>
            </tbody>
          </table>
          <p className="operational-summary__note">
            {sector.groundAllowanceApplied
              ? 'This departure includes 7 L / 00:15 startup, taxi and takeoff allowance.'
              : 'Touch-and-go departure: no new ground allowance.'}
            {inputs.alternate === null
              ? ''
              : ` Alternate requirement: ${inputs.alternate.distanceNm.toFixed(1)} NM, ${formatMinutes(inputs.alternate.timeMinutes)}, ${inputs.alternate.fuelLitres.toFixed(1)} L.`}
          </p>
        </div>

        <div>
          <h4>Mass &amp; balance</h4>
          <table className="operational-summary__table">
            <thead>
              <tr><th>Station</th><th>L</th><th>kg</th><th>kgm</th><th>arm m</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">A/C {aircraft.registration ?? ''}</th><td>—</td><td>{loading.basicEmptyMassKg.toFixed(1)}</td><td>{loading.basicEmptyMomentKgm.toFixed(1)}</td><td>{(loading.basicEmptyMomentKgm / loading.basicEmptyMassKg).toFixed(3)}</td></tr>
              <tr><th scope="row">Left seat</th><td>—</td><td>{inputs.leftSeatMassKg.toFixed(1)}</td><td>{(inputs.leftSeatMassKg * loading.leftSeatArmM).toFixed(1)}</td><td>{loading.leftSeatArmM.toFixed(3)}</td></tr>
              <tr><th scope="row">Right seat</th><td>—</td><td>{inputs.rightSeatMassKg.toFixed(1)}</td><td>{(inputs.rightSeatMassKg * loading.rightSeatArmM).toFixed(1)}</td><td>{loading.rightSeatArmM.toFixed(3)}</td></tr>
              <tr><th scope="row">Fuel (Main)</th><td>{sector.takeoffLoading.fuel.mainLitres.toFixed(1)}</td><td>{fuelMass(sector.takeoffLoading.fuel.mainLitres).toFixed(1)}</td><td>{(fuelMass(sector.takeoffLoading.fuel.mainLitres) * system.main.armM).toFixed(1)}</td><td>{system.main.armM.toFixed(3)}</td></tr>
              <tr><th scope="row">Fuel (Auxiliary)</th><td>{sector.takeoffLoading.fuel.auxiliaryLitres.toFixed(1)}</td><td>{fuelMass(sector.takeoffLoading.fuel.auxiliaryLitres).toFixed(1)}</td><td>{(fuelMass(sector.takeoffLoading.fuel.auxiliaryLitres) * system.auxiliary.armM).toFixed(1)}</td><td>{system.auxiliary.armM.toFixed(3)}</td></tr>
              <tr><th scope="row">Baggage</th><td>—</td><td>{inputs.baggageMassKg.toFixed(1)}</td><td>{(inputs.baggageMassKg * loading.baggageArmM).toFixed(1)}</td><td>{loading.baggageArmM.toFixed(3)}</td></tr>
              <LoadingTotals label="Takeoff" loading={sector.takeoffLoading} />
              <tr className="operational-summary__fuel-used"><th scope="row">Enroute fuel used (Aux)</th><td>{usedValue(auxiliaryFuelUsedLitres)}</td><td>{usedValue(fuelMass(auxiliaryFuelUsedLitres))}</td><td>{usedValue(fuelMass(auxiliaryFuelUsedLitres) * system.auxiliary.armM)}</td><td>{system.auxiliary.armM.toFixed(3)}</td></tr>
              <tr className="operational-summary__fuel-used"><th scope="row">Enroute fuel used (Main)</th><td>{usedValue(mainFuelUsedLitres)}</td><td>{usedValue(fuelMass(mainFuelUsedLitres))}</td><td>{usedValue(fuelMass(mainFuelUsedLitres) * system.main.armM)}</td><td>{system.main.armM.toFixed(3)}</td></tr>
              <LoadingTotals label="Landing" loading={sector.landingLoading} />
            </tbody>
          </table>
          <dl className="operational-summary__minimum-flight">
            <div><dt>Minimum flight time</dt><dd>{minimumFlightTime}</dd></div>
            <div><dt>Required fuel at landing</dt><dd>{minimumFlightFuel}</dd></div>
          </dl>
        </div>
      </div>

      {sector.warnings.length === 0 ? null : (
        <ul className="operational-summary__warnings" aria-label="Operational warnings">
          {sector.warnings.map((warning) => (
            <li key={warning.code}>{warning.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
