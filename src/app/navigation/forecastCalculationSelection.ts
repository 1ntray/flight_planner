export function calculateWithOptionalForecast<T>(
  manualResult: T,
  forecastSamples: readonly unknown[],
  calculateWithForecast: () => T,
): T {
  if (forecastSamples.length === 0) {
    return manualResult;
  }

  return calculateWithForecast();
}
