# MVP 0.7

## Goal

MVP 0.7 establishes the storage-neutral aeronautical overlay and waypoint
anchoring boundary before an operational AIRAC data source is selected.

## Included

- Normalized aeronautical point and area feature domain models
- Dataset, AIRAC, provider, revision, and feature-version provenance
- An asynchronous, cancellable `AeronauticalDataRepository` abstraction
- An in-memory repository for tests and synthetic development data
- Independent visibility and minimum zoom policy for aerodromes, reporting
  points, navaids/designated points, and airspace
- Separate Leaflet panes for airspace, aeronautical points, route lines, and
  route handles
- Point-feature clicks that create one anchored real waypoint at the exact
  published coordinate without triggering the empty-map click handler
- Information-only area features that cannot become waypoints
- Distinct anchored waypoint presentation and disabled dragging
- A detach action that preserves the waypoint coordinate
- Pure state-level enforcement that anchored waypoints cannot move
- Tests for repository filtering/provenance, layer visibility, anchoring,
  detachment, and movement protection

## Persistence contract

The `FlightPlan` stores real waypoint coordinates and compact anchor
provenance. It does not store the aeronautical overlay dataset or resolve route
coordinates from the currently loaded dataset. Shaping points remain separate
geometry-only route inputs.

## Deliberately excluded

No operational dataset, AIXM importer, permanent flight-plan persistence,
automatic AIRAC updating, vertical-limit model, or large-dataset spatial index
is included yet. The default repository is empty. A query-parameter-gated
synthetic dataset exists only for development and is explicitly marked not for
navigation.

