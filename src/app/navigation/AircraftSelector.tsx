import { AIRCRAFT_CATALOG } from '../../domain';
import type { AircraftDefinition } from '../../domain';

export interface AircraftSelectorProps {
  aircraftDefinition: AircraftDefinition;
  onChange: (aircraft: AircraftDefinition) => void;
}

function selectionKey(aircraft: AircraftDefinition): string {
  return `${aircraft.aircraftId}@${aircraft.revision}`;
}

export function AircraftSelector({
  aircraftDefinition,
  onChange,
}: AircraftSelectorProps) {
  const currentKey = selectionKey(aircraftDefinition);
  const aircraftOptions = AIRCRAFT_CATALOG.some(
    (candidate) => selectionKey(candidate) === currentKey,
  )
    ? AIRCRAFT_CATALOG
    : [aircraftDefinition, ...AIRCRAFT_CATALOG];

  return (
    <fieldset className="navigation-inputs aircraft-selector">
      <legend>Aircraft</legend>
      <label>
        <span>Performance model</span>
        <select
          value={currentKey}
          onChange={(event) => {
            const selected = aircraftOptions.find(
              (candidate) => selectionKey(candidate) === event.currentTarget.value,
            );

            if (selected !== undefined) {
              onChange(selected);
            }
          }}
        >
          {aircraftOptions.map((aircraft) => (
            <option key={selectionKey(aircraft)} value={selectionKey(aircraft)}>
              {aircraft.displayName}
              {aircraft.registration === undefined
                ? ''
                : ` (${aircraft.registration})`}
            </option>
          ))}
        </select>
      </label>
      <p className="navigation-inputs__scope">
        Revision {aircraftDefinition.revision}. The complete definition is
        saved with the plan so later catalog changes cannot silently alter it.
      </p>
    </fieldset>
  );
}
