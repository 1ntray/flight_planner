# MVP 0.13

## Goal

MVP 0.13 makes aircraft performance an explicit, selectable domain input while
preserving the complete integrated performance model introduced in MVP 0.12.

## Included

- Serializable `AircraftDefinition` identity and revision metadata
- Nested climb, cruise, and descent performance data
- Explicit, parameterized climb-rate coefficients
- A one-entry aircraft catalog and aircraft selector ready for additional
  supplied profiles
- The selected aircraft threaded through TAS, climb/descent, fuel, weather,
  and route-phase calculations without React or provider coupling
- Version-three plan files containing the complete selected-aircraft snapshot
- Validated migration of version-one and version-two plan files/local drafts

## Boundaries

The catalog contains only supplied aircraft data. There is no generic profile
editor and no invented interpolation table. Aircraft mass, weather, aerodrome
elevations, pattern height, and the per-leg altitude schedule remain
flight-specific inputs rather than aircraft properties.

Weight-and-balance arms/moments, fuel-tank definitions, usable fuel, loading
stations, runway performance, and OFP/PDF mapping are not yet part of the
aircraft definition. They can be added as separate sections when authoritative
data is supplied, without changing the performance calculation boundary.
