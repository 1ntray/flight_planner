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

Repository-level dataset metadata additionally records the selected edition,
source reference, retrieval timestamp, and import timestamp. Feature references
retain the smaller dataset identity so waypoint anchors do not embed the full
import record.

This generic metadata can carry normalized AIXM time-slice identity without
making the rest of the application depend on AIXM types.

## Detailed aerodrome data

The map-facing `AeronauticalPointFeature` remains lightweight. OFP-relevant
aerodrome data is stored separately as `AerodromeDetails` and is resolved with
`AeronauticalDataRepository.getFeatureDetails`. The current model contains:

- ICAO identifier, published name, ARP, and aerodrome elevation;
- physical runway length;
- runway-direction designator and published true bearing;
- standard TORA, TODA, ASDA, and LDA per runway direction; and
- traceable source aerodrome, AIP sections, and source reference.

Frequencies are deliberately excluded. A later communication-service model
will be able to relate a service to an aerodrome, airspace, or both without
making frequencies an aerodrome-owned property.

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
handler. In Select/Edit mode, point and area clicks show feature information.
In explicit Add waypoint mode, point clicks add one anchored waypoint at the
published coordinate. Area features remain information-only and cannot add a
waypoint in any mode.

Layer visibility is presentation state, independent of the `FlightPlan`.
Aerodromes, reporting points, navaids/designated points, and airspace have
independent controls and minimum zoom levels. Viewport queries occur after map
movement and are cancellable; repository implementations are expected to use
spatial indexing and appropriate caching for large datasets.

## Current repository configuration

The default repository loads a local normalized Avinor eAIP dataset for the AD
2 aerodromes in the selected edition, effective 11 June 2026. The browser
never parses eAIP HTML and never contacts Avinor when the planner starts. Each
aerodrome is exposed as a normal aerodrome point, so the existing overlay and
waypoint-anchor behavior is unchanged.

During development only, adding `?aeroDemo=1` to the local URL enables a small
synthetic dataset around the initial map view. Every source label and feature
name identifies it as synthetic and not for navigation. It exists only for UI
and interaction verification.

## Avinor eAIP importer

The Node-only importer is under `tools/aeronautical/avinor-eaip`. It uses a
fixed edition configuration, semantic AIP section headings, published table
headers, and HTML rowspan/colspan expansion. Generated HTML element IDs and
the numeric suffixes in hidden eAIP markers are not identities.

The selected edition is discovered from AD 1.3. The importer includes AD 2
aerodromes and deliberately excludes AD 3 heliports. Each AD 2 page reads AD
2.1, AD 2.2, AD 2.12, and the standard declared-distance table in AD 2.13. The
separate `Reduced (Alternate) Take-off PSN` table is intentionally ignored.
Missing optional values become `null` with an importer warning; malformed
required values fail that aerodrome's import but do not discard other valid
aerodromes. The generated report records every warning and failure.

Parser tests use checked-in fixtures and do not require Avinor to be online. To
explicitly retrieve the configured edition and regenerate the local JSON dataset
and import report for every AD 2 aerodrome, run:

```sh
pnpm aero:import
```

To import only ENDU while developing the parser, run:

```sh
pnpm aero:import:endu
```

The importer can also run without a network connection by providing a saved AD
1.3 index, a directory of `<ICAO>.html` AD 2 pages, and an explicit retrieval
timestamp: `--input-index`, `--input-directory`, and `--retrieved-at`.
