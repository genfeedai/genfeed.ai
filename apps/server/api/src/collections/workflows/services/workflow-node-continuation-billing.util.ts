import type { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import { currentWorkflowGenerationDispatch } from '@api/collections/workflow-executions/services/workflow-generation-dispatch.context';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Prisma, WorkflowNodeContinuationStatus } from '@genfeedai/prisma';

type ContinuationBilling = Pick<
  WorkflowGenerationBillingService,
  'recordContinuationProof' | 'recordSubmissionIntent'
>;

type ContinuationSettlementInput = {
  continuationId: string;
  organizationId: string;
  succeeded: boolean;
};

type ContinuationProofRow = {
  actionId: string;
  executionId: string;
  externalId: string | null;
  id: string;
  ingredientId: string;
  nodeId: string;
  organizationId: string;
  provider: string;
};

/**
 * Funded continuation helpers extracted from WorkflowNodeContinuationService
 * to stay under the runtime-complexity file-size guard.
 */
export async function recordFundedWorkflowSubmissionIntent(
  billing: ContinuationBilling | undefined,
  transaction: Prisma.TransactionClient,
  executionId: string,
  organizationId: string,
): Promise<void> {
  const dispatch = currentWorkflowGenerationDispatch();
  if (
    !billing ||
    !dispatch?.dispatchFingerprint ||
    dispatch.executionId !== executionId ||
    dispatch.organizationId !== organizationId
  ) {
    throw new Error('Workflow dispatch context is unavailable');
  }
  await billing.recordSubmissionIntent(
    transaction,
    executionId,
    organizationId,
    dispatch.operationId,
    dispatch.dispatchFingerprint,
    dispatch.claimId,
  );
}

export async function finishWorkflowContinuationSettlement(
  prisma: PrismaService,
  billing: ContinuationBilling | undefined,
  input: ContinuationSettlementInput,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const continuation = (await transaction.workflowNodeContinuation.findFirst({
      where: {
        id: input.continuationId,
        organizationId: input.organizationId,
        status: WorkflowNodeContinuationStatus.RESUMING,
      },
    })) as ContinuationProofRow | null;
    if (!continuation) {
      return;
    }
    const finished = await transaction.workflowNodeContinuation.updateMany({
      data: {
        completedAt: new Date(),
        resumeClaimedAt: null,
        status: input.succeeded
          ? WorkflowNodeContinuationStatus.COMPLETED
          : WorkflowNodeContinuationStatus.FAILED,
      },
      where: {
        id: continuation.id,
        organizationId: input.organizationId,
        status: WorkflowNodeContinuationStatus.RESUMING,
      },
    });
    if (finished.count !== 1) {
      return;
    }
    await billing?.recordContinuationProof(
      transaction,
      continuation,
      input.succeeded
        ? {
            kind: 'completed',
            ...(continuation.externalId
              ? { providerJobId: continuation.externalId }
              : {}),
          }
        : {
            kind: 'provider-terminal',
            ...(continuation.externalId
              ? { providerJobId: continuation.externalId }
              : {}),
          },
    );
  });
}
