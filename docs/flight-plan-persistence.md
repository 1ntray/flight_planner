# Flight-plan persistence

## Document boundary

The exported format is a versioned JSON document. Version 9 contains the route,
navigation inputs including magnetic-variation mode and manual fallback, the complete selected aircraft-definition
snapshot, optional performance and operational inputs, and the forecast
preference. Versions 1 through 7 are validated and explicitly migrated on load.

```ts
interface FlightPlanningDocumentV9 {
  schemaVersion: 9;
  flightPlan: FlightPlan;
  planningInputs: RoutePlanningInputs;
  aircraftDefinition: AircraftDefinition;
  performanceInputs: AircraftPerformancePlanInputs | null;
  operationalInputs: OperationalPlanningInputs | null;
  useForecastWinds: boolean;
}
```

`FlightPlan` retains the ordered real `waypoints` and optional per-leg
`legShapes`, plus references to intermediate waypoints explicitly marked as
sector boundaries. Performance inputs store mass, endpoint weather/elevations, the
global altitude, and sparse per-adjacent-leg altitude/target overrides in their
documented internal units. A leg may optionally have a second altitude and
reach-by target after its primary target. It may also store a pilot-entered
minimum safe altitude in ft MSL; this is an optional manual value, not derived
route output. A route-shaping point may likewise retain an optional
reporting-point-specific source snapshot; this remains geometry input, not a
real navlog waypoint.

Each sector boundary with active performance inputs has one intermediate-airport
snapshot containing elevation, QNH, ISA deviation, and a non-negative stop
duration in minutes. The following sector departure is derived from arrival
plus that duration. Version-four documents used an optional fixed onward UTC
departure instead.
Navlog sectors, calculated legs, ETAs, phase boundaries, totals, and per-leg
WMM variations are derived and are not persisted.

Operational inputs contain total ramp fuel, occupant and baggage masses,
extra/reserve policy, one T&G/full-stop operation per intermediate airport,
optional full-stop fuel-onboard targets, an editable final-reserve quantity in
litres, and an optional aerodrome-anchored alternate snapshot with pilot-entered
distance, time, and fuel requirements. Tank split, fuel remaining, loading
states, OFP rows, warnings, and requirement totals are recalculated. The
alternate navigation line remains derived; it is not used to overwrite the
pilot-entered alternate requirement.

Optional per-airport pattern plans contain only a landing waypoint ID and a
whole-number circuit count. They are input, while their OFP rows, elapsed time,
fuel, loading effects, and refuelling horizons remain derived.

`aircraftDefinition` includes identity and revision metadata plus all phase
speeds, fuel flows, descent rate, and climb-rate coefficients used by the
calculation. It may also snapshot the fuel-system and weight-and-balance
definition. Loading a plan uses this snapshot even if the local catalog later
contains a newer revision of the same aircraft.

Text-field drafts are not persisted. Export is disabled while the current draft
is invalid.

## Local working draft

The browser keeps at most one autosaved working draft under the application-owned
key `flight-planner:working-draft:v2`. The previous `v1` key remains readable
for migration and both keys are removed by `New plan`. It uses the same validated, versioned
document contract as file import/export; local storage is a transport, not a
second domain model.

Changes to a valid document are saved after a short debounce. A temporarily
invalid form draft never replaces the last valid saved document. An untouched
new session is not written merely because the application opened, and a restored
document is not needlessly rewritten.

On startup, stored JSON crosses the same untrusted validation boundary as an
imported file. Invalid or unreadable stored data is reported and left unchanged
until the user makes a valid planning change or explicitly starts a new plan.

`Clear route` remains a route-only operation and its result is autosaved while
preserving the planning inputs. `New plan` is a separate confirmed action: it
resets the route and planning inputs, disables forecast winds, clears selection,
and removes the local working draft. The resulting untouched blank plan is not
immediately autosaved again.

## Deliberately excluded data

The document does not store:

- calculated legs or navlog rows,
- expanded route geometry,
- forecast wind responses or retrieval state,
- Leaflet layer visibility or viewport,
- selected points, popup state, or drag state.
- map corridor visibility or other map presentation preferences.

These values are recalculated or recreated after import. The forecast-source
preference may be restored, but the application never fetches weather merely
because a document was opened. The user must explicitly load forecast winds
for the restored route, time, altitude, and performance inputs.

## Validation

JSON is parsed as untrusted data before application state changes. Validation
protects:

- the exact supported schema version,
- finite WGS84 coordinates and coordinate bounds,
- stable, non-empty, globally unique route-point IDs,
- waypoint-name constraints,
- shaping-point order and adjacent-leg ownership,
- one optional non-empty shape per real leg,
- point-feature-only anchor references and complete dataset provenance,
- navigation and performance input units and numeric bounds,
- aircraft identity, revision, phase values, and climb-model coefficients,
- fuel capacities/arms, loading stations/limits, and operational inputs,
- unique altitude plans associated only with adjacent real-waypoint legs,
- the forecast preference boolean and magnetic-variation mode/manual value.

Unknown top-level and nested fields are ignored when a validated normalized
document is constructed. Schema-one documents migrate without inventing
flight-specific performance inputs: their legacy fixed TAS and altitude are
discarded, the current project aircraft definition is snapshotted, and
`performanceInputs` remains `null`. Schema-two documents preserve their flat
phase speeds, fuel flows, descent rate, identity, and revision. They receive
the authoritative project climb-rate coefficients because the older schema
had no field capable of storing them. Schema-three documents gain empty sector
boundary and intermediate-airport collections, preserving their original
single-sector meaning. Schema-four fixed onward UTC departures are retained as
legacy compatibility values so importing an existing plan does not change its
timeline; entering a stop duration replaces that legacy value. Version-five
documents gain `operationalInputs: null` and preserve their previous behaviour.
Version-six documents retain all operational inputs and migrate without
inventing the new optional second altitude instruction. Version-seven documents
migrate their route-wide variation to explicit Manual mode, preserving the
previous navigation output. Version-eight documents convert final reserve from
minutes to litres using the saved aircraft's reserve flow, and retain the old
alternate waypoint while setting its new manual distance, time, and fuel values
to zero for pilot review.

## AIRAC stability

An anchored waypoint is restored from its saved WGS84 coordinate and anchor
snapshot. The current aeronautical dataset may be used for map overlays, but it
must not silently alter the loaded route coordinate or provenance.
