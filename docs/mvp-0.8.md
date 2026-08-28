# MVP 0.8

## Goal

MVP 0.8 allows a planned route to gain a real navlog waypoint at a selected
location on existing route geometry without confusing that action with route
shaping.

## Included

- Click-versus-drag route-line interaction based on a small screen-pixel
  movement threshold rather than single-click/double-click timing
- Route-line clicks that select a transient location and show explicit
  **Add waypoint** and **Cancel** actions
- WGS84 snapping of the click coordinate to the bounded geodesic between the
  selected geometry segment's endpoints
- Confirmed insertion of a normal free waypoint in the canonical ordered
  `waypoints` array with the normal automatic `WPnn` name
- Atomic splitting of existing per-leg shaping geometry at the selected
  segment while preserving shaping-point identity and order
- Two derived navlog legs after insertion, each with direct WGS84 true track
  between its new real endpoints
- Preservation of the original shaped path distance, using full-precision
  WGS84 segment sums and presentation-only rounding
- Validation that rejects stale insertion candidates if waypoint adjacency or
  selected route geometry has changed
- Existing route-line dragging retained for creation of shaping points

## State contract

An insertion candidate is temporary map UI state. It is not a waypoint, a
shaping point, or duplicated calculated route state. Only confirmation changes
the `FlightPlan`, and the resulting point is an ordinary real free waypoint.

For shaped geometry `A → G1 → G2 → B`, insertion on the `G1 → G2` segment
produces:

- real-waypoint order containing `A, W, B`,
- optional leg shape `A → W` containing `G1`, and
- optional leg shape `W → B` containing `G2`.

Empty shape halves are omitted, so direct geometry remains represented by the
absence of a `LegShape`.

## Deliberately excluded

This increment does not add airway-aware insertion, insertion of anchored
aeronautical waypoints from a route-line popup, undo/redo, waypoint renaming,
or automatic promotion of a shaping point into a real waypoint.
