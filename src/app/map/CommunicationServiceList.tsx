import { useEffect, useState } from 'react';
import type { AeronauticalDataRepository } from '../../aeronautical';
import type { CommunicationService } from '../../domain';

export interface CommunicationServiceListProps {
  repository: AeronauticalDataRepository;
  featureId: string;
}

export function CommunicationServiceList({ repository, featureId }: CommunicationServiceListProps) {
  const [services, setServices] = useState<readonly CommunicationService[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setServices(null);
    void repository
      .queryCommunicationServices({ featureIds: [featureId] }, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setServices(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServices([]);
      });
    return () => controller.abort();
  }, [featureId, repository]);

  if (services === null) return <p className="aerodrome-info-popup__status">Loading published frequencies…</p>;
  if (services.length === 0) return null;

  return (
    <section className="aerodrome-info-popup__runways" aria-label="Published communication services">
      <h4>Communications</h4>
      <table>
        <thead><tr><th>Service</th><th>Callsign</th><th>Frequency</th></tr></thead>
        <tbody>
          {services.flatMap((service) => service.frequencies.map((frequency, index) => (
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
