# Flight Planner

Browser-based VFR flight planning with an interactive waypoint map, an
OFP-oriented navigation log, WGS84 route calculations, altitude-aware
performance, forecast or manual winds, local AIRAC-versioned Avinor eAIP data,
operational fuel planning, and registration-specific mass and balance.

Flight Planner is a planning aid. It does not replace current AIP, NOTAM,
METAR/TAF, runway-performance data, or a pilot's required operational briefing
and judgement.

## Development

```sh
pnpm install
pnpm dev
```

### One-click Windows testing

After dependencies have been installed, double-click
`start-flight-planner.cmd` in File Explorer. It starts the Vite development
server and opens the application in the default browser. It prefers
`http://127.0.0.1:5173`; if that port is already occupied, it selects the next
available local port automatically.

Keep the launcher window open while testing. Press Enter in that window when
finished; the launcher will stop the server and close. If the launcher window
is closed unexpectedly, double-click `stop-flight-planner.cmd` to stop the
server it recorded.

The stop utility only terminates the recorded process after confirming its
process ID and start time. It will not blindly terminate an unrelated
application.

### One-click AIRAC update

After dependencies have been installed, double-click `update-airac.cmd`. It
checks for a newer Avinor edition and asks before changing files. When approved,
it imports and validates the complete candidate, runs TypeScript, all tests,
and the production build, then opens the generated change report in Notepad.

The updater never commits, pushes, merges, or contacts Avinor from the browser.
The resulting candidate still requires review before it is committed or merged.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Documentation

[`docs/current-state.md`](docs/current-state.md) is the authoritative overview
of current capabilities and boundaries. [`docs/v1-roadmap.md`](docs/v1-roadmap.md)
sets out the remaining path to a useful 1.0 release.

Detailed contracts and operational boundaries:

- [`docs/conventions.md`](docs/conventions.md) — project architecture and UI
  state rules.
- [`docs/navigation-conventions.md`](docs/navigation-conventions.md) — WGS84,
  wind, magnetic, timing, and forecast conventions.
- [`docs/aircraft-performance.md`](docs/aircraft-performance.md) — aircraft
  constants, phase integration, MSA, patterns, and operational calculations.
- [`docs/aeronautical-data.md`](docs/aeronautical-data.md) — aeronautical data,
  anchoring, frequency planning, and importer contracts.
- [`docs/airac-updates.md`](docs/airac-updates.md) — the human-gated Avinor
  AIRAC update workflow.
- [`docs/flight-plan-persistence.md`](docs/flight-plan-persistence.md) — saved
  document and local-working-draft contract.

The `docs/mvp-*.md` files are milestone records. In particular,
[`docs/mvp-0.21.md`](docs/mvp-0.21.md) records the MVP 0.21 scope; it is not the
primary current-capabilities reference.
