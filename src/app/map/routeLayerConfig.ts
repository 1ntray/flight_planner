export type RouteLayerId =
  | 'route'
  | 'legs'
  | 'waypoints'
  | 'waypoint-names'
  | 'shaping-points'
  | 'altitude-targets'
  | 'flight-phases';

export type RouteLayerVisibility = Readonly<Record<RouteLayerId, boolean>>;

export interface RouteLayerDefinition {
  readonly id: RouteLayerId;
  readonly label: string;
}

export const ROUTE_LAYER_DEFINITIONS: readonly RouteLayerDefinition[] = [
  { id: 'legs', label: 'Legs' },
  { id: 'waypoints', label: 'Waypoints' },
  { id: 'waypoint-names', label: 'Waypoint names' },
  { id: 'shaping-points', label: 'Shaping points' },
  { id: 'altitude-targets', label: 'Altitude targets' },
  { id: 'flight-phases', label: 'TOC / TOD markers' },
];

export const DEFAULT_ROUTE_LAYER_VISIBILITY: RouteLayerVisibility = {
  route: true,
  legs: true,
  waypoints: true,
  'waypoint-names': true,
  'shaping-points': true,
  'altitude-targets': true,
  'flight-phases': true,
};
