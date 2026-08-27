# MVP 0.4

## Goal

MVP 0.4 adds altitude-aware forecast winds without coupling asynchronous
weather access to the navigation calculation layer.

## Included

- All route, timing, and wind-triangle behavior from MVP 0.3
- One route-wide planned altitude entered in feet above mean sea level
- Optional ECMWF IFS 0.25° upper-air wind lookup through Open-Meteo for each
  timed, non-zero-distance leg
- Forecast sampling at the WGS84 geodesic midpoint and calculated midpoint UTC
  time
- Batched Open-Meteo requests using Unix UTC timestamps and wind speed in knots
- Temporal and vertical interpolation of wind vector components
- Vertical interpolation against forecast geopotential height above mean sea
  level rather than a fixed assumed height for each pressure level
- Manual route-wide wind as the first timing estimate and fallback
- One bounded timing-refinement pass after forecast winds are first applied
- Request cancellation, a ten-minute in-memory response cache, and visible
  loading/error/fallback state
- Per-leg display of the wind actually used by the navigation calculation
- Visible forecast provenance: provider, model, valid UTC time range, retrieval
  UTC time, and per-leg pressure-level/interpolation details
- Unit tests for altitude input, weather request derivation, vector conversion,
  pressure-level selection, forecast parsing/interpolation, clamping, and
  per-leg wind overrides

## Forecast pipeline

1. `calculateNavigationRoute` derives a preliminary route using manual wind.
2. Pure weather helpers derive one sample request per timed, non-zero-distance
   leg from its midpoint position, midpoint time, and planned altitude.
3. The browser client explicitly requests the ECMWF IFS 0.25° model
   (`models=ecmwf_ifs025`) and fetches batched hourly pressure-level data from
   Open-Meteo.
4. Pure forecast code interpolates east/north wind components in time and then
   in actual geopotential height.
5. The resulting per-leg winds are passed back to `calculateNavigationRoute` as
   overrides; manual wind remains the fallback for legs without an override.
6. If forecast-adjusted midpoint times differ, the application performs one
   additional forecast selection pass and stops.

React owns only user input and asynchronous forecast state. The ordered
`waypoints[]` array remains the canonical route, and all legs, midpoint context,
headings, groundspeeds, and timing remain derived data.

The forecast integration follows the published
[Open-Meteo ECMWF API](https://open-meteo.com/en/docs/ecmwf-api) contract.
Open-Meteo's ECMWF HRES 9 km feed does not include pressure-level variables;
upper-air pressure-level data is supplied by the ECMWF IFS 0.25° open-data
feed. The app therefore does not claim that these winds are the same HRES 9 km
product shown by a third-party viewer such as Windy.

## Deliberately excluded

The MVP still uses a single route-wide altitude and true airspeed. It does not
model climb or descent, terrain clearance, forecast confidence, a model
selection UI, magnetic variation, fuel flow, aircraft profiles, persistence,
or PDF output.
The forecast is advisory planning data and is not a substitute for an approved
aviation weather briefing.
