# MVP 0.18

## Goal

MVP 0.18 makes the on-screen sector navlogs follow the two-page Zlin OFP more
closely, improves map readability, and permits two vertical transitions inside
one real-waypoint leg.

## OFP-aligned navlog

Each sector navlog uses the page-one OFP column order and grouping: FROM, TAS,
TT, VAR, MT, wind, accumulated distance/time, fuel flow/intermediate/accumulated,
TO, MSA/planned altitude, MH, intermediate groundspeed/distance/time,
ETO/ATO/difference, estimated/actual fuel remaining, and frequency. Calculated
planning values are filled; actual-time, actual-fuel, MSA, and frequency fields
remain visibly blank until the application has authoritative inputs for them.
Intermediate totals reset for each sector, while accumulated values continue
from the original takeoff.

The page-two loading table now shows auxiliary and main fuel consumed between
takeoff and landing as separate negative rows. The calculation continues to
consume auxiliary fuel before main fuel and derives both rows from the takeoff
and landing tank states.

## Map interaction

Primary sectors receive repeating, high-contrast route colours so intermediate
landings remain visible. Selection still uses the separate selected-leg colour.
Creating a shaping point by dragging the route no longer opens its removal
popup; selecting the handle later still provides removal.

A free waypoint can be dropped onto a visible aeronautical point to become an
anchored waypoint. The screen-space drop target is presentation-only; the
canonical waypoint receives the feature's published WGS84 coordinate and source
snapshot. Route endpoints anchored to aerodromes with published elevations
show that value as a blank-field default without overriding a user-entered
value.

Pattern altitude is derived from aerodrome elevation plus pattern height and
rounded to the nearest 100 ft for every primary and intermediate arrival. ENDU
uses a 1500 ft MSL planning default (approximately 1250 ft AGL) while the
pattern-height field remains editable. Calculated vertical-phase annotations use compact perpendicular route
ticks with hover details. BOC at a FROM waypoint and BOD at a TO waypoint are
suppressed while internal phase boundaries remain visible.

An arrival leg's planned altitude is not replaced by pattern altitude. The
normal per-leg altitude schedule is calculated first, followed by a derived
final descent that reaches the rounded pattern altitude at the aerodrome.

Anchored aerodromes provide non-destructive elevation defaults for departure,
destination, and intermediate landing fields. Blank aerodrome weather fields
use 1013 hPa QNH and 0 °C ISA deviation as editable planning defaults.

## Two transitions on one leg

A per-leg altitude plan has a primary planned altitude/reach-by target and one
optional end altitude/reach-by target. Both targets are distances along the
actual shaped WGS84 geometry. The interval-integrated performance engine applies
the second transition after the primary target, preserving full TAS, wind,
groundspeed, time, fuel, and horizontal-distance integration. A real waypoint
inserted into the leg keeps each instruction on the resulting leg containing
its physical target.

Document schema version 9 persists the current planning inputs. Earlier versions
remain readable and migrate without invented route geometry.
