import { createHash } from 'node:crypto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  WorkflowCostEstimate,
  WorkflowNodeCostEstimate,
} from '@genfeedai/contracts/interfaces';
import {
  billCreditsFromProviderCost,
  buildPricingAuditStamp,
  resolveProviderCostUnits,
} from '@genfeedai/pricing';
import { Prisma } from '@genfeedai/prisma';
import {
  DEFAULT_CREDIT_COSTS,
  type ExecutableNode,
  getExecutableNodeOperationId,
  isEngineNativeNodeType,
} from '@genfeedai/workflows/engine';

export async function captureWorkflowCostEstimate(
  prisma: PrismaService,
  organizationId: string,
  nodes: ExecutableNode[],
  brandId?: string | null,
): Promise<WorkflowCostEstimate> {
  const projected = nodes.map((node) => ({
    ...node,
    operation: getExecutableNodeOperationId(node),
    config:
      typeof node.config.parameters === 'object' &&
      node.config.parameters !== null &&
      !Array.isArray(node.config.parameters)
        ? (node.config.parameters as Record<string, unknown>)
        : node.config,
  }));
  const keys = projected.flatMap((node) =>
    typeof node.config.model === 'string' ? [node.config.model] : [],
  );
  const models = keys.length
    ? await prisma.model.findMany({
        where: {
          isDeleted: false,
          key: { in: keys },
          OR: [{ organizationId }, { organizationId: null }],
        },
      })
    : [];
  const estimates: WorkflowNodeCostEstimate[] = projected.map((node) => {
    const operation = node.operation;
    const key =
      typeof node.config.model === 'string' ? node.config.model : null;
    const model = models.find((candidate) => candidate.key === key);
    const duration =
      typeof node.config.duration === 'number'
        ? node.config.duration
        : undefined;
    const width =
      typeof node.config.width === 'number' ? node.config.width : undefined;
    const height =
      typeof node.config.height === 'number' ? node.config.height : undefined;
    const hasDynamicInputs = JSON.stringify(node.config).includes('{{');
    const fixedCredits =
      !key && Object.hasOwn(DEFAULT_CREDIT_COSTS, operation)
        ? DEFAULT_CREDIT_COSTS[operation]
        : !key && isEngineNativeNodeType(operation)
          ? 0
          : null;
    const reason =
      fixedCredits !== null
        ? null
        : hasDynamicInputs
          ? 'runtime_inputs'
          : !model
            ? 'model_unresolved'
            : model.pricingType === 'per-token'
              ? 'runtime_tokens'
              : model.pricingType === 'per-second' &&
                  !(duration && duration > 0)
                ? 'runtime_duration'
                : model.pricingType === 'per-megapixel' &&
                    !(width && height && width > 0 && height > 0)
                  ? 'runtime_dimensions'
                  : null;
    const estimatedCredits =
      fixedCredits ??
      (reason || !model
        ? null
        : billCreditsFromProviderCost(model, { duration, width, height }));
    return {
      nodeId: node.id,
      nodeType: operation,
      model: key,
      provider: model?.provider ?? null,
      estimatedCredits,
      pricing: model
        ? {
            pricingType: model.pricingType,
            marginMultiplier: buildPricingAuditStamp(model).marginMultiplier,
            providerCostUsd: model.providerCostUsd,
            modelUpdatedAt: model.updatedAt.toISOString(),
          }
        : null,
      estimatedProviderCostMicros: isEngineNativeNodeType(operation)
        ? 0
        : !reason &&
            model &&
            typeof model.providerCostUsd === 'number' &&
            model.providerCostUsd >= 0
          ? Math.round(
              model.providerCostUsd *
                resolveProviderCostUnits(
                  model.pricingType,
                  model.defaultDuration,
                  { duration, width, height },
                ) *
                1_000_000,
            )
          : null,
      quantity:
        reason || !model
          ? null
          : resolveProviderCostUnits(model.pricingType, model.defaultDuration, {
              duration,
              width,
              height,
            }),
      pricingFingerprint:
        fixedCredits !== null
          ? createHash('sha256')
              .update(JSON.stringify({ operation, fixedCredits }))
              .digest('hex')
          : model
            ? createHash('sha256')
                .update(
                  JSON.stringify({
                    modelId: model.id,
                    updatedAt: model.updatedAt,
                    ...buildPricingAuditStamp(model),
                  }),
                )
                .digest('hex')
            : null,
      unresolvedReason:
        reason ?? (estimatedCredits === null ? 'pricing_unavailable' : null),
    };
  });
  const knownEstimatedCredits = estimates
    .reduce(
      (sum, node) => sum.plus(node.estimatedCredits ?? 0),
      new Prisma.Decimal(0),
    )
    .toNumber();
  return {
    brandId: brandId ?? null,
    estimatedProviderCostMicros: estimates.every(
      (node) => node.estimatedProviderCostMicros !== null,
    )
      ? estimates.reduce(
          (sum, node) => sum + (node.estimatedProviderCostMicros ?? 0),
          0,
        )
      : null,
    knownEstimatedProviderCostMicros: estimates.reduce(
      (sum, node) => sum + (node.estimatedProviderCostMicros ?? 0),
      0,
    ),
    version: 1,
    capturedAt: new Date().toISOString(),
    nodes: estimates,
    knownEstimatedCredits,
    estimatedCredits: estimates.some((node) => node.estimatedCredits === null)
      ? null
      : knownEstimatedCredits,
  };
}

export async function captureMissingWorkflowCostEstimate(
  prisma: PrismaService,
  executionId: string,
  organizationId: string,
  nodes: ExecutableNode[],
  brandId?: string | null,
): Promise<void> {
  const existing = await prisma.workflowExecution.findFirst({
    where: { id: executionId, organizationId, isDeleted: false },
    select: { costEstimate: true, startedAt: true },
  });
  if (!existing || existing.costEstimate || existing.startedAt) return;
  const estimate = await captureWorkflowCostEstimate(
    prisma,
    organizationId,
    nodes,
    brandId,
  );
  await prisma.workflowExecution.updateMany({
    where: {
      id: executionId,
      organizationId,
      isDeleted: false,
      costEstimate: { equals: Prisma.DbNull },
      startedAt: null,
    },
    data: {
      costEstimate: JSON.parse(
        JSON.stringify(estimate),
      ) as Prisma.InputJsonValue,
    },
  });
}
