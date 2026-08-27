import { useMemo } from 'react';

import { calculateRoute, calculateWindAdjustedLeg } from '../../calculations';
import type { WindAdjustedLegResult } from '../../calculations';
import type { NavigationParameters, Waypoint } from '../../domain';
import {
  calculateTotalEetSeconds,
  calculateTotalDistanceNm,
  formatDistanceNmValue,
  formatEetMinutesValue,
  formatGroundSpeedKtValue,
  formatTrueHeadingDeg,
  formatTrueTrackDeg,
} from './routeFormatting';

export interface RouteTableProps {
  waypoints: readonly Waypoint[];
  navigationParameters: NavigationParameters | null;
}

interface RouteTableRow {
  leg: ReturnType<typeof calculateRoute>[number];
  navigation: WindAdjustedLegResult | null;
}

function getNoSolutionMessage(result: WindAdjustedLegResult): string | null {
  if (result.status === 'ok') {
    return null;
  }

  return result.reason === 'crosswind-exceeds-true-airspeed'
    ? 'Crosswind exceeds TAS'
    : 'No forward groundspeed';
}

export function RouteTable({
  waypoints,
  navigationParameters,
}: RouteTableProps) {
  const legs = useMemo(() => calculateRoute(waypoints), [waypoints]);
  const waypointNames = useMemo(
    () => new Map(waypoints.map((waypoint) => [waypoint.id, waypoint.name])),
    [waypoints],
  );
  const rows: RouteTableRow[] = useMemo(
    () =>
      legs.map((leg) => ({
        leg,
        navigation:
          leg.trueTrackDeg === null || navigationParameters === null
            ? null
            : calculateWindAdjustedLeg({
                trueTrackDeg: leg.trueTrackDeg,
                distanceNm: leg.distanceNm,
                ...navigationParameters,
              }),
      })),
    [legs, navigationParameters],
  );
  const totalDistanceNm = calculateTotalDistanceNm(legs);
  const totalEetSeconds = calculateTotalEetSeconds(
    rows.map((row) => row.navigation),
  );

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
              <th scope="col">TH</th>
              <th scope="col" aria-label="Distance nautical miles">
                DIST<span className="route-table__unit">NM</span>
              </th>
              <th scope="col" aria-label="Groundspeed knots">
                GS<span className="route-table__unit">KT</span>
              </th>
              <th scope="col" aria-label="Estimated elapsed time minutes">
                EET<span className="route-table__unit">MIN</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ leg, navigation }) => {
              const solution =
                navigation?.status === 'ok' ? navigation : null;
              const noSolutionMessage =
                navigation === null ? null : getNoSolutionMessage(navigation);

              return (
                <tr key={`${leg.fromId}:${leg.toId}`}>
                  <td>{waypointNames.get(leg.fromId) ?? leg.fromId}</td>
                  <td>{waypointNames.get(leg.toId) ?? leg.toId}</td>
                  <td>{formatTrueTrackDeg(leg.trueTrackDeg)}</td>
                  <td>
                    {formatTrueHeadingDeg(solution?.trueHeadingDeg ?? null)}
                  </td>
                  <td>{formatDistanceNmValue(leg.distanceNm)}</td>
                  <td>
                    {solution === null
                      ? '—'
                      : formatGroundSpeedKtValue(solution.groundSpeedKt)}
                  </td>
                  <td
                    title={noSolutionMessage ?? undefined}
                    aria-label={noSolutionMessage ?? undefined}
                  >
                    {solution === null
                      ? (noSolutionMessage === null ? '—' : 'NO SOL')
                      : formatEetMinutesValue(solution.eetSeconds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td>{formatDistanceNmValue(totalDistanceNm)}</td>
              <td aria-hidden="true" />
              <td>
                {totalEetSeconds === null
                  ? '—'
                  : formatEetMinutesValue(totalEetSeconds)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
