# MVP 0.2

## Goal

MVP 0.2 adds a deterministic wind-adjusted navigation calculation to the route
workflow established in MVP 0.1. It deliberately uses manual, constant planning
inputs so the aviation mathematics is testable before weather retrieval is
introduced.

## Included

- All route and map behavior from MVP 0.1
- Manual true airspeed in knots
- Manual wind direction in degrees true, using the direction from which the
  wind blows
- Manual wind speed in knots
- A pure wind-triangle calculation for each leg
- Signed wind-correction angle and normalized true heading
- Groundspeed and estimated elapsed time
- Explicit no-solution results for excessive crosswind and non-positive forward
  groundspeed
- Navigation-log display of true heading, groundspeed, leg EET, and total EET
- Input validation and focused Vitest coverage for calculations, edge cases,
  formatting, and parsing

## Deliberately excluded

Open-Meteo integration, altitude and time-dependent wind, wind interpolation,
magnetic variation, magnetic heading, climb/descent modeling, aircraft
profiles, fuel calculations, persistence, and PDF generation remain outside
MVP 0.2.

## Architecture boundary

The ordered waypoint array remains the canonical route. True track and distance
are derived from adjacent waypoint positions, and wind-adjusted values are then
derived from those legs plus navigation input data. Neither geometric legs nor
wind-adjusted results are stored as independent React state.

Weather retrieval will later be implemented as an adapter that converts an
external forecast into internal wind inputs. It must not be coupled to the pure
wind-triangle calculation.
