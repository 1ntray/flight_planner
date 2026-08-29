# MVP 0.19

## Goal

MVP 0.19 adds automatic per-leg magnetic variation using WMM2025 and makes
the Zlin planning defaults and alternate workflow match the current OFP
planning process more closely.

## Magnetic variation

Magnetic variation has two explicit modes:

- **Automatic (WMM2025):** each real navlog leg samples WMM2025 at the WGS84
  midpoint of its direct FROM-to-TO geodesic, at the leg midpoint UTC time and
  representative altitude where available.
- **Manual:** one signed route-wide value is applied to every leg.

East variation is positive and west variation is negative. Magnetic track and
heading are derived as `magnetic = true - variation`. Wind-triangle calculations
remain in true directions. A shaped leg still samples variation from its direct
real-waypoint endpoints; shaping geometry does not alter the sample position.

WMM output is derived, never persisted as flight-plan truth. The model is used
only within its published 2025–2030 validity period; outside that range the
automatic result is unavailable and the pilot can use manual variation instead.
The displayed variation, MT, and MH are rounded to whole degrees for planning.

## Planning defaults

New plans default to 224 L fuel on board, 56 kg in the left seat, 0 kg in the
right seat, 15 kg baggage, 18 L extra fuel, 36 L final reserve, and 2,500 ft
planned leg altitude. All are editable.

Final reserve is entered as fuel. Its displayed time is derived using the
aircraft profile's 36 L/h reserve-flow assumption.

Pattern height has a blank-field 1,000 ft AGL preset, matching QNH and ISA
planning defaults, and can be overridden for a plan. The resulting pattern
altitude is rounded to the nearest 100 ft. Anchored ENDU arrivals use a 1,500
ft MSL planning default when that unchanged 1,000 ft pattern-height default
applies.

## Alternate planning

The alternate is selected as an aerodrome on the map and stored as an anchored
waypoint snapshot. Its navigation line is derived directly from the primary
final destination to the alternate: WGS84 TT, automatic or manual variation,
MT, the current true-direction wind-triangle solution, MH, and groundspeed.

Alternate distance, time, and fuel remain pilot-entered OFP planning values.
They feed fuel requirements and endurance; this release deliberately does not
infer them from a performance route or fetch forecast wind for the alternate.

## Persistence

Document schema version 9 persists the variation mode/manual value and the
current alternate inputs. Derived WMM values are recalculated when the document
is opened. Earlier documents remain readable; their former reserve time is
converted with the selected aircraft reserve fuel flow, and prior calculated
alternate entries are retained as manual zero-value entries for review.
