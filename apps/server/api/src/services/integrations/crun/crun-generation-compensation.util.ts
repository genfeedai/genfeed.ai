import type {
  GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';

export const CRUN_DISPATCH_ABORTED = 'CRUN_DISPATCH_ABORTED';

interface CrunCompensationDeps {
  tasks: Pick<CrunTaskService, 'failPrepared' | 'findForIngredient'>;
  billing: Pick<
    GenerationBillingService,
    'abortUnsubmittedOutput' | 'recordSubmissionRejection' | 'releasePool'
  >;
  receipts: Pick<MediaGenerationReceiptsService, 'syncTerminal'>;
}

/**
 * Undo a dispatch that threw after funding was reserved (image and video share
 * it). Outputs whose task row is still `prepared` take the existing
 * submission-rejection path; outputs that never got a task row take the billing
 * pre-submission abort (hold evidence, release, failure); a task already claimed for submission is left to the poller, since
 * its acceptance is ambiguous. Each output failed here also fails its
 * generation receipt (detached). The funding pool is then released.
 */
export async function compensateCrunDispatchFailure(
  deps: CrunCompensationDeps,
  params: {
    organizationId: string;
    ingredientIds: readonly string[];
    billingRequest: GenerationBillingRequest;
  },
): Promise<void> {
  const { organizationId, ingredientIds, billingRequest } = params;
  for (const ingredientId of ingredientIds) {
    try {
      await compensateOutput(deps, organizationId, ingredientId);
    } catch {
      // The original dispatch error must surface and the pool must still be
      // released; a stuck output is retried by the stale-prepared sweep.
    }
  }
  await deps.billing.releasePool(billingRequest);
}

async function compensateOutput(
  deps: CrunCompensationDeps,
  organizationId: string,
  ingredientId: string,
): Promise<void> {
  const task = await deps.tasks.findForIngredient(organizationId, ingredientId);
  if (!task) {
    await deps.billing.abortUnsubmittedOutput(ingredientId, organizationId);
  } else if (task.state === 'prepared') {
    await deps.tasks.failPrepared(task, CRUN_DISPATCH_ABORTED);
    await deps.billing.recordSubmissionRejection(ingredientId, organizationId);
  } else return;
  void deps.receipts.syncTerminal(organizationId, ingredientId, 'released');
}
