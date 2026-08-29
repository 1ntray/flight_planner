# Navigation conventions

This document defines the conventions used by the navigation calculation layer.
They are calculation contracts rather than display preferences.

## Tracks, headings, and angles

- Angles are expressed in degrees clockwise from true north.
- Normalized angles use the half-open interval `[0, 360)`.
- A leg's `trueTrackDeg` is the initial WGS84 geodesic azimuth at the departure
  waypoint. It is not a rhumb-line course and is not constant along a long
  geodesic.
- Route shaping points do not affect `trueTrackDeg`. For a real-waypoint leg
  `A → B`, true track is always the direct WGS84 initial geodesic track from
  `A` to `B`, even when the displayed route geometry bends through shaping
  points.
- Wind direction is the true direction **from** which the wind is blowing.
- Wind-correction angle is positive to the right of track and negative to the
  left. True heading is `true track + wind-correction angle`, normalized to
  `[0, 360)`.
- Magnetic variation is stored in degrees with east positive and west
  negative. A plan selects automatic WMM2025 variation or a route-wide manual
  fallback. The manual editor uses an unsigned magnitude with an explicit
  east/west direction.
- The conversion contract is `true = magnetic + variation`, so
  `magnetic = true - variation`. Magnetic track is derived from true track;
  magnetic heading is derived from a valid wind-adjusted true heading.
- Magnetic directions are normalized to `[0, 360)`. A leg with no defined true
  track has no magnetic track, and a leg with no wind-triangle solution has no
  magnetic heading.
- Compass deviation is not modeled. Therefore magnetic heading is not yet a
  compass heading.

## Units and precision

- Distance is stored in nautical miles (`NM`).
- True airspeed, wind speed, and groundspeed are stored in knots (`kt`).
- Altitudes are input in feet above mean sea level (`ft MSL`). Exact
  conversion to metres uses `1 ft = 0.3048 m` where required by forecast data.
- Leg elapsed time is stored in seconds.
- Absolute times are stored as Unix timestamps in milliseconds and interpreted
  as UTC.
- Calculations retain their full numeric precision. Rounding is applied only by
  presentation helpers.

## Shaped leg distance

- Real adjacent waypoints define navlog legs. Route shaping points are ordered
  geometry inputs associated with one such leg and never create additional
  FROM/TO rows.
- A direct leg `A → B` has geometry `[A, B]`. A shaped leg may have geometry
  `[A, G1, G2, …, B]`.
- `distanceNm` is the sum of the WGS84 inverse-geodesic distances of every
  adjacent geometry segment. Segment distances are summed at full precision;
  presentation rounding occurs only after the sum.
- True track and shaped distance intentionally describe different aspects of a
  leg: TT describes direct `A → B` navigation, while DIST describes the planned
  shaped path length.
- Route shaping points do not affect magnetic track or magnetic heading,
  because both are derived from the direct `A → B` true directions. In
  automatic mode they also do not affect the WMM sample position.
- Wind correction, heading, and groundspeed use the direct true track. EET and
  cumulative timing use the shaped distance. This is a deliberate planning
  abstraction rather than segment-by-segment navigation.
- Inserting a real waypoint `W` into `A → G1 → G2 → B` on the `G1 → G2`
  geometry segment creates two navlog legs with geometry `A → G1 → W` and
  `W → G2 → B`. Each new leg receives its own direct endpoint-to-endpoint true
  track. Because `W` is snapped onto the selected WGS84 geometry segment, the
  sum of both shaped distances equals the original shaped distance apart from
  floating-point tolerance.

## Route timing and weather sampling context

- Planned departure time is input data. Leg start, midpoint, and end times are
  derived cumulatively from unrounded leg EET values.
- An explicit intermediate landing starts a new sector timeline. The onward
  departure is the preceding calculated arrival plus the non-negative stop
  duration; blank means zero minutes. Ground time is not included in airborne
  EET or fuel totals.
- The midpoint position is halfway by distance along the direct WGS84 geodesic
  between the real leg endpoints. It is not an arithmetic average of latitude
  and longitude, and shaping points do not change it.
- The midpoint time is halfway through the leg's calculated EET.
- Automatic magnetic variation uses one WMM2025 sample per real navlog leg:
  the direct WGS84 endpoint midpoint, midpoint UTC time, and the altitude at
  that time from the calculated performance profile when available. Without a
  performance profile it uses the normal planned altitude. It is intentionally
  not integrated through climb, descent, or shaping segments.
- Without an aircraft performance plan, a weather sample request combines the
  WGS84 leg midpoint, midpoint UTC time, and a representative altitude.
- With a performance plan, every integrated climb, cruise, or descent step has
  its own sample context using route position, representative altitude, and UTC
  midpoint time.
- An effectively zero-distance leg has zero EET and does not interrupt the
  route timeline even though its track and heading are undefined.
- If a leg has no wind-triangle solution, its end time and all subsequent
  absolute leg times are unknown. Later leg wind solutions may still be
  calculated independently.
- UTC times are rounded to the nearest minute only for display. A `+Nd` suffix
  indicates a UTC date offset from the departure date.

## Forecast wind selection

- Open-Meteo is an optional input source. The request explicitly selects the
  ECMWF IFS 0.25° upper-air feed with `models=ecmwf_ifs025`. Manual wind remains
  the route-wide fallback and supplies the preliminary timing estimate.
- Each accepted forecast result records the provider, model identifier,
  retrieval UTC timestamp, requested leg-midpoint valid UTC timestamp, and the
  pressure levels and geopotential heights used for vertical interpolation.
  These details are presentation/audit metadata and do not alter navigation
  calculations.
- Requests use hourly pressure-level wind speed, meteorological true direction
  from which the wind blows, and geopotential height above mean sea level.
- Four pressure levels around each requested altitude are selected. A mixed-
  altitude batch requests the union of those levels.
  Vertical interpolation uses their returned geopotential heights; a pressure
  level is not treated as having a fixed altitude.
- Wind is converted to eastward and northward velocity components before any
  interpolation. Components are interpolated linearly in time and then
  linearly in geopotential height. This avoids the discontinuity between, for
  example, directions `359°` and `001°`.
- If planned altitude lies outside the usable returned height range, wind is
  clamped to the nearest usable pressure level and the result records that
  clamping occurred.
- Forecast winds are first applied to the preliminary manual-wind route or
  performance profile. If this changes sample positions or times, one additional
  forecast selection pass is allowed. There is no unbounded convergence loop.
- A performance profile can produce several position, altitude, and time samples
  within one waypoint leg. Those samples are resolved by the performance wind
  resolver; they are not passed into the summary navigation route's
  one-override-per-leg interface.
- A forecast failure is not a navigation-calculation failure. The UI reports
  the failure and continues to calculate with manual wind.
- Responses are cached in memory for ten minutes by their full request URL.
  Cached results retain the time at which the underlying response was fetched;
  reading from the cache does not falsely update the displayed retrieval time.

## Wind-triangle solution

The wind calculation finds the aircraft heading whose air-velocity vector and
the wind vector produce a ground-velocity vector along the requested true
track.

The result explicitly reports that no solution exists when:

- the required crosswind component exceeds true airspeed, so no real heading
  can maintain the requested track; or
- the resulting groundspeed along the track is zero or negative, so the
  aircraft cannot make forward progress along the leg.

No-solution cases are data results, not exceptions. Invalid inputs such as a
non-positive true airspeed, negative distance, negative wind speed, or a
non-finite number are programming/input-boundary errors and cause a
`RangeError`.

## Magnetic variation model

- The offline provider uses bundled WMM2025 coefficients and makes no network
  request.
- WMM2025 is accepted only from 2025-01-01T00:00Z up to, but excluding,
  2030-01-01T00:00Z. Outside that range automatic output is explicitly
  unavailable and Manual mode remains available. Calculated WMM values are not
  persisted.
- Planning altitude is ft MSL and is converted to km MSL for the provider.
  VAR, MT, and MH are rounded to whole degrees only in the navlog display.
- The performance model and wind triangle remain entirely in true directions.
  Compass deviation is not modeled, so magnetic heading is not a compass heading.

## Current scope

When aircraft performance inputs are present, IAS, altitude-dependent TAS,
phase fuel flow, and altitude-resolved winds are integrated through the route.
The older constant-TAS navigation calculation remains a geometric/fallback
presentation path when no performance plan has been entered.
