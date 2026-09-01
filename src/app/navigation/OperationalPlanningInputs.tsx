import { useState } from 'react';

import type { AircraftDefinition } from '../../domain';
import type { OperationalInputDraft } from './operationalInput';

export interface OperationalPlanningInputsProps {
  aircraft: AircraftDefinition;
  draft: OperationalInputDraft;
  errorMessage?: string;
  calculatedTakeoffMassKg?: number;
  onChooseAlternateByIcao: (icaoIdentifier: string) => Promise<string | null>;
  onChange: (draft: OperationalInputDraft) => void;
}

type ScalarField = Exclude<
  keyof OperationalInputDraft,
  | 'sectorOperations'
  | 'patternPlans'
  | 'alternateEnabled'
  | 'alternateWaypoint'
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
  onChooseAlternateByIcao,
  onChange,
}: OperationalPlanningInputsProps) {
  const [alternateIcaoDraft, setAlternateIcaoDraft] = useState('');
  const [alternateLookupError, setAlternateLookupError] = useState<string | null>(null);
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
        field="finalReserveLitres"
        unit="L"
        min="0"
        step="0.1"
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
        <span>Include an alternate from the final destination</span>
      </label>

      {draft.alternateEnabled ? (
        <div className="operational-planning-inputs__alternate">
          <p className="navigation-inputs__scope">
            {draft.alternateWaypoint === null
              ? 'Enter an alternate ICAO code, then enter your own alternate requirements.'
              : `Alternate: ${draft.alternateWaypoint.name}`}
          </p>
          <label>
            <span>Alternate ICAO</span>
            <span className="navigation-inputs__control">
              <input
                type="text"
                value={alternateIcaoDraft}
                placeholder={draft.alternateWaypoint?.anchor?.publishedIdentifier ?? 'e.g. ENTC'}
                autoCapitalize="characters"
                onChange={(event) => {
                  setAlternateIcaoDraft(event.currentTarget.value.toUpperCase());
                  setAlternateLookupError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void onChooseAlternateByIcao(alternateIcaoDraft).then(
                    setAlternateLookupError,
                  );
                }}
              />
              <button
                type="button"
                className="button"
                onClick={() => {
                  void onChooseAlternateByIcao(alternateIcaoDraft).then(
                    setAlternateLookupError,
                  );
                }}
              >
                Set alternate
              </button>
            </span>
          </label>
          {alternateLookupError === null ? null : (
            <p className="navigation-inputs__error" role="alert">
              {alternateLookupError}
            </p>
          )}
          <NumericField label="Alternate planned altitude" field="alternatePlannedAltitudeFtMsl" unit="ft MSL" min="0" step="100" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="Alternate distance" field="alternateDistanceNm" unit="NM" min="0" step="0.1" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="Alternate time" field="alternateTimeMinutes" unit="min" min="0" step="1" draft={draft} invalid={invalid} onChange={onChange} />
          <NumericField label="Alternate fuel" field="alternateFuelLitres" unit="L" min="0" step="0.1" draft={draft} invalid={invalid} onChange={onChange} />
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
