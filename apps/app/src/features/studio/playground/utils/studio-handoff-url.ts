export const STUDIO_HANDOFF_QUERY_KEY = 'handoff';

const SAFE_HANDOFF_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;

export function parseStudioHandoffId(
  searchParams: Pick<URLSearchParams, 'get'>,
): string | null {
  const id = searchParams.get(STUDIO_HANDOFF_QUERY_KEY)?.trim() ?? '';
  return SAFE_HANDOFF_ID.test(id) ? id : null;
}
