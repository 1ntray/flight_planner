# Aircraft performance model

## Aircraft definition, profile, and units

An `AircraftDefinition` owns stable aircraft identity, registration, a revision,
a display name, a serializable performance profile, and optional fuel/loading
definitions. The current catalog contains the Zlin Z242 aircraft LN-UPS,
LN-UPT, and LN-UPR with their registration-specific basic empty mass and moment.
A saved plan contains the selected definition as an immutable
snapshot; calculations never depend on a later catalog lookup.

The first project-specific profile uses climb IAS 80 kt, cruise IAS 103 kt,
descent IAS 103 kt, fuel flows 61/36/26.5 L/h, and descent rate 500 ft/min.
Altitude is ft MSL, mass kg, QNH hPa, ISA deviation °C, speed kt, vertical speed
ft/min, time minutes inside vertical primitives, and fuel litres. Calculations
retain full precision and presentation alone rounds values.

## Climb

Effective altitude is `He = H + 120 * deltaISA`. Climb rate is
`1210 - 0.047*He - 1.55*(W-820) - 0.000035*He*(W-820)` ft/min. Climb time is
integrated from the starting altitude in 100 ft steps (with an exact partial
final step), evaluating ROC at the start of each interval. A zero or negative
required ROC returns an impossible-climb result; it is never clamped.

Planning altitude and elevation inputs are bounded to 60,000 ft for the current
calculation model. This is a defensive software limit, not a published aircraft
operating limit. The vertical integrators also reject calculations requiring
more than 600 of their 100 ft intervals, preventing malformed inputs from
blocking the browser's main thread.

The route performance solver also has a bounded work counter covering repeated
vertical-step and target-placement evaluation. If that budget is exhausted,
the calculation returns an explicit no-solution result rather than continuing
to monopolize the browser renderer.

The constants of that equation are data in the profile's discriminated
`effective-altitude-linear-mass` climb-rate model. The pure climb functions
receive the model explicitly. Future aircraft can therefore use other model
kinds without putting aircraft-specific constants back into the calculation
engine; no unprovided table or formula is invented.

## IAS to TAS

The project formula is applied directly:

```text
pressure_ratio = (qnh/1013.25) * (1-altitude/145366.45)^5.25588
pressure_altitude = 145366.45 * (1-pressure_ratio^(1/5.25588))
temperature_K = 288.15 - 0.0019812*pressure_altitude + deltaISA
density_ratio = pressure_ratio * 288.15 / temperature_K
TAS = IAS / sqrt(density_ratio)
```

Departure and destination QNH and ISA deviation are averaged arithmetically by
the environment-selection layer before being passed to performance functions.

## Route phase integration

Each adjacent real-waypoint leg has a target altitude. The route-wide default
can be overridden per leg. The aircraft begins at departure aerodrome elevation;
the planned altitude of an arrival leg remains independent of its arrival
constraint. After its configured planned and optional end-altitude transitions,
the calculation adds a final descent that reaches destination elevation plus
the editable pattern height (normally 1000 ft AGL) at the aerodrome. That target
is rounded to the nearest 100 ft after elevation and pattern height are added.
This supports any sequence of climb, cruise, and descent across successive legs
rather than assuming one climb and one descent.

## Minimum safe altitude (MSA)

MSA is a manual planning input in feet MSL for each adjacent real-waypoint leg.
It is not a performance-calculation input and does not alter climb, descent,
TAS, wind, track, or route geometry. The planner displays it in the OFP-style
navlog MSA column only.

For this project, the pilot assesses the highest terrain or obstacle within
**1 NM on either side** of the actual intended route and adds 500 ft. The map
can display a toggleable semi-transparent corridor around the selected leg as
a visual aid. It follows the leg's shaped WGS84 geometry and uses WGS84
geodesic one-NM offsets; it does not inspect map pixels, Web Mercator values,
terrain tiles, or obstacle data, and it does not calculate an MSA automatically.

A blank MSA is intentionally allowed but shown as a warning. A value higher
than that leg's effective planned altitude is also a warning, not a route
calculation failure. On waypoint insertion, the manual MSA is retained on both
resulting leg plans so that each can be reviewed after the route is split.

The route may also contain explicit intermediate landing boundaries. Each
boundary closes one flight sector at the airport's pattern altitude. The next
sector is calculated independently from that airport's field elevation, using
its weather as the inbound destination environment and outbound departure
environment. If an onward departure time is omitted, it defaults to the
preceding calculated arrival time plus the airport's stop duration. A blank
duration means zero minutes. Stop time shifts the following sector's UTC
timeline and weather sampling, but is not airborne EET. Operational planning
applies the 7 L ground allowance before the first takeoff and after each full
stop, but not after a touch and go. Performance uses one mass throughout each
individual sector; fuel burn and optional refuelling determine the takeoff mass
of later sectors.

An optional target distance says where along the shaped WGS84 leg the requested
altitude must have been reached. A leg can also specify one optional end
altitude with its own reach-by target. The resulting phase sequence may contain,
for example, climb, cruise, descent, and another cruise segment on the same
navlog leg. The second transition starts only after the first target has been
reached; overlapping transitions are reported as no solution.

Automatic climbs begin at FROM; automatic descents are arranged to reach their
target at TO. Either target can be entered as distance from FROM, selected on
the route line, or dragged along the route. These are inputs attached to the
adjacent real-waypoint leg, not waypoints or route-shaping points. Inserting a
real waypoint splits and preserves both instructions at their physical route
locations.

Climb and descent horizontal motion is integrated in the same 100 ft intervals.
TAS is evaluated at interval midpoint altitude, wind is requested through a
provider abstraction using representative WGS84 position, altitude, and UTC
time, and the existing wind triangle supplies groundspeed. Distance is
`GS * dt/60`. Fuel uses interval time and the phase fuel flow. Cruise uses its
altitude-dependent TAS and phase fuel flow.

The performance engine has no React, Leaflet, or Open-Meteo dependency. Manual
wind, sampled forecast wind, and future providers implement the same resolver
boundary. Open-Meteo profile requests select pressure levels around every
required step altitude, interpolate vectors in time and actual geopotential
height, and allow one timing/position refinement pass.

Departure/destination weather, elevations, pattern height, and the leg altitude
schedule are flight-specific plan inputs. When operational loading is complete,
aircraft mass is derived from the selected registration, occupants, baggage,
and fuel rather than entered independently. The 100 ft integration step and the supplied IAS-to-TAS equation
are calculation conventions rather than editable aircraft parameters.

Blank QNH and ISA-deviation fields use planning defaults of 1013 hPa and 0 °C
for departure, destination, and intermediate landing aerodromes. These defaults
are not forecasts and every field remains editable for actual conditions. When
a departure, destination, or intermediate landing waypoint is anchored to an
aerodrome with a published elevation, that elevation is used while the
corresponding flight-specific field is blank. A manually entered elevation
always overrides the dataset value.

When a route endpoint is anchored to an aerodrome whose normalized dataset
publishes an elevation, the planner presents that value as the blank field's
default and uses it for calculations. A user-entered value is an explicit
override. Missing aerodrome elevation data does not cause a guessed value to be
entered.

The manual-planning 2/3-climb and midpoint-descent TAS/wind conventions are not
used when interval data is available. They remain possible future fallbacks,
not the default calculation method.

## Navlog summaries and map boundaries

A navlog leg still occupies one row even when it contains many integrated
steps. WIND, TH, and MH use a cruise step at the leg's primary requested altitude when
one exists. If several such cruise fragments exist, the longest is used. If
there is cruise only at another altitude, the longest cruise fragment is used.
When a vertical transition occupies the whole leg, wind is a duration-weighted
vector average and headings are duration-weighted circular averages. The UI
labels these choices `CRZ` and `AVG`; the underlying phase calculations continue
to use every interval independently.

The map derives BOC/TOC and TOD/BOD annotations from calculated phase-step
boundaries. These annotations are calculated output and are never persisted as
waypoints or shaping points. A BOC coincident with the FROM waypoint and a BOD
coincident with the TO waypoint are omitted because the waypoint already
communicates that boundary. Internal transitions retain both ends.

Calculated boundaries use short, fixed-pixel ticks perpendicular to the local
route direction. Climb ticks are green and descent ticks are red; altitude is
available on hover instead of through a permanent large tooltip. The tick's
WGS84 position remains calculation-derived, while its screen angle and size are
presentation-only. When a custom reach-by target coincides with TOC or BOD, the
draggable target handle carries that label and the duplicate calculated tick is
suppressed.
