# MVP 0.11

## Goal

MVP 0.11 makes the current planning session resilient to a browser reload while
keeping the versioned planning document as the single persistence boundary.

## Included

- One browser-local working draft using `FlightPlanningDocumentV1`
- Validation before a saved draft enters application state
- Startup restoration of route, shaping points, anchors, semantic navigation
  inputs, and forecast-wind preference
- Debounced saving of valid document changes
- Retention of the last valid saved document during invalid form edits
- Compact restored, saving, saved, and error feedback
- A confirmed `New plan` action that resets the complete session and removes the
  working draft
- Storage-adapter tests using an injected in-memory implementation, including
  unavailable storage and malformed saved data

## Behavioural distinction

`Clear route` clears only the canonical route and leaves planning inputs in
place. Because this is a normal valid edit, the route-cleared document is
autosaved.

`New plan` resets route and planning inputs together, turns forecast winds off,
clears selection, and removes the stored working draft. The fresh blank session
is treated as untouched and is not immediately written back to storage.

## Architectural outcome

Local storage contains no React draft state, Leaflet state, calculated legs, or
weather response. It is only a browser transport for the same versioned semantic
document used by import/export. Storage access is isolated behind a small
injected adapter so failure modes remain independently testable.

## Deliberately excluded

This increment does not add multiple named plans, IndexedDB, cloud
synchronization, conflict resolution, background sync, or schema migrations
beyond version 1.
