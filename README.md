# Flight Planner

Browser-based flight planning with an interactive waypoint map and a timed,
altitude-aware, wind-adjusted navigation log, route shaping, magnetic
directions, a storage-neutral aeronautical-layer/waypoint-anchoring boundary,
real-waypoint insertion into existing route geometry, and selected-waypoint
renaming, versioned JSON flight-plan import/export, and a validated local
working draft, and interval-integrated climb/cruise/descent performance for
MVP 0.14.

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

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

See [`docs/mvp-0.14.md`](docs/mvp-0.14.md) for current scope and
[`docs/conventions.md`](docs/conventions.md) for project conventions. Aviation
calculation definitions are recorded in
[`docs/navigation-conventions.md`](docs/navigation-conventions.md).
Aircraft constants, formulas, and phase integration are recorded in
[`docs/aircraft-performance.md`](docs/aircraft-performance.md).
Aeronautical data and anchoring contracts are recorded in
[`docs/aeronautical-data.md`](docs/aeronautical-data.md).
The saved-document contract is recorded in
[`docs/flight-plan-persistence.md`](docs/flight-plan-persistence.md).
