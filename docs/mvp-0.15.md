# MVP 0.15

## Goal

MVP 0.15 makes intermediate-airport scheduling relative to the calculated
arrival and keeps the complete planning panel accessible while the larger UI is
being redesigned.

## Included

- A non-negative stop duration for every intermediate landing
- Derived onward departure as preceding arrival plus stop duration
- Blank stop duration interpreted as zero minutes
- Stop time included in the next sector's UTC timeline and weather sampling,
  but excluded from airborne EET and fuel
- Version-five persistence with explicit migration of the version-four fixed
  onward-departure representation
- Vertical scrolling for the viewport-height right panel so controls and all
  sector navlogs remain reachable

## Boundaries

No ground fuel, start/taxi allowance, refuelling, mass change, or turnaround
phase is calculated yet. The retained version-four fixed departure exists only
for saved-plan compatibility; newly edited plans use stop duration.

The scrolling repair is deliberately small. A map-first panel and interaction
overhaul should reorganize controls without moving navigation or performance
logic into React or Leaflet components.
