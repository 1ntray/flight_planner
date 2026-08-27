import { describe, expect, it } from 'vitest';

import {
  CHROMIUM_RASTER_SEAM_CLASS_NAME,
  getChromiumRasterSeamClassName,
  isChromiumUserAgent,
} from './rasterTileSeamWorkaround';

describe('Chromium raster tile seam workaround', () => {
  it.each([
    'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 Chromium/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 OPR/121.0.0.0',
  ])('enables the isolated tile class for %s', (userAgent) => {
    expect(isChromiumUserAgent(userAgent)).toBe(true);
    expect(getChromiumRasterSeamClassName(userAgent)).toBe(
      CHROMIUM_RASTER_SEAM_CLASS_NAME,
    );
  });

  it.each([
    'Mozilla/5.0 Firefox/142.0',
    'Mozilla/5.0 Version/18.6 Safari/605.1.15',
  ])('leaves non-Chromium raster tiles unchanged for %s', (userAgent) => {
    expect(isChromiumUserAgent(userAgent)).toBe(false);
    expect(getChromiumRasterSeamClassName(userAgent)).toBeUndefined();
  });
});

