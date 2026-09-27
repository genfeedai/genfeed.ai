/**
 * Extracted from PromptTransformationService (#5375) to keep the service
 * under the split-controller 500-line ceiling
 * (prompts-split-controllers.spec.ts). Pure — no service state.
 */
export function errorMessage(
  error: unknown,
  fallback = 'An error occurred',
): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return fallback;
  }

  return typeof error.message === 'string' && error.message
    ? error.message
    : fallback;
}
