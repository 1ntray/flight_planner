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
- CTR, TMA, CTA, TIA, TIZ, restricted, danger, prohibited, and other airspace features are
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

Communication data is modeled separately. A `CommunicationService` contains
one or more exact published MHz strings and associations to aerodromes and/or
airspaces. ATIS is aerodrome-associated. TWR/AFIS may additionally be linked to
the matching CTR/TIZ when the source callsign makes that relationship unique.
An `AtsUnit` may be shared by services. Frequencies are therefore not flattened
into aerodrome or airspace metadata.

Published ACC sector coverage is represented separately as `AtsServiceArea`.
Each volume references its ATS unit and communication service, retains WGS84
lateral geometry plus semantic vertical limits, and is queryable without being
rendered as regulatory airspace. This allows future route-frequency selection
to distinguish Polaris sectors instead of treating the broad CTA as if it had
one frequency.

## Airspace and vertical limits

`AirspaceDetails` retains published name/type, class, lower and upper limits,
semantic source geometry, communications, remarks, and source references.
Vertical limits are a tagged union for SFC/GND, altitude with unit and datum,
flight level, MSL, UNL, and explicitly unresolved values. They are never
silently converted into a single feet number.

The lightweight area feature contains WGS84 render polygons for viewport
queries and Leaflet. Detailed geometry separately retains geodesic segments,
arcs, circles, sectors, or published references so future importers need not
discard source semantics merely to render a layer.

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

## Reporting-point shaping anchors

A route-shaping point may independently snap to a published **reporting point**.
This is geometry-only: it does not create a real waypoint or a navlog leg.
The shaping point stores its own reporting-point-specific AIRAC reference and a
WGS84 coordinate snapshot, so a later dataset change cannot alter a saved
route. Aerodromes, navaids, and designated points are deliberately excluded
from shaping-point snapping.

In Edit route mode, releasing an existing shaping handle or a newly dragged
route-line handle within the display snap radius of a visible reporting point
commits that published coordinate and provenance. Releasing it elsewhere makes
the point free; the selected shaping-point popup also offers explicit detach.

## Map interaction and layers

Aeronautical point and area clicks do not bubble to the empty-map waypoint
handler. In Select/Edit mode, point and area clicks show feature information.
When areas overlap at the pointer position, one tooltip and popup list every
rendered area at that WGS84 position in CTR/TIZ/TIA/TMA/CTA order. Leaflet's
individual SVG stacking order therefore does not decide which airspace the
user sees.

Selecting an aerodrome in Select mode opens its basic published-aerodrome
information: identity, ARP, elevation, active dataset/AIRAC provenance, and
published TODA/LDA values per available runway direction. Details are resolved on demand through
`AeronauticalDataRepository.getFeatureDetails`, so the map overlay remains
lightweight. An aerodrome-anchored route waypoint exposes an **Aerodrome info**
action in its waypoint popup; this reaches the same information even when the
route handle visually sits above the aerodrome marker. The popup uses the
waypoint's saved coordinate snapshot while its published details are looked up
by its saved source reference.

Published communication services appear on aerodrome and airspace information
popups but do not currently populate the OFP automatically. The planner UI
shows only frequency assignments from 118.000 through 137.000 MHz, inclusive.
Assignments outside that range remain in the normalized dataset and import
report for source traceability, but are not presented to the user. The
international emergency frequency 121.500 MHz is also retained but omitted
from normal flight-planning displays.

Live operational data such as METAR, TAF, NOTAMs, or weather products is not
part of `AeronauticalDataRepository` or the persisted `FlightPlan`. A future
popup section may compose one or more dedicated, time-aware operational-data
providers alongside the published aeronautical details without coupling either
data source to route geometry or anchor persistence.
In explicit Add waypoint mode, point clicks add one anchored waypoint at the
published coordinate. Area features remain information-only and cannot add a
waypoint in any mode.

Layer visibility is presentation state, independent of the `FlightPlan`.
Aerodromes, reporting points, navaids/designated points, and airspace have
independent controls and minimum zoom levels. Airspace has subordinate filters
for CTR/TIZ, TMA/TIA, CTA, and other airspace. CTA is initially hidden because
its broad volumes can obscure local VFR layers. Viewport queries occur after
map movement and are cancellable; repository implementations are expected to
use spatial indexing and appropriate caching for large datasets.

## Current repository configuration

The default repository loads a local normalized Avinor eAIP dataset for the AD
2 aerodromes in the selected edition, effective 11 June 2026. The browser
never parses eAIP HTML and never contacts Avinor when the planner starts. Each
aerodrome is exposed as a normal aerodrome point, so the existing overlay and
waypoint-anchor behavior is unchanged. The same import now includes published
AD 2.17 ATS airspace and AD 2.18 communication facilities for all 53 imported
AD 2 aerodromes, machine-readable TMA/CTA volumes from ENR 2.1, and TIA plus
Polaris ACC sectorization from ENR 2.2. Multiple
published volumes remain separate features with their own vertical limits; for
example, all three Bardufoss TMA volumes are retained at lower limits of 4500,
5500, and 6500 FT AMSL. Polaris sectorization is stored as data-only ATS service
coverage rather than map airspace. The dataset also contains 218 unique reporting points
whose coordinates are printed in the selected edition's VAC PDFs, covering 23
aerodromes. They remain usable with any chart layer hidden.

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
2.1, AD 2.2, AD 2.12, the standard declared-distance table in AD 2.13, AD 2.17,
and AD 2.18. The separate `Reduced (Alternate) Take-off PSN` table is
intentionally ignored.
Missing optional values become `null` with an importer warning; malformed
required values fail that aerodrome's import but do not discard other valid
aerodromes. A malformed optional operational section is reported without
discarding valid aerodrome/runway data. The importer also reads the fixed
edition's ENR 2.1 and ENR 2.2 once and keeps each published TMA, CTA, TIA, and
Polaris service-sector vertical volume separate.
The generated report records every warning and failure.

Coordinate-list ENR boundaries are normalized directly. Published references
such as "along the border between Norway and Sweden" are resolved offline from
an edition-pinned prepared snapshot of Kartverket's official *Norges maritime
grenser* Riksgrense and agreed maritime-delimitation WFS features. The normalized
source geometry retains the original AIP reference, while the area feature stores
the resolved WGS84 render path; feature provenance records both Avinor and
Kartverket. A strict 0.5 NM
endpoint tolerance prevents a nearby but unrelated boundary from being guessed.
The checked-in preparation step simplifies survey-level line detail to a maximum
0.02 NM presentation tolerance so repeated vertical volumes do not bloat the
browser bundle; published AIP endpoints are always retained exactly.
Arcs and coast references remain explicit importer errors until an authoritative
resolver exists for them.

The configured edition produces 206 rendered airspace volumes: 96 TMA, 38 CTA,
20 TIA, and 52 AD 2 CTR/TIZ volumes. All 38 Polaris ACC service-area volumes
and their sector frequencies have resolved WGS84 query geometry. This includes
the complete border-referenced northern CTA, all three Kirkenes TMA volumes,
and the border-referenced southern service sectors.

The ENR 2.1 Polaris CTA frequency aggregate is retained for source traceability
but is not associated with every CTA polygon. Runtime selection uses the ENR
2.2 service-area polygons: the containing CTR/TIZ/TIA/TMA service wins, then
the closest overlying TMA/TIA, then the geographically and vertically relevant
Polaris sector. Only 118.000–137.000 MHz is displayed and 121.500 MHz is omitted.
Navlog frequency changes are derived from the WGS84 route and calculated
altitude profile; multiple changes on one leg overflow into following FREQ cells.

Parser tests use checked-in fixtures and do not require Avinor to be online. To
explicitly retrieve the configured edition and regenerate the local JSON dataset
and import report for every AD 2 aerodrome, run:

```sh
pnpm aero:import
```

The authoritative boundary snapshot is prepared separately and is never
downloaded by the browser runtime:

```sh
pnpm aero:prepare:boundaries
```

To import only ENDU while developing the parser, run:

```sh
pnpm aero:import:endu
```

The importer can also run without a network connection by providing a saved AD
1.3 index, a directory of `<ICAO>.html` AD 2 pages, and an explicit retrieval
timestamp: `--input-index`, `--input-directory`, and `--retrieved-at`. A full
offline import additionally reads `ENR-2.1.html` and `ENR-2.2.html` from that
directory.

The reviewed ENDU reporting-point fixture can be refreshed without replacing
the nationwide operational dataset with:

```sh
pnpm aero:build:operational-slice
```

These importers do not scrape Avinor in the browser. Missing values remain
unavailable; malformed required coordinates, limits, classes, or frequencies
are explicit import errors or warnings according to whether the affected
source section is required for the core aerodrome record.

Nationwide reporting-point input is stored in the edition-specific prepared
file `tools/aeronautical/avinor-eaip/prepared/vac-reporting-points-2026-06-11.json`.
It records each VAC source URL and only name/coordinate pairs printed as text
in the source PDF. The importer supports multiple pairs on one extracted text
line and deduplicates a point printed on more than one VAC page while retaining
both source references.

The selected edition publishes 47 VAC PDFs for 46 aerodromes. Twenty-three
aerodromes provide 218 unique machine-readable published coordinates. Another
23 VACs do not contain a published coordinate table, and seven AD 2 aerodromes
publish no VAC. These 30 cases are explicit import-report warnings. No
graphical point is assigned a coordinate until a separately validated,
georeferenced-VAC workflow can mark it as `derived-from-georeferenced-vac`.

## VAC preparation boundary

VAC PDFs remain presentation sources, not structured aeronautical geometry.
`VacChartManifest` defines an AIRAC-versioned, pre-warped EPSG:3857 XYZ tile
set, WGS84 bounds, zoom range, opacity, retained ground-control points, optional
residual validation, and source provenance. Manifest validation requires at
least four retained control points and a valid XYZ template.

No VAC raster is enabled in the current dataset yet. The ENDU PDF contains no
GeoPDF georeferencing, so publishing a visually guessed overlay would violate
the data-validation rules. The preparation step must render the PDF, establish
verified graticule control points, warp once offline (for example with GDAL),
validate residual/alignment error, and emit local Web Mercator tiles plus a
manifest. Runtime support can then query only nearby manifests above their
minimum zoom and expose visibility/opacity controls without changing the map
CRS or any navigation calculation.
