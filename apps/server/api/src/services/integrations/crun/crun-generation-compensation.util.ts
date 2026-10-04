import type {
  GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';

export const CRUN_DISPATCH_ABORTED = 'CRUN_DISPATCH_ABORTED';

interface CrunCompensationDeps {
  tasks: Pick<CrunTaskService, 'failPrepared' | 'findForIngredient'>;
  billing: Pick<
    GenerationBillingService,
    'recordSubmissionRejection' | 'releasePool'
  >;
  prisma: Pick<PrismaService, 'ingredient'>;
}

/**
 * Undo a dispatch that threw after funding was reserved (image and video share
 * it). Outputs whose task row is still `prepared` take the existing
 * submission-rejection path; outputs that never got a task row are failed
 * directly; a task already claimed for submission is left to the poller, since
 * its acceptance is ambiguous. The funding pool is then released.
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
    await deps.prisma.ingredient.updateMany({
      where: {
        id: ingredientId,
        organizationId,
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      data: { status: IngredientStatus.FAILED },
    });
    return;
  }
  if (task.state !== 'prepared') return;
  await deps.tasks.failPrepared(task, CRUN_DISPATCH_ABORTED);
  await deps.billing.recordSubmissionRejection(ingredientId, organizationId);
}
