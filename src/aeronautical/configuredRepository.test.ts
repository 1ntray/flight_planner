import { describe, expect, it } from 'vitest';

import { getConfiguredAeronauticalRepository } from './configuredRepository';

describe('aeronautical repository configuration', () => {
  it('uses an empty repository unless synthetic development data is explicit', async () => {
    await expect(
      getConfiguredAeronauticalRepository('').getDatasetMetadata(),
    ).resolves.toBeNull();

    await expect(
      getConfiguredAeronauticalRepository('?aeroDemo=1').getDatasetMetadata(),
    ).resolves.toMatchObject({
      datasetId: 'synthetic-demo-1',
      airacCycle: null,
      sourceName: 'Synthetic development data — not for navigation',
    });
  });
});

