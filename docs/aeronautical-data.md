# Aeronautical data and waypoint anchoring

## Boundaries

Aeronautical features are external overlay data and are not part of a
`FlightPlan` by default. The UI consumes normalized WGS84 features through the
`AeronauticalDataRepository` interface. A future AIXM 5.1, JSON, SQLite, or
remote implementation must translate its source representation at that
boundary.

The normalized feature union distinguishes point features from area features:

- aerodromes, reporting points, navaids, and designated points are point
  features and may be waypoint anchors;
- CTR, TMA, restricted, danger, prohibited, and other airspace features are
  areas and provide map information only.

Source-specific identifiers remain opaque. Render geometry contains WGS84
latitude and longitude only; no Leaflet or projected coordinates enter the
domain model.

## Dataset provenance

Every feature reference identifies an exact dataset revision with:

- provider and dataset IDs;
- human-readable source name;
- AIRAC cycle where applicable;
- effective start and end timestamps;
- optional dataset revision and feature-version IDs.

This generic metadata can carry normalized AIXM time-slice identity without
making the rest of the application depend on AIXM types.

## Anchored waypoint contract

Clicking an aeronautical point creates a new real waypoint with a new internal
route UUID. Its `position` is copied from the normalized published feature,
not from the pointer event. The waypoint also stores an anchor containing the
feature and dataset reference together with published identifier/name
snapshots.

`Waypoint.position` is always the coordinate used by route and navigation
calculations. Looking up the anchor is optional and must never silently replace
that coordinate. Consequently, a saved route remains geometrically stable if
the source is unavailable or a future AIRAC cycle moves the feature.

Anchored waypoints are not draggable. The pure waypoint state helper also
rejects an attempted move, so the constraint does not depend only on Leaflet.
Detaching removes the anchor while preserving ID, name, and position. The
result is a normal free waypoint.

The same source feature may be anchored more than once. Source feature IDs must
therefore never be reused as route waypoint IDs.

## Map interaction and layers

Aeronautical point and area clicks do not bubble to the empty-map waypoint
handler. Point clicks add one anchored waypoint. Area clicks may show feature
information but cannot add a waypoint.

Layer visibility is presentation state, independent of the `FlightPlan`.
Aerodromes, reporting points, navaids/designated points, and airspace have
independent controls and minimum zoom levels. Viewport queries occur after map
movement and are cancellable; repository implementations are expected to use
spatial indexing and appropriate caching for large datasets.

## Current repository configuration

No operational aeronautical dataset is configured by default. The application
therefore shows the layer controls and an explicit no-dataset status without
displaying invented operational features.

During development only, adding `?aeroDemo=1` to the local URL enables a small
synthetic dataset around the initial map view. Every source label and feature
name identifies it as synthetic and not for navigation. It exists only for UI
and interaction verification.

