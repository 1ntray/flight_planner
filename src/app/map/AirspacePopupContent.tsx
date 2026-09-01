import { useEffect, useState } from 'react';
import type { AeronauticalDataRepository } from '../../aeronautical';
import type { AeronauticalAreaFeature, AirspaceDetails, Position, VerticalLimit } from '../../domain';
import { CommunicationServiceList } from './CommunicationServiceList';

function formatLimit(limit: VerticalLimit | null): string {
  return limit?.publishedText ?? '—';
}

export interface AirspacePopupContentProps {
  feature: AeronauticalAreaFeature;
  repository: AeronauticalDataRepository;
  position: Position;
}

export function AirspacePopupContent({ feature, repository, position }: AirspacePopupContentProps) {
  const [details, setDetails] = useState<AirspaceDetails | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    setDetails(undefined);
    void repository.getFeatureDetails(feature.ref, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDetails(result?.detailKind === 'airspace' ? result : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetails(null);
      });
    return () => controller.abort();
  }, [feature.ref, repository]);

  return (
    <div className="airspace-info-popup">
      <strong>{feature.name}</strong><br />
      {details === undefined ? 'Loading published airspace details…' : details === null ? (
        <>{feature.identifier ?? feature.areaKind}<br />Information only — not a waypoint anchor</>
      ) : (
        <>
          {details.publishedType}{details.airspaceClass === null ? '' : ` · Class ${details.airspaceClass}`}<br />
          {formatLimit(details.lowerLimit)} – {formatLimit(details.upperLimit)}<br />
          Information only — not a waypoint anchor
          <CommunicationServiceList
            repository={repository}
            {...(feature.areaKind === 'cta'
              ? { serviceAreaPosition: position }
              : { featureId: feature.ref.featureId })}
          />
        </>
      )}
    </div>
  );
}
