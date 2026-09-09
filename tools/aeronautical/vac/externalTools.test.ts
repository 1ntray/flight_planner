import { describe, expect, it } from 'vitest';
import { runCommand } from './externalTools';

describe('VAC external tool diagnostics', () => {
  it('names a missing required executable and explains the PATH requirement', async () => {
    await expect(runCommand('flight-planner-definitely-missing-vac-tool', []))
      .rejects.toThrow(/could not be started.*Poppler and GDAL.*PATH/);
  });
});
