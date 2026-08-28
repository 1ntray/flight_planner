# MVP 0.9

## Goal

MVP 0.9 makes automatically named, inserted, free, and anchored real waypoints
usable as operational navlog entries by allowing their route label to be
edited.

## Included

- A compact editor shown only when a real waypoint is selected
- Editing and saving the waypoint's navlog name
- Non-empty, trimmed names limited to 32 characters
- Immutable rename helpers independent of React and Leaflet
- Stable waypoint IDs and unchanged WGS84 coordinates through renaming
- Immediate propagation of the new name to map labels and navlog FROM/TO rows
- Anchored-waypoint renaming without detachment or loss of published feature
  provenance
- Clear free/anchored status and published-identifier context in the editor
- Tests protecting validation, immutability, route geometry, and anchor
  preservation

## Naming contract

The editable `Waypoint.name` is a route and navlog label. It is not an identity
key. Calculated legs and route-shape associations continue to use stable IDs.
Duplicate names remain permitted because a route may legitimately visit the
same named point more than once.

For an anchored waypoint, changing `Waypoint.name` does not alter the anchor's
`publishedIdentifier`, source feature reference, AIRAC metadata, or coordinate
snapshot.

## Deliberately excluded

This increment does not add coordinate text editing, DMS parsing, waypoint
notes, waypoint reordering, a large properties dialog, or persistent flight
plan storage.
