/** Cached workflow options of the Turbo new-project picker, per brand. */
export const TURBO_WORKFLOW_OPTIONS_QUERY_KEY = ['turbo-workflow-options'];

export function turboWorkflowOptionsQueryKey(brandId: string) {
  return [...TURBO_WORKFLOW_OPTIONS_QUERY_KEY, brandId];
}
