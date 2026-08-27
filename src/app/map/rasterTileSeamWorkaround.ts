export const CHROMIUM_RASTER_SEAM_CLASS_NAME =
  'kartverket-topo-tiles--chromium-seam-fix';

const CHROMIUM_USER_AGENT_PATTERN = /(?:Chrome|Chromium|Edg|OPR)\/\d/iu;

export function isChromiumUserAgent(userAgent: string): boolean {
  return CHROMIUM_USER_AGENT_PATTERN.test(userAgent);
}

export function getChromiumRasterSeamClassName(
  userAgent: string,
): string | undefined {
  return isChromiumUserAgent(userAgent)
    ? CHROMIUM_RASTER_SEAM_CLASS_NAME
    : undefined;
}

