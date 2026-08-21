export const STUDIO_REMIX_RUN_QUERY_KEY = 'run';

const SAFE_REMIX_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;

export function parseStudioRemixRunId(
  searchParams: Pick<URLSearchParams, 'get'>,
): string | null {
  const runId = searchParams.get(STUDIO_REMIX_RUN_QUERY_KEY)?.trim() ?? '';
  return SAFE_REMIX_RUN_ID.test(runId) ? runId : null;
}
