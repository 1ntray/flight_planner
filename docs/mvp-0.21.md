# MVP 0.21

> Historical milestone record. This document preserves the MVP 0.21 scope;
> [`current-state.md`](current-state.md) is the authoritative description of
> the current application. Factual references below have been updated where
> they describe the active checked-in data or runtime behaviour.

## Goal

MVP 0.21 turns the planner's map into a more complete VFR planning workspace.
It adds an official aeronautical chart option, AIRAC-versioned structured
aeronautical information, reporting-point-aware route shaping, manual MSA
planning, and faster keyboard-oriented route editing without changing the
waypoint-first navigation architecture established by earlier releases.

This remains a planning application. Published chart and eAIP information is
not live operational data and does not replace current AIP, NOTAM, weather, or
pre-flight briefing sources.

## Planning workflow

The map has explicit **Select**, **Edit route**, and **Add waypoint** modes.
Route and planning edits support undo and redo, while the command palette and
shortcut reference make the available operations discoverable without relying
on map popups alone.

Sequential entry workflows are available for waypoint names, planned
altitudes, minimum safe altitudes, and manual per-leg winds. Text-field edits do not continuously
commit partial numeric values: altitude and MSA values are committed at the
defined field boundary so route calculations are not repeatedly invoked for
each typed character. Planner shortcuts remain disabled while a form control
or editable element has focus.

Per-leg manual wind overrides are edited in the selected-leg map popup or the
right-side Altitude schedule, not in the navlog. Blank fields display the
effective loaded-forecast or route-wide manual default in grey. `R` toggles Add
waypoint mode, `W` focuses wind for the selected leg, and `Shift+W` starts the
sequential wind editor.

Waypoint insertion, shaping-point movement, and altitude-target editing retain
the active route-editing context where appropriate. Canonical route input is
still the ordered real-waypoint array plus per-leg shaping points; selection,
popup state, drag positions, history bookkeeping, and active tools are UI
state rather than flight-plan geometry.

## Manual minimum safe altitude

Each adjacent real-waypoint leg may store an optional pilot-entered MSA in feet
MSL. The value is displayed in the navigation log but does not alter route,
wind, magnetic, or aircraft-performance calculations.

For assessment, the selected leg can display a semi-transparent corridor one
nautical mile either side of its complete shaped route. The corridor is
derived using WGS84 geodesic offsets and is only a visual aid. The application
does not inspect terrain or obstacle data and does not calculate an MSA
automatically. A missing MSA, or an MSA above the planned altitude, produces a
review warning rather than invalidating the route.

## Base maps and chart rendering

The Leaflet map remains in EPSG:3857 and offers two mutually exclusive base
maps:

- Kartverket Norgeskart topo; and
- Avinor Norway VFR Aeronautical Chart ICAO 1:500 000.

Avinor's ArcGIS service performs the ICAO chart's Lambert-to-Web-Mercator
rendering on the server. The application requests stable, edition-keyed,
high-density export tiles and uses a narrowly scoped, bounded service-worker
cache to improve repeat loading. The user acknowledges the chart's published
usage warning once per browser session.

Base-map selection and cached raster tiles are presentation concerns only.
Waypoint positions, route geometry, geodesic distance, true track, magnetic
variation, wind, and performance calculations remain WGS84 domain data and are
not coupled to the displayed map projection.

## Structured aeronautical data

The default `AeronauticalDataRepository` loads the normalized local Avinor eAIP
dataset `avinor-eaip-2026-09-03`, effective 3 September 2026 (AIP AMDT 05/2026).
The browser neither parses eAIP HTML nor contacts Avinor during normal startup.
The active dataset contains:

- 53 AD 2 aerodromes with ARP, elevation, runway information, and standard
  declared distances where published;
- 206 rendered airspace volumes: 19 CTR, 33 TIZ, 96 TMA, 20 TIA, and 38 CTA;
- 37 data-only Polaris ACC service-area volumes with resolved WGS84 geometry;
- 19 ATS units and 219 communication services containing 477 source frequency
  assignments; and
- 218 reporting points carried forward from separately reviewed VAC coordinate
  material, covering 23 aerodromes.

Detailed aerodrome, airspace, communication, and reporting-point concepts
remain separate normalized domain types. Frequencies belong to communication
services that may reference aerodromes, airspaces, or both; they are not
flattened into generic feature metadata.

Airspace vertical limits retain their published meaning, including GND/SFC,
altitudes, flight levels, and unlimited limits. Multiple vertical volumes with
the same published airspace name remain separate features. At a location where
areas overlap, the cursor tooltip and information popup list every containing
airspace in a stable operational order instead of allowing SVG draw order to
select one arbitrarily.

The Airspace layer has subordinate CTR/TIZ, TMA/TIA, CTA, and other-airspace
filters. CTA is available but initially hidden. Polaris ACC sector coverage is
data-only and is not drawn as another airspace layer.

Normal planning popups show only assignments from 118.000 through 137.000 MHz.
The emergency monitoring frequency 121.500 MHz and assignments
outside that range remain in the normalized dataset and import report for
traceability but are not displayed as routine planning frequencies.

## Reporting points and route shaping

Reporting points are independent WGS84 repository features and remain usable
when the VAC or ICAO raster layers are hidden. In Edit route mode, a shaping
point can snap to a visible reporting point and store a compact anchor snapshot
containing the published identity, coordinate, dataset revision, and source
provenance.

This attachment changes only the shaped geometry of the existing leg. It does
not create a real waypoint or navigation-log leg. Dragging the shaping point
away detaches it, while the stored coordinate snapshot prevents a later AIRAC
dataset from silently moving a saved route.

## Import and provenance

Avinor HTML and VAC material are processed by Node-only importers outside the
browser. Provider-specific parsing is followed by validation, normalization,
an import report, and generation of the local repository dataset. Tests use
local fixtures and do not require Avinor to be online.

Dataset provenance includes provider, source, effective edition, revision,
retrieval/import timestamps, and importer version. Feature-level provenance
retains relevant AIP sections, source documents, references, and stable
semantic identities. Generated DOM identifiers are not treated as stable
aviation-data identities.

Missing values remain unavailable. Malformed or ambiguous source values become
explicit importer warnings or errors and are not inferred from nearby features
or chart artwork.

## Known data limitations

The active import resolves WGS84 render/query geometry for all 206 airspace
volumes and all 37 Polaris service-area volumes, including the
border-referenced areas. The importer still does not invent geometry: future
source features that require unsupported arcs, coast references, or other
unresolvable semantics must remain explicit import errors until an authoritative
resolver is available.

Avinor publishes 47 VAC PDFs for 46 of the imported aerodromes. Twenty-three
aerodromes provide machine-readable reporting-point coordinate tables. Another
23 VACs contain no such table, and seven aerodromes have no published VAC in
the selected edition. Graphical-only reporting points remain unavailable until
a separately validated georeferenced-VAC workflow can record them with
`derived-from-georeferenced-vac` provenance.

The current approved dataset now exposes 47 independently validated VAC
rasters for all 46 aerodromes that publish them in the pinned edition. They use
the runtime visibility, zoom-threshold, and opacity controls introduced around
this milestone. Each chart was enabled only after its offline georeferencing,
source identity, and independent alignment checks passed.

## Persistence and architecture boundaries

The saved flight-planning document remains schema version 9. It may persist
manual per-leg MSA and reporting-point anchor snapshots as planning input, but
it does not embed the complete aeronautical dataset, calculated legs, expanded
geometry, chart tiles, repository results, or map-layer state.

The ordered `FlightPlan.waypoints` array remains the source of truth for real
route points. Calculated legs continue to be derived through the pure WGS84
calculation layer. Leaflet, Web Mercator, raster pixels, and ArcGIS geometry
remain presentation-only and never supply navigation distances or tracks.

## Deployment and verification

The Vite application can be deployed to GitHub Pages through the repository's
deployment workflow while retaining the local one-click development launcher.
The production base path and service-worker scope are configured for the
deployed project path.

MVP 0.21 is covered by focused tests for map-source requests, aeronautical
normalization and repositories, airspace and vertical-limit parsing,
communication filtering, reporting-point anchoring, MSA geometry/state, popup
positioning, shortcuts, history, and import fixtures. TypeScript compilation,
the complete Vitest suite, and a production Vite build remain required release
checks.

## Deliberately excluded

MVP 0.21 did not originally add operational weather. The current application
now provides explicit-load MET Norway METAR/TAF and surface-model data through
the separate runtime boundary documented in `current-state.md`; it still has no
live NOTAM, runway-state, or airspace-status feed. It does not calculate terrain
or obstacle clearance, infer graphical reporting-point coordinates, render an
unvalidated VAC overlay, or replace the pilot's obligation to verify current
operational information. AIRAC discovery is build-time automation only: it can
prepare a candidate pull request, but it cannot activate or merge an edition
without human review.
