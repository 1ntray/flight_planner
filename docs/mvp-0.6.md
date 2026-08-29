# MVP 0.6

## Goal

MVP 0.6 adds an explicit magnetic-reference step to the navigation log without
mixing magnetic variation into route geometry or the wind-triangle solution.

## Included

- All route shaping, timing, navigation, and forecast-wind behavior from MVP
  0.5
- Automatic per-leg variation from the local/offline WMM2025 model, sampled at
  each direct WGS84 leg midpoint, with a manual route-wide fallback
- An internal signed convention where east variation is positive and west
  variation is negative
- Pure true-to-magnetic direction conversion with normalized results
- Magnetic track (MT) derived from the direct real-waypoint true track (TT)
- Magnetic heading (MH) derived from a valid wind-adjusted true heading (TH)
- Compact paired `TT / MT` and `TH / MH` navigation-log presentation
- Unit tests for sign convention, north wraparound, validation, unavailable
  headings, and shaped-leg invariance

## Calculation contract

The stored value is `magneticVariationDegEast`, in degrees:

- east variation is positive;
- west variation is negative; and
- `magnetic direction = true direction - magneticVariationDegEast`.

For example, `180°T` with `14°E` variation is `166°M`, while `180°T` with
`10°W` variation is `190°M`.

The wind triangle continues to use true directions. MT is converted from the
direct real-waypoint TT, and MH is converted from the resulting TH only after a
valid wind solution exists. Shaping points therefore affect distance and EET,
but do not affect TT, MT, TH, or MH.

## Deliberately excluded

WMM2025 is valid only from 2025-01-01 through 2029-12-31. Automatic variation
is explicitly unavailable outside that period, and Manual mode remains
available. The navigation log rounds VAR, MT, and MH to whole degrees for
planning display; calculations retain their full precision. Compass deviation
is not modeled, so the application does not calculate compass heading.
