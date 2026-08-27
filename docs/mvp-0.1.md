# MVP 0.1

## Goal

MVP 0.1 establishes a dependable browser-based route planning workflow. It
includes the Vite, React, TypeScript, Vitest, Leaflet, and React-Leaflet stack,
the core route domain, deterministic route calculations, and a functional map
and navigation log.

## Included

- A desktop React application shell with an approximately 70/30 map and route
  panel layout
- `Position`, `Waypoint`, `FlightPlan`, and `CalculatedLeg` domain concepts
- An ordered waypoint array as the only route source of truth
- WGS84 inverse geodesic calculations through `geographiclib-geodesic`
- Exact metre-to-nautical-mile conversion using 1852 m/NM
- True-track normalization to `[0, 360)`
- Explicit zero-distance and `null`-track handling for effectively identical
  coordinates
- Adjacent-leg derivation from the current waypoint order
- A React-Leaflet map initially centered between Tromsø and Bardufoss
- Kartverket topo WMTS tiles with the required attribution
- Click-to-add, drag-to-move, select, delete, and clear waypoint interactions
- Stable random waypoint IDs and sequential `WP01`, `WP02`, ... display names
- A display polyline between adjacent waypoints
- A derived route table with formatted true track, leg distance, and total
  unrounded route distance
- Vitest coverage for geodesy and route calculations
- Vitest coverage for non-UI naming, formatting, and total-distance helpers

## Deliberately excluded

Weather, aircraft performance, wind calculations, fuel calculations, magnetic
variation, altitude, aircraft data, PDF generation, a backend, and persistence
are outside MVP 0.1.

## Architecture boundary

The UI edits only the ordered waypoint array. `calculateRoute(waypoints)` derives
legs for the navigation log on render; legs are never stored in React state. The
Leaflet polyline uses waypoint coordinates for display only. All distance and
true-track values continue to come from the pure WGS84 calculation layer rather
than Leaflet, pixels, tile coordinates, or Web Mercator.
