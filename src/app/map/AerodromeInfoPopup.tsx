import { useEffect, useState } from 'react';

import type { AeronauticalDataRepository } from '../../aeronautical';
import type {
  AerodromeDetails,
  AeronauticalPointFeature,
} from '../../domain';
import { StableMapPopup } from './StableMapPopup';
import { CommunicationServiceList } from './CommunicationServiceList';

type DetailStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'available'; readonly details: AerodromeDetails }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error' };

function formatPosition(
  position: AeronauticalPointFeature['position'],
): string {
  return `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
}

function formatMetres(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(0)} m`;
}

function formatBearing(value: number | null): string {
  return value === null ? '—' : `${Math.round(value).toString().padStart(3, '0')}°T`;
}

export interface AerodromeInfoPopupProps {
  feature: AeronauticalPointFeature;
  repository: AeronauticalDataRepository;
  onClose: () => void;
}

/**
 * Displays AIRAC-versioned aerodrome data only. A future live weather panel
 * can be composed here without making METAR/TAF part of the aeronautical
 * repository or persisted FlightPlan data.
 */
export function AerodromeInfoPopup({
  feature,
  repository,
  onClose,
}: AerodromeInfoPopupProps) {
  const [detailStatus, setDetailStatus] = useState<DetailStatus>({
    kind: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();
    setDetailStatus({ kind: 'loading' });

    void repository.getFeatureDetails(feature.ref, { signal: controller.signal })
      .then((details) => {
        if (controller.signal.aborted) return;
        setDetailStatus(
          details?.detailKind === 'aerodrome'
            ? { kind: 'available', details }
            : { kind: 'unavailable' },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        setDetailStatus({ kind: 'error' });
      });

    return () => controller.abort();
  }, [feature.ref, repository]);

  const details =
    detailStatus.kind === 'available' ? detailStatus.details : null;
  const displayName = details?.name ?? feature.name;
  const displayPosition = details?.arpPosition ?? feature.position;
  const dataSet = feature.ref.dataset;

  return (
    <StableMapPopup
      position={feature.position}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="aerodrome-info-popup"
    >
      <div className="aerodrome-info-popup__heading">
        <p className="eyebrow">Aerodrome</p>
        <h3>{feature.identifier}</h3>
        {displayName === undefined ? null : <p>{displayName}</p>}
      </div>

      <dl className="aerodrome-info-popup__facts">
        <div><dt>ARP</dt><dd>{formatPosition(displayPosition)}</dd></div>
        <div><dt>Elevation</dt><dd>{details?.elevationFt === null || details === null ? '—' : `${details.elevationFt.toFixed(0)} ft MSL`}</dd></div>
        <div><dt>Dataset</dt><dd>{dataSet.sourceName}{dataSet.airacCycle === null ? '' : ` · ${dataSet.airacCycle}`}</dd></div>
      </dl>

      {detailStatus.kind === 'loading' ? (
        <p className="aerodrome-info-popup__status">Loading published aerodrome details…</p>
      ) : detailStatus.kind === 'error' ? (
        <p className="aerodrome-info-popup__status">Aerodrome details could not be loaded.</p>
      ) : detailStatus.kind === 'unavailable' ? (
        <p className="aerodrome-info-popup__status">No detailed aerodrome record is available in the active dataset.</p>
      ) : detailStatus.details.runways.length === 0 ? (
        <p className="aerodrome-info-popup__status">No runway data is available in the active dataset.</p>
      ) : (
        <section className="aerodrome-info-popup__runways" aria-label="Published runways">
          <h4>Runways</h4>
          <table>
            <thead>
              <tr><th>RWY</th><th>TODA</th><th>LDA</th><th>Direction</th></tr>
            </thead>
            <tbody>
              {detailStatus.details.runways.flatMap((runway) =>
                runway.directions.length === 0
                  ? (
                    <tr key={runway.identifier}>
                      <th scope="row">{runway.identifier}</th>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  )
                  : runway.directions.map((direction) => (
                    <tr key={`${runway.identifier}:${direction.designator}`}>
                      <th scope="row">{direction.designator}</th>
                      <td>{formatMetres(direction.declaredDistances.todaM)}</td>
                      <td>{formatMetres(direction.declaredDistances.ldaM)}</td>
                      <td>{formatBearing(direction.trueBearingDeg)}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </section>
      )}

      <CommunicationServiceList repository={repository} featureId={feature.ref.featureId} />

      <div className="map-popup-actions map-popup-actions--two">
        <button type="button" className="button" onClick={onClose}>
          Close <kbd>Esc</kbd>
        </button>
      </div>
    </StableMapPopup>
  );
}
