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
  negative. The current input is route-wide and manually entered as an
  unsigned magnitude with an explicit east/west direction.
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
- Planned altitude is input in feet above mean sea level (`ft MSL`). Exact
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
  because both are derived from the direct `A → B` true directions.
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
- The midpoint position is halfway by distance along the direct WGS84 geodesic
  between the real leg endpoints. It is not an arithmetic average of latitude
  and longitude, and shaping points do not change it.
- The midpoint time is halfway through the leg's calculated EET.
- A weather sample request combines that WGS84 midpoint, midpoint UTC time, and
  the route-wide planned altitude. Zero-distance or untimed legs do not produce
  a request.
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
- Four pressure levels around the approximate planned altitude are requested.
  Vertical interpolation uses their returned geopotential heights; a pressure
  level is not treated as having a fixed altitude.
- Wind is converted to eastward and northward velocity components before any
  interpolation. Components are interpolated linearly in time and then
  linearly in geopotential height. This avoids the discontinuity between, for
  example, directions `359°` and `001°`.
- If planned altitude lies outside the usable returned height range, wind is
  clamped to the nearest usable pressure level and the result records that
  clamping occurred.
- Forecast winds are first applied to the preliminary manual-wind route. If
  this changes midpoint sample times, one additional forecast selection pass is
  allowed. There is no unbounded convergence loop.
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

## Current scope

The calculation currently assumes a constant true airspeed and route-wide
planned altitude and magnetic variation. It can apply a distinct forecast wind
to each leg, but each leg still uses one constant wind vector sampled at its
midpoint. It does not yet account for wind or magnetic-variation changes along
a leg, climb/descent performance, compass deviation, or fuel flow.
