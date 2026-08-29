# MVP 0.17

## Goal

MVP 0.17 adds the first complete operational fuel-planning and mass-and-balance
calculation path needed for the Zlin OFP. It remains derived from route,
performance, aircraft, and loading inputs and does not yet write into the PDF.

## Aircraft and fuel model

- Selectable Zlin Z242 registrations: LN-UPS (763 kg / 502 kgm), LN-UPT
  (775 kg / 526 kgm), and LN-UPR (776 kg / 525 kgm).
- Main fuel: 116 L usable at 0.750 m; auxiliary fuel: 108 L usable at
  0.948 m; density: 0.72 kg/L.
- One total onboard-fuel input allocates the first 116 L to main and excess to
  auxiliary. Consumption is auxiliary first, then main.
- Startup/taxi/takeoff consumes 7 L and contributes a fixed 15 minutes to the
  page-two planning table. It applies initially and after a full stop, not after
  a touch and go.
- Extra fuel defaults to 18 L. Final reserve is entered as fuel quantity and
  defaults to 36 L; its displayed time uses 36 L/h.

## Sector OFP semantics

Each primary sector receives its own navlog. Intermediate distance, airborne
time, and airborne fuel reset at the start of that sector. Accumulated values
continue from the original takeoff across every sector and exclude taxi and
stop time. Fuel remaining includes ground allowances and airborne burn.

The page-two trip line includes all remaining primary airborne time/fuel plus
every remaining 7 L / 15 minute ground event. The alternate aerodrome is chosen
on the map and provides a derived navigation line, while alternate distance,
time, and fuel are entered by the pilot. Total required adds trip, alternate,
extra, and final reserve. Endurance adds the fuel surplus or deficit converted at 36 L/h
to the sum of those component times.

## Mass and balance

Left and right seats use arm 0.956 m; baggage uses 1.766 m and is limited to
20 kg. Takeoff loading is calculated after the applicable ground allowance;
landing loading is calculated after the current sector's airborne burn. Limits
are 1090 kg takeoff and 1050 kg landing.

When takeoff mass is no more than 1050 kg, minimum flight time displays `0`
and required fuel displays `—`. Otherwise the engine finds the time at which
actual interval-integrated phase fuel burn reduces mass to 1050 kg and reports
the corresponding fuel remaining. It warns if the sector cannot reach it.

## Architecture and persistence

Fuel allocation, sequential sector projection, loading, OFP accumulation,
requirements, endurance, alternate calculation, and minimum-flight calculation
are pure modules under `src/calculations`. React only owns editable input drafts
and renders results. Open-Meteo remains behind the existing wind-resolver
boundary.

Document schema version 6 persists the aircraft snapshot and operational input
data, never derived OFP rows or loading results. Versions 1 through 5 migrate to
version 6 with no invented operational inputs.
