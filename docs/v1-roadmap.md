# V1 roadmap

This roadmap describes the smallest credible path from the current planning aid
to a dependable Flight Planner 1.0. It is intentionally driven by gaps in the
current implementation, not a broad feature wishlist. Every item remains
subject to authoritative aircraft, aerodrome, and operational source material.

## Must-have before 1.0

### 1. Documentation and quality hardening

- Keep current-state.md, calculation contracts, AIRAC documentation, and
  release notes aligned with implementation.
- Maintain deterministic calculation, persistence, and importer tests; add
  regression cases from reviewed operational plans.
- Exercise the app in supported desktop and touch browser environments, and
  document the supported use and planning-only safety boundary.

**Why first:** reliable boundaries and reproducible review are prerequisites
for trusting later operational features.

### 2. Airport operational weather inputs

Add a dedicated, time-aware airport operational-data boundary for:

- METAR and TAF display with source, observation/issue time, validity, and
  unavailable/error state;
- pilot review of QNH, OAT/ISA, wind, and relevant surface environment; and
- clear separation between fetched operational data, pilot-entered planning
  overrides, AIRAC data, and saved flight-plan inputs.

Do not make a weather feed silently rewrite route, performance, or persisted
inputs. Preserve explicit load/refresh behaviour and source provenance.

### 3. Takeoff and landing runway performance

Implement runway-specific Zlin planning calculations only after verified source
data and rules are available. The feature should combine selected runway,
declared distances, aircraft performance data, mass, QNH/OAT, wind, and any
required surface assumptions; it must return explicit unavailable/no-solution
results rather than guessed margins.

This closes the largest operational gap between the existing enroute/performance
planning and airport operations.

### 4. Validate against manually prepared real flight plans

Prepare a small controlled set of real, manually checked Zlin planning examples.
Compare route geometry, headings, timing, altitude transitions, fuel, patterns,
refuel horizons, mass and balance, alternate handling, and frequency changes.
Record assumptions and expected tolerances so discrepancies become regression
tests rather than anecdotal observations.

## Nice-to-have before 1.0

### Zlin OFP PDF generation

Generate a clearly labelled PDF from the existing derived OFP data. The output
should preserve source/provenance and warning visibility, include only the
implemented calculated fields, and never imply that blank actual fields or
unavailable data are operationally complete.

### UX, touch, and iPad hardening

Run practical touch and iPad-oriented acceptance tests for map selection,
dragging, popup sizing, keyboard-free editing, scrolling, and export/print
flows. Address concrete accessibility and responsive-layout defects found in
that testing without changing the calculation boundary.

### AIRAC update review ergonomics

Improve review guidance and change-report presentation as needed after several
real updates. The human-reviewed merge boundary remains unchanged; convenience
must not automate activation.

## Post-1.0 / experimental

### Additional weather providers

Evaluate providers such as MEPS or AROME-Arctic only behind the existing
forecast-provider boundary. They are not a 1.0 blocker: ECMWF IFS 0.25° and DWD
ICON-EU already provide selectable upper-air wind planning data. Any additional
provider needs documented coverage, terms, model semantics, failure behaviour,
and validation against the existing wind conventions.

### Further operational-data layers

Potential later work includes richer airport information, validated VAC raster
preparation, and carefully scoped NOTAM presentation. These require independent
source, update, and safety decisions; they must not be treated as automatic
interpretation or route mutation.

## Explicitly out of V1 scope

V1 does not require cloud sync, automatic NOTAM interpretation, autonomous
flight-plan submission, automatic terrain-derived MSA, or autonomous
operational decisions. Those would need separate safety, authority, and product
requirements beyond the current planner architecture.
