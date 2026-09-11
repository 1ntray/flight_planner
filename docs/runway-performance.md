# Zlin Z242L runway-performance contract

## Status and safety boundary

The planner now contains the pure UTSA runway atmosphere, wind, RCC,
crosswind-limit, correction-order, runway-resolution, persistence, weather-context,
and OFP presentation boundaries. It deliberately does **not** yet produce an
uncorrected Zlin takeoff or landing distance: the supplied AFM pages are scanned
raster nomograms and no independently reviewed numeric control-point set was
provided. OCR or visually estimated pixels are not accepted as operational data.

Until reviewed graph values are checked in, both AFM lookup functions return
`reviewed-digitization-required`. Consequently required distance and runway
margin remain unavailable. This is a fail-closed state, not a software error.

## Authoritative project method

- Takeoff source: ZLIN Z242L AFM Figure 5-10, distance to 50 ft (15 m).
- Landing source: ZLIN Z242L AFM Figure 5-26, distance from 50 ft (15 m),
  **Hot brakes**. Figure 5-25 is never used.
- Braking and instructor crosswind source: UTSA OM-C 4.7.1.
- Presentation and factors: UTSA Operational Flightplan v2.0, 10.08.2026.
- The reference PDFs remain local reference material and are not runtime assets.

The future AFM representation must be deterministic, reviewable breakpoints or
piecewise interpolation derived from approved graph control values. Interpolation
will be allowed only inside the reviewed envelope. Extrapolation must return an
explicit unavailable result. No polynomial or regression approximation is
permitted.

## Atmosphere

The project-specific simplified equations are:

```text
Pressure altitude ft = aerodrome elevation ft + 27 * (1013 - QNH hPa)
ISA deviation C      = round(OAT C - 15)
Density altitude ft  = pressure altitude ft + 120 * rounded ISA deviation C
```

The whole-degree ISA rounding occurs before density altitude and before any
future AFM lookup. Aerodrome elevation is the published ARP elevation, not a
threshold elevation.

## Wind and crosswind

Surface wind is direction **from**. For the project OFP worksheet, runway
heading is intentionally simplified from the selected runway designator:
runway `10` is `100°`, runway `28` is `280°`, and so on. The published true
bearing is not used for this particular calculation. Components are calculated
directly from the difference between that nominal heading and the wind:

```text
angle difference = wind direction - runway number * 10°
headwind kt       = round(cos(angle difference) * wind speed kt)
crosswind kt      = round(sin(angle difference) * wind speed kt)
```

Positive parallel component means headwind and negative means tailwind.
Crosswind retains its side sign in the calculation, while the OFP displays its
magnitude. Both steady and gust components are rounded to the nearest whole
knot. Base and gust crosswind magnitudes are checked independently; gust affects
limitations but never distance correction. Variable or otherwise unresolved
wind has no invented component.

Distance correction uses the rounded steady runway-parallel component:

```text
steps = floor(abs(component kt) / 9)
headwind factor = 1 - steps * 0.10
tailwind factor = 1 + steps * 0.10
```

Only complete 9 kt steps count. An extreme headwind producing a zero or negative
factor is unavailable rather than clipped.

## RCC and calculation order

| RCC | Default runway state | Landing correction | Instructor X-wind |
|---:|---|---:|---:|
| 6 | Dry | 0% | 20 kt |
| 5 | Wet | 0% | 20 kt |
| 4 | unavailable | 10% | 16 kt |
| 3 | unavailable | 20% | 13 kt |
| 2 | unavailable | 50% | 7 kt |
| 1 | unavailable | 100% | 4 kt |
| 0 | unavailable | unsupported | unsupported |

Takeoff order is AFM Figure 5-10 distance, steady-wind correction, then `1.25`,
then comparison with published TODA. RCC distance correction is always 0% for
takeoff, although runway status and braking action remain visible.

Landing order is AFM Figure 5-26 Hot-brakes distance, steady-wind correction,
RCC correction applied to the complete distance, then `1.43`, then comparison
with published LDA. Physical runway length is never substituted for TODA/LDA.

The personal crosswind default is 9 kt. Instructor mode temporarily selects the
RCC table limit without destroying the saved personal value. RCC 0 and a known
runway width below 24 m are explicitly unsupported; unknown width is shown as
unavailable data and is not guessed. The Flaps field identifies the takeoff and
landing worksheets as `TO` and `LND`, matching the OFP layout.

## State, weather, and sectors

Runway selections and conditions use stable operation keys made from operation
kind plus sector FROM/TO waypoint IDs. An intermediate landing and its onward
takeoff therefore retain independent runway and RCC selections for calculation,
but are presented as one airport stop. Because the elapsed ground time is not
material to this planning use, that stop uses one reviewed weather context for
both operations. The representative time is the derived arrival time; no second
timeline or route is created.

Manual surface wind and OAT, runway direction, condition/RCC, personal limit,
and Instructor mode are persisted as semantic inputs. Personal/Instructor
crosswind policy is global, while runway direction, condition and RCC are edited
only in the airport-planning panel. The navlog runway tables are read-only and
retain the OFP's three-pair airport grid and separate distance-worksheet row
layout. The worksheet's `Brk action` value presents only the selected RCC
number; it does not add a prefix or translate the code to a qualitative
braking-action label. Fetched METAR, TAF, and
Locationforecast data, weather-source choices, wind components, atmosphere,
distances, and margins are derived/runtime-only. Old documents omit the optional
runway block and therefore open with 9 kt personal limit, Instructor off, and no
invented runway or RCC selection.

The calculation module has no React, Leaflet, repository, network, or PDF
dependency. The active aircraft is explicitly Zlin Z242L; no model is applied
to an unsupported aircraft.

## Remaining validation work

A qualified reviewer must supply independent Figure 5-10 and Figure 5-26 graph
control values covering mass, pressure-altitude, and ISA axes, plus boundary and
interpolation check cases. Only then can supported ranges, interpolation surfaces,
uncorrected distances, required distances, and margins be enabled and checked
against manually completed UTSA OFPs.
