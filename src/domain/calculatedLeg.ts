import type { Position } from './position';

export interface CalculatedLeg {
  fromId: string;
  toId: string;
  geometry: readonly Position[];
  distanceNm: number;
  trueTrackDeg: number | null;
}
