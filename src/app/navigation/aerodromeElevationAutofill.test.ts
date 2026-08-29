import { describe, expect, it } from 'vitest';

import { createEmptyPerformanceInputDraft } from './performanceInput';
import {
  applyAerodromeElevationAutofill,
  EMPTY_AERODROME_ELEVATION_AUTOFILL_STATE,
} from './aerodromeElevationAutofill';

describe('aerodrome elevation autofill', () => {
  it('fills blank departure and destination elevation fields from anchored aerodromes', () => {
    const result = applyAerodromeElevationAutofill(
      createEmptyPerformanceInputDraft(),
      {
        departure: { waypointId: 'departure', elevationFt: 254 },
        destination: { waypointId: 'destination', elevationFt: 17 },
      },
      EMPTY_AERODROME_ELEVATION_AUTOFILL_STATE,
    );

    expect(result.draft.departureElevationFtMsl).toBe('254');
    expect(result.draft.destinationElevationFtMsl).toBe('17');
    expect(result.state).toEqual({
      departure: { waypointId: 'departure', elevationFt: 254 },
      destination: { waypointId: 'destination', elevationFt: 17 },
    });
  });

  it('updates a value previously supplied by autofill when its endpoint changes', () => {
    const result = applyAerodromeElevationAutofill(
      {
        ...createEmptyPerformanceInputDraft(),
        destinationElevationFtMsl: '254',
      },
      {
        departure: null,
        destination: { waypointId: 'new-destination', elevationFt: 17 },
      },
      {
        departure: null,
        destination: { waypointId: 'old-destination', elevationFt: 254 },
      },
    );

    expect(result.draft.destinationElevationFtMsl).toBe('17');
    expect(result.state.destination).toEqual({
      waypointId: 'new-destination',
      elevationFt: 17,
    });
  });

  it('preserves a different user-entered elevation as a manual override', () => {
    const result = applyAerodromeElevationAutofill(
      {
        ...createEmptyPerformanceInputDraft(),
        departureElevationFtMsl: '300',
      },
      {
        departure: { waypointId: 'departure', elevationFt: 254 },
        destination: null,
      },
      {
        departure: { waypointId: 'previous-departure', elevationFt: 200 },
        destination: null,
      },
    );

    expect(result.draft.departureElevationFtMsl).toBe('300');
    expect(result.state.departure).toBeNull();
  });
});
