import { describe, expect, it } from 'vitest';

import {
  calculateInverseGeodesic,
  calculatePositionAtDistanceAndTrack,
} from '../../calculations';
import { buildCirclingMeasurement } from './circlingMeasurement';

describe('circling measurement', () => {
  it('builds a closed WGS84 ring at the measured nautical-mile radius', () => {
    const center = { latitude: 69.35, longitude: 18.75 };
    const edge = calculatePositionAtDistanceAndTrack(center, 90, 2.5);
    const measurement = buildCirclingMeasurement(center, edge);

    expect(measurement.radiusNm).toBeCloseTo(2.5, 10);
    expect(measurement.ring).toHaveLength(73);
    expect(measurement.ring[0]).toEqual(measurement.ring.at(-1));
    expect(
      calculateInverseGeodesic(center, measurement.ring[18]!).distanceNm,
    ).toBeCloseTo(2.5, 10);
  });
});
