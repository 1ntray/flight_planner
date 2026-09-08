# Flight Planner

Browser-based flight planning with an interactive waypoint map and a timed,
altitude-aware, wind-adjusted navigation log, route shaping, magnetic
directions, a storage-neutral aeronautical-layer/waypoint-anchoring boundary,
real-waypoint insertion into existing route geometry, and selected-waypoint
renaming, versioned JSON flight-plan import/export, and a validated local
working draft, interval-integrated climb/cruise/descent performance,
multi-sector stop-duration scheduling, operational fuel planning, and
registration-specific mass and balance, OFP-aligned navlogs, multi-transition
legs, detailed aerodrome information, and bounded calculation recovery for
MVP 0.21.

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

See [`docs/mvp-0.21.md`](docs/mvp-0.21.md) for current scope and
[`docs/conventions.md`](docs/conventions.md) for project conventions. Aviation
calculation definitions are recorded in
[`docs/navigation-conventions.md`](docs/navigation-conventions.md).
Aircraft constants, formulas, and phase integration are recorded in
[`docs/aircraft-performance.md`](docs/aircraft-performance.md).
Aeronautical data and anchoring contracts are recorded in
[`docs/aeronautical-data.md`](docs/aeronautical-data.md).
The human-gated Avinor edition workflow is documented in
[`docs/airac-updates.md`](docs/airac-updates.md).
The saved-document contract is recorded in
[`docs/flight-plan-persistence.md`](docs/flight-plan-persistence.md).
