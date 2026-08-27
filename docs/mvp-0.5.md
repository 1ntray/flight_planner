# MVP 0.5

## Goal

MVP 0.5 adds route shaping without weakening the semantic distinction between
real navigation waypoints and intermediate route geometry.

## Included

- All route timing, navigation, and forecast-wind behavior from MVP 0.4
- Explicit `RouteShapingPoint` and `LegShape` domain inputs
- One canonical `FlightPlan` containing real waypoint order and optional
  per-leg shaping geometry
- Dragging an existing route segment to create a shaping point
- Multiple ordered shaping points on one real-waypoint leg
- Distinct, draggable, selectable shaping-point map handles
- Removal of a selected shaping point without deleting either real waypoint
- Automatic restoration of direct geometry when the last shaping point is
  removed
- Automatic cleanup of shapes touching a deleted real waypoint
- Navlog legs derived only from adjacent real waypoints
- Direct endpoint-to-endpoint WGS84 true track together with summed,
  segment-by-segment WGS84 shaped distance
- Unit tests covering geometry order, state cleanup, direct-track preservation,
  unrounded distance summation, EET behavior, and display derivation

## Calculation contract

For a real leg `A → B` shaped through `G1` and `G2`:

- `trueTrackDeg` is the direct WGS84 initial track from `A` to `B`.
- `distanceNm` is `A → G1 + G1 → G2 + G2 → B`, using unrounded WGS84
  geodesic distances.
- The navigation log still contains one `A → B` row.
- Wind correction, heading, and groundspeed use the direct true track; EET uses
  the shaped distance.
- The weather sampling position remains the direct WGS84 midpoint of `A → B`.
  Shaped distance can still change the midpoint UTC time through EET.

Shaping-point positions and order are route inputs. Expanded geometry,
calculated legs, distances, and navigation results remain derived data and are
not stored as independent React state.

## Deliberately excluded

The MVP does not calculate separate tracks, headings, winds, or EET values for
individual shaped segments. It also does not provide undo/redo, automatic
obstacle avoidance, airway snapping, terrain clearance, or route-shape
persistence.
