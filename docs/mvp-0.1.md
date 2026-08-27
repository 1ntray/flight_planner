# MVP 0.1

## Goal

MVP 0.1 establishes a dependable browser-project foundation for flight planning.
It includes the Vite, React, TypeScript, Vitest, Leaflet, and React-Leaflet stack,
the core route domain, and deterministic route calculations.

## Included

- A minimal React application shell
- `Position`, `Waypoint`, `FlightPlan`, and `CalculatedLeg` domain concepts
- An ordered waypoint array as the only route source of truth
- WGS84 inverse geodesic calculations through `geographiclib-geodesic`
- Exact metre-to-nautical-mile conversion using 1852 m/NM
- True-track normalization to `[0, 360)`
- Explicit zero-distance and `null`-track handling for effectively identical
  coordinates
- Adjacent-leg derivation from the current waypoint order
- Vitest coverage for geodesy and route calculations

## Deliberately excluded

The interactive Leaflet map UI is not part of this initial task. Weather,
aircraft performance, wind calculations, fuel calculations, PDF generation, a
backend, and persistence are also outside MVP 0.1.

## Next milestone boundary

A later milestone may introduce a React-Leaflet map and waypoint-editing UI. That
UI should edit only `FlightPlan.waypoints` and call the pure route calculation
layer to display legs. It must not introduce independently mutable leg state.

