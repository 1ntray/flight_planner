import { useMemo } from 'react';
import { Pane, Polygon } from 'react-leaflet';

import { buildMsaCorridorGeometry } from '../../calculations';
import type { Position } from '../../domain';

export interface MsaCorridorProps {
  /** Actual WGS84 leg geometry, including route-shaping points. */
  geometry: readonly Position[];
}

/** Visual aid for manually assessing the required one-NM MSA corridor. */
export function MsaCorridor({ geometry }: MsaCorridorProps) {
  const corridor = useMemo(
    () => buildMsaCorridorGeometry(geometry),
    [geometry],
  );

  return (
    <Pane name="msa-corridor" style={{ zIndex: 475 }}>
      {corridor.polygons.map((polygon, index) => (
        <Polygon
          key={index}
          positions={polygon.map(
            ({ latitude, longitude }) => [latitude, longitude] as [number, number],
          )}
          pathOptions={{
            color: '#9b6618',
            weight: 1,
            opacity: 0.65,
            fillColor: '#e8b14c',
            fillOpacity: 0.16,
          }}
          interactive={false}
        />
      ))}
    </Pane>
  );
}
