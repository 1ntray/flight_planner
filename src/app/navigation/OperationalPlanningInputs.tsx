import type { AircraftDefinition } from '../../domain';
import type { OperationalInputDraft } from './operationalInput';

export interface OperationalPlanningInputsProps {
  aircraft: AircraftDefinition;
  draft: OperationalInputDraft;
  errorMessage?: string;
  calculatedTakeoffMassKg?: number;
  onChange: (draft: OperationalInputDraft) => void;
}

type ScalarField = Exclude<
  keyof OperationalInputDraft,
  | 'sectorOperations'
  | 'alternateEnabled'
  | 'alternateWaypointId'
>;

interface NumericFieldProps {
  label: string;
  field: ScalarField;
  unit: string;
  draft: OperationalInputDraft;
  invalid: boolean;
  min?: string;
  max?: string;
  step?: string;
  onChange: (draft: OperationalInputDraft) => void;
}

function NumericField({
  label,
  field,
  unit,
  draft,
  invalid,
  min,
  max,
  step = '1',
  onChange,
}: NumericFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <span className="navigation-inputs__control">
        <input
          type="number"
          value={draft[field]}
          aria-invalid={invalid}
          {...(min === undefined ? {} : { min })}
          {...(max === undefined ? {} : { max })}
          step={step}
          onChange={(event) =>
            onChange({ ...draft, [field]: event.currentTarget.value })
          }
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

export function OperationalPlanningInputs({
  aircraft,
  draft,
  errorMessage,
  calculatedTakeoffMassKg,
  onChange,
}: OperationalPlanningInputsProps) {
  const fuelSystem = aircraft.fuelSystem;
  const loading = aircraft.weightBalance;
  const invalid = errorMessage !== undefined;
  const capacity = fuelSystem === undefined
    ? undefined
    : fuelSystem.main.usableCapacityLitres +
      fuelSystem.auxiliary.usableCapacityLitres;
  const enteredFuel = Number(draft.fuelOnboardLitres);
  const fuelAllocation =
    fuelSystem !== undefined &&
    draft.fuelOnboardLitres.trim() !== '' &&
    Number.isFinite(enteredFuel) &&
    enteredFuel >= 0 &&
    enteredFuel <= (capacity ?? 0)
      ? {
          main: Math.min(enteredFuel, fuelSystem.main.usableCapacityLitres),
          auxiliary: Math.max(
            0,
            enteredFuel - fuelSystem.main.usableCapacityLitres,
          ),
        }
      : null;

  return (
    <fieldset className="navigation-inputs operational-planning-inputs">
      <legend>Fuel and mass &amp; balance</legend>
      <p className="navigation-inputs__scope">
        {fuelSystem === undefined || loading === undefined
          ? 'The selected aircraft has no operational loading definition.'
          : `Usable fuel ${capacity} L (${fuelSystem.main.usableCapacityLitres} main + ${fuelSystem.auxiliary.usableCapacityLitres} auxiliary), ${fuelSystem.densityKgPerLitre} kg/L. Auxiliary fuel is consumed first.`}
      </p>

      <NumericField
        label="Fuel onboard"
        field="fuelOnboardLitres"
        unit="L"
        min="0"
        {...(capacity === undefined ? {} : { max: String(capacity) })}
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Left seat"
        field="leftSeatMassKg"
        unit="kg"
        min="0"
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Right seat"
        field="rightSeatMassKg"
        unit="kg"
        min="0"
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Baggage"
        field="baggageMassKg"
        unit="kg"
        min="0"
        {...(loading === undefined
          ? {}
          : { max: String(loading.maximumBaggageMassKg) })}
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Extra fuel"
        field="extraFuelLitres"
        unit="L"
        min="0"
        step="0.1"
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Final reserve"
        field="finalReserveMinutes"
        unit="min"
        min="0"
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />

      {fuelAllocation === null ? null : (
        <p className="navigation-inputs__scope operational-planning-inputs__result">
          Tank allocation: {fuelAllocation.main.toFixed(1)} L main ·{' '}
          {fuelAllocation.auxiliary.toFixed(1)} L auxiliary
          {calculatedTakeoffMassKg === undefined
            ? ''
            : ` · takeoff mass ${calculatedTakeoffMassKg.toFixed(1)} kg`}
        </p>
      )}

      <label className="navigation-inputs__forecast-toggle">
        <input
          type="checkbox"
          checked={draft.alternateEnabled}
          onChange={(event) =>
            onChange({ ...draft, alternateEnabled: event.currentTarget.checked })
          }
        />
        <span>Plan an alternate from the final destination</span>
      </label>

      {draft.alternateEnabled ? (
        <div className="operational-planning-inputs__alternate">
          <label>
            <span>Alternate</span>
            <input
              type="text"
              value={draft.alternateName}
              aria-invalid={invalid}
              placeholder="ICAO or name"
              onChange={(event) =>
                onChange({ ...draft, alternateName: event.currentTarget.value })
              }
            />
          </label>
          <NumericField label="Latitude" field="alternateLatitude" unit="°" min="-90" max="90" step="0.000001" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="Longitude" field="alternateLongitude" unit="°" min="-180" max="180" step="0.000001" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="Elevation" field="alternateElevationFtMsl" unit="ft MSL" min="0" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="QNH" field="alternateQnhHpa" unit="hPa" min="0.1" step="0.1" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="ISA deviation" field="alternateIsaDeviationC" unit="°C" step="0.1" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="Planned altitude" field="alternateAltitudeFtMsl" unit="ft MSL" min="0" step="100" draft={draft} invalid={invalid} onChange={onChange} />
        </div>
      ) : null}

      {errorMessage === undefined ? null : (
        <p className="navigation-inputs__error" role="alert">
          {errorMessage}
        </p>
      )}
    </fieldset>
  );
}
