# Aircraft performance model

## Profile and units

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
the final leg ends at destination elevation plus the editable pattern height
(normally 1000 ft AGL). This supports any sequence of climb, cruise, and descent
across successive legs rather than assuming one climb and one descent.

An optional target distance says where along the shaped WGS84 leg the requested
altitude must have been reached. Automatic climbs begin at FROM; automatic
descents are arranged to reach the target at TO. A target can be entered as
distance from FROM, selected on the route line, or dragged along the route.
It is input attached to the adjacent real-waypoint leg, not a waypoint or a
route-shaping point. Inserting a real waypoint splits and preserves this input.

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

The manual-planning 2/3-climb and midpoint-descent TAS/wind conventions are not
used when interval data is available. They remain possible future fallbacks,
not the default calculation method.
