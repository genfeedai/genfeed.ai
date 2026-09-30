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
import { ConflictException, Injectable } from '@nestjs/common';
export async function learningFence(
  tx: Prisma.TransactionClient,
  mode: 'shared' | 'exclusive',
): Promise<void> {
  if (mode === 'shared')
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(5728, 1)::text`;
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock(5728, 1)::text`;
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
@Injectable()
export class LearningDependencyService {
  constructor(private readonly prisma: PrismaService) {}
  private async pinned(
    kind: LearningDependencyKindV1,
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    const scope = scoped(kind, organizationId);
    if (!scope) return null;
    if (kind === 'config')
      return (
        LEARNING_REGISTERED_CONFIG_VERSIONS as readonly string[]
      ).includes(id)
        ? id
        : null;
    if (kind === 'organization') {
      const row = await tx.organization.findFirst({
        where: { id, isDeleted: false },
      });
      return row && row.id === organizationId ? id : null;
    }
    if (kind === 'brand') {
      const row = await tx.brand.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? id : null;
    }
    if (kind === 'credential') {
      const row = await tx.credential.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? id : null;
    }
    if (kind === 'post') {
      const row = await tx.post.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          isDeleted: false,
        },
      });
      return row ? id : null;
    }
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
    if (kind === 'publish_approval') {
      const row = await tx.publishApproval.findFirst({
        where: {
          id,
          organizationId: organizationId ?? undefined,
          status: 'approved',
          invalidatedAt: null,
        },
      });
      return row ? row.artifactVersionPinId : null;
    }
    if (kind === 'post_publish_finalization') {
      const row = await tx.postPublishFinalization.findFirst({
        where: { id, organizationId: organizationId ?? undefined },
      });
      if (!row) return null;
      const post = await tx.post.findFirst({
        where: {
          id: row.postId,
          organizationId: row.organizationId,
          isDeleted: false,
        },
      });
      return post ? (row.completedAt?.toISOString() ?? row.source) : null;
    }
    if (kind === 'content_version_pin') {
      const row = await tx.contentVersionPin.findFirst({
        where: { id, organizationId: organizationId ?? undefined },
      });
      return row ? row.contentDigest : null;
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
    const visited = new Set<string>(),
      stack = new Set<string>();
    return this.walk(kind, id, organizationId ?? null, tx, visited, stack);
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
  private async walk(
    kind: LearningDependencyKindV1,
    id: string,
    organizationId: string | null,
    tx: Prisma.TransactionClient,
    visited: Set<string>,
    stack: Set<string>,
  ): Promise<boolean> {
    const key = JSON.stringify([kind, id, organizationId]);
    if (stack.has(key)) return false;
    if (visited.has(key)) return true;
    stack.add(key);
    const version = await this.pinned(kind, id, organizationId, tx);
    if (!version) {
      stack.delete(key);
      return false;
    }
    const edges = await tx.contentLearningDependency.findMany({
      where: {
        derivedKind: kind,
        derivedId: id,
        derivedOrganizationId: organizationId,
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
    });
    if (isLearningDerivedDependencyKind(kind) && !edges.length) {
      stack.delete(key);
      return false;
    }
    for (const edge of edges) {
      if (
        !edge.valid ||
        !validLearningDependencyKind(edge.sourceKind) ||
        edge.sourceVersion === 'current'
      ) {
        stack.delete(key);
        return false;
      }
      const sourceOrg = isLearningGlobalDependencyKind(edge.sourceKind)
        ? null
        : edge.sourceOrganizationId;
      const pinned = await this.pinned(
        edge.sourceKind,
        edge.sourceId,
        sourceOrg,
        tx,
      );
      if (
        pinned !== edge.sourceVersion ||
        !(await this.walk(
          edge.sourceKind,
          edge.sourceId,
          sourceOrg,
          tx,
          visited,
          stack,
        ))
      ) {
        stack.delete(key);
        return false;
      }
    }
    stack.delete(key);
    visited.add(key);
    return true;
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
  ) {
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
        await tx.contentLearningDependency.updateMany({
          where: { id: edge.id, isDeleted: false },
          data: { valid: false, invalidatedAt: new Date() },
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
        queue.push({
          kind: edge.derivedKind,
          id: edge.derivedId,
          organizationId: edge.derivedOrganizationId,
        });
      }
    }
    return visited.size;
  }
}
