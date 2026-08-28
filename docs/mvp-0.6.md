# MVP 0.6

## Goal

MVP 0.6 adds an explicit magnetic-reference step to the navigation log without
mixing magnetic variation into route geometry or the wind-triangle solution.

## Included

- All route shaping, timing, navigation, and forecast-wind behavior from MVP
  0.5
- One manually entered, route-wide magnetic variation magnitude and explicit
  east/west direction
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

MVP 0.6 does not automatically obtain magnetic variation from a geomagnetic
model, vary it by position or date, or model compass deviation. It therefore
does not calculate compass heading. Those concerns can be added behind
separate, testable boundaries when needed.
