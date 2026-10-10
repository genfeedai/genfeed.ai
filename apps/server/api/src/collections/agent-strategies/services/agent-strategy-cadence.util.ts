import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type {
  CadenceDraftGenerator,
  FinalizeOpportunityInput,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import type { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  PersistedReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { AgentStrategyCadenceStatus } from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { DateTime } from 'luxon';

export type StrategyCadenceConfiguration = {
  postsPerWeek?: number;
  publishingCeilingPerWeek?: number;
  readyDraftReserve?: number;
};

export type StrategyCadencePolicy = {
  separate: boolean;
  target: number;
  ceiling: number;
  reserve: number;
};

export class CadenceGenerationUnavailableError extends Error {}

export function resolveCadencePolicy(
  config: StrategyCadenceConfiguration,
): StrategyCadencePolicy {
  const separate =
    config.publishingCeilingPerWeek !== undefined ||
    config.readyDraftReserve !== undefined;
  const target = config.postsPerWeek ?? 0;
  const ceiling = config.publishingCeilingPerWeek ?? target;
  const reserve = config.readyDraftReserve ?? 0;
  if (
    separate &&
    (!Number.isInteger(target) ||
      target < 1 ||
      target > 100 ||
      !Number.isInteger(ceiling) ||
      ceiling < target ||
      ceiling > 1000 ||
      !Number.isInteger(reserve) ||
      reserve < 0 ||
      reserve > 100)
  )
    throw new RangeError(
      'Cadence requires a weekly target of 1–100, a ceiling from the target to 1000, and a draft reserve of 0–100.',
    );
  return { separate, target, ceiling, reserve };
}

export function getCadenceWeek(
  timezone: string,
  date = new Date(),
): { start: Date; end: Date } {
  const local = DateTime.fromJSDate(date, { zone: timezone || 'UTC' });
  if (!local.isValid)
    throw new RangeError(
      'A valid cadence timezone and scheduling date are required.',
    );
  const start = local.startOf('week');
  return {
    start: start.toUTC().toJSDate(),
    end: start.plus({ weeks: 1 }).toUTC().toJSDate(),
  };
}

export function getCadenceDemand(
  policy: StrategyCadencePolicy,
  counts: Pick<
    AgentStrategyCadenceStatus,
    'week' | 'readyDrafts' | 'pendingDrafts'
  >,
) {
  const publicationSlots = Math.max(0, policy.ceiling - counts.week);
  const postingGap = Math.min(
    publicationSlots,
    Math.max(0, policy.target - counts.week),
  );
  const available = counts.readyDrafts + counts.pendingDrafts;
  const posting = Math.max(0, postingGap - available);
  const reserve = Math.max(
    0,
    policy.reserve - Math.max(0, available - postingGap),
  );
  return { posting, reserve, generation: posting + reserve, publicationSlots };
}

export function cadencePublicationDate(
  row: Readonly<Record<string, unknown>>,
  now = new Date(),
): Date | null {
  if (row.targetExecutionState === TargetExecutionState.PUBLISHING) return now;
  const value = row.publishedAt ?? row.scheduledDate;
  return value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;
}

export function bindCadenceQualityEvaluator(
  opportunities: Pick<AgentStrategyOpportunitiesService, 'updateStatus'>,
  opportunity: AgentStrategyOpportunityDocument,
  organizationId: string,
  evaluate: Awaited<ReturnType<CadenceDraftGenerator>>['evaluateQuality'],
): Awaited<ReturnType<CadenceDraftGenerator>>['evaluateQuality'] {
  if (!evaluate) return undefined;
  return async (content, platform) => {
    const result = await evaluate(content, platform);
    opportunity.estimatedCreditCost += result.creditsUsed;
    await opportunities.updateStatus(
      opportunity.id,
      organizationId,
      'generating',
      { estimatedCreditCost: opportunity.estimatedCreditCost },
    );
    return result;
  };
}

// Inbox linkage and this receipt are bookkeeping, not evaluated content.
// Keep all other canonical material, including generation settings and media.
export function buildReadyDraftReceipt(
  draft: Readonly<Record<string, unknown>>,
): string {
  const settings = readArtifactRecord(draft.targetSettings);
  const generation = readArtifactRecord(settings.generation);
  const metadata = { ...readArtifactRecord(generation.metadata) };
  for (const key of [
    'cadenceQualityReceipt',
    'reviewBatchId',
    'reviewItemId',
    'reviewPostId',
  ])
    delete metadata[key];
  return buildArtifactContentDigest(
    projectPostArtifactMaterial({
      ...draft,
      targetSettings: { ...settings, generation: { ...generation, metadata } },
    }),
  );
}

export function isReadyCadenceDraft(
  draft: Readonly<Record<string, unknown>>,
): boolean {
  if (
    draft.isDeleted ||
    draft.parentId ||
    draft.scheduledDate ||
    draft.targetExecutionState !== TargetExecutionState.DRAFT ||
    draft.reviewDecision === PersistedReviewDecision.REJECTED ||
    draft.reviewDecision === PersistedReviewDecision.REQUEST_CHANGES
  )
    return false;
  const metadata = readArtifactRecord(
    readArtifactRecord(readArtifactRecord(draft.targetSettings).generation)
      .metadata,
  );
  return (
    typeof metadata.cadenceQualityReceipt === 'string' &&
    metadata.cadenceQualityReceipt === buildReadyDraftReceipt(draft)
  );
}

export async function recordReadyDraftReceipt(
  posts: Pick<PostsService, 'findOne' | 'patch'>,
  input: Pick<
    FinalizeOpportunityInput,
    'draft' | 'organizationId' | 'evaluatedReceipt'
  >,
): Promise<void> {
  const { organizationId, evaluatedReceipt } = input;
  if (!evaluatedReceipt) return;
  const id = input.draft.id;
  const current = await posts.findOne(scopedWhere(organizationId, { id }));
  if (!current) return;
  const row = current as unknown as Record<string, unknown>;
  const settings = readArtifactRecord(row.targetSettings);
  const generation = readArtifactRecord(settings.generation);
  await posts.patch(id, {
    targetSettings: toPrismaJson({
      ...settings,
      generation: {
        ...generation,
        metadata: {
          ...readArtifactRecord(generation.metadata),
          cadenceQualityReceipt: evaluatedReceipt,
        },
      },
    }),
  });
}

export function buildEvaluatedDraftReceipt(
  draft: Readonly<Record<string, unknown>>,
  metadata: Readonly<Record<string, unknown>>,
): string {
  const settings = readArtifactRecord(draft.targetSettings);
  const generation = readArtifactRecord(settings.generation);
  return buildReadyDraftReceipt({
    ...draft,
    targetSettings: { ...settings, generation: { ...generation, metadata } },
  });
}
