import {
  batches,
  LearningDatasetGraph,
} from '@api/collections/content-learning/services/learning-dataset-graph.service';
import { resolveLearningPublicationSourceV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  isLearningDerivedDependencyKind,
  isLearningGlobalDependencyKind,
  LEARNING_REGISTERED_CONFIG_VERSIONS,
  type LearningDependencyKindV1,
  type LearningDependencyRefV1,
  validLearningDependencyKind,
  validLearningDependencyRef,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { type Prisma } from '@genfeedai/prisma';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

export type LearningFenceMode = 'shared' | 'exclusive';
export type LearningMutationFenceScope = 'organization' | 'global';

/** Fence waits at or above this are logged as warnings (alert threshold). */
export const LEARNING_FENCE_WAIT_ALERT_MS = 1000;
// Advisory key spaces: (5728, 1) is the global fence; (5729, hashtext(orgId))
// are per-organization fences nested beneath it.
const LEARNING_ORGANIZATION_FENCE_CLASS = 5729;
// Exclusive fence scope held by each interactive transaction client.
const exclusiveFenceScopes = new WeakMap<
  Prisma.TransactionClient,
  'global' | readonly string[]
>();
const learningFenceLogger = new Logger('LearningFence');

/**
 * An organization-fenced invalidation reached global or other-tenant learning
 * state. The transaction must roll back and rerun under the global fence.
 */
export class LearningFenceEscalationError extends ConflictException {
  constructor() {
    super(
      'Learning invalidation crossed its organization fence; retry under the global fence.',
    );
  }
}

async function observeLearningFence(
  scope: LearningMutationFenceScope,
  mode: LearningFenceMode,
  acquire: () => Promise<void>,
): Promise<void> {
  const startedAt = performance.now();
  await acquire();
  const waitMs = performance.now() - startedAt;
  try {
    Sentry.metrics.distribution('learning.fence.wait', waitMs, {
      attributes: { mode, scope },
      unit: 'millisecond',
    });
  } catch {
    // Fence telemetry must never change locking behavior.
  }
  if (waitMs >= LEARNING_FENCE_WAIT_ALERT_MS)
    learningFenceLogger.warn(
      `learning fence wait ${Math.round(waitMs)}ms exceeded ${LEARNING_FENCE_WAIT_ALERT_MS}ms`,
      { mode, scope, waitMs: Math.round(waitMs) },
    );
}

/**
 * Global exclusive learning fence: excludes every organization fence holder.
 * Reserved for genuinely global or cross-tenant invalidations. Readers and
 * per-organization writers use learningOrgFence; the global key has no
 * shared-only mode, so a reader can never skip its organization key.
 */
export async function learningFence(
  tx: Prisma.TransactionClient,
  mode: 'exclusive',
): Promise<void> {
  await observeLearningFence('global', mode, async () => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(5728, 1)::text`;
    exclusiveFenceScopes.set(tx, 'global');
  });
}

/**
 * Organization learning fence: global shared, then each organization key in
 * ascending id order. Same-organization readers and writers exclude each other
 * while different organizations proceed concurrently. An exclusive holder's
 * invalidation walk may not leave its organizations; it raises
 * LearningFenceEscalationError instead (see withLearningFenceEscalation).
 */
export async function learningOrgFence(
  tx: Prisma.TransactionClient,
  organizationIds: string | readonly string[],
  mode: LearningFenceMode,
): Promise<void> {
  const ids = [
    ...new Set(
      (typeof organizationIds === 'string'
        ? [organizationIds]
        : organizationIds
      ).filter((id) => typeof id === 'string' && id.trim().length > 0),
    ),
  ].sort();
  if (ids.length === 0)
    throw new ConflictException('Learning organization fence scope required');
  await observeLearningFence('organization', mode, async () => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(5728, 1)::text`;
    for (const id of ids)
      if (mode === 'shared')
        await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(${LEARNING_ORGANIZATION_FENCE_CLASS}::int, hashtext(${id}))::text`;
      else
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${LEARNING_ORGANIZATION_FENCE_CLASS}::int, hashtext(${id}))::text`;
    if (mode === 'exclusive' && exclusiveFenceScopes.get(tx) !== 'global')
      exclusiveFenceScopes.set(tx, ids);
  });
}

/** Exclusive mutation fence for one organization at the requested scope. */
export async function learningMutationFence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  scope: LearningMutationFenceScope,
): Promise<void> {
  if (scope === 'global') await learningFence(tx, 'exclusive');
  else await learningOrgFence(tx, organizationId, 'exclusive');
}

/**
 * Runs an organization-fenced mutation, rerunning it once under the global
 * fence when its invalidation walk reaches global or other-tenant state.
 */
export async function withLearningFenceEscalation<T>(
  run: (scope: LearningMutationFenceScope) => Promise<T>,
): Promise<T> {
  try {
    return await run('organization');
  } catch (error: unknown) {
    if (!(error instanceof LearningFenceEscalationError)) throw error;
    learningFenceLogger.log('learning mutation escalated to global fence');
    return run('global');
  }
}

function assertInvalidationWithinFence(
  tx: Prisma.TransactionClient,
  derivedKind: string,
  derivedOrganizationId: string | null,
): void {
  const scope = exclusiveFenceScopes.get(tx);
  if (scope === undefined || scope === 'global') return;
  if (
    isLearningGlobalDependencyKind(derivedKind) ||
    derivedOrganizationId === null ||
    !scope.includes(derivedOrganizationId)
  )
    throw new LearningFenceEscalationError();
}
function scoped(
  kind: LearningDependencyKindV1,
  organizationId?: string | null,
) {
  if (isLearningGlobalDependencyKind(kind))
    return organizationId == null ? { organizationId: null } : null;
  return typeof organizationId === 'string' && organizationId.trim()
    ? { organizationId }
    : null;
}
export async function invalidateLearningDependencySource(
  tx: Prisma.TransactionClient,
  sourceKind: string,
  sourceId: string,
  organizationId?: string | null,
): Promise<number> {
  if (!validLearningDependencyKind(sourceKind)) return 0;
  const queue = [{ kind: sourceKind, id: sourceId, organizationId }],
    visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const key = JSON.stringify(current);
    if (visited.has(key)) continue;
    visited.add(key);
    const edges = await tx.contentLearningDependency.findMany({
      where: {
        sourceKind: current.kind,
        sourceId: current.id,
        ...(current.organizationId !== undefined
          ? { sourceOrganizationId: current.organizationId }
          : {}),
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
    });
    for (const edge of edges) {
      if (
        isLearningGlobalDependencyKind(edge.derivedKind) ||
        edge.derivedOrganizationId !== edge.sourceOrganizationId
      )
        assertInvalidationWithinFence(
          tx,
          edge.derivedKind,
          edge.derivedOrganizationId,
        );
      await tx.contentLearningDependency.updateMany({
        where: { id: edge.id, isDeleted: false },
        data: { valid: false, invalidatedAt: new Date() },
      });
      if (
        edge.derivedKind === 'baseline' &&
        typeof edge.derivedOrganizationId === 'string' &&
        edge.derivedOrganizationId.trim() &&
        (isLearningGlobalDependencyKind(sourceKind)
          ? organizationId === null
          : typeof organizationId === 'string' &&
            organizationId.trim() &&
            organizationId === edge.derivedOrganizationId) &&
        (current.organizationId === edge.derivedOrganizationId ||
          (isLearningGlobalDependencyKind(current.kind) &&
            current.organizationId === null))
      )
        await tx.contentLearningBaseline.updateMany({
          where: {
            id: edge.derivedId,
            organizationId: edge.derivedOrganizationId,
            isDeleted: false,
          },
          data: { validity: 'invalid_source' },
        });
      if (edge.derivedKind === 'reward' && edge.derivedOrganizationId)
        await tx.contentLearningReward.updateMany({
          where: {
            id: edge.derivedId,
            organizationId: edge.derivedOrganizationId,
            isDeleted: false,
          },
          data: {
            status:
              sourceKind === 'checkpoint'
                ? 'invalid_baseline'
                : 'invalid_source',
          },
        });
      if (edge.derivedKind === 'policy' && edge.derivedOrganizationId)
        await tx.contentLearningPolicyVersion.updateMany({
          where: {
            id: edge.derivedId,
            organizationId: edge.derivedOrganizationId,
            isDeleted: false,
          },
          data: { state: 'invalid' },
        });
      if (edge.derivedKind === 'dataset')
        await tx.contentLearningDataset.updateMany({
          where: { id: edge.derivedId, isDeleted: false },
          data: {
            status: 'invalidated',
            invalidationRevision: { increment: 1 },
          },
        });
      if (edge.derivedKind === 'run')
        await tx.contentLearningRun.updateMany({
          where: { id: edge.derivedId, isDeleted: false },
          data: { status: 'invalidated' },
        });
      if (edge.derivedKind === 'shared-policy')
        await tx.contentLearningSharedPolicy.updateMany({
          where: { id: edge.derivedId, isDeleted: false },
          data: { validity: 'invalid' },
        });
      if (edge.derivedKind === 'release')
        await tx.contentLearningRelease.updateMany({
          where: { id: edge.derivedId, isDeleted: false },
          data: {
            stage: 'invalid',
            revision: { increment: 1 },
            invalidationRevision: { increment: 1 },
            activeCells: [],
          },
        });
      if (!validLearningDependencyKind(edge.derivedKind)) continue;
      queue.push({
        kind: edge.derivedKind,
        id: edge.derivedId,
        organizationId: edge.derivedOrganizationId,
      });
    }
  }
  return visited.size;
}
/** Fail-closed ceiling on distinct nodes one dependency validation may visit. */
export const LEARNING_DEPENDENCY_WALK_MAX_NODES = 5000;
interface LearningWalkNode {
  kind: LearningDependencyKindV1;
  id: string;
  organizationId: string | null;
}
const learningWalkKey = (node: LearningWalkNode) =>
  JSON.stringify([node.kind, node.id, node.organizationId]);
function learningWalkEdgeFilter(
  nodes: readonly LearningWalkNode[],
): Prisma.ContentLearningDependencyWhereInput[] {
  const groups = new Map<
    string,
    {
      derivedKind: string;
      derivedOrganizationId: string | null;
      ids: string[];
    }
  >();
  for (const node of nodes) {
    const key = JSON.stringify([node.kind, node.organizationId]);
    const group = groups.get(key) ?? {
      derivedKind: node.kind,
      derivedOrganizationId: node.organizationId,
      ids: [],
    };
    group.ids.push(node.id);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    derivedKind: group.derivedKind,
    derivedOrganizationId: group.derivedOrganizationId,
    derivedId: { in: group.ids },
  }));
}
/** Iterative three-colour DFS over the already-loaded source adjacency. */
function learningWalkHasCycle(
  rootKey: string,
  sources: ReadonlyMap<string, readonly string[]>,
): boolean {
  const done = new Set<string>();
  const active = new Set<string>([rootKey]);
  const stack: { key: string; next: number }[] = [{ key: rootKey, next: 0 }];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const children = sources.get(top.key) ?? [];
    if (top.next >= children.length) {
      active.delete(top.key);
      done.add(top.key);
      stack.pop();
      continue;
    }
    const child = children[top.next++];
    if (active.has(child)) return true;
    if (done.has(child)) continue;
    active.add(child);
    stack.push({ key: child, next: 0 });
  }
  return false;
}
@Injectable()
export class LearningDependencyService {
  constructor(private readonly prisma: PrismaService) {}
  private async pinned(
    kind: LearningDependencyKindV1,
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (!scoped(kind, organizationId)) return null;
    if (kind === 'organization' || kind === 'brand' || kind === 'credential')
      return this.pinnedParents(kind, id, organizationId, tx);
    if (
      kind === 'post' ||
      kind === 'publish_approval' ||
      kind === 'post_publish_finalization' ||
      kind === 'content_version_pin'
    )
      return this.pinnedPublication(kind, id, organizationId, tx);
    if (
      kind === 'account' ||
      kind === 'consent' ||
      kind === 'checkpoint' ||
      kind === 'baseline' ||
      kind === 'decision' ||
      kind === 'reward' ||
      kind === 'policy'
    )
      return this.pinnedPrivateEvidence(kind, id, organizationId, tx);
    if (
      kind === 'config' ||
      kind === 'dataset' ||
      kind === 'run' ||
      kind === 'shared-policy' ||
      kind === 'release'
    )
      return this.pinnedGlobal(kind, id, organizationId, tx);
    if (
      kind === 'experiment' ||
      kind === 'enrollment' ||
      kind === 'opportunity' ||
      kind === 'experiment-event' ||
      kind === 'provider_attempt' ||
      kind === 'llm_vendor_cost' ||
      kind === 'media_vendor_cost'
    )
      return this.pinnedExperiment(kind, id, organizationId, tx);
    return null;
  }
  private async pinnedParents(
    kind: 'organization' | 'brand' | 'credential',
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (!organizationId) return null;
    const organization = await tx.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
    });
    if (
      !organization ||
      organization.id !== organizationId ||
      organization.isDeleted
    )
      return null;
    if (kind === 'organization') return id === organizationId ? id : null;
    if (kind === 'brand') {
      const row = await tx.brand.findFirst({
        where: { id, organizationId, isDeleted: false, isActive: true },
      });
      return row &&
        row.id === id &&
        row.organizationId === organizationId &&
        !row.isDeleted &&
        row.isActive
        ? id
        : null;
    }
    const row = await tx.credential.findFirst({
      where: { id, organizationId, isDeleted: false, isConnected: true },
    });
    if (
      !row ||
      row.id !== id ||
      row.organizationId !== organizationId ||
      row.isDeleted ||
      !row.isConnected ||
      !row.brandId?.trim()
    )
      return null;
    const brand = await tx.brand.findFirst({
      where: {
        id: row.brandId,
        organizationId,
        isDeleted: false,
        isActive: true,
      },
    });
    return brand &&
      brand.id === row.brandId &&
      brand.organizationId === organizationId &&
      !brand.isDeleted &&
      brand.isActive
      ? id
      : null;
  }
  private async pinnedPublication(
    kind:
      | 'post'
      | 'publish_approval'
      | 'post_publish_finalization'
      | 'content_version_pin',
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (!organizationId) return null;
    if (kind === 'post') {
      const source = await resolveLearningPublicationSourceV1(
        tx,
        organizationId,
        id,
      );
      return source?.postSourceVersion ?? null;
    }
    if (kind === 'publish_approval') {
      const row = await tx.publishApproval.findFirst({
        where: { id, organizationId },
      });
      if (!row || row.id !== id || row.organizationId !== organizationId)
        return null;
      const source = await resolveLearningPublicationSourceV1(
        tx,
        organizationId,
        row.postId,
      );
      return source?.approvalId === id ? source.approvalVersion : null;
    }
    if (kind === 'post_publish_finalization') {
      const row = await tx.postPublishFinalization.findFirst({
        where: { id, organizationId },
      });
      if (!row || row.id !== id || row.organizationId !== organizationId)
        return null;
      const source = await resolveLearningPublicationSourceV1(
        tx,
        organizationId,
        row.postId,
      );
      return source?.finalizationId === id ? source.finalizationVersion : null;
    }
    if (kind === 'content_version_pin') {
      const row = await tx.contentVersionPin.findFirst({
        where: { id, organizationId: organizationId ?? undefined },
      });
      return row ? row.contentDigest : null;
    }
    return null;
  }
  private async pinnedPrivateEvidence(
    kind:
      | 'account'
      | 'consent'
      | 'checkpoint'
      | 'baseline'
      | 'decision'
      | 'reward'
      | 'policy',
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (kind === 'account') {
      const row = await tx.contentLearningAccount.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? String(row.epoch) : null;
    }
    if (kind === 'consent') {
      const row = await tx.contentLearningConsent.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      if (!row?.granted || row.revokedAt) return null;
      const account = await tx.contentLearningAccount.findFirst({
        where: {
          id: row.accountId,
          organizationId: row.organizationId,
          isDeleted: false,
        },
      });
      return account?.sharingConsentVersion === row.version
        ? String(row.version)
        : null;
    }
    if (kind === 'checkpoint') {
      const row = await tx.contentLearningCheckpoint.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? String(row.revision) : null;
    }
    if (kind === 'baseline') {
      const row = await tx.contentLearningBaseline.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? row.fingerprint : null;
    }
    if (kind === 'decision') {
      const row = await tx.contentLearningDecision.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? row.payloadHash : null;
    }
    if (kind === 'reward') {
      const row = await tx.contentLearningReward.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? String(row.version) : null;
    }
    if (kind === 'policy') {
      const row = await tx.contentLearningPolicyVersion.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
          state: { not: 'invalid' },
        },
      });
      return row ? String(row.version) : null;
    }
    return null;
  }
  private async pinnedGlobal(
    kind: 'config' | 'dataset' | 'run' | 'shared-policy' | 'release',
    id: string,
    _organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (kind === 'config')
      return (
        LEARNING_REGISTERED_CONFIG_VERSIONS as readonly string[]
      ).includes(id)
        ? id
        : null;
    if (kind === 'dataset') {
      const row = await tx.contentLearningDataset.findFirst({
        where: { id, isDeleted: false, status: { not: 'invalidated' } },
      });
      return row ? row.manifestHash : null;
    }
    if (kind === 'run') {
      const row = await tx.contentLearningRun.findFirst({
        where: { id, isDeleted: false, status: { not: 'invalidated' } },
      });
      return row ? row.configHash : null;
    }
    if (kind === 'shared-policy') {
      const row = await tx.contentLearningSharedPolicy.findFirst({
        where: { id, isDeleted: false, validity: { not: 'invalid' } },
      });
      return row ? String(row.version) : null;
    }
    if (kind === 'release') {
      const row = await tx.contentLearningRelease.findFirst({
        where: { id, isDeleted: false, stage: { not: 'invalid' } },
      });
      return row ? String(row.revision) : null;
    }
    return null;
  }
  private async pinnedExperiment(
    kind:
      | 'experiment'
      | 'enrollment'
      | 'opportunity'
      | 'experiment-event'
      | 'provider_attempt'
      | 'llm_vendor_cost'
      | 'media_vendor_cost',
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (kind === 'experiment') {
      const row = await tx.contentLearningExperiment.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? row.specHash : null;
    }
    if (kind === 'enrollment') {
      const row = await tx.contentLearningEnrollment.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? `${row.accountEpoch}:${row.consentNoticeVersion}` : null;
    }
    if (kind === 'opportunity') {
      const row = await tx.contentLearningOpportunity.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? row.specHash : null;
    }
    if (kind === 'experiment-event') {
      const row = await tx.contentLearningExperimentEvent.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? row.fingerprint : null;
    }
    if (kind === 'provider_attempt') {
      const row = await tx.contentLearningExperimentEvent.findFirst({
        where: {
          sourceKind: 'provider_attempt',
          sourceId: id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
        orderBy: { id: 'asc' },
      });
      return row ? row.sourceRevision : null;
    }
    if (kind === 'llm_vendor_cost' || kind === 'media_vendor_cost') {
      const row =
        kind === 'llm_vendor_cost'
          ? await tx.llmVendorCost.findFirst({
              where: {
                id,
                organizationId: organizationId ?? undefined,
                isDeleted: false,
              },
            })
          : await tx.mediaVendorCost.findFirst({
              where: {
                id,
                organizationId: organizationId ?? undefined,
                isDeleted: false,
              },
            });
      return row?.learningAttemptId
        ? `${row.learningAttemptId}:${row.id}:${row.updatedAt.toISOString()}`
        : null;
    }
    return null;
  }
  async valid(
    kind: string,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
    organizationId?: string | null,
  ): Promise<boolean> {
    if (!validLearningDependencyKind(kind)) return false;
    return this.walk({ kind, id, organizationId: organizationId ?? null }, tx);
  }
  async resolve(
    kind: LearningDependencyKindV1,
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<LearningDependencyRefV1> {
    const version = await this.pinned(kind, id, organizationId, tx);
    const ref = { kind, id, organizationId, version: version ?? '' };
    if (!version || !validLearningDependencyRef(ref))
      throw new ConflictException('Pinned dependency identity unavailable');
    return ref;
  }
  /**
   * Breadth-first, level-batched dependency validation: one edge query per
   * level and one pin query per (kind, organization) group per level, all run
   * sequentially on the caller's transaction client. A node reached again by a
   * later edge has its version re-read (batched, fresh) and compared to that
   * edge. Cycles are found on the in-memory graph.
   */
  private async walk(
    root: LearningWalkNode,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const rootKey = learningWalkKey(root);
    const pins = new Map<string, string>();
    const expected = new Map<string, Set<string>>();
    const sources = new Map<string, string[]>();
    const seen = new Set<string>([rootKey]);
    let frontier: LearningWalkNode[] = [root];
    let revisits: { node: LearningWalkNode; want: string }[] = [];
    while (frontier.length || revisits.length) {
      const versions = await this.pinsFor(frontier, tx);
      for (const node of frontier) {
        const key = learningWalkKey(node);
        const version = versions.get(key);
        if (!version) return false;
        for (const want of expected.get(key) ?? [])
          if (want !== version) return false;
        pins.set(key, version);
      }
      if (revisits.length) {
        const again = await this.pinsFor(
          revisits.map((revisit) => revisit.node),
          tx,
        );
        for (const { node, want } of revisits)
          if (again.get(learningWalkKey(node)) !== want) return false;
      }
      revisits = [];
      const edges = frontier.length
        ? await tx.contentLearningDependency.findMany({
            where: { isDeleted: false, OR: learningWalkEdgeFilter(frontier) },
            orderBy: { id: 'asc' },
          })
        : [];
      const edgesByNode = new Map<string, typeof edges>();
      for (const edge of edges) {
        const key = JSON.stringify([
          edge.derivedKind,
          edge.derivedId,
          edge.derivedOrganizationId,
        ]);
        edgesByNode.set(key, [...(edgesByNode.get(key) ?? []), edge]);
      }
      const next: LearningWalkNode[] = [];
      const revisited = new Set<string>();
      for (const node of frontier) {
        const key = learningWalkKey(node);
        const nodeEdges = edgesByNode.get(key) ?? [];
        if (isLearningDerivedDependencyKind(node.kind) && !nodeEdges.length)
          return false;
        const children: string[] = [];
        for (const edge of nodeEdges) {
          if (
            !edge.valid ||
            !validLearningDependencyKind(edge.sourceKind) ||
            edge.sourceVersion === 'current'
          )
            return false;
          const child: LearningWalkNode = {
            kind: edge.sourceKind,
            id: edge.sourceId,
            organizationId: isLearningGlobalDependencyKind(edge.sourceKind)
              ? null
              : edge.sourceOrganizationId,
          };
          const childKey = learningWalkKey(child);
          const pinned = pins.get(childKey);
          if (pinned !== undefined && pinned !== edge.sourceVersion)
            return false;
          if (pinned === undefined) {
            const wanted = expected.get(childKey) ?? new Set<string>();
            wanted.add(edge.sourceVersion);
            expected.set(childKey, wanted);
          }
          if (seen.has(childKey)) {
            const revisitKey = JSON.stringify([childKey, edge.sourceVersion]);
            if (!revisited.has(revisitKey)) {
              revisited.add(revisitKey);
              revisits.push({ node: child, want: edge.sourceVersion });
            }
          } else {
            if (seen.size >= LEARNING_DEPENDENCY_WALK_MAX_NODES)
              throw new ConflictException(
                `Learning dependency graph exceeds ${LEARNING_DEPENDENCY_WALK_MAX_NODES} nodes`,
              );
            seen.add(childKey);
            next.push(child);
          }
          children.push(childKey);
        }
        sources.set(key, children);
      }
      frontier = next;
    }
    return !learningWalkHasCycle(rootKey, sources);
  }
  /** Current pins for nodes, one batched read per (kind, organization) group. */
  private async pinsFor(
    nodes: readonly LearningWalkNode[],
    tx: Prisma.TransactionClient,
  ): Promise<Map<string, string>> {
    const graph = new LearningDatasetGraph(tx);
    const groups = new Map<
      string,
      {
        kind: LearningDependencyKindV1;
        organizationId: string | null;
        ids: Set<string>;
      }
    >();
    for (const node of nodes) {
      const key = JSON.stringify([node.kind, node.organizationId]);
      const group = groups.get(key) ?? {
        kind: node.kind,
        organizationId: node.organizationId,
        ids: new Set<string>(),
      };
      group.ids.add(node.id);
      groups.set(key, group);
    }
    const result = new Map<string, string>();
    for (const group of groups.values())
      for (const part of batches([...group.ids])) {
        const pins = await graph.pins(group.kind, part, group.organizationId);
        for (const [id, pin] of pins)
          result.set(
            learningWalkKey({
              kind: group.kind,
              id,
              organizationId: group.organizationId,
            }),
            pin,
          );
      }
    return result;
  }
  async link(
    tx: Prisma.TransactionClient,
    source: LearningDependencyRefV1,
    derived: LearningDependencyRefV1,
  ) {
    if (
      !validLearningDependencyRef(source) ||
      !validLearningDependencyRef(derived)
    )
      throw new ConflictException('Invalid dependency identity');
    const sourceVersion = await this.pinned(
      source.kind,
      source.id,
      source.organizationId,
      tx,
    );
    const derivedVersion = await this.pinned(
      derived.kind,
      derived.id,
      derived.organizationId,
      tx,
    );
    if (sourceVersion !== source.version || derivedVersion !== derived.version)
      throw new ConflictException('Pinned dependency version mismatch');
    if (
      !isLearningGlobalDependencyKind(source.kind) &&
      !isLearningGlobalDependencyKind(derived.kind) &&
      source.organizationId !== derived.organizationId
    )
      throw new ConflictException('Cross-tenant dependency forbidden');
    const existing = await tx.contentLearningDependency.findUnique({
      where: {
        sourceKind_sourceId_sourceVersion_derivedKind_derivedId: {
          sourceKind: source.kind,
          sourceId: source.id,
          sourceVersion: source.version,
          derivedKind: derived.kind,
          derivedId: derived.id,
        },
      },
    });
    if (existing) {
      if (
        existing.sourceOrganizationId !== source.organizationId ||
        existing.derivedOrganizationId !== derived.organizationId
      )
        throw new ConflictException('Dependency scope conflict');
      return existing;
    }
    return tx.contentLearningDependency.create({
      data: {
        sourceKind: source.kind,
        sourceId: source.id,
        sourceVersion: source.version,
        sourceOrganizationId: source.organizationId,
        derivedKind: derived.kind,
        derivedId: derived.id,
        derivedOrganizationId: derived.organizationId,
      },
    });
  }
  async invalidate(
    sourceKind: string,
    sourceId: string,
    tx: Prisma.TransactionClient = this.prisma,
    organizationId?: string | null,
  ): Promise<number> {
    return invalidateLearningDependencySource(
      tx,
      sourceKind,
      sourceId,
      organizationId,
    );
  }
}
