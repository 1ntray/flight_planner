# MVP 0.3

## Goal

MVP 0.3 establishes a pure route-level navigation pipeline and the spatial and
temporal context needed for future weather lookup.

## Included

- All route, map, and wind-triangle behavior from MVP 0.2
- Planned departure time entered and interpreted explicitly as UTC
- A single pure calculation that derives geometric and wind-adjusted route legs
- Cumulative leg start, midpoint, and end timestamps
- Total EET and estimated arrival time
- WGS84 geodesic midpoint positions for every leg
- Explicit propagation of unavailable absolute timing after a no-solution leg
- Zero-time handling for effectively zero-distance legs
- Compact ETA display with UTC day-offset indication
- Unit tests for timing, UTC date crossings, midpoint geometry, invalid input,
  zero-distance legs, and no-solution propagation

## Deliberately excluded

Altitude, Open-Meteo integration, forecast interpolation, per-leg wind,
magnetic variation, magnetic heading, climb/descent modeling, aircraft
profiles, fuel calculations, persistence, and PDF generation remain outside
MVP 0.3.

## Architecture boundary

`calculateNavigationRoute` is the calculation-layer orchestration boundary. It
receives the canonical waypoint array plus planning inputs and returns all
geometric, wind-adjusted, and timing output as derived data. React owns input
state and renders that result; it does not calculate or store independent legs.

Each calculated leg exposes a WGS84 midpoint position and midpoint UTC time.
These values form the future weather-query context, but the calculation remains
independent of any weather API or asynchronous behavior.
