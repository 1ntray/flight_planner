# Project conventions

## Source layout

- `src/domain` contains data-only TypeScript interfaces. Domain types do not
  depend on React, Leaflet, or calculation implementations.
- `src/calculations` contains pure functions. Calculation modules do not read or
  modify UI state.
- `src/app` contains the React application shell. Map and feature-specific UI
  code is grouped under `src/app/map` and `src/app/route`.
- Calculation tests live beside their modules as `*.test.ts` files.

## Route state

`FlightPlan` is the single source of truth for route input. Its ordered
`waypoints` array contains real navigation waypoints and defines the flight and
navlog leg order. Its `legShapes` collection contains optional ordered route
shaping points associated with a specific adjacent real-waypoint pair. Shaping
points are not waypoints and never create navlog legs.

A shaping point may optionally retain a reporting-point anchor snapshot. This
is not a real-waypoint anchor and does not change route-leg or navlog semantics:
it only records why a geometry point uses a particular published WGS84
coordinate. Dragging a shaping point away removes that optional anchor.

`sectorBoundaryWaypointIds` identifies intermediate real waypoints at which a
landing ends one flight sector and a new sector begins. It does not duplicate
waypoints, geometry, or calculated legs. Sectors are derived by slicing the
canonical waypoint order; the boundary airport is shared as the inbound TO and
outbound FROM waypoint. Merely anchoring a waypoint to an aerodrome does not
imply a landing because an aerodrome may be overflown.

A real waypoint may optionally contain an aeronautical-feature anchor. Its
stored WGS84 `position` remains the route's coordinate snapshot and is never
resolved dynamically from the current aeronautical dataset. The anchor records
the exact source dataset and feature identity. An anchored waypoint must be
detached before its position can be moved; detachment preserves its current
identity, name, and coordinate.

A `CalculatedLeg` is derived from each adjacent real-waypoint pair whenever it
is needed; calculated legs and expanded route geometry must not be stored or
independently updated as application state. This prevents waypoint, shaping,
and leg data from becoming inconsistent.

Domain collections are exposed as readonly arrays to calculation code. Pure
calculation functions return new values and do not mutate their inputs.

The top-level `App` component owns the `FlightPlan`, selected serializable
aircraft-definition snapshot, navigation, aircraft performance, and operational
loading/fuel input drafts,
forecast-source preference, and selected route-point
descriptor. Selection and
in-progress drag positions are UI state; calculated legs are not. UI consumers
call the pure calculation layer to derive legs from the latest route and
validated planning inputs.

Waypoint IDs are generated independently of waypoint names and remain stable
when markers move. Automatic names use `WP01`, `WP02`, and so on. The next name
continues after the highest generated name still in the route, preventing a
middle deletion from creating a duplicate name.

Waypoint names are editable navlog labels, not route identity. User-entered
names are trimmed, must contain between 1 and 32 characters, and need not be
unique because the same named point may legitimately appear more than once in
an ordered route. Renaming changes neither the stable waypoint ID nor geometry.
An anchored waypoint may be renamed without detachment; its published
identifier remains available in the separate anchor snapshot.

In Add waypoint mode, visible aeronautical source markers are intentionally
above existing route markers. This allows the same aerodrome or reporting point
to be selected repeatedly for separate anchored waypoints at its published
WGS84 coordinate. Clicking an existing real route waypoint also creates a new
waypoint at that exact stored coordinate; it preserves the source anchor when
the clicked waypoint is anchored.

## Map

- Select/Edit is the default map tool. Empty-map clicks do not mutate the route
  unless explicit Add waypoint mode is active.
- Add waypoint and altitude-target placement are mutually exclusive tools.
  Altitude placement cannot create a waypoint, and Escape returns to Select/Edit.
- Waypoint, shaping-point, and leg selection are transient UI state. A selected
  leg stores endpoint IDs and one snapped WGS84 route location for map actions;
  it is not persistent route or calculation state.
- Keyboard shortcuts are ignored while an input, textarea, select, or editable
  element has focus.
- Map-popup form text is transient UI state until its documented commit action.
  Leg altitude commits on blur or Enter, preventing partial numeric input from
  repeatedly updating planning calculations.
- Planning altitudes above 60,000 ft are rejected before route integration.
- MSA is an optional, manual ft-MSL value attached to an adjacent real-waypoint
  leg. The selected-leg 1 NM corridor is a WGS84 visual aid around shaped
  geometry only; it neither derives terrain/obstacle elevation nor changes
  navigation or performance calculations. Missing MSA and MSA above planned
  altitude are warnings rather than input errors.
  Development builds warn in the browser console when a synchronous planning
  calculation stage takes at least 100 ms; production builds do not emit these
  measurements.
- Before each synchronous planning stage, the application stores a compact
  diagnostic breadcrumb containing the stage name and numeric route-complexity
  summary, but no coordinates. Successful completion clears it. If a browser
  renderer is force-closed during a stage, the next launch enters calculation
  recovery mode instead of automatically repeating that work. This breadcrumb
  is diagnostic state and is not route or planning persistence.
- Map-level popups keep one Leaflet instance and update its WGS84 position
  without reopening it. Selected waypoint and shaping-point popups use the same
  temporary drag position as their markers, while canonical coordinates still
  commit only on `dragend`.
- Base-map sources are isolated in `src/app/map/baseMapSource.ts`. Base-map
  selection is local presentation state in `FlightMap`; it is not part of the
  flight plan or calculation inputs.
- The Avinor ICAO chart is rendered by its ArcGIS MapServer as stable,
  edition-keyed EPSG:3857 export tiles. A bounded browser cache may retain only
  those presentation tiles. Its native Lambert projection is never introduced
  into waypoint, route, magnetic, wind, or performance calculations.
- Aeronautical overlay components consume normalized domain features through
  an `AeronauticalDataRepository`. They do not consume AIXM, provider JSON,
  database rows, or Leaflet geometry as domain data.
- Aeronautical point features are overlay data until explicitly anchored.
  Aeronautical area features are information-only and never create waypoints.
- In Add waypoint mode, clicking an airspace area creates one normal free
  waypoint at the clicked WGS84 coordinate. The area does not open its
  information popup or block the deliberate map-add action.
- Communication services relate frequencies to aerodromes and/or airspaces;
  frequencies are not owned by generic map features or persisted FlightPlans.
- ATS service areas are separate, data-only coverage volumes. They associate a
  published unit/service/frequency with WGS84 lateral geometry and semantic
  vertical limits for future frequency selection, but are not regulatory
  airspace, map features, or waypoint anchors.
- Airspace vertical limits retain published semantics such as GND, altitude,
  flight level, and UNL. Map render polygons may be derived, while detailed
  source geometry and provenance remain available for verification.
- VAC rasters are offline-prepared, AIRAC-versioned presentation layers in
  EPSG:3857. Reporting points remain independent WGS84 repository features.
- A free waypoint may be dropped onto a visible aeronautical point to anchor it.
  The screen-space hit radius is only a map interaction aid: the commit stores
  the feature's published WGS84 coordinate and compact source provenance in the
  canonical waypoint. It never derives route geometry or navigation values from
  pixels.
- A free waypoint may also be dropped onto another real route waypoint. This
  screen-space snap commits the target's exact stored WGS84 coordinate. When
  the target is anchored, the dropped waypoint copies that anchor snapshot;
  otherwise it remains a free waypoint at the shared coordinate. Reusing a
  point therefore remains explicit ordered `waypoints` data rather than a
  graphical alias. Route markers at a shared coordinate use the participating
  sector colours as a display-only split fill.
- Selecting a waypoint at a shared exact coordinate exposes a transient popup
  pager for the other route occurrences. The popup's sector routes and
  departure/arrival/enroute roles are derived from `deriveFlightPlanSectors`;
  they are not persisted selection or FlightPlan state.
- Map route lines with identical displayed geometry use alternating sector
  colour stripes. Matching is direction-independent because a drawn line has
  no directional visual form; different shaping geometry remains separate.
- Leaflet latitude/longitude from click and drag events may update waypoint
  positions, and waypoint positions may be projected for marker/polyline display.
- Navigation distance and track must never be calculated with Leaflet geometry,
  pixel distances, tile coordinates, or Web Mercator.
- A marker's in-progress drag position is local map presentation state. It may
  temporarily replace that real or shaping point when rendering the marker and
  polyline, but it is committed to `FlightPlan` only on `dragend` and is never
  stored as a second route.
- Dragging an interactive route segment creates a temporary shaping-point draft
  associated with that real leg and segment index. It is committed once on
  pointer release. Leaflet supplies WGS84 input coordinates but never supplies
  navigation distances or tracks.
- Pressing and releasing a route segment without crossing the UI drag threshold
  creates only a transient insertion candidate. Its coordinate is snapped to
  the bounded WGS84 geodesic for the selected geometry segment. Confirming the
  action atomically inserts a normal real waypoint into `waypoints` and splits
  any existing `legShapes` around that segment; the candidate itself is never
  persisted.
- Raster tile seam investigation and workaround policy are documented in
  [`map-rendering.md`](map-rendering.md).

## Units and angles

- Positions use decimal degrees in WGS84 latitude and longitude.
- Geodesic distance is calculated in metres and converted with exactly
  `1 NM = 1852 m`.
- True tracks are degrees normalized to the half-open interval `[0, 360)`.
- A track is `null` when the two positions are effectively identical because a
  direction is undefined.
- Positions separated by 1 mm or less according to the WGS84 inverse result are
  treated as effectively identical. Their reported distance is exactly `0`.
- Wind, heading, speed, and elapsed-time conventions are documented in
  [`navigation-conventions.md`](navigation-conventions.md).
- Aircraft performance units, formulas, and vertical integration are documented
  in [`aircraft-performance.md`](aircraft-performance.md).

## TypeScript and testing

Strict TypeScript is required. New domain calculations should be pure and covered
by Vitest tests, including nominal values, boundary cases, and degenerate input.
Non-UI helpers for route naming, formatting, and totals should also have focused
unit tests. Snapshot tests are not a default requirement.
Run `pnpm typecheck` and `pnpm test` before merging changes.

## Persistence

- Saved planning files are versioned documents around the `FlightPlan`; they do
  not replace its canonical route semantics.
- Persistence stores semantic numeric planning inputs in their documented
  internal units, never HTML input strings.
- The selected aircraft definition is snapshotted in the document. Aircraft
  catalog data must not be consulted at calculation or load time in a way that
  silently changes an existing plan.
- Intermediate sector-stop inputs contain only airport elevation, weather, and
  a non-negative stop duration. Calculated onward departure times, sector legs,
  and navlog totals remain derived.
- Operational inputs store total ramp fuel, people/baggage loading, reserve and
  extra-fuel policy, intermediate T&G/full-stop choices, optional full-stop
  refuelling targets, and an optional alternate waypoint/environment snapshot.
  Tank allocation, fuel burn, mass, moment, CG arm, OFP progress, requirements,
  endurance, and minimum-flight values remain derived.
- Calculated legs, expanded geometry, forecast responses, loading state,
  selection, and drag state are derived or transient and must not be saved.
- Imported JSON crosses an untrusted input boundary and must be validated by
  pure code before it reaches React state.
- Anchored waypoint coordinates and complete source provenance are loaded from
  the saved snapshot. Loading never substitutes a coordinate from the currently
  configured aeronautical repository.
- Browser autosave uses the same versioned document and validation boundary as
  file persistence. It retains the last valid document while a form draft is
  invalid and never persists the draft's raw text-field representation.
