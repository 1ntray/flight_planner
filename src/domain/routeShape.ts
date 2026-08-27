import type { Position } from './position';

export interface RouteShapingPoint {
  id: string;
  position: Position;
}

export interface LegShape {
  fromWaypointId: string;
  toWaypointId: string;
  points: readonly RouteShapingPoint[];
}
