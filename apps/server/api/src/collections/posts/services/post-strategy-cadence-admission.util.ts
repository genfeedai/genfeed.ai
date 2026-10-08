import { readArtifactRecord } from '@api/agent-artifacts/agent-artifact-material.util';
import {
  cadencePublicationDate,
  getCadenceWeek,
  resolveCadencePolicy,
} from '@api/collections/agent-strategies/services/agent-strategy-cadence.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

export function requiresStrategyCadenceAdmission(
  candidate: Readonly<Record<string, unknown>>,
): boolean {
  return Boolean(
    candidate.agentStrategyId &&
      !candidate.parentId &&
      [
        TargetExecutionState.SCHEDULED,
        TargetExecutionState.PUBLISHING,
      ].includes(candidate.targetExecutionState as TargetExecutionState),
  );
}

export async function assertStrategyCadenceAdmission(
  tx: Prisma.TransactionClient,
  candidate: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (!requiresStrategyCadenceAdmission(candidate)) return;
  const strategyId = String(candidate.agentStrategyId);
  const organizationId = String(candidate.organizationId ?? '');
  if (!organizationId)
    throw new ConflictException(
      'Strategy scheduling requires an organization.',
    );
  // Use the same lock as strategy configuration changes so a lowered ceiling
  // and the last available schedule slot cannot cross each other.
  const key = `agent-strategy-config:${strategyId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  const strategy = await tx.agentStrategy.findFirst({
    where: scopedWhere(organizationId, {
      id: strategyId,
      brandId: typeof candidate.brandId === 'string' ? candidate.brandId : null,
    }),
    select: { config: true },
  });
  if (!strategy)
    throw new ConflictException(
      'The post strategy is unavailable in this brand.',
    );
  const config = readArtifactRecord(strategy.config);
  const policy = resolveCadencePolicy(config);
  if (!policy.separate) return;
  const date = cadencePublicationDate(candidate) ?? new Date();
  const { start, end } = getCadenceWeek(
    typeof config.timezone === 'string' ? config.timezone : 'UTC',
    date,
  );
  const rows = await tx.post.findMany({
    where: scopedWhere(organizationId, {
      agentStrategyId: strategyId,
      parentId: null,
      targetExecutionState: {
        in: [
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
          TargetExecutionState.PUBLISHED,
        ],
      },
      OR: [
        { publishedAt: { gte: start, lt: end } },
        { scheduledDate: { gte: start, lt: end } },
        { targetExecutionState: TargetExecutionState.PUBLISHING },
      ],
    }),
    select: {
      id: true,
      groupId: true,
      publishedAt: true,
      scheduledDate: true,
      targetExecutionState: true,
    },
    take: 1001,
  });
  const identity = String(
    candidate.groupId || candidate.id || 'new-content-group',
  );
  const groups = new Set(
    rows
      .filter((row) => {
        if (row.id === candidate.id) return false;
        const at = cadencePublicationDate(row);
        return at && at >= start && at < end;
      })
      .map((row) => row.groupId || row.id),
  );
  if (groups.has(identity)) return;
  if (rows.length >= 1001 || groups.size >= policy.ceiling)
    throw new ConflictException(
      'The publishing ceiling is reached for this strategy and week. Keep the post as a draft or select another week.',
    );
}
