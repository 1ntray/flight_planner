You are working in the Flight Planner repository.

Task:
Complete the ZLIN Z242L AFM runway-distance model by replacing the current
fail-closed `reviewed-digitization-required` placeholders with the reviewed
numeric nomogram representation supplied in `z242_afm_digitization_v1.json`.

IMPORTANT:
- Inspect current `main` first.
- The existing UTSA runway-performance architecture is already intentional.
- Do NOT redesign unrelated runway planning.
- Do NOT change the school-specific wind-component conventions:
  * runway heading for this worksheet = runway designator × 10 degrees;
  * wind components are rounded to whole knots before the 9-kt correction rule.
- Intermediate stops intentionally use one reviewed airport weather context for
  both landing and onward takeoff.
- Do NOT revert those conventions to earlier documentation/prompt wording.

Reference sources:
- ZLIN Z242L AFM Figure 5-10: take-off distance to 50 ft (15 m).
- ZLIN Z242L AFM Figure 5-26: landing distance from 50 ft (15 m), Hot brakes.
- Figure 5-25 must never be used.
- `z242_afm_digitization_v1.json` is the reviewed numeric representation for
  implementation. Do not redigitize the PDFs, refit the data, smooth it, or
  replace it with a polynomial/regression model.

The representative validation cases in the JSON were independently checked
against manual graph readings and agreed closely.

======================================================================
1. INSPECT CURRENT IMPLEMENTATION
======================================================================

Read at least:
- docs/current-state.md
- docs/runway-performance.md
- docs/aircraft-performance.md
- docs/flight-plan-persistence.md
- src/calculations/runwayPerformance.ts
- src/calculations/runwayPerformance.test.ts
- src/app/route/RunwayPerformanceSummary.tsx
- src/app/navigation/AirportInputs.tsx
- src/domain/runwayPerformance.ts
- src/domain/projectAircraftPerformanceProfile.ts

Run before changes:
- pnpm typecheck
- pnpm test
- pnpm build

======================================================================
2. CHANGE AFM INPUT FROM ISA DEVIATION TO ACTUAL OAT
======================================================================

The AFM nomograms use actual outside-air temperature.

Change the AFM distance input boundary from:

  pressureAltitudeFt
  isaDeviationC
  massKg

to:

  pressureAltitudeFt
  temperatureC
  massKg

Runway-performance density altitude remains a separate OFP display calculation:

  ISA deviation = round(OAT - 15)
  DA = PA + 120 * rounded ISA deviation

Do not feed density altitude into the AFM nomogram.

Do not replace actual OAT with the simplified ISA deviation.

Update all callers and tests accordingly.

======================================================================
3. IMPLEMENT THE REVIEWED NOMOGRAM INTERPOLATION
======================================================================

Load/translate the reviewed JSON data into a small deterministic TypeScript data
module. Runtime must not load the JSON over the network and must not require the
PDF or raster image.

A checked-in TypeScript constant generated/copied from the JSON is acceptable.

The implementation should remain pure and dependency-free.

Use piecewise-linear interpolation in the digitized nomogram coordinate system.

For each figure:

STEP A — TEMPERATURE AXIS
Map `temperatureC` to chart coordinate X by piecewise-linear interpolation
between adjacent `temperatureAxis.valuesC` / `temperatureAxis.x` points.

Reject temperature outside the figure's `chartBounds.temperatureC`.

STEP B — PRESSURE-ALTITUDE PANEL
For every published pressure-altitude line:

  yAtPaLine = slope * temperatureX + intercept

The published lines are at:
  0, 3000, 6000, 9000, 12000 ft.

Interpolate linearly in Y between the two bounding pressure-altitude lines for
the requested `pressureAltitudeFt`.

Reject PA outside 0..12000 ft.

Call the result `entryY`.

STEP C — ENTRY FRAME CHECK
`entryY` must remain within the printed distance-axis Y frame:
  min(distanceAxis.y) <= entryY <= max(distanceAxis.y)

Otherwise return an explicit outside-reviewed-envelope result.

STEP D — MASS AXIS
Map `massKg` to chart coordinate X with piecewise-linear interpolation through
`massAxis.valuesKg` / `massAxis.x`.

Reject mass outside the figure's chart mass bounds.

STEP E — WEIGHT-PANEL GUIDE SLOPE
Each `weightGuideLines` record is:
  { entryY, slope }

Interpolate slope linearly as a function of `entryY`.

For entryY between the first and last guide, use ordinary piecewise
interpolation.

At the small top/bottom portions of the printed chart outside the first/last
digitized guide, linearly continue the slope from the nearest two reviewed
guides ONLY while:
- temperature, PA and mass remain inside published chart bounds;
- entryY remains inside the printed distance frame; and
- finalY remains inside the printed distance frame.

This edge continuation is part of this reviewed digitization representation.
It is NOT permission to extrapolate outside the AFM chart.

STEP F — APPLY WEIGHT PANEL

  finalY =
      entryY
      + guideSlope * (massX - weightPanelReferenceX)

STEP G — FINAL FRAME CHECK
`finalY` must remain within the printed distance-axis Y frame.

If not, return outside-reviewed-envelope.

STEP H — DISTANCE AXIS
Map finalY to metres by piecewise-linear interpolation through:

  distanceAxis.y -> distanceAxis.valuesM

Note that Y increases downward while distance decreases. Implement the generic
interpolator so paired values may increase or decrease independently; the
coordinate key itself must be sorted/monotonic.

Return the resulting uncorrected AFM distance in metres with full precision.

Do not round in the calculation layer.

======================================================================
4. RESULT TYPES / FAILURE BEHAVIOUR
======================================================================

Replace the blanket:
  reviewed-digitization-required

with explicit results.

At minimum distinguish:
- available
- outside-reviewed-envelope
- invalid-input, if this project normally models invalid pure-calculation input
  as a result rather than throwing

Follow current project conventions.

Do not clamp:
- temperature;
- pressure altitude;
- mass;
- entryY;
- finalY;
- distance.

Do not extrapolate outside the printed chart bounds.

======================================================================
5. DATA PROVENANCE
======================================================================

Retain existing provenance and add/clarify:
- takeoff numeric model: reviewed digitization of AFM Figure 5-10;
- landing numeric model: reviewed digitization of AFM Figure 5-26 Hot brakes;
- representation revision: `z242l-afm-fig-5-10-v1` /
  `z242l-afm-fig-5-26-hot-brakes-v1`.

Do not expose or commit the source PDFs if they are currently local reference
material.

The numeric model itself may be checked in.

======================================================================
6. ACCEPTANCE TESTS
======================================================================

Use the validation cases from `z242_afm_digitization_v1.json` as INDEPENDENT
acceptance cases.

They must not be generated dynamically from the same implementation.

TAKEOFF FIG 5-10:
- PA 0 ft, OAT +20 C, mass 1050 kg -> approximately 534 m
- PA 3000 ft, OAT +15 C, mass 1050 kg -> approximately 666 m
- PA 3000 ft, OAT 0 C, mass 1000 kg -> approximately 541 m
- PA 6000 ft, OAT 0 C, mass 1000 kg -> approximately 700 m
- PA 9000 ft, OAT -10 C, mass 950 kg -> approximately 757 m
- PA 12000 ft, OAT -20 C, mass 900 kg -> approximately 823 m

LANDING FIG 5-26 HOT BRAKES:
- PA 0 ft, OAT +20 C, mass 1050 kg -> approximately 546 m
- PA 3000 ft, OAT +15 C, mass 1050 kg -> approximately 605 m
- PA 3000 ft, OAT 0 C, mass 1000 kg -> approximately 544 m
- PA 6000 ft, OAT 0 C, mass 1000 kg -> approximately 616 m
- PA 9000 ft, OAT -10 C, mass 950 kg -> approximately 639 m
- PA 12000 ft, OAT -20 C, mass 900 kg -> approximately 662 m

Use ±10 m as the graph-reading acceptance tolerance for these manually reviewed
cases. The implementation itself should be deterministic and normally produce
values much closer to the numeric representation.

Also test:
- exact axis nodes;
- interpolation between temperature ticks;
- interpolation between PA lines;
- interpolation between mass ticks;
- out-of-range temperature;
- PA below 0 and above 12000;
- mass below/above each figure's supported range;
- entryY outside chart frame;
- finalY outside chart frame;
- edge-guide continuation inside the printed frame;
- no NaN/infinity.

======================================================================
7. INTEGRATE INTO EXISTING DISTANCE SEQUENCES
======================================================================

Once AFM lookup returns available:

TAKEOFF:
Fig 5-10 uncorrected distance
-> existing rounded steady head/tailwind correction
-> corrected TOD
-> × 1.25
-> required TOD
-> compare with TODA

LANDING:
Fig 5-26 Hot-brakes uncorrected distance
-> existing rounded steady head/tailwind correction
-> RCC correction on complete distance
-> corrected LD
-> × 1.43
-> required LD
-> compare with LDA

Do not alter the already-reviewed correction order.

Do not apply RCC distance correction to takeoff.

Keep full precision internally and round only for display.

======================================================================
8. UI
======================================================================

The existing OFP-style runway-performance tables should now populate:

- Uncorrected take-off / landing distance
- Corrected take-off / landing distance
- Required TOD / LD
- TODA / LDA
- distance margin / exceedance state if the UI already has a place for it

Remove the generic "Reviewed AFM graph digitization required" blocker when the
lookup is available.

If input is outside the reviewed graph envelope, display a concise explicit
message instead.

Do not move runway/RCC editing back into the navlog table.
The current airport-panel editing and read-only OFP table structure is
intentional.

======================================================================
9. DO NOT CHANGE THESE INTENTIONAL PROJECT CONVENTIONS
======================================================================

Do not change:
- runway heading = designator × 10 degrees for this worksheet;
- wind components rounded to whole knots before 9-kt correction;
- 9-kt discrete wind correction;
- base wind, not gust, for distance correction;
- separate base/gust crosswind display;
- personal crosswind default 9 kt;
- Instructor mode RCC limits;
- RCC table;
- RCC 0 unsupported;
- known runway width <24 m unsupported;
- takeoff factor 1.25;
- landing factor 1.43;
- Hot Brakes Figure 5-26 always used;
- Figure 5-25 excluded;
- one shared airport weather context at an intermediate stop;
- semantic persistence only;
- fetched weather not persisted;
- derived runway distances not persisted.

======================================================================
10. DOCUMENTATION
======================================================================

Update:
- docs/runway-performance.md
- docs/current-state.md
- docs/v1-roadmap.md if necessary

The documentation should now say that the AFM digitization is implemented and
validated against representative manually read graph points.

Do not claim greater source precision than the scanned nomograms support.

State that runtime interpolation reproduces the reviewed nomogram geometry;
it is not a polynomial/regression performance model.

======================================================================
11. VERIFICATION
======================================================================

Run:
- pnpm typecheck
- pnpm test
- pnpm build

Then manually smoke-test at least:
- one departure and destination with in-envelope values;
- one takeoff acceptance case;
- one landing acceptance case;
- one outside-envelope case;
- one crosswind-limit warning case;
- one RCC correction case.

Inspect the final diff.

======================================================================
12. FINAL RESPONSE
======================================================================

Report:
1. files changed;
2. how the numeric model is represented;
3. exact interpolation algorithm;
4. supported figure bounds;
5. edge-guide handling;
6. acceptance-case results and errors in metres;
7. takeoff/landing integration;
8. UI behavior;
9. any persistence impact;
10. typecheck/test/build results;
11. remaining limitations.

Do not merely propose the implementation. Implement it.
