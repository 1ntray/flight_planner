export interface CalculatedLeg {
  fromId: string;
  toId: string;
  distanceNm: number;
  trueTrackDeg: number | null;
}

