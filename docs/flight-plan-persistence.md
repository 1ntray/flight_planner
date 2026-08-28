# Flight-plan persistence

## Document boundary

The exported format is a versioned JSON document. Version 2 contains the route,
route-wide navigation inputs, the aircraft profile snapshot, optional
performance inputs, and the forecast preference. Version 1 documents are
validated and explicitly migrated on load.

```ts
interface FlightPlanningDocumentV2 {
  schemaVersion: 2;
  flightPlan: FlightPlan;
  planningInputs: RoutePlanningInputs;
  aircraftPerformanceProfile: AircraftPerformanceProfile;
  performanceInputs: AircraftPerformancePlanInputs | null;
  useForecastWinds: boolean;
}
```

`FlightPlan` retains the ordered real `waypoints` and optional per-leg
`legShapes`. Performance inputs store mass, endpoint weather/elevations, the
global altitude, and sparse per-adjacent-leg altitude/target overrides in their
documented internal units.

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

These values are recalculated, fetched, or recreated after import. If forecast
winds are enabled in the saved document, the application requests fresh data
for the restored route, time, and altitude.

## Validation

JSON is parsed as untrusted data before application state changes. Version 1
validation protects:

- the exact supported schema version,
- finite WGS84 coordinates and coordinate bounds,
- stable, non-empty, globally unique route-point IDs,
- waypoint-name constraints,
- shaping-point order and adjacent-leg ownership,
- one optional non-empty shape per real leg,
- point-feature-only anchor references and complete dataset provenance,
- navigation and performance input units and numeric bounds,
- unique altitude plans associated only with adjacent real-waypoint legs,
- the forecast preference boolean.

Unknown top-level and nested fields are ignored when a validated normalized
document is constructed. Schema-one documents migrate without inventing
aircraft inputs: their legacy fixed TAS and altitude are discarded, and
`performanceInputs` is `null` until the required values are supplied.

## AIRAC stability

An anchored waypoint is restored from its saved WGS84 coordinate and anchor
snapshot. The current aeronautical dataset may be used for map overlays, but it
must not silently alter the loaded route coordinate or provenance.
