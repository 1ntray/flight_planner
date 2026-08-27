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

`FlightPlan.waypoints` is the single source of truth for a route. Its array order
is the flight order. A `CalculatedLeg` is derived from each adjacent pair whenever
it is needed; calculated legs must not be stored or independently updated as
application state. This prevents waypoint and leg data from becoming inconsistent.

Domain collections are exposed as readonly arrays to calculation code. Pure
calculation functions return new values and do not mutate their inputs.

The top-level `App` component owns the ordered waypoint array and the selected
waypoint ID. Selection is UI state; calculated legs are not. UI consumers call
`calculateRoute(waypoints)` to derive legs from the latest route.

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
  temporarily replace that waypoint when rendering the marker and polyline, but
  it is committed to `FlightPlan.waypoints` only on `dragend` and is never stored
  as a second route.
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

## TypeScript and testing

Strict TypeScript is required. New domain calculations should be pure and covered
by Vitest tests, including nominal values, boundary cases, and degenerate input.
Non-UI helpers for route naming, formatting, and totals should also have focused
unit tests. Snapshot tests are not a default requirement.
Run `pnpm typecheck` and `pnpm test` before merging changes.
