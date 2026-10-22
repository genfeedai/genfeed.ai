import { createHash } from 'node:crypto';
import { parseWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import type {
  KnowledgeEmbeddingChunk,
  KnowledgeEmbeddingStageInput,
} from '@api/collections/contexts/interfaces/context-embedding-write.interface';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { softDeleteKnowledgeChunks } from '@api/collections/contexts/utils/knowledge-chunk.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  KnowledgeProcessingState,
  KnowledgeRefreshRunStatus,
  KnowledgeRetentionState,
} from '@genfeedai/contracts';
import {
  type KnowledgeEmbeddingManifest,
  type KnowledgeSource,
  type KnowledgeSourceVersion,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { stableStringify } from '@libs/utils/canonical-hash.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class KnowledgeEmbeddingCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: ContextEmbeddingWriteService,
    private readonly provider: ContextEmbeddingProviderService,
    private readonly queue: ContextEmbeddingQueueService,
  ) {}

  orderedHash(
    sourceId: string,
    versionId: string,
    model: string,
    chunks: KnowledgeEmbeddingChunk[],
  ): string {
    return createHash('sha256')
      .update(
        stableStringify({
          sourceId,
          versionId,
          modelIdentifier: model,
          dimension: 1024,
          chunks: chunks.map((chunk, chunkIndex) => ({
            chunkIndex,
            contentHash: this.writer.contentHash(chunk.content),
            metadataHash: createHash('sha256')
              .update(stableStringify(chunk.metadata))
              .digest('hex'),
          })),
        }),
      )
      .digest('hex');
  }

  async stage(
    input: KnowledgeEmbeddingStageInput,
  ): Promise<KnowledgeEmbeddingManifest> {
    if (
      !input.admissionExecutionId ||
      !input.initiatingActor ||
      input.chunks.length > 200
    )
      throw new BadRequestException('Invalid Knowledge embedding admission');
    input = {
      ...input,
      initiatingActor: parseWorkflowActor(
        input.initiatingActor,
        input.organizationId,
      ),
    };
    const model = await this.provider.selectModel();
    const hash = this.orderedHash(
      input.sourceId,
      input.versionId,
      model,
      input.chunks,
    );
    const result = await this.prisma.$transaction(async (tx) => {
      const { source, version } = await this.lockSource(
        tx,
        input.organizationId,
        input.sourceId,
        input.versionId,
      );
      await this.writer.assertActor(
        tx,
        input.initiatingActor,
        input.organizationId,
        source.brandId ?? undefined,
      );
      this.assertPersonalOwner(source, input.initiatingActor.userId);
      await this.assertVersionEligible(tx, version);
      const sameExecution = await tx.knowledgeEmbeddingManifest.findFirst({
        where: {
          organizationId: input.organizationId,
          versionId: input.versionId,
          admissionExecutionId: input.admissionExecutionId,
          isDeleted: false,
        },
      });
      const latest = await tx.knowledgeEmbeddingManifest.findFirst({
        where: {
          organizationId: input.organizationId,
          versionId: input.versionId,
          isDeleted: false,
        },
        orderBy: { generation: 'desc' },
      });
      const reuse = sameExecution ?? latest;
      if (
        reuse &&
        (reuse.orderedChunksHash !== hash || reuse.modelIdentifier !== model)
      )
        throw new BadRequestException(
          'Knowledge chunk snapshot conflicts with the sealed version',
        );
      if (sameExecution || (latest && !latest.failedAt))
        return { manifest: reuse as KnowledgeEmbeddingManifest, jobs: [] };
      const generation = latest
        ? latest.generation + 1
        : Math.max(1, version.embeddingGeneration);
      if (latest) {
        await softDeleteKnowledgeChunks(tx, input.organizationId, {
          sourceId: input.sourceId,
          versionId: input.versionId,
          manifestId: latest.id,
        });
      } else {
        await softDeleteKnowledgeChunks(tx, input.organizationId, {
          sourceId: input.sourceId,
          versionId: input.versionId,
          unmanifestedOnly: true,
        });
      }
      const manifest = await tx.knowledgeEmbeddingManifest.create({
        data: {
          organizationId: input.organizationId,
          sourceId: input.sourceId,
          versionId: input.versionId,
          generation,
          admissionExecutionId: input.admissionExecutionId,
          expectedChunkCount: input.chunks.length,
          orderedChunksHash: hash,
          modelIdentifier: model,
          observedValidators: toPrismaJson(input.observedValidators),
          initiatingActor: toPrismaJson(input.initiatingActor),
          sealedAt: new Date(),
        },
      });
      await tx.knowledgeSourceVersion.updateMany({
        where: {
          organizationId: input.organizationId,
          sourceId: input.sourceId,
          id: input.versionId,
          isDeleted: false,
        },
        data: {
          embeddingGeneration: generation,
          processingState: 'PROCESSING',
          processingError: null,
        },
      });
      const jobs = [];
      for (const [index, chunk] of input.chunks.entries()) {
        const saved = await this.writer.writeInTransaction(
          tx,
          {
            contextBaseId: input.contextBaseId,
            organizationId: input.organizationId,
            dto: { content: chunk.content, metadata: chunk.metadata },
            knowledgeLink: {
              knowledgeSourceId: input.sourceId,
              knowledgeSourceVersionId: input.versionId,
            },
            principal: { origin: 'ACTOR', actor: input.initiatingActor },
          },
          model,
          generation,
          { id: manifest.id, index },
        );
        jobs.push(saved.job);
      }
      return { manifest, jobs };
    });
    for (const job of result.jobs) {
      try {
        await this.queue.enqueue({
          jobId: job.id,
          organizationId: job.organizationId,
          generation: job.generation,
        });
      } catch {
        /* The committed ledger remains due for bounded transport recovery. */
      }
    }
    return result.manifest;
  }

  async complete(
    organizationId: string,
    sourceId: string,
    versionId: string,
    manifestId?: string,
  ): Promise<'queued' | 'completed' | 'failed'> {
    return this.prisma.$transaction(async (tx) => {
      const { source, version } = await this.lockSource(
        tx,
        organizationId,
        sourceId,
        versionId,
      );
      const manifest = await tx.knowledgeEmbeddingManifest.findFirst({
        where: scopedWhere(organizationId, {
          sourceId,
          versionId,
          ...(manifestId
            ? { id: manifestId }
            : { generation: version.embeddingGeneration }),
        }),
      });
      if (!manifest)
        throw new BadRequestException(
          'Knowledge chunks have no sealed manifest',
        );
      if (manifest.failedAt) return 'failed';
      if (manifest.generation !== version.embeddingGeneration)
        return manifest.finalizedAt ? 'completed' : 'queued';
      if (manifest.finalizedAt) return 'completed';
      try {
        await this.assertManifestActor(tx, manifest, source);
        await this.assertVersionEligible(tx, version);
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenException)) throw error;
        await this.fail(tx, source, version, manifest, 'SOURCE_INELIGIBLE');
        return 'failed';
      }
      if (!source.isVisible || source.syncState === 'STALE' || source.staleAt)
        return 'queued';
      const failed = await tx.contextEmbeddingJob.findFirst({
        where: {
          organizationId,
          isDeleted: false,
          generation: manifest.generation,
          status: { in: ['FAILED', 'CANCELLED'] },
          contextEntry: {
            is: {
              organizationId,
              knowledgeEmbeddingManifestId: manifest.id,
              isDeleted: false,
            },
          },
        },
      });
      if (failed) {
        await this.fail(tx, source, version, manifest);
        return 'failed';
      }
      if (!(await this.ready(tx, version, manifest))) return 'queued';
      await this.promote(tx, source, version, manifest);
      return 'completed';
    });
  }

  async assertManualAdmission(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceId: string,
  ): Promise<void> {
    const unfinished = await tx.knowledgeSourceRefreshRun.findFirst({
      where: scopedWhere(organizationId, {
        sourceId,
        status: {
          in: [
            KnowledgeRefreshRunStatus.QUEUED,
            KnowledgeRefreshRunStatus.PROCESSING,
          ],
        },
      }),
    });
    if (unfinished)
      throw new ConflictException('Knowledge source ingestion is in progress');
  }

  async fenceManualCandidate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceId: string,
    versionId: string,
    currentVersionId: string,
  ): Promise<void> {
    await tx.knowledgeSourceRefreshRun.create({
      data: {
        organizationId,
        sourceId,
        candidateVersionId: versionId,
        expectedCurrentVersionId: currentVersionId,
        tickKey: 'manual-version:' + versionId,
        status: 'PROCESSING',
      },
    });
  }

  async retryManualCandidate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceId: string,
  ) {
    const latest = await tx.knowledgeSourceVersion.findFirst({
      where: scopedWhere(organizationId, {
        sourceId,
      }),
      orderBy: { version: 'desc' },
    });
    if (!latest || latest.isCurrent) return null;
    const run = await tx.knowledgeSourceRefreshRun.findFirst({
      where: scopedWhere(organizationId, {
        sourceId,
        candidateVersionId: latest.id,
        tickKey: 'manual-version:' + latest.id,
      }),
    });
    if (!run) return null;
    if (run.status !== 'FAILED' || latest.processingState !== 'FAILED')
      throw new BadRequestException('Manual candidate is still being ingested');
    const current = await tx.knowledgeSourceVersion.findFirst({
      where: scopedWhere(organizationId, { sourceId, isCurrent: true }),
    });
    if (!current || current.id !== run.expectedCurrentVersionId)
      throw new ConflictException('Manual candidate predecessor changed');
    const unfinished = await tx.knowledgeSourceRefreshRun.findFirst({
      where: scopedWhere(organizationId, {
        sourceId,
        status: {
          in: [
            KnowledgeRefreshRunStatus.QUEUED,
            KnowledgeRefreshRunStatus.PROCESSING,
          ],
        },
      }),
    });
    if (unfinished)
      throw new ConflictException('Knowledge source ingestion is in progress');
    const reopened = await tx.knowledgeSourceRefreshRun.updateMany({
      where: scopedWhere(organizationId, {
        id: run.id,
        sourceId,
        candidateVersionId: latest.id,
        expectedCurrentVersionId: current.id,
        status: KnowledgeRefreshRunStatus.FAILED,
      }),
      data: {
        status: 'PROCESSING',
        completedAt: null,
        error: null,
        nextAttemptAt: null,
      },
    });
    if (reopened.count !== 1)
      throw new ConflictException('Manual candidate retry changed');
    const data = await this.processingUpdate(
      tx,
      latest,
      KnowledgeProcessingState.QUEUED,
    );
    return tx.knowledgeSourceVersion.update({
      where: scopedWhere(organizationId, { id: latest.id, sourceId }),
      data,
    });
  }

  async processingUpdate(
    tx: Prisma.TransactionClient,
    version: KnowledgeSourceVersion,
    state: KnowledgeProcessingState,
    processingError?: string,
  ): Promise<Prisma.KnowledgeSourceVersionUpdateInput> {
    if (version.retentionState !== KnowledgeRetentionState.RETAINED)
      throw new BadRequestException(
        'Only a retained current version can be processed',
      );
    if (!version.isCurrent) {
      const run = await tx.knowledgeSourceRefreshRun.findFirst({
        where: scopedWhere(version.organizationId, {
          sourceId: version.sourceId,
          candidateVersionId: version.id,
          tickKey: 'manual-version:' + version.id,
          status: {
            in: [
              KnowledgeRefreshRunStatus.QUEUED,
              KnowledgeRefreshRunStatus.PROCESSING,
            ],
          },
        }),
      });
      if (!run)
        throw new BadRequestException(
          'Only a retained current version can be processed',
        );
      if (state === KnowledgeProcessingState.READY)
        throw new BadRequestException(
          'Knowledge indexing is incomplete; sealed promotion is required',
        );
      await this.assertVersionEligible(tx, version);
    }
    const allowed: Record<
      KnowledgeProcessingState,
      readonly KnowledgeProcessingState[]
    > = {
      QUEUED: [KnowledgeProcessingState.PROCESSING],
      PROCESSING: [
        KnowledgeProcessingState.READY,
        KnowledgeProcessingState.FAILED,
      ],
      FAILED: [KnowledgeProcessingState.QUEUED],
      READY: [],
    };
    if (
      version.processingState !== state &&
      !allowed[version.processingState].includes(state)
    )
      throw new BadRequestException('Invalid processing transition');
    if (state === KnowledgeProcessingState.READY)
      await this.assertReady(tx, version);
    // The database rejects a reason outside FAILED; clear it on every other
    // transition so a requeued version starts clean.
    return {
      processingState: state,
      processingError:
        state === KnowledgeProcessingState.FAILED
          ? (processingError ?? version.processingError ?? null)
          : null,
    };
  }

  async assertReady(
    tx: Prisma.TransactionClient,
    version: KnowledgeSourceVersion,
  ): Promise<void> {
    if (version.embeddingGeneration === 0) return;
    const manifest = await tx.knowledgeEmbeddingManifest.findFirst({
      where: {
        organizationId: version.organizationId,
        sourceId: version.sourceId,
        versionId: version.id,
        generation: version.embeddingGeneration,
        isDeleted: false,
      },
    });
    if (
      !manifest ||
      manifest.failedAt ||
      !(await this.ready(tx, version, manifest))
    )
      throw new BadRequestException('Knowledge indexing is incomplete');
  }

  private async ready(
    tx: Prisma.TransactionClient,
    version: KnowledgeSourceVersion,
    manifest: KnowledgeEmbeddingManifest,
  ): Promise<boolean> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "context_entries"
      WHERE "organizationId" = ${version.organizationId} AND "knowledgeSourceId" = ${version.sourceId}
        AND "knowledgeSourceVersionId" = ${version.id} AND "isDeleted" = false
      ORDER BY "id" ASC LIMIT 201 FOR UPDATE
    `);
    if (locked.length !== manifest.expectedChunkCount) return false;
    const rows = await tx.contextEntry.findMany({
      where: {
        organizationId: version.organizationId,
        knowledgeSourceId: version.sourceId,
        knowledgeSourceVersionId: version.id,
        knowledgeEmbeddingManifestId: manifest.id,
        isDeleted: false,
      },
      orderBy: { knowledgeChunkIndex: 'asc' },
      take: 201,
    });
    if (
      rows.length !== manifest.expectedChunkCount ||
      rows.some(
        (row, i) =>
          row.knowledgeChunkIndex !== i ||
          row.embeddingGeneration !== manifest.generation ||
          row.embeddingStoredGeneration !== manifest.generation,
      )
    )
      return false;
    const chunks = rows.map((row) => ({
      content: record(row.data).content,
      metadata: record(record(row.data).metadata),
    }));
    if (chunks.some((chunk) => typeof chunk.content !== 'string')) return false;
    if (
      this.orderedHash(
        version.sourceId,
        version.id,
        manifest.modelIdentifier,
        chunks.map((chunk) => ({
          content: chunk.content as string,
          metadata: chunk.metadata,
        })),
      ) !== manifest.orderedChunksHash
    )
      return false;
    if (manifest.expectedChunkCount === 0) return true;
    const stored = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count" FROM "context_entries" e
      JOIN "context_embedding_jobs" j ON j."contextEntryId" = e."id" AND j."organizationId" = e."organizationId"
        AND j."generation" = e."embeddingGeneration" AND j."isDeleted" = false AND j."status" = 'SUCCEEDED'
      WHERE e."organizationId" = ${version.organizationId} AND e."knowledgeEmbeddingManifestId" = ${manifest.id}
        AND e."isDeleted" = false AND e."embedding" IS NOT NULL
        AND e."embeddingGeneration" = ${manifest.generation} AND e."embeddingStoredGeneration" = ${manifest.generation}
        AND j."modelIdentifier" = ${manifest.modelIdentifier} AND j."dimension" = 1024
        AND j."contentHash" = encode(sha256(convert_to(e."data"->>'content', 'UTF8')), 'hex')
    `);
    return stored[0]?.count === manifest.expectedChunkCount;
  }

  private async lockSource(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceId: string,
    versionId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "knowledge_sources" WHERE "id" = ${sourceId}
      AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`);
    const source = await tx.knowledgeSource.findFirst({
      where: { id: sourceId, organizationId, isDeleted: false },
    });
    const version = await tx.knowledgeSourceVersion.findFirst({
      where: { id: versionId, sourceId, organizationId, isDeleted: false },
    });
    if (!source || !version)
      throw new ForbiddenException('Knowledge access denied');
    return { source, version };
  }

  private async assertVersionEligible(
    tx: Prisma.TransactionClient,
    version: KnowledgeSourceVersion,
  ): Promise<void> {
    if (
      version.retentionState !== 'RETAINED' ||
      version.retrievalState !== 'ACTIVE' ||
      version.supersededByVersionId
    )
      throw new ForbiddenException('Knowledge source is retired');
    const valid = await tx.$queryRaw<Array<{ valid: boolean }>>(Prisma.sql`
      SELECT ("expiresAt" IS NULL OR "expiresAt" > clock_timestamp()) AS "valid" FROM "knowledge_source_versions"
      WHERE "id" = ${version.id} AND "organizationId" = ${version.organizationId} AND "isDeleted" = false
    `);
    if (!valid[0]?.valid)
      throw new ForbiddenException('Knowledge source is expired');
    if (!version.isCurrent) {
      const run = await tx.knowledgeSourceRefreshRun.findFirst({
        where: {
          organizationId: version.organizationId,
          sourceId: version.sourceId,
          candidateVersionId: version.id,
          isDeleted: false,
          status: {
            in: [
              KnowledgeRefreshRunStatus.QUEUED,
              KnowledgeRefreshRunStatus.PROCESSING,
            ],
          },
        },
      });
      const current =
        run?.expectedCurrentVersionId &&
        (await tx.knowledgeSourceVersion.findFirst({
          where: {
            id: run.expectedCurrentVersionId,
            organizationId: version.organizationId,
            sourceId: version.sourceId,
            isCurrent: true,
            isDeleted: false,
          },
        }));
      if (!current)
        throw new ForbiddenException('Knowledge refresh predecessor changed');
    }
  }

  private assertPersonalOwner(source: KnowledgeSource, userId: string): void {
    if (source.scope === 'personal' && source.userId !== userId)
      throw new ForbiddenException('Knowledge access denied');
  }

  private async assertManifestActor(
    tx: Prisma.TransactionClient,
    manifest: KnowledgeEmbeddingManifest,
    source: KnowledgeSource,
  ) {
    const actor = parseWorkflowActor(
      manifest.initiatingActor,
      manifest.organizationId,
      () => {
        throw new ForbiddenException('Knowledge access denied');
      },
    );
    await this.writer.assertActor(
      tx,
      actor,
      manifest.organizationId,
      source.brandId ?? undefined,
    );
    this.assertPersonalOwner(source, actor.userId);
    return actor;
  }

  private async promote(
    tx: Prisma.TransactionClient,
    source: KnowledgeSource,
    version: KnowledgeSourceVersion,
    manifest: KnowledgeEmbeddingManifest,
  ) {
    const now = new Date();
    const actor = await this.assertManifestActor(tx, manifest, source);
    await this.assertVersionEligible(tx, version);
    const run = version.isCurrent
      ? null
      : await tx.knowledgeSourceRefreshRun.findFirst({
          where: scopedWhere(source.organizationId, {
            sourceId: source.id,
            candidateVersionId: version.id,
            status: {
              in: [
                KnowledgeRefreshRunStatus.QUEUED,
                KnowledgeRefreshRunStatus.PROCESSING,
              ],
            },
          }),
        });
    const predecessorId = run?.expectedCurrentVersionId;
    if (!version.isCurrent && !predecessorId)
      throw new ForbiddenException('Knowledge refresh predecessor changed');
    if (run && predecessorId) {
      const retired = await tx.knowledgeSourceVersion.updateMany({
        where: {
          organizationId: source.organizationId,
          sourceId: source.id,
          isCurrent: true,
          isDeleted: false,
          id: predecessorId,
        },
        data: {
          isCurrent: false,
          retrievalState: 'SUPERSEDED',
          supersededByVersionId: version.id,
        },
      });
      if (retired.count !== 1)
        throw new ConflictException('Knowledge predecessor changed');
      await softDeleteKnowledgeChunks(tx, source.organizationId, {
        sourceId: source.id,
        exceptVersionId: version.id,
      });
      await tx.$queryRaw(Prisma.sql`
        SELECT set_config('genfeed.knowledge_candidate_promotion', jsonb_build_object(
          'transactionId', txid_current()::text,
          'organizationId', ${source.organizationId}::text, 'sourceId', ${source.id}::text,
          'candidateVersionId', ${version.id}::text, 'generation', ${manifest.generation}::integer,
          'manifestId', ${manifest.id}::text, 'orderedChunksHash', ${manifest.orderedChunksHash}::text,
          'modelIdentifier', ${manifest.modelIdentifier}::text, 'runId', ${run.id}::text,
          'expectedCurrentVersionId', ${predecessorId}::text, 'actor', ${JSON.stringify(actor)}::jsonb
        )::text, true)
      `);
    }
    const promoted = await tx.knowledgeSourceVersion.updateMany({
      where: {
        organizationId: source.organizationId,
        sourceId: source.id,
        id: version.id,
        isDeleted: false,
        embeddingGeneration: manifest.generation,
      },
      data: {
        isCurrent: true,
        processingState: 'READY',
        processingError: null,
      },
    });
    if (promoted.count !== 1)
      throw new ConflictException('Knowledge candidate changed');
    if (run && predecessorId) {
      await tx.$queryRaw(
        Prisma.sql`SELECT set_config('genfeed.knowledge_candidate_promotion', '', true), set_config('genfeed.knowledge_predecessor_retirement', '', true)`,
      );
      const settled = await tx.knowledgeSourceRefreshRun.updateMany({
        where: scopedWhere(source.organizationId, {
          id: run.id,
          sourceId: source.id,
          candidateVersionId: version.id,
          expectedCurrentVersionId: predecessorId,
          status: {
            in: [
              KnowledgeRefreshRunStatus.QUEUED,
              KnowledgeRefreshRunStatus.PROCESSING,
            ],
          },
        }),
        data: { completedAt: now, outcome: 'CHANGED', status: 'COMPLETED' },
      });
      if (settled.count !== 1)
        throw new ConflictException('Knowledge refresh settlement changed');
    }
    const validators = record(manifest.observedValidators);
    await tx.knowledgeSource.updateMany({
      where: {
        organizationId: source.organizationId,
        id: source.id,
        isDeleted: false,
      },
      data: {
        consecutiveFailures: 0,
        firstFailureAt: null,
        lastCheckedAt: now,
        lastSuccessfulSyncAt: now,
        lastSyncError: null,
        nextCheckAt: new Date(
          now.getTime() +
            (source.refreshIntervalMinutes ??
              (source.kind === 'RSS' ? 60 : 1440)) *
              60000,
        ),
        syncState: 'CURRENT',
        staleAt: null,
        ...(typeof validators.etag === 'string'
          ? { etag: validators.etag }
          : {}),
        ...(typeof validators.lastModified === 'string'
          ? { lastModified: validators.lastModified }
          : {}),
      },
    });
    await tx.knowledgeCaptureRequest.updateMany({
      where: {
        organizationId: source.organizationId,
        sourceId: source.id,
        isDeleted: false,
        status: 'queued',
      },
      data: { status: 'completed' },
    });
    await tx.knowledgeEmbeddingManifest.updateMany({
      where: {
        organizationId: source.organizationId,
        id: manifest.id,
        isDeleted: false,
        finalizedAt: null,
        failedAt: null,
      },
      data: { finalizedAt: now },
    });
  }

  private async fail(
    tx: Prisma.TransactionClient,
    source: KnowledgeSource,
    version: KnowledgeSourceVersion,
    manifest: KnowledgeEmbeddingManifest,
    code = 'CHUNK_EMBEDDING_FAILED',
  ) {
    const now = new Date();
    const error = 'Knowledge indexing failed';
    await tx.knowledgeEmbeddingManifest.updateMany({
      where: {
        organizationId: source.organizationId,
        id: manifest.id,
        isDeleted: false,
        finalizedAt: null,
        failedAt: null,
      },
      data: { failedAt: now, safeFailureCode: code },
    });
    await tx.contextEmbeddingJob.updateMany({
      where: {
        organizationId: source.organizationId,
        isDeleted: false,
        generation: manifest.generation,
        status: { in: ['PENDING', 'RETRYABLE', 'PROCESSING'] },
        contextEntry: {
          is: {
            organizationId: source.organizationId,
            knowledgeEmbeddingManifestId: manifest.id,
            isDeleted: false,
          },
        },
      },
      data: {
        status: 'CANCELLED',
        safeFailureCode: 'MANIFEST_FAILED',
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: now,
      },
    });
    await tx.knowledgeSourceVersion.updateMany({
      where: {
        organizationId: source.organizationId,
        sourceId: source.id,
        id: version.id,
        isDeleted: false,
        embeddingGeneration: manifest.generation,
      },
      data: { processingState: 'FAILED', processingError: error },
    });
    await tx.knowledgeCaptureRequest.updateMany({
      where: {
        organizationId: source.organizationId,
        sourceId: source.id,
        isDeleted: false,
        status: 'queued',
      },
      data: { status: 'failed', error },
    });
    if (!version.isCurrent) {
      const failures = source.consecutiveFailures + 1;
      const firstFailureAt = source.firstFailureAt ?? now;
      const stale =
        failures >= 2 &&
        now.getTime() - firstFailureAt.getTime() >=
          (source.gracePeriodMinutes ?? 10080) * 60000;
      const backoff = Math.min(
        [15, 30, 60, 120][Math.min(failures - 1, 3)] ?? 120,
        source.refreshIntervalMinutes ?? (source.kind === 'RSS' ? 60 : 1440),
      );
      const next = new Date(now.getTime() + backoff * 60000);
      await tx.knowledgeSourceRefreshRun.updateMany({
        where: {
          organizationId: source.organizationId,
          sourceId: source.id,
          candidateVersionId: version.id,
          isDeleted: false,
          status: {
            in: [
              KnowledgeRefreshRunStatus.QUEUED,
              KnowledgeRefreshRunStatus.PROCESSING,
            ],
          },
        },
        data: {
          completedAt: now,
          error,
          nextAttemptAt: next,
          status: KnowledgeRefreshRunStatus.FAILED,
        },
      });
      await tx.knowledgeSource.updateMany({
        where: {
          organizationId: source.organizationId,
          id: source.id,
          isDeleted: false,
        },
        data: {
          consecutiveFailures: failures,
          firstFailureAt,
          lastCheckedAt: now,
          lastSyncError: error,
          nextCheckAt: next,
          staleAt: stale ? now : source.staleAt,
          syncState: stale ? 'STALE' : 'FAILED',
        },
      });
    }
  }
}
