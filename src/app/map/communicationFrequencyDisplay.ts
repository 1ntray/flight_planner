import type { CommunicationFrequencyAssignment } from '../../domain';

export const DISPLAY_FREQUENCY_MIN_MHZ = 118;
export const DISPLAY_FREQUENCY_MAX_MHZ = 136;

/** Keeps the map information UI focused on the requested civil VHF range. */
export function isDisplayedCommunicationFrequency(
  frequency: CommunicationFrequencyAssignment,
): boolean {
  if (!/^\d{3}\.\d{3}$/.test(frequency.valueMHz)) return false;
  const value = Number(frequency.valueMHz);
  return (
    value >= DISPLAY_FREQUENCY_MIN_MHZ &&
    value <= DISPLAY_FREQUENCY_MAX_MHZ
  );
}
