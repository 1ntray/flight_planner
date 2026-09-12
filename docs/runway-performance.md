# Zlin Z242L runway-performance contract

## Status and safety boundary

The planner contains the pure UTSA runway atmosphere, wind, RCC,
crosswind-limit, correction-order, runway-resolution, persistence,
weather-context, AFM-distance, and OFP presentation boundaries. The Zlin AFM
distance model is a reviewed numeric digitization of the original scanned
nomograms. Runtime calculations use checked-in nomogram coordinates and never
read the source PDF or raster pixels.

The implementation was validated against twelve independently and manually
read representative graph points: six from each figure, with a graph-reading
tolerance of ±10 m. This validates reproduction of the reviewed digitization;
it does not claim more precision than the scanned nomograms support.

## Authoritative project method

- Takeoff source: ZLIN Z242L AFM Figure 5-10, distance to 50 ft (15 m).
- Landing source: ZLIN Z242L AFM Figure 5-26, distance from 50 ft (15 m),
  **Hot brakes**. Figure 5-25 is never used.
- Braking and instructor crosswind source: UTSA OM-C 4.7.1.
- Presentation and factors: UTSA Operational Flightplan v2.0, 10.08.2026.
- The reference PDFs remain local reference material and are not runtime assets.

The numeric representation revisions are `z242l-afm-fig-5-10-v1` and
`z242l-afm-fig-5-26-hot-brakes-v1`. They reproduce the reviewed two-panel
nomogram geometry with deterministic piecewise-linear interpolation. They are
not polynomial or regression performance models.

For each figure, actual OAT is interpolated to the printed temperature-axis X
coordinate. Every published pressure-altitude line evaluates its Y coordinate
at that X, after which Y is interpolated between the bounding 0, 3000, 6000,
9000, and 12000 ft lines. Mass is independently interpolated to the weight-axis
X coordinate. The weight-guide slope is interpolated at the entry Y coordinate
and applies the horizontal mass displacement from the figure's reviewed
reference X. Finally, the resulting Y coordinate is interpolated through the
printed distance axis to metres.

The supported printed bounds are:

| Figure | OAT | Pressure altitude | Mass | Distance frame |
|---|---:|---:|---:|---:|
| 5-10 takeoff | -60 to +50 °C | 0 to 12,000 ft | 800 to 1,100 kg | 400 to 1,600 m |
| 5-26 Hot brakes landing | -50 to +50 °C | 0 to 12,000 ft | 850 to 1,050 kg | 400 to 900 m |

Inputs are never clamped. Temperature, pressure altitude, or mass outside the
published bounds returns `outside-reviewed-envelope`. Entry and final Y must
also remain within the printed distance frame. The small printed portions above
or below the outer reviewed weight-guide anchors linearly continue the nearest
two reviewed guide slopes, but only while every input and both Y coordinates
remain inside their published frames. This is controlled continuation within
the chart, not extrapolation beyond it.

## Atmosphere

The project-specific simplified equations are:

```text
Pressure altitude ft = aerodrome elevation ft + 27 * (1013 - QNH hPa)
ISA deviation C      = round(OAT C - 15)
Density altitude ft  = pressure altitude ft + 120 * rounded ISA deviation C
```

The whole-degree ISA rounding occurs before density altitude. Density altitude
is an OFP display calculation only: the AFM lookup receives pressure altitude,
actual OAT, and mass directly. Neither density altitude nor the simplified ISA
deviation replaces OAT in the nomogram. Aerodrome elevation is the published
ARP elevation, not a threshold elevation.

## Wind and crosswind

Surface wind is direction **from**. The project OFP worksheet deliberately uses
the selected runway designator as a simplified nominal direction. The numeric
runway part is multiplied by ten: runway `10` is `100°`, runway `28L` is
`280°`, and runway `36` is `360°`. A `L`, `C`, or `R` suffix does not change
the direction. Only standard runway numbers `01` through `36` are accepted;
an invalid designator makes the component unavailable rather than guessed.

Although runway designators conventionally represent magnetic direction, this
project method compares that nominal number directly with the entered or
selected wind-direction number. It does not substitute the published true
bearing and does not apply WMM variation at this runway-workbook boundary.
This is intentionally separate from the enroute wind triangle.

Components are calculated from the direct angular difference:

```text
runway direction deg = runway number * 10
angle difference deg = wind direction from deg - runway direction deg
angle difference rad = angle difference deg * pi / 180
headwind kt           = round(cos(angle difference rad) * wind speed kt)
crosswind kt          = round(sin(angle difference rad) * wind speed kt)
```

For example, runway `10` and wind from `150°` give a `50°` difference. At
20 kt this produces a displayed 13 kt headwind and 15 kt crosswind.

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
takeoff, although the runway state and selected RCC number remain visible.

Landing order is AFM Figure 5-26 Hot-brakes distance, steady-wind correction,
RCC correction applied to the complete distance, then `1.43`, then comparison
with published LDA. Physical runway length is never substituted for TODA/LDA.

The personal crosswind default is 9 kt. Instructor mode temporarily selects the
RCC table limit without destroying the saved personal value. RCC 0 and a known
runway width below 24 m are explicitly unsupported; unknown width is shown as
unavailable data and is not guessed. The Flaps field identifies the takeoff and
landing worksheets as `TO` and `LND`, matching the OFP layout.

Leaving runway state blank uses `DRY` for RCC 6 and `WET` for RCC 5. No default
state is invented for RCC 4 through 0. A manually entered runway state overrides
the default display without changing the selected RCC.

## State, weather, and sectors

Runway selections and conditions use stable operation keys made from operation
kind plus sector FROM/TO waypoint IDs. An intermediate landing and its onward
takeoff therefore retain independent runway and RCC selections for calculation,
but are presented as one airport stop. Because the elapsed ground time is not
material to this planning use, that stop uses one reviewed weather context for
both operations. The representative time is the derived arrival time; no second
timeline or route is created.

Manual surface wind and explicit OAT overrides, runway direction, condition/RCC,
personal limit, and Instructor mode are persisted as semantic inputs. A blank
runway OAT uses the standard 15 °C default and is presented as a grey placeholder;
selected METAR/forecast temperatures and manual entries override it. Personal/Instructor
crosswind policy is global, while runway direction, condition and RCC are edited
only in the airport-planning panel. The navlog runway tables are read-only and
retain the OFP's three-pair airport grid and separate distance-worksheet row
layout. The worksheet's `Brk action` value presents only the selected RCC
number; it does not add a prefix or translate the code to a qualitative
braking-action label. Fetched METAR, TAF, and Locationforecast data,
weather-source choices, wind components, atmosphere, distances, and margins are
derived/runtime-only. Old documents omit the optional runway block and therefore
open with 9 kt personal limit, Instructor off, and no invented runway or RCC
selection.

The calculation module has no React, Leaflet, repository, network, or PDF
dependency. The active aircraft is explicitly Zlin Z242L; no model is applied
to an unsupported aircraft.

## OFP presentation

The operational summary is arranged with mass and balance at the top left, the
remaining-fuel plan beside it, and the paired departure/destination runway
worksheets to their right. Minimum-flight time and required fuel at landing sit
below the fuel table. The fuel explanation wraps to that table's width rather
than widening the complete summary. Narrow layouts stack the same sections.

Each runway worksheet keeps the OFP's three label/value pairs per row and the
published placement of RWY, elevation, flaps, wind, crosswind, pressure
altitude, QNH, temperature, density altitude, corrections, required distance,
and TODA/LDA. The decorative vertical `FILL OUT AS REQUIRED` strip is omitted
so the airport table and distance worksheet align. The `Brk action` value shows
only the selected RCC number, for example `5`, not `RCC 5` or a qualitative
GOOD/MEDIUM label.

Availability problems are still derived for every runway operation. They
include missing aerodrome/runway/RCC/weather data, invalid designators,
unsupported runway/RCC/aircraft cases, missing declared distance, and the
reviewed AFM chart envelope. The repeated red issue list is intentionally
not drawn beneath each worksheet; the operation retains a ready/blocked status
and non-visual issue detail. Crosswind-limit feedback remains visible when a
component and applicable limit are available. An outside-envelope AFM result is
shown explicitly because no distance may be presented. This is a presentation
choice, not removal of validation or fail-closed behaviour.

## Remaining limitations

The model is limited to the reviewed Figure 5-10 and Figure 5-26 Hot-brakes
frames and to the precision supported by their scanned nomograms. Further
validation against complete manually prepared operational flight plans remains
required. Figure 5-25 is excluded and cannot be selected.
