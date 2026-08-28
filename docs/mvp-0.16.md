# MVP 0.16

## Goal

MVP 0.16 makes map editing explicit and safer while giving the navigation log
a persistent, wide workspace.

## Included

- Select/Edit as the default map tool; empty-map clicks no longer create route
  points accidentally
- Explicit Add waypoint mode for free, anchored, and route-line insertion
- Exclusive altitude-target placement that cannot add waypoints
- Waypoint popups for renaming, landing status, anchor information, detachment,
  coordinates, and deletion
- Shaping-point popup deletion
- Leg selection at an exact snapped WGS84 route location
- Leg popup actions for real-waypoint insertion, altitude override, target
  placement, and restoration of automatic target placement
- Keyboard shortcuts for tools, selected-point deletion, leg insertion,
  altitude editing/placement, landing status, help, and cancellation
- A discoverable Shortcuts tab with context requirements
- A full-width bottom navigation-log dock and a separately scrolling planning
  sidebar

## Interaction rules

Select/Edit (`V`) is the safe default. Add waypoint (`W`) remains active until
the user toggles it, selects another tool, inserts into a route line, or presses
Escape. Clicking a route line in Select/Edit selects its snapped route location;
dragging beyond the existing threshold still creates a shaping point.

The `+`, `A`, and `P` shortcuts require a selected leg. `Delete` requires a
selected real waypoint or shaping point. `L` requires an intermediate real
waypoint. `?` opens the shortcut reference. All planner shortcuts pause while
the user is editing a form control.

Selections, active tools, popup state, and shortcut focus requests are UI state
and are not persisted. Route mutations continue to use the existing pure route
helpers, and navigation/performance calculations remain outside React and
Leaflet.
