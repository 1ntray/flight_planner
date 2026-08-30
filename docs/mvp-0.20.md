# MVP 0.20

## Goal

MVP 0.20 improves operational route planning and map usability while adding
guardrails that allow the planner to recover safely if an unusually expensive
calculation is interrupted.

## Performance and calculation safety

The performance model rejects user-entered altitudes outside the current
0–60,000 ft planning range and bounds vertical-profile/target-placement work.
An exhausted work budget produces an explicit no-solution result rather than
leaving the browser renderer busy indefinitely.

Before every synchronous calculation stage, the UI records a compact local
diagnostic breadcrumb containing only the stage and numeric complexity context.
It is cleared after normal completion. On the next launch after an unfinished
stage, calculation-heavy results are paused until the pilot chooses **Retry
calculations**; route editing remains available. This diagnostic state is not
part of a saved flight plan and contains no route coordinates.

## Vertical planning and route editing

Leg vertical transitions now begin at the earliest feasible point when a
reach-by target is automatic, for both climbs and descents. Explicit targets
and arrival constraints retain their requested end-of-leg behaviour. Target
dragging, shaping-point deletion, and real-waypoint insertion retain **Edit
route** mode where appropriate, reducing accidental mode changes during route
construction.

The airport setup is presented as a single itinerary-oriented panel with
departure, intermediate-stop, and destination tabs. It keeps field elevation,
planning QNH, and ISA-deviation inputs alongside the airport to which they
apply.

## Alternate planning

An alternate aerodrome can be selected by ICAO identifier from the configured
AIRAC-versioned repository. The chosen aerodrome is stored as an anchored
snapshot and visualised on the map. Alternate navigation uses the pilot's
selected alternate planning altitude to derive TAS, true/magnetic directions,
wind correction, heading, and groundspeed; its OFP distance, time, and fuel
requirements remain pilot-entered values.

The alternate navlog row appears only on the final primary sector. Its
distance, time, fuel, and fuel-remaining output feed the appropriate
accumulated OFP-style fields.

## OFP-oriented presentation

Navigation-log headers, totals, and per-sector presentation are aligned and
proportioned around the OFP transfer workflow rather than filling available
width. The remaining-fuel and mass-and-balance panels are compacted, aligned
with the navlog visual language, and retain the Zlin-specific main/auxiliary
fuel-burn rows. Mass-and-balance columns are ordered mass, arm, and moment.

## Aerodrome information

Selecting an aerodrome in Select mode now opens an on-demand published-data
popup. It shows aerodrome identity, ARP, elevation, active dataset/AIRAC
provenance, and TODA/LDA values per runway direction. An anchored aerodrome
waypoint offers **Aerodrome info**, so the source remains available even when
the route handle overlays the map feature. Escape closes this popup.

Published aeronautical details remain separate from future live operational
sources. METAR, TAF, NOTAM, and similar data can later be composed into the
popup through dedicated time-aware providers without becoming part of the
AIRAC repository or saved flight-plan geometry.

## Persistence and verification

The saved-document schema remains version 9. Alternate planning altitude is a
backward-compatible optional input; documents that predate it use a 2,500 ft
default when loaded. Derived performance, alternate-navigation, and popup
state remain outside persistence.

The release adds or updates tests for calculation limits/recovery, expanded
performance behaviour, alternate inputs, normalized aerodrome declared
distances, and source-aerodrome snapshots. Typechecking, Vitest, and the
production build are required verification steps.
