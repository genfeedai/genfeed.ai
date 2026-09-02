import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import { PollAbortException } from '@api/shared/services/poll-until/poll-until.exception';

/**
 * Thrown when a studio generation is stopped while the provider job is still
 * in flight. Distinct from a provider failure so completion/finalize paths
 * can no-op instead of treating Stop as an error.
 */
export class GenerationCancelledError extends Error {
  constructor(message = GENERATION_CANCELLED_BY_USER) {
    super(message);
    this.name = 'GenerationCancelledError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isGenerationCancelledError(error: unknown): boolean {
  return (
    error instanceof GenerationCancelledError ||
    error instanceof PollAbortException
  );
}
