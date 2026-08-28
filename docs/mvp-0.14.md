# MVP 0.14

## Goal

MVP 0.14 supports a route containing multiple airport-to-airport flight
sectors, with a separate navigation log for each sector.

## Included

- Explicit landing/sector boundaries attached to intermediate real waypoints
- Pure derivation of sectors from the canonical waypoint order
- One shared boundary airport as the inbound TO and outbound FROM waypoint
- Intermediate-airport elevation, QNH, ISA deviation, and optional onward
  departure time inputs
- Independent performance calculation for every sector
- Descent to pattern altitude before each landing and a new climb from field
  elevation on the onward sector
- Separate navlog table, EET, fuel, and arrival totals for each sector
- Version-four persistence and validated migration of versions one through
  three

## Boundaries

Aerodrome anchoring alone does not imply a landing. The user explicitly marks
an intermediate real waypoint as a landing, so an aerodrome may still be used
as an overflight waypoint. The route continues to own one ordered waypoint
array and one set of per-leg shaping geometry; sectors and their calculated
legs are derived.

The current model uses one aircraft mass and route-wide manual wind/variation
for all sectors. Ground operations, landing/takeoff allowances, refuelling,
sector-specific mass, weight-and-balance changes, and independent fuel-policy
blocks remain future work.
