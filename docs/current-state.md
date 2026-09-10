# Current state

This document is the concise source of truth for the current Flight Planner
implementation. Detailed calculation and data contracts remain in the linked
documents; historical MVP documents record milestone scope rather than the
complete current product.

For detailed rules, see [project conventions](conventions.md), [navigation
conventions](navigation-conventions.md), [aircraft performance](aircraft-performance.md),
[aeronautical data](aeronautical-data.md), [AIRAC updates](airac-updates.md),
[VAC preparation](vac-chart-preparation.md), and [flight-plan
persistence](flight-plan-persistence.md).

## Product purpose and safety boundary

Flight Planner is a browser-based VFR planning aid centred on an interactive
map and an OFP-oriented navigation log. It helps prepare route, altitude, wind,
fuel, loading, and communication planning data. It is not an operational
briefing system and does not replace current AIP, NOTAM, runway-performance
data, or pilot judgement. Airport weather is source data for explicit pilot
review and selection, not a go/no-go decision.

Published aeronautical data and fetched weather are distinct sources. Neither
changes a saved route coordinate or silently becomes a new planning input.

## Route and waypoint model

FlightPlan.waypoints is the canonical ordered input for real navigation
waypoints. Adjacent real waypoints define navlog legs and flight-sector order.
Calculated legs, expanded geometry, timings, fuel, headings, and totals are
derived from it; they are never a competing source of route state.

legShapes holds ordered shaping points for an adjacent real-waypoint pair. They
alter displayed geometry and shaped distance, but do not create navlog waypoints
or rows. A sector boundary marks an intermediate real waypoint as a landing:
the inbound and outbound sectors share that same waypoint.

Waypoints can be free or anchored to a published aerodrome/reporting point.
Anchors retain a WGS84 coordinate snapshot and source provenance. The saved
coordinate remains authoritative if a later AIRAC edition changes or removes a
source feature. Anchored waypoints must be detached before moving. The same
source feature or exact position may be used repeatedly in an ordered route.

## Map and aeronautical data

The map is Leaflet/Web Mercator presentation only. WGS84 calculations do not
use pixels, Leaflet measurements, tile coordinates, or the map projection.
Kartverket Norgeskart topo and the Avinor ICAO 1:500 000 chart are optional
base maps; the latter is server-rendered into Web Mercator tiles and requires a
session acknowledgement.

The optional VAC layer contains 42 offline-prepared, independently validated
charts for 41 aerodromes. All active charts are compact, high-resolution,
pre-warped EPSG:3857 WebP images. Charts load only near their aerodrome and at
the configured zoom.
Source hashes, fit points, holdout residuals, thresholds, chart dates, and
source references remain in the normalized manifests and preparation reports.
VAC pixels remain presentation-only; charts without enough reliable control
points are deliberately not exposed.

The checked-in browser repository is Avinor eAIP avinor-eaip-2026-09-03,
effective 3 September 2026, revision **AIP AMDT 05/2026**. It contains:

- 53 AD 2 aerodromes;
- 206 rendered airspace volumes: 19 CTR, 33 TIZ, 96 TMA, 20 TIA, and 38 CTA;
- 37 resolved Polaris ATS service-area volumes, stored separately from
  regulatory map airspace;
- 19 ATS units, 219 communication services, and 477 published frequency
  assignments; and
- 218 reporting points from separately reviewed, carried-forward VAC
  coordinate material covering 23 aerodromes.

All active airspace and ATS service-area volumes have resolved WGS84 render or
query geometry. Aerodrome popups resolve published identity, elevation,
TODA/LDA, and communication data on demand. Airspace popups show published
limits and communication data; overlapping areas are handled together rather
than by SVG draw order. Reporting points use hover information rather than a
separate information popup.

## AIRAC/eAIP update model

The browser never fetches or parses Avinor eAIP. Node-only tools discover
edition history, import/normalize a candidate, validate it, and generate import
and semantic change reports. The edition pin and repository import are the
explicit active-edition selectors.

Discovery does not activate data. The local one-click updater and the weekly
GitHub workflow can prepare a reviewed candidate, but neither merges it.
Reviewing and merging the generated change is the approval boundary. VAC
reporting-point material is a separate review stream and is carried forward
with its original provenance until it is independently refreshed.

## Reporting points and route shaping

In Edit route mode, shaping points snap to visible reporting points and can be
detached. That attachment is geometry-only and stores a reporting-point
snapshot; it is not a real waypoint anchor. Real waypoints can be anchored to
an aerodrome or reporting point, including a point already used elsewhere in
the route. Shared positions have display-only split marker colours, and a popup
pager can cycle route occurrences at the same coordinate.

## Navigation calculations

The calculation layer uses WGS84 inverse geodesics. True track is the direct
initial geodesic azimuth between real leg endpoints. Shaping points instead
affect the summed WGS84 distance; they do not change the direct true track,
magnetic variation sample position, or wind-triangle track.

Wind direction is true direction **from**. The wind triangle returns explicit
no-solution data when crosswind exceeds TAS or forward groundspeed is not
positive. Automatic variation uses bundled WMM2025 within its 2025–2030
validity period; manual variation remains available. Calculations retain full
precision. The navlog uses a linked rounded display chain so displayed TT,
variation, MT, WCA, and MH add up, while underlying calculations remain
unrounded.

## Altitude and performance calculations

The supplied Zlin performance profiles integrate climb, cruise, and descent in
100 ft intervals with altitude-dependent TAS, phase fuel flow, WGS84 position,
and UTC wind sampling. A leg has a global/default planned altitude, an optional
per-leg override, a primary reach-by target, and an optional later end-altitude
target. Automatic climbs begin at FROM; automatic descents reach the requested
target at TO. Target positions are leg inputs, not waypoints.

Each sector descends to the calculated airport pattern altitude. The standard
pattern height is 1000 ft AGL, with the ENDU 1500 ft MSL exception. QNH and ISA
deviation default to 1013 hPa and 0 °C while remaining editable; anchored
aerodrome elevation is a blank-field fallback rather than an inserted value.

MSA is a manual optional ft-MSL value per real leg. A selected-leg 1 NM WGS84
corridor is a visual terrain/obstacle assessment aid only; the app does not
derive terrain or obstacle elevation. Blank MSA and MSA above planned altitude
produce warnings, not calculation errors.

## Wind and weather

Open-Meteo upper-air forecast winds are supported through a provider boundary.
The whole plan selects either **ECMWF IFS 0.25°** or **DWD ICON-EU**. Requests
use pressure-level wind and geopotential-height data; wind vectors are
interpolated in time and actual geopotential height. Performance routes sample
their climb/cruise/descent steps and permit one timing/position refinement.

Forecast loading is deliberate: the user must choose **Load forecast winds** or
refresh. Editing the route or relevant planning context makes a result stale;
stale forecast data is not applied. Forecast failures leave planning available.
Effective wind precedence is: manual wind for the adjacent real waypoint pair,
then a valid loaded forecast sample, then the route-wide manual wind fallback.

The selected upper-air forecast model and manual per-leg winds are persisted as
planning inputs. Fetched forecast responses, provider cache, retrieval state,
and live weather are runtime-only and are never persisted.

Airport operational weather is a separate MET Norway provider boundary, not an
AIRAC or upper-air-wind feature. The airport panel explicitly loads METAR/TAF
from Tafmetar and surface model data from Locationforecast 2.0. It retains raw
TAC and parses only observation time, report type/AUTO/COR, wind, temperature,
and QNH. TAF wind is resolved against the airport's planned UTC context;
TEMPO, PROB, BECMG, and variable-wind ambiguity is shown rather than reduced to
a deterministic value. Locationforecast temperature and model MSL pressure are
linearly interpolated; wind is vector-interpolated. Forecast MSL pressure is
not labelled as observed QNH.

Wind, pressure, and temperature/ISA source selection is independent. Manual
values remain the saved editable defaults. A pilot may select METAR or TAF wind
(where deterministic), METAR QNH or forecast pressure, and METAR or forecast
temperature; temperature is converted to ISA deviation using aerodrome
elevation before performance calculations. Selecting unavailable data requires
review and never silently changes the selected source. Browser requests are
explicit load/refresh operations with cancellation, request de-duplication,
and short in-memory caching; no polling occurs. Weather attribution is shown
as MET Norway. Live data and source selections are runtime-only; reopening a
saved plan starts from the persisted manual planning values and makes no
weather request.

Per-leg wind overrides are entered from the selected-leg map popup, the
Altitude schedule, or the sequential wind workflow. Empty fields show the
effective loaded forecast or route-wide manual wind as a labelled grey default;
the navigation log remains output-only for wind.

## Frequency planning

Communication changes are derived automatically from shaped WGS84 route
geometry and calculated altitude. The planner samples the route, refines a
transition boundary, and selects eligible VFR frequencies with this priority:
containing CTR/TIZ/TIA/TMA, then the closest overlying TMA/TIA, then a
geographically and vertically relevant Polaris service area. IFR-only,
contingency, out-of-band assignments, and 121.500 MHz are retained for source
traceability but excluded from normal VFR planning display.

Changes are allocated to their originating navlog leg; multiple changes remain
in that leg's FREQ cell. A service change alone does not create a retune when
the selected numeric frequency is unchanged. Preferences for a service with
multiple eligible frequencies are browser-local settings, not part of the
flight-plan document or AIRAC dataset.

## Fuel planning

Operational planning derives fuel allocation, sector burns, OFP progress,
requirements, endurance, warnings, and minimum-flight values from the selected
aircraft snapshot, route performance, and editable loading inputs. The current
Zlin model has main/auxiliary tanks, burns auxiliary before main, includes the
7 L / 15 minute ground allowance before the first takeoff and after a full
stop, and distinguishes touch-and-go from full-stop operations.

Each landing airport can have a whole-number pattern plan. Each circuit adds
five airborne minutes and cruise-flow fuel, and produces a derived
airport-to-airport OFP pattern row without creating a route leg. A full-stop
refuel target resets the remaining trip-fuel horizon after that airport, so
preceding requirements do not include later sectors.

An optional alternate is an aerodrome snapshot selected from the repository.
Its calculated navigation line uses its planned altitude, but alternate
distance, time, and fuel requirements are pilot-entered. The alternate row is
shown only with the final primary sector.

## Mass and balance

The selected aircraft definition is snapshotted with the plan. The Zlin
operational model derives takeoff and landing mass, arm, and moment from empty
aircraft, seats, baggage, and tank-specific fuel. It applies supplied baggage,
takeoff-mass, and landing-mass limits and reports operational warnings. The OFP
summary presents mass and balance as kg, arm, and kgm, including separate main
and auxiliary fuel burn rows.

## Persistence

Export/import and the browser working draft use validated schema version 9
documents. The document stores semantic route, anchor/provenance snapshots,
navigation inputs (including selected forecast model and manual per-leg winds),
aircraft snapshot, performance inputs and override flags, operational inputs
and override flags, and the forecast-enabled preference. It migrates versions
1 through 8.

Calculated legs, geometry expansions, OFP rows, forecast responses, layer and
viewport state, selections, drag state, and raw text-field drafts are excluded.
The local working draft retains the last valid document during invalid editing.

## Deployment and local tooling

The Vite app deploys to GitHub Pages from main. Windows launch/stop scripts
support local development, and update-airac.cmd guides a local AIRAC update
without committing, pushing, or merging. Standard verification is pnpm
typecheck, pnpm test, and pnpm build.

## Known limitations

- No NOTAM, runway-state, or live airspace-status feed. Airport METAR/TAF and
  numerical surface forecast are explicit-load planning-review data, not a
  briefing or go/no-go service.
- No takeoff or landing runway-performance calculation.
- No PDF OFP generation; the on-screen navlog is OFP-oriented.
- No automatic terrain/obstacle scan or terrain-derived MSA.
- VAC coverage remains limited to 42 separately prepared and reviewed charts
  for 41 aerodromes. Charts whose current source or reliable controls are
  unavailable, or which fail the independent validation gate, remain excluded.
- No cloud sync, flight-plan submission, or autonomous operational decisions.
