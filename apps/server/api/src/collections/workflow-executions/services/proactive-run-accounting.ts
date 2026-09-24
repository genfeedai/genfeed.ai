import type { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AgentStrategyRunStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IAgentStrategyPerformanceSnapshot } from '@genfeedai/contracts/interfaces';
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

function readPerformanceSnapshot(
  value: unknown,
): IAgentStrategyPerformanceSnapshot | undefined {
  const snapshot = record(value);
  const numbers = [
    'clicks',
    'creditsSpent',
    'ctr',
    'generatedCount',
    'impressions',
    'publishedCount',
  ];
  const lists = ['bestPostingWindows', 'topHooks', 'topTopics'];
  if (
    numbers.some(
      (key) =>
        typeof snapshot[key] !== 'number' ||
        !Number.isFinite(snapshot[key]) ||
        Number(snapshot[key]) < 0,
    ) ||
    lists.some(
      (key) =>
        !Array.isArray(snapshot[key]) ||
        !(snapshot[key] as unknown[]).every(
          (entry) => typeof entry === 'string',
        ),
    ) ||
    !Array.isArray(snapshot.bestPlatformFormatPairs) ||
    !snapshot.bestPlatformFormatPairs.every((entry) => {
      const pair = record(entry);
      return (
        typeof pair.platform === 'string' &&
        typeof pair.format === 'string' &&
        typeof pair.score === 'number' &&
        Number.isFinite(pair.score)
      );
    }) ||
    ['costPerVisit', 'visits'].some(
      (key) =>
        snapshot[key] !== null &&
        (typeof snapshot[key] !== 'number' ||
          !Number.isFinite(snapshot[key]) ||
          Number(snapshot[key]) < 0),
    )
  )
    return undefined;
  return snapshot as unknown as IAgentStrategyPerformanceSnapshot;
}

export function proactiveRunMetadata(result: unknown): {
  strategyId: string;
  threadId?: string;
  performanceSnapshot?: IAgentStrategyPerformanceSnapshot;
} | null {
  const metadata = record(record(result).metadata);
  if (
    metadata.source !== 'proactive' ||
    metadata.canonicalId !== 'agent.turn.execute' ||
    typeof metadata.strategyId !== 'string' ||
    metadata.strategyId.length === 0
  )
    return null;
  return {
    strategyId: metadata.strategyId,
    ...(readPerformanceSnapshot(metadata.performanceSnapshot)
      ? {
          performanceSnapshot: readPerformanceSnapshot(
            metadata.performanceSnapshot,
          ),
        }
      : {}),
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
      performanceSnapshot: proactive.performanceSnapshot,
    },
    execution.organizationId,
    transaction,
  );
  const strategy = await transaction.agentStrategy.findFirst({
    where: scopedWhere(execution.organizationId, { id: proactive.strategyId }),
    select: {
      brandId: true,
      label: true,
      brand: { select: { slug: true } },
      organization: { select: { slug: true } },
    },
  });
  const pendingReviewCount = await transaction.post.count({
    where: scopedWhere(execution.organizationId, {
      workflowExecutionId: execution.id,
      agentStrategyId: proactive.strategyId,
      targetExecutionState: TargetExecutionState.DRAFT,
      reviewDecision: null,
    }),
  });
  const publishedCount = await transaction.post.count({
    where: scopedWhere(execution.organizationId, {
      workflowExecutionId: execution.id,
      agentStrategyId: proactive.strategyId,
      targetExecutionState: TargetExecutionState.PUBLISHED,
    }),
  });
  const summary = `${contentGenerated} posts created; ${publishedCount} published; ${pendingReviewCount} waiting for review. ${creditsUsed} credits used.${outcome.failed ? ' The run failed; inspect its activity before retrying.' : ''}`;
  const periodStart = new Date(outcome.completedAt);
  periodStart.setUTCHours(0, 0, 0, 0);
  if (strategy) {
    const snapshot = proactive.performanceSnapshot;
    const report = {
      bestPlatformFormatPairs: [],
      bestPostingWindows: [],
      clicks: 0,
      costPerVisit: null,
      ctr: 0,
      impressions: 0,
      topHooks: [],
      topTopics: [],
      visits: null,
      ...(snapshot ?? {}),
      allocationChanges:
        snapshot?.bestPlatformFormatPairs
          .slice(0, 2)
          .map(
            (pair) =>
              `Bias next runs toward ${pair.platform}/${pair.format} based on observed performance.`,
          ) ?? [],
      generatedCount: contentGenerated,
      publishedCount,
      creditsSpent: creditsUsed,
      periodStart: periodStart.toISOString(),
      periodEnd: outcome.completedAt.toISOString(),
      reportType: 'daily',
      summary,
      metadata: {
        executionId: execution.id,
        pendingReviewCount,
        status: outcome.failed ? 'failed' : 'completed',
        performanceSnapshotAvailable: Boolean(snapshot),
        measurementBasis: snapshot
          ? 'Rolling weekly snapshot captured before this run; generated, published, pending review and credits describe this run.'
          : 'Prior performance snapshot unavailable; generated, published, pending review and credits describe this run.',
        performanceSnapshot: snapshot,
      },
    };
    await transaction.agentStrategyReport.upsert({
      where: {
        id: `agent-run:${execution.id}`,
        organizationId: execution.organizationId,
        isDeleted: false,
      },
      create: {
        id: `agent-run:${execution.id}`,
        strategyId: proactive.strategyId,
        organizationId: execution.organizationId,
        brandId: strategy.brandId,
        data: toPrismaJson(report),
      },
      update: {},
    });
  }
  const sourcePath =
    strategy?.organization.slug && strategy.brand?.slug
      ? `/${encodeURIComponent(strategy.organization.slug)}/${encodeURIComponent(strategy.brand.slug)}/automation/agents/${encodeURIComponent(proactive.strategyId)}`
      : null;
  const recordedResult = withProactiveConsumedCredits(
    execution.result,
    creditsUsed,
  );
  recordedResult.metadata = {
    ...record(recordedResult.metadata),
    agentReport: {
      summary,
      pendingReviewCount,
      publishedCount,
      generatedCount: contentGenerated,
      creditsUsed,
      strategyId: proactive.strategyId,
      label: strategy?.label ?? 'Agent',
      sourcePath,
    },
  };
  return transaction.workflowExecution.update({
    where: scopedWhere(execution.organizationId, { id: execution.id }),
    data: {
      result: toPrismaJson(recordedResult),
    },
  });
}
