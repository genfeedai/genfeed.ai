import type { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { scopedWhere } from '@api/index';
import { AgentStrategyRunStatus } from '@genfeedai/contracts';
import {
  Prisma,
  toPrismaJson,
  type WorkflowExecution,
} from '@genfeedai/prisma';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function proactiveRunMetadata(
  result: unknown,
): { strategyId: string; threadId?: string } | null {
  const metadata = record(record(result).metadata);
  if (
    metadata.source !== 'proactive' ||
    metadata.canonicalId !== 'agent.turn.execute' ||
    typeof metadata.strategyId !== 'string'
  )
    return null;
  return {
    strategyId: metadata.strategyId,
    ...(typeof metadata.threadId === 'string'
      ? { threadId: metadata.threadId }
      : {}),
  };
}

export async function resolveProactiveConsumedCredits(
  transaction: Prisma.TransactionClient,
  input: { executionId: string; organizationId: string },
): Promise<number> {
  const ledger = await transaction.creditTransaction.findMany({
    where: {
      workflowExecutionId: input.executionId,
      organizationId: input.organizationId,
      isDeleted: false,
      category: { in: ['deduct', 'refund'] },
    },
    select: { amount: true, category: true },
  });
  if (ledger.length > 0) {
    const total = ledger.reduce(
      (sum, entry) =>
        entry.category === 'deduct'
          ? sum.plus(new Prisma.Decimal(entry.amount).abs())
          : sum.minus(new Prisma.Decimal(entry.amount).abs()),
      new Prisma.Decimal(0),
    );
    return Math.max(0, total.toNumber());
  }
  return 0;
}

export function withProactiveConsumedCredits(
  result: unknown,
  creditsUsed: number,
): Record<string, unknown> {
  return {
    ...record(result),
    metadata: {
      ...record(record(result).metadata),
      proactiveCreditsUsed: creditsUsed,
    },
  };
}

export async function recordProactiveRunCompletion(
  transaction: Prisma.TransactionClient,
  strategies: AgentStrategiesService,
  executionId: string,
  outcome: { completedAt: Date; failed: boolean },
): Promise<WorkflowExecution> {
  // tenant-scope-ignore: this primary-key read follows a successful organization-scoped terminal update in the same transaction
  const execution = await transaction.workflowExecution.findUnique({
    where: { id: executionId },
  });
  if (!execution) {
    throw new Error(
      `Workflow execution ${executionId} disappeared after its terminal transition`,
    );
  }
  const proactive = proactiveRunMetadata(execution.result);
  if (!proactive) return execution;
  const creditsUsed = await resolveProactiveConsumedCredits(transaction, {
    executionId: execution.id,
    organizationId: execution.organizationId,
  });
  const contentGenerated = await transaction.post.count({
    where: scopedWhere(execution.organizationId, {
      workflowExecutionId: execution.id,
      agentStrategyId: proactive.strategyId,
    }),
  });
  await strategies.recordRun(
    proactive.strategyId,
    {
      executionId: execution.id,
      startedAt: execution.startedAt ?? outcome.completedAt,
      completedAt: outcome.completedAt,
      status: outcome.failed
        ? AgentStrategyRunStatus.FAILED
        : AgentStrategyRunStatus.COMPLETED,
      creditsUsed,
      contentGenerated,
      threadId: proactive.threadId,
    },
    execution.organizationId,
    transaction,
  );
  return transaction.workflowExecution.update({
    where: scopedWhere(execution.organizationId, { id: execution.id }),
    data: {
      result: toPrismaJson(
        withProactiveConsumedCredits(execution.result, creditsUsed),
      ),
    },
  });
}
