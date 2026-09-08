import { useEffect, useMemo, useState } from 'react';

import type { AeronauticalDataRepository } from '../../aeronautical';
import {
  eligibleVfrPlanningFrequencies,
} from '../../calculations';
import type { CommunicationPreferences } from '../../calculations';
import type { CommunicationService } from '../../domain';

export interface FrequencyPreferencesPanelProps {
  repository: AeronauticalDataRepository;
  preferences: CommunicationPreferences;
  onChange: (preferences: CommunicationPreferences) => void;
}

function serviceLabel(service: CommunicationService): string {
  return service.callsign ?? service.publishedServiceType;
}

function optionLabel(
  frequency: CommunicationService['frequencies'][number],
): string {
  return `${frequency.valueMHz} MHz${
    frequency.remarks === undefined ? '' : ` — ${frequency.remarks}`
  }`;
}

export function FrequencyPreferencesPanel({
  repository,
  preferences,
  onChange,
}: FrequencyPreferencesPanelProps) {
  const [services, setServices] = useState<readonly CommunicationService[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadFailed(false);
    void repository.listPlanningCommunicationServices({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setServices(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServices([]);
          setLoadFailed(true);
        }
      });
    return () => controller.abort();
  }, [repository]);

  const selectableServices = useMemo(() => (services ?? [])
    .filter((service) => {
      const frequencies = eligibleVfrPlanningFrequencies(service);
      return new Set(frequencies.map(({ valueMHz }) => valueMHz)).size > 1 ||
        preferences.preferredFrequencyByServiceId[service.id] !== undefined;
    })
    .sort((left, right) => serviceLabel(left).localeCompare(serviceLabel(right))),
  [preferences.preferredFrequencyByServiceId, services]);

  const knownServiceIds = new Set((services ?? []).map(({ id }) => id));
  const unavailablePreferences = services === null ? [] : Object.entries(
    preferences.preferredFrequencyByServiceId,
  ).filter(([serviceId, frequency]) => {
    const service = services?.find(({ id }) => id === serviceId);
    return service === undefined || !eligibleVfrPlanningFrequencies(service)
      .some(({ valueMHz }) => valueMHz === frequency);
  });

  const update = (serviceId: string, value: string) => {
    const next = { ...preferences.preferredFrequencyByServiceId };
    if (value === '') delete next[serviceId];
    else next[serviceId] = value;
    onChange({ preferredFrequencyByServiceId: next });
  };

  return (
    <section className="frequency-preferences" aria-labelledby="frequency-preferences-heading">
      <h3 id="frequency-preferences-heading">Frequency preferences</h3>
      <p>
        Choose the normal frequency you prefer for services with multiple
        eligible VHF assignments. Choices are remembered in this browser and
        are not saved in the flight plan.
      </p>
      {services === null ? <p role="status">Loading published services…</p> : null}
      {loadFailed ? <p role="alert">Published services could not be loaded.</p> : null}
      {unavailablePreferences.length === 0 ? null : (
        <div className="frequency-preferences__warning" role="alert">
          <p>
            {unavailablePreferences.length} saved preference(s) are unavailable
            in the active AIRAC and are not being applied.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => onChange({
              preferredFrequencyByServiceId: Object.fromEntries(
                Object.entries(preferences.preferredFrequencyByServiceId)
                  .filter(([serviceId]) => knownServiceIds.has(serviceId))
                  .filter(([serviceId, frequency]) => {
                    const service = services?.find(({ id }) => id === serviceId);
                    return service !== undefined && eligibleVfrPlanningFrequencies(service)
                      .some(({ valueMHz }) => valueMHz === frequency);
                  }),
              ),
            })}
          >
            Remove unavailable
          </button>
        </div>
      )}
      <div className="frequency-preferences__list">
        {selectableServices.map((service) => {
          const frequencies = eligibleVfrPlanningFrequencies(service);
          const saved = preferences.preferredFrequencyByServiceId[service.id] ?? '';
          const validSaved = frequencies.some(({ valueMHz }) => valueMHz === saved)
            ? saved
            : '';
          return (
            <label key={service.id} className="frequency-preferences__item">
              <span>
                <strong>{serviceLabel(service)}</strong>
                <small>{service.publishedServiceType}</small>
              </span>
              <select
                aria-label={`${serviceLabel(service)} preferred frequency`}
                value={validSaved}
                onChange={(event) => update(service.id, event.target.value)}
              >
                <option value="">Automatic</option>
                {frequencies.map((frequency) => (
                  <option key={frequency.valueMHz} value={frequency.valueMHz}>
                    {optionLabel(frequency)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {services !== null && selectableServices.length === 0 ? (
        <p>No multi-frequency services are available.</p>
      ) : null}
      {Object.keys(preferences.preferredFrequencyByServiceId).length === 0 ? null : (
        <button
          type="button"
          className="button"
          onClick={() => onChange({ preferredFrequencyByServiceId: {} })}
        >
          Reset all to automatic
        </button>
      )}
    </section>
  );
}
