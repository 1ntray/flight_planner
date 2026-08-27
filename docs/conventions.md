# Project conventions

## Source layout

- `src/domain` contains data-only TypeScript interfaces. Domain types do not
  depend on React, Leaflet, or calculation implementations.
- `src/calculations` contains pure functions. Calculation modules do not read or
  modify UI state.
- `src/app` contains the React application shell. Map and feature-specific UI
  code is grouped under `src/app/map` and `src/app/route`.
- Calculation tests live beside their modules as `*.test.ts` files.

## Route state

`FlightPlan` is the single source of truth for route input. Its ordered
`waypoints` array contains real navigation waypoints and defines the flight and
navlog leg order. Its `legShapes` collection contains optional ordered route
shaping points associated with a specific adjacent real-waypoint pair. Shaping
points are not waypoints and never create navlog legs.

A `CalculatedLeg` is derived from each adjacent real-waypoint pair whenever it
is needed; calculated legs and expanded route geometry must not be stored or
independently updated as application state. This prevents waypoint, shaping,
and leg data from becoming inconsistent.

Domain collections are exposed as readonly arrays to calculation code. Pure
calculation functions return new values and do not mutate their inputs.

The top-level `App` component owns the `FlightPlan` and the selected route-point
descriptor. Selection and in-progress drag positions are UI state; calculated
legs are not. UI consumers call `calculateRoute(flightPlan)` to derive legs
from the latest route input.

Waypoint IDs are generated independently of waypoint names and remain stable
when markers move. Automatic names use `WP01`, `WP02`, and so on. The next name
continues after the highest generated name still in the route, preventing a
middle deletion from creating a duplicate name.

## Map

- The base-map source is isolated in `src/app/map/tileSource.ts` so it can be
  replaced without changing map interaction code.
- Leaflet latitude/longitude from click and drag events may update waypoint
  positions, and waypoint positions may be projected for marker/polyline display.
- Navigation distance and track must never be calculated with Leaflet geometry,
  pixel distances, tile coordinates, or Web Mercator.
- A marker's in-progress drag position is local map presentation state. It may
  temporarily replace that real or shaping point when rendering the marker and
  polyline, but it is committed to `FlightPlan` only on `dragend` and is never
  stored as a second route.
- Dragging an interactive route segment creates a temporary shaping-point draft
  associated with that real leg and segment index. It is committed once on
  pointer release. Leaflet supplies WGS84 input coordinates but never supplies
  navigation distances or tracks.
- Raster tile seam investigation and workaround policy are documented in
  [`map-rendering.md`](map-rendering.md).

## Units and angles

- Positions use decimal degrees in WGS84 latitude and longitude.
- Geodesic distance is calculated in metres and converted with exactly
  `1 NM = 1852 m`.
- True tracks are degrees normalized to the half-open interval `[0, 360)`.
- A track is `null` when the two positions are effectively identical because a
  direction is undefined.
- Positions separated by 1 mm or less according to the WGS84 inverse result are
  treated as effectively identical. Their reported distance is exactly `0`.
- Wind, heading, speed, and elapsed-time conventions are documented in
  [`navigation-conventions.md`](navigation-conventions.md).

## TypeScript and testing

Strict TypeScript is required. New domain calculations should be pure and covered
by Vitest tests, including nominal values, boundary cases, and degenerate input.
Non-UI helpers for route naming, formatting, and totals should also have focused
unit tests. Snapshot tests are not a default requirement.
Run `pnpm typecheck` and `pnpm test` before merging changes.
