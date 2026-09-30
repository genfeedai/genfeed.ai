import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { assertWorkflowFundingIdentity } from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import type { WorkflowExecutionGenerationBilling } from '@genfeedai/contracts/interfaces/billing';
import { quoteModelBillableCompletion } from '@genfeedai/pricing';
import { Prisma } from '@genfeedai/prisma';

export interface WorkflowGenerationSettlementOperation {
  operationId: string;
  nodeId: string;
  actionId: string;
  billingMode: 'credits' | 'byok';
  phase: 'completed' | 'failed' | 'unsubmitted';
  credits: number;
  billableProviderCostUsd: number | null;
}

export interface WorkflowGenerationSettlement {
  actualAmount: number;
  operations: WorkflowGenerationSettlementOperation[];
}

export function workflowGenerationHoldAmount(
  plan: WorkflowExecutionGenerationBilling,
): Prisma.Decimal {
  return plan.manifest.allocations.reduce(
    (amount, allocation) =>
      amount.plus(
        allocation.billingMode === 'credits'
          ? (allocation.quote?.credits ?? 0)
          : 0,
      ),
    new Prisma.Decimal(0),
  );
}

/** Financial proof is immutable; mutable node results and library projections never enter settlement. */
export function calculateWorkflowGenerationSettlement(
  plan: WorkflowExecutionGenerationBilling,
): WorkflowGenerationSettlement | null {
  assertWorkflowFundingIdentity(plan);
  if (!workflowGenerationHoldAmount(plan).equals(plan.holdAmount))
    throw new BusinessLogicException(
      'Workflow hold amount differs from its frozen allocations',
    );
  if (!plan.dispatchClosed) return null;
  const operations: WorkflowGenerationSettlementOperation[] = [];
  let amount = new Prisma.Decimal(0);
  for (const allocation of plan.manifest.allocations) {
    const evidence = plan.operations.find(
      (item) => item.operationId === allocation.operationId,
    );
    if (
      !evidence ||
      !['completed', 'failed', 'unsubmitted'].includes(evidence.phase)
    )
      return null;
    if (
      evidence.phase !== 'completed' &&
      evidence.phase !== 'failed' &&
      evidence.phase !== 'unsubmitted'
    )
      return null;
    let credits = 0;
    let billableProviderCostUsd: number | null =
      evidence.phase === 'completed' && allocation.billingMode === 'byok'
        ? null
        : 0;
    if (
      evidence.phase === 'completed' &&
      allocation.billingMode === 'credits'
    ) {
      if (!allocation.quote)
        throw new BusinessLogicException(
          'Workflow completed allocation has no frozen quote',
        );
      const completion = quoteModelBillableCompletion(
        allocation.quote,
        evidence.completion,
      );
      if (completion.status === 'unresolved') return null;
      credits = completion.credits;
      billableProviderCostUsd = completion.billableProviderCostUsd;
      amount = amount.plus(credits);
    }
    operations.push({
      operationId: allocation.operationId,
      nodeId: allocation.nodeId,
      actionId: allocation.actionId,
      billingMode: allocation.billingMode,
      phase: evidence.phase,
      credits,
      billableProviderCostUsd,
    });
  }
  if (amount.greaterThan(plan.holdAmount))
    throw new BusinessLogicException(
      'Completed workflow units exceed their funding authorization',
    );
  return { actualAmount: amount.toNumber(), operations };
}
