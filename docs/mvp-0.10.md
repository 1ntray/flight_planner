# MVP 0.10

## Goal

MVP 0.10 makes complete current planning inputs portable and establishes a
versioned persistence boundary suitable for later aircraft, fuel, performance,
and OFP fields.

## Included

- A versioned `FlightPlanningDocumentV1` domain contract
- Pure runtime validation, normalization, JSON parsing, and serialization
- Export of the current route and valid semantic planning inputs to JSON
- Import of a validated JSON document into the route and planning controls
- Application-level ownership of the navigation draft and forecast preference
- Full preservation of real waypoints, names, shaping geometry, anchored WGS84
  snapshots, AIRAC/source provenance, departure, TAS, altitude, variation,
  manual wind, and forecast-source preference
- Explicit exclusion of calculated output and fetched forecast responses
- Fresh forecast retrieval after importing a document with forecast winds
  enabled
- Tests for round trips, malformed JSON, schema mismatch, invalid route
  geometry, duplicate IDs, anchor provenance, and navigation input bounds

## Architectural outcome

The live UI may contain an invalid text draft while the user edits a field, but
only parsed `NavigationPlanInputs` cross the persistence boundary. Consequently
the saved document remains semantic input data rather than a snapshot of form
implementation details.

The `FlightPlan` remains the canonical source of route truth inside the larger
planning document. Calculated legs continue to be derived and are never
persisted independently.

## Deliberately excluded

This increment does not add browser autosave, multiple named local plans, cloud
storage, schema migrations beyond version 1, aircraft profiles, fuel planning,
or PDF generation.
