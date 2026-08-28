# MVP 0.12

## Goal

MVP 0.12 adds the first complete project-specific aircraft performance model
and an editable multi-leg altitude schedule.

## Included

- Pure, tested climb-rate, climb-time, descent-time, fuel, planning-environment,
  and exact IAS-to-TAS calculations
- 100 ft climb/descent integration using altitude-dependent TAS and wind
- Repeated altitude changes and different cruise altitudes across route legs
- Route-wide default altitude plus sparse per-leg overrides
- Automatic or explicit altitude-attainment distance on shaped WGS84 geometry
- Map selection and draggable altitude-target handles distinct from waypoints
  and shaping points
- Arrival at destination pattern altitude, defined as destination elevation plus
  editable pattern height AGL
- Phase EET, effective groundspeed, fuel, and route totals in the navlog
- Position/altitude/time-aware Open-Meteo sampling with one refinement pass and
  manual-wind fallback
- Version-two saved documents and migration of version-one files/local drafts

## Boundaries

The ordered real-waypoint array still defines navlog legs. Shaping points affect
only route geometry. Altitude targets are separate leg inputs and never create
navlog rows. Calculated phase steps, TAS, ROC, groundspeed, time, fuel, forecast
responses, and marker drag state are derived or transient and are not persisted.

The model does not yet include takeoff/landing fuel allowances, taxi, reserve,
contingency, alternate fuel, weight change from fuel burn during climb,
weight-and-balance, runway performance, or OFP/PDF population.
