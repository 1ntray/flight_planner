import { MAX_SUPPORTED_PLANNING_ALTITUDE_FT } from '../../domain';

export type ParsedLegAltitudeDraft =
  | { status: 'valid'; value: number | null }
  | { status: 'invalid' };

export function formatLegAltitudeDraft(
  altitudeFtMsl: number | undefined,
): string {
  return altitudeFtMsl === undefined ? '' : String(altitudeFtMsl);
}

export function parseLegAltitudeDraft(
  draft: string,
): ParsedLegAltitudeDraft {
  const normalizedDraft = draft.trim();

  if (normalizedDraft === '') {
    return { status: 'valid', value: null };
  }

  const altitudeFtMsl = Number(normalizedDraft);

  if (
    !Number.isFinite(altitudeFtMsl) ||
    altitudeFtMsl < 0 ||
    altitudeFtMsl > MAX_SUPPORTED_PLANNING_ALTITUDE_FT
  ) {
    return { status: 'invalid' };
  }

  return { status: 'valid', value: altitudeFtMsl };
}
