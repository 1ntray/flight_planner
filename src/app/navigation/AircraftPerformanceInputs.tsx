import type { AircraftPerformanceProfile } from '../../domain';
import type {
  PerformanceInputDefaults,
  PerformanceInputDraft,
} from './performanceInput';
import {
  DEFAULT_PLANNING_ISA_DEVIATION_C,
  DEFAULT_PLANNING_QNH_HPA,
} from './performanceInput';

export interface AircraftPerformanceInputsProps {
  draft: PerformanceInputDraft;
  profile: AircraftPerformanceProfile;
  errorMessage?: string;
  derivedMassKg?: number;
  defaults: PerformanceInputDefaults;
  onChange: (draft: PerformanceInputDraft) => void;
}

interface NumericFieldProps {
  label: string;
  field: Exclude<
    keyof PerformanceInputDraft,
    'legAltitudePlans' | 'sectorStopPlans'
  >;
  unit: string;
  placeholder?: string | undefined;
  min?: string;
  step?: string;
  draft: PerformanceInputDraft;
  invalid: boolean;
  onChange: (draft: PerformanceInputDraft) => void;
}

function NumericField({
  label,
  field,
  unit,
  placeholder,
  min,
  step = '1',
  draft,
  invalid,
  onChange,
}: NumericFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <span className="navigation-inputs__control">
        <input
          type="number"
          min={min}
          step={step}
          value={draft[field]}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(event) =>
            onChange({ ...draft, [field]: event.currentTarget.value })
          }
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

export function AircraftPerformanceInputs({
  draft,
  profile,
  errorMessage,
  derivedMassKg,
  defaults,
  onChange,
}: AircraftPerformanceInputsProps) {
  const invalid = errorMessage !== undefined;

  return (
    <fieldset className="navigation-inputs aircraft-performance-inputs">
      <legend>Aircraft performance</legend>
      <p className="navigation-inputs__scope">
        IAS {profile.climb.iasKt}/{profile.cruise.iasKt}/
        {profile.descent.iasKt} kt · fuel flow {profile.climb.fuelFlowLph}/
        {profile.cruise.fuelFlowLph}/{profile.descent.fuelFlowLph} L/h ·
        descent {profile.descent.rateFtPerMin} ft/min. Complete these
        flight-specific inputs to calculate phases and fuel.
      </p>

      {derivedMassKg === undefined ? (
        <NumericField
          label="Aircraft mass"
          field="massKg"
          unit="kg"
          min="0.1"
          step="1"
          draft={draft}
          invalid={invalid}
          onChange={onChange}
        />
      ) : (
        <p className="navigation-inputs__derived-value">
          Aircraft mass <strong>{derivedMassKg.toFixed(1)} kg</strong>
          <span>Derived from loading and takeoff fuel.</span>
        </p>
      )}
      <NumericField
        label="Default leg altitude"
        field="defaultAltitudeFtMsl"
        unit="ft MSL"
        min="0"
        step="100"
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Departure elevation"
        field="departureElevationFtMsl"
        unit="ft MSL"
        min="0"
        placeholder={
          defaults.departureElevationFtMsl === undefined
            ? undefined
            : `${defaults.departureElevationFtMsl} (aerodrome)`
        }
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Destination elevation"
        field="destinationElevationFtMsl"
        unit="ft MSL"
        min="0"
        placeholder={
          defaults.destinationElevationFtMsl === undefined
            ? undefined
            : `${defaults.destinationElevationFtMsl} (aerodrome)`
        }
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Pattern height"
        field="patternHeightAglFt"
        unit="ft AGL"
        min="0"
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <span aria-hidden="true" />
      <NumericField
        label="Departure QNH"
        field="departureQnhHpa"
        unit="hPa"
        min="0.1"
        step="0.1"
        placeholder={`${DEFAULT_PLANNING_QNH_HPA} (standard)`}
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Departure ISA deviation"
        field="departureIsaDeviationC"
        unit="°C"
        step="0.1"
        placeholder={`${DEFAULT_PLANNING_ISA_DEVIATION_C} (standard)`}
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Destination QNH"
        field="destinationQnhHpa"
        unit="hPa"
        min="0.1"
        step="0.1"
        placeholder={`${DEFAULT_PLANNING_QNH_HPA} (standard)`}
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Destination ISA deviation"
        field="destinationIsaDeviationC"
        unit="°C"
        step="0.1"
        placeholder={`${DEFAULT_PLANNING_ISA_DEVIATION_C} (standard)`}
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />

      {errorMessage === undefined ? null : (
        <p className="navigation-inputs__error" role="alert">
          {errorMessage}
        </p>
      )}
    </fieldset>
  );
}
