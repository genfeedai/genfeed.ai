import type { ExecutionContext } from '@genfeedai/workflows/engine';

interface FundedSubmission {
  bind(ingredientId: string): Promise<void>;
  /** A definitive rejection: the output hold goes back. */
  reject(ingredientId: string): Promise<void>;
}

interface FundedSubmissionTarget {
  context: ExecutionContext;
  continuationId: string;
  ingredientId: string;
}

/**
 * Binds the output to its hold, then submits. Funds go back only when the
 * provider never saw the job or definitively refused it; an ambiguous
 * failure keeps the hold for the callback or reconciliation to resolve.
 */
export async function dispatchFundedSubmission<T>(params: {
  failContinuation: (input: {
    continuationId: string;
    error: string;
    organizationId: string;
  }) => Promise<void>;
  funding: FundedSubmission;
  isRejected: (error: unknown) => boolean;
  submit: () => Promise<T>;
  target: FundedSubmissionTarget;
}): Promise<T> {
  const { failContinuation, funding, isRejected, submit, target } = params;
  let isSubmissionStarted = false;
  try {
    await funding.bind(target.ingredientId);
    isSubmissionStarted = true;
    return await submit();
  } catch (error: unknown) {
    if (!isSubmissionStarted) {
      // The helper fails the continuation only for a provider rejection.
      await failContinuation({
        continuationId: target.continuationId,
        error: error instanceof Error ? error.message : String(error),
        organizationId: target.context.organizationId,
      });
    }
    if (!isSubmissionStarted || isRejected(error))
      await funding.reject(target.ingredientId);
    throw error;
  }
}
