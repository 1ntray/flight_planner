# Project conventions

## Source layout

- `src/domain` contains data-only TypeScript interfaces. Domain types do not
  depend on React, Leaflet, or calculation implementations.
- `src/calculations` contains pure functions. Calculation modules do not read or
  modify UI state.
- `src/app` contains the React application shell. Map and feature-specific UI
  folders can be added here as later milestones require them.
- Calculation tests live beside their modules as `*.test.ts` files.

## Route state

`FlightPlan.waypoints` is the single source of truth for a route. Its array order
is the flight order. A `CalculatedLeg` is derived from each adjacent pair whenever
it is needed; calculated legs must not be stored or independently updated as
application state. This prevents waypoint and leg data from becoming inconsistent.

Domain collections are exposed as readonly arrays to calculation code. Pure
calculation functions return new values and do not mutate their inputs.

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
Run `pnpm typecheck` and `pnpm test` before merging changes.

