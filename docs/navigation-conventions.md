# Navigation conventions

This document defines the conventions used by the navigation calculation layer.
They are calculation contracts rather than display preferences.

## Tracks, headings, and angles

- Angles are expressed in degrees clockwise from true north.
- Normalized angles use the half-open interval `[0, 360)`.
- A leg's `trueTrackDeg` is the initial WGS84 geodesic azimuth at the departure
  waypoint. It is not a rhumb-line course and is not constant along a long
  geodesic.
- Wind direction is the true direction **from** which the wind is blowing.
- Wind-correction angle is positive to the right of track and negative to the
  left. True heading is `true track + wind-correction angle`, normalized to
  `[0, 360)`.
- Magnetic variation and magnetic headings are not part of this calculation
  stage.

## Units and precision

- Distance is stored in nautical miles (`NM`).
- True airspeed, wind speed, and groundspeed are stored in knots (`kt`).
- Leg elapsed time is stored in seconds.
- Calculations retain their full numeric precision. Rounding is applied only by
  presentation helpers.

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

The calculation currently assumes a constant true airspeed and a single
constant wind vector for each leg. It does not yet account for wind variation
along a leg, climb/descent performance, magnetic variation, fuel flow, or
forecast interpolation.
