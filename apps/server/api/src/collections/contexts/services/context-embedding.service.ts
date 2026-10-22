import { randomUUID } from 'node:crypto';
import type {
  ContextEmbeddingAdmissionPrincipal,
  ContextEmbeddingClaim,
  ContextEmbeddingSourceEligibility,
} from '@api/collections/contexts/interfaces/context-embedding-write.interface';
import {
  ContextEmbeddingProviderError,
  ContextEmbeddingProviderService,
} from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { buildContextEmbeddingClaimQuery } from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import { serializeContextEmbedding } from '@api/collections/contexts/utils/context-similarity-query.util';
import { assertKnowledgeGovernance } from '@api/collections/contexts/utils/knowledge-actor.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ContextEmbeddingJobData } from '@genfeedai/contracts/queue';
import {
  ContextEmbeddingAdmissionOperation,
  type ContextEmbeddingJob,
  ContextEmbeddingJobStatus,
  ContextEmbeddingOrigin,
  type ContextEntry,
  KnowledgeRefreshRunStatus,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceSyncState,
  Prisma,
} from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

@Injectable()
export class ContextEmbeddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: ContextEmbeddingWriteService,
    private readonly provider: ContextEmbeddingProviderService,
  ) {}

  async process(payload: ContextEmbeddingJobData): Promise<void> {
    const claim = await this.prisma.$transaction((tx) =>
      this.claim(tx, payload),
    );
    if (!claim) return;
    let vector: number[];
    try {
      vector = await this.provider.stored(
        claim.content,
        claim.job.modelIdentifier,
      );
    } catch (error: unknown) {
      const failure =
        error instanceof ContextEmbeddingProviderError
          ? error
          : new ContextEmbeddingProviderError('PROVIDER_REJECTED', false);
      await this.prisma.$transaction(async (tx) => {
        const locked = await this.lock(tx, claim.job);
        if (!locked) return;
        const eligibility = await this.revalidate(tx, locked.job, locked.entry);
        await this.settle(
          tx,
          locked.job,
          eligibility === 'eligible'
            ? failure.isRetryable && locked.job.attempts < 3
              ? ContextEmbeddingJobStatus.RETRYABLE
              : ContextEmbeddingJobStatus.FAILED
            : eligibility === 'deferred'
              ? ContextEmbeddingJobStatus.RETRYABLE
              : ContextEmbeddingJobStatus.CANCELLED,
          eligibility === 'eligible'
            ? failure.safeFailureCode
            : 'SOURCE_INELIGIBLE',
          claim.leaseToken,
        );
      });
      return;
    }
    // A database commit failure leaves the durable lease for expiry recovery;
    // it is not misclassified as a terminal provider rejection.
    await this.prisma.$transaction((tx) => this.commit(tx, claim, vector));
  }

  private async claim(
    tx: Prisma.TransactionClient,
    payload: ContextEmbeddingJobData,
  ): Promise<ContextEmbeddingClaim | null> {
    const job = await tx.contextEmbeddingJob.findFirst({
      where: {
        id: payload.jobId,
        organizationId: payload.organizationId,
        generation: payload.generation,
        isDeleted: false,
      },
    });
    if (!job) return null;
    const locked = await this.lock(tx, job);
    if (!locked) return null;
    const { entry } = locked;
    const current = locked.job;
    if (
      ![
        ContextEmbeddingJobStatus.PENDING,
        ContextEmbeddingJobStatus.RETRYABLE,
        ContextEmbeddingJobStatus.PROCESSING,
      ].some((status) => status === current.status)
    )
      return null;
    const due = await tx.$queryRaw<Array<{ isDue: boolean }>>(Prisma.sql`
      SELECT (("status" IN ('PENDING','RETRYABLE') AND "nextAttemptAt" <= clock_timestamp())
        OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= clock_timestamp())) AS "isDue"
      FROM "context_embedding_jobs" WHERE "id" = ${current.id} AND "organizationId" = ${current.organizationId} AND "isDeleted" = false
    `);
    if (!due[0]?.isDue) return null;
    const eligibility = await this.revalidate(tx, current, entry);
    if (eligibility !== 'eligible') {
      await this.settle(
        tx,
        current,
        eligibility === 'deferred'
          ? ContextEmbeddingJobStatus.RETRYABLE
          : ContextEmbeddingJobStatus.CANCELLED,
        'SOURCE_INELIGIBLE',
      );
      return null;
    }
    if (current.attempts >= 3) {
      await this.settle(
        tx,
        current,
        ContextEmbeddingJobStatus.FAILED,
        'ATTEMPTS_EXHAUSTED',
      );
      return null;
    }
    const leaseToken = randomUUID();
    const claimed = await tx.$queryRaw<Array<{ id: string }>>(
      buildContextEmbeddingClaimQuery(
        current.id,
        current.organizationId,
        current.generation,
        leaseToken,
      ),
    );
    if (claimed.length !== 1) return null;
    return {
      entry,
      job: { ...current, attempts: current.attempts + 1 },
      content: this.content(entry),
      leaseToken,
    };
  }

  private async commit(
    tx: Prisma.TransactionClient,
    claim: ContextEmbeddingClaim,
    vector: number[],
  ): Promise<void> {
    const locked = await this.lock(tx, claim.job);
    if (!locked) return;
    if (
      locked.job.modelIdentifier !== claim.job.modelIdentifier ||
      locked.job.contentHash !== claim.job.contentHash ||
      locked.job.sourceSnapshotHash !== claim.job.sourceSnapshotHash ||
      this.content(locked.entry) !== claim.content
    ) {
      await this.settle(
        tx,
        locked.job,
        ContextEmbeddingJobStatus.CANCELLED,
        'SOURCE_CHANGED',
        claim.leaseToken,
      );
      return;
    }
    const eligibility = await this.revalidate(tx, locked.job, locked.entry);
    if (eligibility !== 'eligible') {
      await this.settle(
        tx,
        locked.job,
        eligibility === 'deferred'
          ? ContextEmbeddingJobStatus.RETRYABLE
          : ContextEmbeddingJobStatus.CANCELLED,
        'SOURCE_INELIGIBLE',
        claim.leaseToken,
      );
      return;
    }
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE "context_embedding_jobs" SET "status" = 'SUCCEEDED', "completedAt" = clock_timestamp(),
        "leaseToken" = NULL, "leaseExpiresAt" = NULL, "safeFailureCode" = NULL, "updatedAt" = clock_timestamp()
      WHERE "id" = ${claim.job.id} AND "organizationId" = ${claim.job.organizationId}
        AND "generation" = ${claim.job.generation} AND "isDeleted" = false
        AND "status" = 'PROCESSING' AND "leaseToken" = ${claim.leaseToken} AND "leaseExpiresAt" > clock_timestamp()
    `);
    if (changed !== 1) return;
    const stored = await tx.$executeRaw(Prisma.sql`
      UPDATE "context_entries" SET "embedding" = ${serializeContextEmbedding(vector)}::vector,
        "embeddingStoredGeneration" = ${claim.job.generation}, "embeddingFailedAt" = NULL,
        "embeddingClaimedAt" = NULL, "updatedAt" = clock_timestamp()
      WHERE "id" = ${claim.job.contextEntryId} AND "organizationId" = ${claim.job.organizationId}
        AND "isDeleted" = false AND "embeddingGeneration" = ${claim.job.generation}
    `);
    if (stored !== 1) throw new Error('Context embedding generation changed');
  }

  private async lock(tx: Prisma.TransactionClient, job: ContextEmbeddingJob) {
    const initial = await tx.contextEntry.findFirst({
      where: {
        id: job.contextEntryId,
        organizationId: job.organizationId,
        isDeleted: false,
      },
    });
    if (!initial) {
      await this.settle(
        tx,
        job,
        ContextEmbeddingJobStatus.CANCELLED,
        'SOURCE_INELIGIBLE',
      );
      return null;
    }
    if (initial.knowledgeSourceId)
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "knowledge_sources" WHERE "id" = ${initial.knowledgeSourceId} AND "organizationId" = ${job.organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
    if (initial.sourceAgentMemoryId)
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "agent_memories" WHERE "id" = ${initial.sourceAgentMemoryId} AND "organizationId" = ${job.organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "context_bases" WHERE "id" = ${initial.contextBaseId} AND "organizationId" = ${job.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "context_entries" WHERE "id" = ${initial.id} AND "organizationId" = ${job.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "context_embedding_jobs" WHERE "id" = ${job.id} AND "organizationId" = ${job.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    const current = await tx.contextEmbeddingJob.findFirst({
      where: {
        id: job.id,
        organizationId: job.organizationId,
        generation: job.generation,
        isDeleted: false,
      },
    });
    const entry = await tx.contextEntry.findFirst({
      where: {
        id: initial.id,
        organizationId: job.organizationId,
        isDeleted: false,
      },
    });
    if (!current || !entry) return null;
    if (
      initial.knowledgeSourceId !== entry.knowledgeSourceId ||
      initial.sourceAgentMemoryId !== entry.sourceAgentMemoryId ||
      initial.contextBaseId !== entry.contextBaseId
    ) {
      await this.settle(
        tx,
        current,
        ContextEmbeddingJobStatus.CANCELLED,
        'SOURCE_CHANGED',
      );
      return null;
    }
    return { job: current, entry };
  }

  private async revalidate(
    tx: Prisma.TransactionClient,
    job: ContextEmbeddingJob,
    entry: ContextEntry,
  ): Promise<ContextEmbeddingSourceEligibility> {
    if (
      entry.isDeleted ||
      entry.embeddingGeneration !== job.generation ||
      this.writer.contentHash(this.content(entry)) !== job.contentHash
    )
      return 'cancelled';
    const base = await tx.contextBase.findFirst({
      where: {
        id: entry.contextBaseId,
        organizationId: job.organizationId,
        isDeleted: false,
      },
    });
    if (!base) return 'cancelled';
    const principal = this.principal(job);
    if (
      !principal ||
      (job.sourceMemoryId ?? null) !== entry.sourceAgentMemoryId
    )
      return 'cancelled';
    try {
      const memory = await this.writer.memorySnapshot(
        tx,
        principal,
        job.organizationId,
        this.content(entry),
      );
      if (
        memory &&
        (memory.hash !== job.sourceSnapshotHash ||
          memory.hash !== entry.sourceSnapshotHash)
      )
        return 'cancelled';
      if (
        !memory &&
        (job.sourceSnapshotHash !== null || entry.sourceSnapshotHash !== null)
      )
        return 'cancelled';
      await this.writer.assertPrincipal(
        tx,
        principal,
        job.organizationId,
        base,
        this.content(entry),
      );
      if (
        job.admissionOperation ===
        ContextEmbeddingAdmissionOperation.HISTORICAL_BACKFILL
      ) {
        if (principal.origin !== 'ACTOR') return 'cancelled';
        await assertKnowledgeGovernance(this.prisma, principal.actor);
      }
    } catch {
      return 'cancelled';
    }
    return this.knowledgeEligibility(tx, entry, principal, base);
  }

  private async knowledgeEligibility(
    tx: Prisma.TransactionClient,
    entry: ContextEntry,
    principal: ContextEmbeddingAdmissionPrincipal,
    base: {
      sourceBrandId: string | null;
      createdById: string | null;
      data: unknown;
    },
  ): Promise<ContextEmbeddingSourceEligibility> {
    if (!entry.knowledgeSourceId && !entry.knowledgeSourceVersionId)
      return 'eligible';
    if (entry.knowledgeEmbeddingManifestId) {
      const manifest = await tx.knowledgeEmbeddingManifest.findFirst({
        where: {
          id: entry.knowledgeEmbeddingManifestId,
          organizationId: entry.organizationId,
          sourceId: entry.knowledgeSourceId ?? '',
          versionId: entry.knowledgeSourceVersionId ?? '',
          generation: entry.embeddingGeneration,
          isDeleted: false,
        },
      });
      if (!manifest || manifest.failedAt) return 'cancelled';
    }

    const source = await tx.knowledgeSource.findFirst({
      where: {
        id: entry.knowledgeSourceId ?? '',
        organizationId: entry.organizationId,
        isDeleted: false,
      },
    });
    const version = await tx.knowledgeSourceVersion.findFirst({
      where: {
        id: entry.knowledgeSourceVersionId ?? '',
        sourceId: entry.knowledgeSourceId ?? '',
        organizationId: entry.organizationId,
        isDeleted: false,
      },
    });
    if (
      !source ||
      !version ||
      version.retentionState !== KnowledgeRetentionState.RETAINED ||
      version.retrievalState !== KnowledgeRetrievalState.ACTIVE ||
      version.supersededByVersionId
    )
      return 'cancelled';
    const baseData = record(base.data);
    const ownerBrand =
      base.sourceBrandId ?? baseData.brandId ?? baseData.sourceBrand ?? null;
    if (
      !['personal', 'org', 'brand'].includes(source.scope) ||
      (source.scope === 'brand' && source.brandId !== ownerBrand) ||
      (source.scope === 'personal' &&
        (principal.origin !== 'ACTOR' ||
          principal.actor.userId !== source.userId ||
          base.createdById !== source.userId))
    )
      return 'cancelled';
    const validTime = await tx.$queryRaw<Array<{ isValid: boolean }>>(
      Prisma.sql`SELECT ("expiresAt" IS NULL OR "expiresAt" > clock_timestamp()) AS "isValid" FROM "knowledge_source_versions" WHERE "id" = ${version.id} AND "organizationId" = ${entry.organizationId} AND "isDeleted" = false`,
    );
    if (!validTime[0]?.isValid) return 'cancelled';
    if (!version.isCurrent) {
      const refresh = await tx.knowledgeSourceRefreshRun.findFirst({
        where: {
          candidateVersionId: version.id,
          organizationId: entry.organizationId,
          sourceId: source.id,
          isDeleted: false,
          status: {
            in: [
              KnowledgeRefreshRunStatus.QUEUED,
              KnowledgeRefreshRunStatus.PROCESSING,
            ],
          },
        },
      });
      if (!refresh?.expectedCurrentVersionId) return 'cancelled';
      const predecessor = await tx.knowledgeSourceVersion.findFirst({
        where: {
          id: refresh.expectedCurrentVersionId,
          sourceId: source.id,
          organizationId: entry.organizationId,
          isCurrent: true,
          isDeleted: false,
        },
      });
      if (!predecessor) return 'cancelled';
    }
    return !source.isVisible ||
      source.syncState === KnowledgeSourceSyncState.STALE ||
      source.staleAt
      ? 'deferred'
      : 'eligible';
  }

  private principal(
    job: ContextEmbeddingJob,
  ): ContextEmbeddingAdmissionPrincipal | null {
    if (job.origin === ContextEmbeddingOrigin.ACTOR) {
      if (!job.actorUserId || job.actorIsApiKey === null) return null;
      return {
        origin: 'ACTOR',
        actor: {
          userId: job.actorUserId,
          organizationId: job.organizationId,
          isApiKey: job.actorIsApiKey,
          scopes: job.actorScopes,
          ...(job.actorApiKeyId ? { apiKeyId: job.actorApiKeyId } : {}),
        },
        ...(job.sourceMemoryId ? { sourceMemoryId: job.sourceMemoryId } : {}),
      };
    }
    if (job.origin === ContextEmbeddingOrigin.DERIVED_MEMORY)
      return job.sourceMemoryId
        ? { origin: 'DERIVED_MEMORY', sourceMemoryId: job.sourceMemoryId }
        : null;
    const p = record(job.workflowProvenance);
    if (
      !nonempty(p.executionId) ||
      !nonempty(p.workflowId) ||
      !nonempty(p.workflowVersionId) ||
      !nonempty(p.userId) ||
      !nonempty(p.nodeId) ||
      !nonempty(p.actionId)
    )
      return null;
    return {
      origin: 'CODE_OWNED_WORKFLOW',
      provenance: {
        organizationId: job.organizationId,
        executionId: p.executionId,
        workflowId: p.workflowId,
        workflowVersionId: p.workflowVersionId,
        userId: p.userId,
        nodeId: p.nodeId,
        actionId: p.actionId,
      },
    };
  }

  private content(entry: ContextEntry): string {
    const content = record(entry.data).content;
    return typeof content === 'string' ? content : '';
  }

  private async settle(
    tx: Prisma.TransactionClient,
    job: ContextEmbeddingJob,
    status: ContextEmbeddingJobStatus,
    code: string,
    leaseToken?: string,
  ): Promise<void> {
    const fence = leaseToken
      ? Prisma.sql`AND "status" = 'PROCESSING' AND "leaseToken" = ${leaseToken} AND "leaseExpiresAt" > clock_timestamp()`
      : Prisma.sql`AND (("status" IN ('PENDING','RETRYABLE') AND "nextAttemptAt" <= clock_timestamp()) OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= clock_timestamp()))`;
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE "context_embedding_jobs" SET "status" = ${status}::"ContextEmbeddingJobStatus",
        "safeFailureCode" = ${code}, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
        "completedAt" = CASE WHEN ${status}::text IN ('FAILED','CANCELLED') THEN clock_timestamp() ELSE NULL END,
        "nextAttemptAt" = clock_timestamp() + CASE WHEN ${job.attempts} <= 1 THEN INTERVAL '30 seconds' ELSE INTERVAL '120 seconds' END,
        "updatedAt" = clock_timestamp()
      WHERE "id" = ${job.id} AND "organizationId" = ${job.organizationId} AND "generation" = ${job.generation} AND "isDeleted" = false ${fence}
    `);
    if (changed === 1 && status === ContextEmbeddingJobStatus.FAILED) {
      await tx.contextEntry.updateMany({
        where: {
          id: job.contextEntryId,
          organizationId: job.organizationId,
          embeddingGeneration: job.generation,
          isDeleted: false,
        },
        data: { embeddingFailedAt: new Date() },
      });
    }
  }
}
