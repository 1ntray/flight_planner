import { useState } from 'react';

import type { Waypoint } from '../../domain';
import { RouteTable } from '../route/RouteTable';
import {
  DEFAULT_NAVIGATION_INPUT_DRAFT,
  parseNavigationInputDraft,
} from './navigationInput';
import type { NavigationInputDraft } from './navigationInput';

export interface NavigationLogProps {
  waypoints: readonly Waypoint[];
}

export function NavigationLog({ waypoints }: NavigationLogProps) {
  const [draft, setDraft] = useState<NavigationInputDraft>(
    DEFAULT_NAVIGATION_INPUT_DRAFT,
  );
  const parsedInputs = parseNavigationInputDraft(draft);

  const updateDraft = (field: keyof NavigationInputDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <>
      <fieldset className="navigation-inputs">
        <legend>Leg planning inputs</legend>
        <p className="navigation-inputs__scope">Constant for all route legs</p>

        <label>
          <span>TAS</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              min="0.1"
              step="1"
              value={draft.trueAirspeedKt}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft('trueAirspeedKt', event.currentTarget.value)
              }
            />
            <span>kt</span>
          </span>
        </label>

        <label>
          <span>Wind from</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              step="1"
              value={draft.windDirectionFromTrueDeg}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft(
                  'windDirectionFromTrueDeg',
                  event.currentTarget.value,
                )
              }
            />
            <span>°T</span>
          </span>
        </label>

        <label>
          <span>Wind speed</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              min="0"
              step="1"
              value={draft.windSpeedKt}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft('windSpeedKt', event.currentTarget.value)
              }
            />
            <span>kt</span>
          </span>
        </label>

        {parsedInputs.status === 'invalid' ? (
          <p className="navigation-inputs__error" role="alert">
            {parsedInputs.message}
          </p>
        ) : null}
      </fieldset>

      <RouteTable
        waypoints={waypoints}
        navigationParameters={
          parsedInputs.status === 'valid' ? parsedInputs.value : null
        }
      />
    </>
  );
}
