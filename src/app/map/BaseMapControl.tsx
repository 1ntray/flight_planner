import {
  AVINOR_ICAO_BASE_MAP_SOURCE,
  BASE_MAP_SOURCES,
} from './baseMapSource';
import type { BaseMapId } from './baseMapSource';
import type { BaseMapLoadStatus } from './ArcGisExportTileLayer';

export interface BaseMapControlProps {
  selectedId: BaseMapId;
  status: BaseMapLoadStatus;
  termsPromptOpen: boolean;
  onSelect: (id: BaseMapId) => void;
  onAcceptTerms: () => void;
  onCancelTerms: () => void;
}

function statusLabel(status: BaseMapLoadStatus): string {
  switch (status) {
    case 'loading':
      return 'Loading chart…';
    case 'ready':
      return `Effective ${AVINOR_ICAO_BASE_MAP_SOURCE.effectiveDate}`;
    case 'error':
      return 'Chart unavailable';
    default:
      return 'Optional chart';
  }
}

export function BaseMapControl({
  selectedId,
  status,
  termsPromptOpen,
  onSelect,
  onAcceptTerms,
  onCancelTerms,
}: BaseMapControlProps) {
  return (
    <fieldset className="base-map-control">
      <legend>Base map</legend>
      {BASE_MAP_SOURCES.map((source) => (
        <label key={source.id}>
          <input
            type="radio"
            name="base-map"
            checked={selectedId === source.id}
            onChange={() => onSelect(source.id)}
          />
          <span>{source.label}</span>
          {source.kind === 'arcgis-export-tiles' ? (
            <small role="status">{statusLabel(status)}</small>
          ) : null}
        </label>
      ))}

      {selectedId === 'avinor-icao' ? (
        <p className={status === 'error' ? 'base-map-control__error' : ''}>
          For planning assistance only. Consult current AIP and NOTAM; do not
          use this electronic chart as the sole navigation tool.{' '}
          <a
            href={AVINOR_ICAO_BASE_MAP_SOURCE.termsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Avinor source and terms
          </a>
        </p>
      ) : null}

      {termsPromptOpen ? (
        <div
          className="base-map-control__terms"
          role="alertdialog"
          aria-label="Avinor ICAO chart terms"
        >
          <strong>Before showing the Avinor chart</strong>
          <p>
            The public chart is for private use and is not a sole navigation
            tool. By continuing, you acknowledge Avinor's published terms.
          </p>
          <a
            href={AVINOR_ICAO_BASE_MAP_SOURCE.termsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Read source terms
          </a>
          <div>
            <button type="button" className="button" onClick={onCancelTerms}>
              Cancel
            </button>
            <button
              type="button"
              className="button button--active"
              onClick={onAcceptTerms}
            >
              I agree and show chart
            </button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
