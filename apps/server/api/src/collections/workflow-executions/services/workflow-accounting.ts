import { reconcileWorkflowMediaCosts } from '@api/collections/workflow-executions/services/workflow-media-accounting-reconciliation';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  WorkflowAccounting,
  WorkflowNodeAccounting,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { isEngineNativeNodeType } from '@genfeedai/workflows/engine';
import { z } from 'zod';

const estimateSchema = z.object({
  brandId: z.string().nullable(),
  estimatedProviderCostMicros: z.number().nullable(),
  knownEstimatedProviderCostMicros: z.number(),
  version: z.literal(1),
  capturedAt: z.string(),
  estimatedCredits: z.number().finite().nullable(),
  knownEstimatedCredits: z.number().finite(),
  nodes: z.array(
    z.object({
      estimatedProviderCostMicros: z.number().nullable(),
      nodeId: z.string(),
      nodeType: z.string(),
      model: z.string().nullable(),
      provider: z.string().nullable(),
      quantity: z.number().finite().nullable(),
      estimatedCredits: z.number().finite().nullable(),
      pricingFingerprint: z.string().nullable(),
      unresolvedReason: z.string().nullable(),
      pricing: z
        .object({
          pricingType: z.string().nullable(),
          marginMultiplier: z.number(),
          providerCostUsd: z.number().nullable(),
          modelUpdatedAt: z.string(),
        })
        .nullable(),
    }),
  ),
});

export async function readWorkflowAccounting(
  prisma: PrismaService,
  organizationId: string,
  executionId: string,
): Promise<WorkflowAccounting | null> {
  return (
    (await readWorkflowAccountings(prisma, organizationId, [executionId])).get(
      executionId,
    ) ?? null
  );
}

export async function readWorkflowAccountings(
  prisma: PrismaService,
  organizationId: string,
  executionIds: string[],
): Promise<Map<string, WorkflowAccounting>> {
  const executions = await prisma.workflowExecution.findMany({
    where: { id: { in: executionIds }, organizationId, isDeleted: false },
    include: { nodeResults: true },
  });
  const results = new Map<string, WorkflowAccounting>();
  if (!executions.length) return results;
  await reconcileWorkflowMediaCosts(
    prisma,
    organizationId,
    executions.map((execution) => execution.id),
  );
  const where = {
    organizationId,
    workflowExecutionId: { in: executions.map((execution) => execution.id) },
    isDeleted: false,
  };
  const [allTransactions, allReservations, allLlm, allMedia, allContinuations] =
    await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        select: {
          workflowExecutionId: true,
          workflowNodeId: true,
          amount: true,
          category: true,
        },
      }),
      prisma.creditReservation.findMany({
        where,
        select: {
          workflowExecutionId: true,
          workflowNodeId: true,
          amount: true,
          status: true,
        },
      }),
      prisma.llmVendorCost.findMany({
        where,
        select: {
          workflowExecutionId: true,
          workflowNodeId: true,
          vendorCostMicros: true,
          costEvidence: true,
          model: true,
          provider: true,
        },
      }),
      prisma.mediaVendorCost.findMany({
        where,
        select: {
          pricingSnapshot: true,
          workflowExecutionId: true,
          workflowNodeId: true,
          vendorCostMicros: true,
          costEvidence: true,
          model: true,
          provider: true,
        },
      }),
      prisma.workflowNodeContinuation.findMany({
        where: {
          executionId: { in: executions.map((execution) => execution.id) },
          organizationId,
        },
        select: { executionId: true, nodeId: true, status: true },
      }),
    ]);
  for (const execution of executions) {
    const transactions = allTransactions.filter(
      (row) => row.workflowExecutionId === execution.id,
    );
    const reservations = allReservations.filter(
      (row) => row.workflowExecutionId === execution.id,
    );
    const llm = allLlm.filter(
      (row) => row.workflowExecutionId === execution.id,
    );
    const media = allMedia.filter(
      (row) => row.workflowExecutionId === execution.id,
    );
    const continuations = allContinuations.filter(
      (row) => row.executionId === execution.id,
    );
    const parsed = estimateSchema.safeParse(execution.costEstimate);
    const estimate = parsed.success ? parsed.data : null;
    const providerRows = [...llm, ...media];
    const nodeIds = new Set([
      ...(estimate?.nodes.map((node) => node.nodeId) ?? []),
      ...execution.nodeResults.map((node) => node.nodeId),
      ...transactions.map((row) => row.workflowNodeId ?? '__unattributed__'),
      ...reservations.map((row) => row.workflowNodeId ?? '__unattributed__'),
      ...providerRows.map((row) => row.workflowNodeId ?? '__unattributed__'),
    ]);
    const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(
      String(execution.status).toUpperCase(),
    );
    const nodes: WorkflowNodeAccounting[] = [...nodeIds].map((nodeId) => {
      const quote = estimate?.nodes.find((node) => node.nodeId === nodeId);
      const result = execution.nodeResults.find(
        (node) => node.nodeId === nodeId,
      );
      const isFreeControl = Boolean(
        quote && isEngineNativeNodeType(quote.nodeType),
      );
      const rows = transactions.filter(
        (row) => (row.workflowNodeId ?? '__unattributed__') === nodeId,
      );
      const paid = rows
        .filter((row) => row.category === 'deduct')
        .reduce(
          (sum, row) => sum.plus(new Prisma.Decimal(row.amount).abs()),
          new Prisma.Decimal(0),
        );
      const refundedCredits = rows
        .filter((row) => row.category === 'refund')
        .reduce(
          (sum, row) => sum.plus(new Prisma.Decimal(row.amount).abs()),
          new Prisma.Decimal(0),
        )
        .toNumber();
      const reservedCredits = reservations
        .filter(
          (row) =>
            (row.workflowNodeId ?? '__unattributed__') === nodeId &&
            row.status === 'RESERVED',
        )
        .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
        .toNumber();
      const knownActualCredits = paid.minus(refundedCredits).toNumber();
      const hasNoChargeDisposition = media.some(
        (row) =>
          (row.workflowNodeId ?? '__unattributed__') === nodeId &&
          row.pricingSnapshot &&
          typeof row.pricingSnapshot === 'object' &&
          !Array.isArray(row.pricingSnapshot) &&
          row.pricingSnapshot.billingDisposition === 'not_charged',
      );
      const hasEvidence = rows.some((row) =>
        ['deduct', 'byok-usage', 'refund'].includes(row.category ?? ''),
      );
      const hasPendingProvider = continuations.some(
        (row) =>
          row.nodeId === nodeId &&
          ![
            'COMPLETED',
            'FAILED',
            'PROVIDER_SUCCEEDED',
            'PROVIDER_FAILED',
          ].includes(row.status),
      );
      const hasUnaccountedRetry =
        (result?.retryCount ?? 0) > 0 &&
        providerRows.some(
          (row) =>
            (row.workflowNodeId ?? '__unattributed__') === nodeId &&
            (!row.costEvidence ||
              ['pending', 'unknown'].includes(row.costEvidence)),
        );
      const actualCredits =
        isTerminal &&
        !reservedCredits &&
        !hasPendingProvider &&
        !hasUnaccountedRetry &&
        (hasEvidence || isFreeControl || hasNoChargeDisposition)
          ? knownActualCredits
          : null;
      const estimatedCredits = quote?.estimatedCredits ?? null;
      const vendors = providerRows.filter(
        (row) => (row.workflowNodeId ?? '__unattributed__') === nodeId,
      );
      const providerBreakdown = [
        ...new Set(
          vendors.map((row) => JSON.stringify([row.model, row.provider])),
        ),
      ].map((key) => {
        const group = vendors.filter(
          (row) => JSON.stringify([row.model, row.provider]) === key,
        );
        const knownProviderCostMicros = group
          .filter(
            (row) =>
              row.costEvidence &&
              !['pending', 'unknown'].includes(row.costEvidence),
          )
          .reduce((sum, row) => sum + row.vendorCostMicros, 0);
        return {
          model: group[0]?.model ?? 'unknown',
          provider: group[0]?.provider ?? 'unknown',
          knownProviderCostMicros,
          actualProviderCostMicros: group.every(
            (row) =>
              row.costEvidence &&
              !['pending', 'unknown'].includes(row.costEvidence),
          )
            ? knownProviderCostMicros
            : null,
        };
      });
      const knownProviderCostMicros = vendors
        .filter(
          (row) =>
            row.costEvidence &&
            !['unknown', 'pending'].includes(row.costEvidence),
        )
        .reduce((sum, row) => sum + row.vendorCostMicros, 0);
      const actualProviderCostMicros =
        isTerminal &&
        !hasPendingProvider &&
        !hasUnaccountedRetry &&
        (isFreeControl ||
          (vendors.length > 0 &&
            vendors.every(
              (row) =>
                row.costEvidence &&
                !['unknown', 'pending'].includes(row.costEvidence),
            )))
          ? knownProviderCostMicros
          : null;
      const unresolvedReasons = [
        ...(nodeId === '__unattributed__' ? ['node_attribution_missing'] : []),
        ...(quote?.unresolvedReason ? [quote.unresolvedReason] : []),
        ...(!hasEvidence && !isFreeControl && !hasNoChargeDisposition
          ? ['billing_evidence_missing']
          : []),
        ...(hasPendingProvider ? ['provider_pending'] : []),
        ...(hasUnaccountedRetry ? ['retry_reconciliation_required'] : []),
        ...(actualProviderCostMicros === null
          ? ['provider_cost_incomplete']
          : []),
      ];
      return {
        nodeId,
        providerBreakdown,
        model:
          providerBreakdown.length === 1
            ? (providerBreakdown[0]?.model ?? null)
            : null,
        provider:
          providerBreakdown.length === 1
            ? (providerBreakdown[0]?.provider ?? null)
            : null,
        estimatedCredits,
        actualCredits,
        knownActualCredits,
        actualProviderCostMicros,
        knownProviderCostMicros,
        unresolvedReasons,
        refundedCredits,
        reservedCredits,
        varianceCredits:
          actualCredits !== null && estimatedCredits !== null
            ? new Prisma.Decimal(actualCredits)
                .minus(estimatedCredits)
                .toNumber()
            : null,
        state:
          reservedCredits > 0
            ? 'reserved'
            : actualCredits !== null && actualProviderCostMicros !== null
              ? refundedCredits > 0
                ? 'refunded'
                : 'reconciled'
              : isTerminal
                ? 'indeterminate'
                : hasEvidence
                  ? 'consuming'
                  : estimate
                    ? 'estimated'
                    : 'unestimated',
      };
    });
    const knownActualCredits = nodes
      .reduce(
        (sum, node) => sum.plus(node.knownActualCredits),
        new Prisma.Decimal(0),
      )
      .toNumber();
    const knownProviderCostMicros = nodes.reduce(
      (sum, node) => sum + node.knownProviderCostMicros,
      0,
    );
    const hasUnattributedTransactions = transactions.some(
      (row) => !row.workflowNodeId,
    );
    const actualCredits =
      nodes.length &&
      !hasUnattributedTransactions &&
      nodes.every((node) => node.actualCredits !== null)
        ? knownActualCredits
        : null;
    const actualProviderCostMicros =
      nodes.length &&
      providerRows.every((row) => row.workflowNodeId) &&
      nodes.every((node) => node.actualProviderCostMicros !== null)
        ? knownProviderCostMicros
        : null;
    const estimatedCredits = estimate?.estimatedCredits ?? null;
    results.set(execution.id, {
      estimatedProviderCostMicros:
        estimate?.estimatedProviderCostMicros ?? null,
      varianceProviderCostMicros:
        actualProviderCostMicros !== null &&
        estimate?.estimatedProviderCostMicros !== null &&
        estimate?.estimatedProviderCostMicros !== undefined
          ? actualProviderCostMicros - estimate.estimatedProviderCostMicros
          : null,
      estimate,
      nodes,
      knownActualCredits,
      actualCredits,
      actualProviderCostMicros,
      knownProviderCostMicros,
      estimatedCredits,
      varianceCredits:
        actualCredits !== null && estimatedCredits !== null
          ? new Prisma.Decimal(actualCredits).minus(estimatedCredits).toNumber()
          : null,
    });
  }
  return results;
}
