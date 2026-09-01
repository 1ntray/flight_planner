import { useEffect, useState } from 'react';
import type { AeronauticalDataRepository } from '../../aeronautical';
import { polygonsContainPosition } from '../../calculations';
import type { CommunicationService, Position } from '../../domain';
import { isDisplayedCommunicationFrequency } from './communicationFrequencyDisplay';

export interface CommunicationServiceListProps {
  repository: AeronauticalDataRepository;
  featureId?: string;
  serviceAreaPosition?: Position;
}

export function CommunicationServiceList({
  repository,
  featureId,
  serviceAreaPosition,
}: CommunicationServiceListProps) {
  const [services, setServices] = useState<readonly CommunicationService[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setServices(null);
    const request = serviceAreaPosition === undefined
      ? repository.queryCommunicationServices(
          { featureIds: featureId === undefined ? [] : [featureId] },
          { signal: controller.signal },
        )
      : repository.queryAtsServiceAreas({
          bounds: {
            south: serviceAreaPosition.latitude,
            west: serviceAreaPosition.longitude,
            north: serviceAreaPosition.latitude,
            east: serviceAreaPosition.longitude,
          },
        }, { signal: controller.signal }).then(async (areas) => {
          const serviceIds = [...new Set(areas
            .filter((area) =>
              area.geometryStatus === 'resolved' &&
              polygonsContainPosition(area.polygons, serviceAreaPosition),
            )
            .map(({ communicationServiceId }) => communicationServiceId))];
          return (await Promise.all(serviceIds.map((id) =>
            repository.getCommunicationService(id, { signal: controller.signal }),
          ))).flatMap((service) => service === null ? [] : [service]);
        });
    void request
      .then((result) => {
        if (!controller.signal.aborted) setServices(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServices([]);
      });
    return () => controller.abort();
  }, [featureId, repository, serviceAreaPosition]);

  if (services === null) return <p className="aerodrome-info-popup__status">Loading published frequencies…</p>;
  const displayedServices = services.flatMap((service) => {
    const frequencies = service.frequencies.filter(
      isDisplayedCommunicationFrequency,
    );
    return frequencies.length === 0 ? [] : [{ ...service, frequencies }];
  });
  if (displayedServices.length === 0) return null;

  return (
    <section className="aerodrome-info-popup__runways" aria-label="Published communication services">
      <h4>Communications</h4>
      <table>
        <thead><tr><th>Service</th><th>Callsign</th><th>Frequency</th></tr></thead>
        <tbody>
          {displayedServices.flatMap((service) => service.frequencies.map((frequency, index) => (
            <tr key={`${service.id}:${frequency.valueMHz}:${index}`}>
              <th scope="row">{service.publishedServiceType}</th>
              <td>{service.callsign ?? '—'}</td>
              <td>{frequency.valueMHz} MHz</td>
            </tr>
          )))}
        </tbody>
      </table>
    </section>
  );
}
