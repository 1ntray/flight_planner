import { useMemo } from 'react';

import { calculateRoute } from '../../calculations';
import type { Waypoint } from '../../domain';
import {
  calculateTotalDistanceNm,
  formatDistanceNm,
  formatTrueTrackDeg,
} from './routeFormatting';

export interface RouteTableProps {
  waypoints: readonly Waypoint[];
}

export function RouteTable({ waypoints }: RouteTableProps) {
  const legs = useMemo(() => calculateRoute(waypoints), [waypoints]);
  const waypointNames = useMemo(
    () => new Map(waypoints.map((waypoint) => [waypoint.id, waypoint.name])),
    [waypoints],
  );
  const totalDistanceNm = calculateTotalDistanceNm(legs);

  return (
    <div className="route-table-wrap">
      {legs.length === 0 ? (
        <p className="empty-route">
          Add at least two waypoints to calculate a route leg.
        </p>
      ) : (
        <table className="route-table">
          <thead>
            <tr>
              <th scope="col">FROM</th>
              <th scope="col">TO</th>
              <th scope="col">TT</th>
              <th scope="col">DIST</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={`${leg.fromId}:${leg.toId}`}>
                <td>{waypointNames.get(leg.fromId) ?? leg.fromId}</td>
                <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
                <td>{formatTrueTrackDeg(leg.trueTrackDeg)}</td>
                <td>{formatDistanceNm(leg.distanceNm)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td>{formatDistanceNm(totalDistanceNm)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
