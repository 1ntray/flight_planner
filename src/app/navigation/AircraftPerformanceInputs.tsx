import type { AircraftPerformanceProfile } from '../../domain';
import type { PerformanceInputDraft } from './performanceInput';

export interface AircraftPerformanceInputsProps {
  draft: PerformanceInputDraft;
  profile: AircraftPerformanceProfile;
  errorMessage?: string;
  onChange: (draft: PerformanceInputDraft) => void;
}

interface NumericFieldProps {
  label: string;
  field: Exclude<keyof PerformanceInputDraft, 'legAltitudePlans'>;
  unit: string;
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
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Destination elevation"
        field="destinationElevationFtMsl"
        unit="ft MSL"
        min="0"
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
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Departure ISA deviation"
        field="departureIsaDeviationC"
        unit="°C"
        step="0.1"
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
        draft={draft}
        invalid={invalid}
        onChange={onChange}
      />
      <NumericField
        label="Destination ISA deviation"
        field="destinationIsaDeviationC"
        unit="°C"
        step="0.1"
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
