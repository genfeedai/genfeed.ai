import { createHash } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  type HiddenWorkflowRule,
  validateHiddenExecutionChain,
} from '@api/authorization/brand-access/hidden-execution-chain.util';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  type WorkflowInitiatingActor,
} from '@api/authorization/brand-access/workflow-actor.util';
import type {
  ContextEmbeddingAdmissionPrincipal,
  ContextEmbeddingWriteInput,
  ContextMemoryCaptureAuthority,
} from '@api/collections/contexts/interfaces/context-embedding-write.interface';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import type { ContextBaseScopeRow } from '@api/collections/contexts/utils/context-brand-scope.util';
import { buildMemorySourceSnapshotHashQuery } from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import { assertKnowledgeGovernance } from '@api/collections/contexts/utils/knowledge-actor.util';
import { PLATFORM_WORKFLOW_SCHEDULE_SOURCE } from '@api/collections/workflows/system-workflow-definition';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import type {
  ContextEmbeddingBackfillInput,
  ContextEmbeddingBackfillResult,
} from '@genfeedai/contracts/interfaces/knowledge-base/context-embedding.interface';
import type { ContextBase } from '@genfeedai/prisma';
import {
  ContextEmbeddingOrigin,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { stableStringify } from '@libs/utils/canonical-hash.util';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const WINNER_ROOT: HiddenWorkflowRule = {
  matches: (id) => id === 'content-loop-autopilot',
  rootSources: [PLATFORM_WORKFLOW_SCHEDULE_SOURCE],
};
const WINNER_ORGANIZATION: HiddenWorkflowRule = {
  matches: (id) => id === 'harness.winners.promote',
  parents: [
    {
      kind: 'hidden-single-child',
      nodeId: (id) => id === 'promoteHarnessWinners',
      rule: WINNER_ROOT,
    },
  ],
};
const WINNER_BRAND: HiddenWorkflowRule = {
  matches: (id) => id === 'harness.winners.promote.brand',
  parents: [
    { nodeId: (id) => id === 'process-items', rule: WINNER_ORGANIZATION },
  ],
};
const WINNER_ITEM: HiddenWorkflowRule = {
  matches: (id) => id === 'harness.winners.promote.item',
  parents: [
    {
      nodeId: (id) => id === 'promote-items',
      rule: WINNER_BRAND,
      discovery: {
        nodeId: 'prepare-brand',
        itemsKey: 'items',
        matches: (item, holder) =>
          stableStringify(item) === stableStringify(holder.item),
      },
    },
  ],
};

@Injectable()
export class ContextEmbeddingWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: BrandAccessService,
    private readonly provider: ContextEmbeddingProviderService,
    private readonly queue: ContextEmbeddingQueueService,
    private readonly logger: LoggerService,
  ) {}

  async assertCaptureAuthority(
    authority: ContextMemoryCaptureAuthority,
    organizationId: string,
    brandId?: string,
  ): Promise<void> {
    if (authority.origin === 'ACTOR') {
      await this.prisma.$transaction(async (tx) => {
        await this.assertActor(tx, authority.actor, organizationId, brandId);
      });
    }
  }

  async write(input: ContextEmbeddingWriteInput) {
    if (!input.principal)
      throw new ForbiddenException('Context admission requires provenance');
    if (!input.dto.content.trim())
      throw new BadRequestException('Context content is required');
    const modelIdentifier = await this.provider.selectModel();
    const saved = await this.prisma.$transaction(async (tx) => {
      return this.writeInTransaction(tx, input, modelIdentifier);
    });
    try {
      await this.queue.enqueue({
        jobId: saved.job.id,
        organizationId: saved.job.organizationId,
        generation: saved.job.generation,
      });
    } catch {
      this.logger.warn(
        'Context embedding transport unavailable; durable intent remains due',
      );
    }
    return saved.entry;
  }

  async writeInTransaction(
    tx: Prisma.TransactionClient,
    input: ContextEmbeddingWriteInput,
    modelIdentifier: string,
    generation = 1,
    manifest?: { id: string; index: number },
  ) {
    if (!input.principal || !input.dto.content.trim())
      throw new ForbiddenException(
        'Context admission requires content and provenance',
      );
    // Linked source rows always precede base/entry/job locks.
    const snapshot = await this.memorySnapshot(
      tx,
      input.principal,
      input.organizationId,
      input.dto.content,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "context_bases" WHERE "id" = ${input.contextBaseId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    const base = await tx.contextBase.findFirst({
      where: {
        id: input.contextBaseId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
    });
    if (!base) throw new ForbiddenException('Context access denied');
    await this.assertPrincipal(
      tx,
      input.principal,
      input.organizationId,
      base,
      input.dto.content,
    );
    const metadata = record(input.dto.metadata);
    const kind =
      typeof metadata.kind === 'string' && metadata.kind.trim()
        ? metadata.kind.trim()
        : undefined;
    const entry = await tx.contextEntry.create({
      data: {
        contextBaseId: input.contextBaseId,
        organizationId: input.organizationId,
        ...(input.knowledgeLink ?? {}),
        embeddingGeneration: generation,
        ...(manifest
          ? {
              knowledgeEmbeddingManifestId: manifest.id,
              knowledgeChunkIndex: manifest.index,
            }
          : {}),
        embeddingStoredGeneration: 0,
        ...(snapshot
          ? {
              sourceAgentMemoryId: snapshot.id,
              sourceSnapshotHash: snapshot.hash,
            }
          : {}),
        data: toPrismaJson({
          content: input.dto.content,
          ...(kind ? { kind } : {}),
          metadata,
          relevanceWeight: input.dto.relevanceWeight || 1.0,
        }),
      },
    });
    const job = await tx.contextEmbeddingJob.create({
      data: {
        organizationId: input.organizationId,
        contextEntryId: entry.id,
        generation,
        contentHash: this.contentHash(input.dto.content),
        modelIdentifier,
        ...this.principalData(input.principal),
        ...(snapshot
          ? { sourceMemoryId: snapshot.id, sourceSnapshotHash: snapshot.hash }
          : {}),
      },
    });
    await tx.$executeRaw(Prisma.sql`
        UPDATE "context_bases" SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), ARRAY['entryCount'], to_jsonb(GREATEST(0, COALESCE("data"->>'entryCount', '0')::int + 1)))
        WHERE "id" = ${input.contextBaseId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false
      `);
    return { entry, job };
  }

  async backfill(
    contextBaseId: string,
    organizationId: string,
    actor: WorkflowInitiatingActor,
    input: ContextEmbeddingBackfillInput,
  ): Promise<ContextEmbeddingBackfillResult<ContextBase>> {
    if (
      !Number.isInteger(input.maxEntries) ||
      input.maxEntries < 1 ||
      input.maxEntries > 200 ||
      (input.cursor !== undefined &&
        (typeof input.cursor !== 'string' ||
          !input.cursor.trim() ||
          input.cursor.length > 200))
    )
      throw new BadRequestException(
        'Invalid context embedding backfill bounds',
      );
    await this.assertCaptureAuthority(
      { origin: 'ACTOR', actor },
      organizationId,
    );
    await assertKnowledgeGovernance(this.prisma, actor);
    const model = await this.provider.selectModel();
    const cursor = input.cursor
      ? Prisma.sql`AND e."id" > ${input.cursor}`
      : Prisma.empty;
    const candidates = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT e."id" FROM "context_entries" e
      WHERE e."organizationId" = ${organizationId} AND e."contextBaseId" = ${contextBaseId} AND e."isDeleted" = false
        AND e."knowledgeEmbeddingManifestId" IS NULL
        AND (e."embedding" IS NULL OR e."embeddingStoredGeneration" <> e."embeddingGeneration")
        AND (e."knowledgeSourceVersionId" IS NULL OR EXISTS (
          SELECT 1 FROM "knowledge_source_versions" v WHERE v."id" = e."knowledgeSourceVersionId"
            AND v."organizationId" = e."organizationId" AND v."sourceId" = e."knowledgeSourceId"
            AND v."embeddingGeneration" = 0 AND v."isDeleted" = false))
        ${cursor} ORDER BY e."id" LIMIT ${input.maxEntries + 1}
    `);
    const selected = candidates.slice(0, input.maxEntries);
    const saved = await this.prisma.$transaction(async (tx) => {
      // Discover and lock sources before the base, matching claim/commit and lifecycle writes.
      const selectedIds = selected.map((entry) => entry.id);
      if (selectedIds.length) {
        await tx.$queryRaw(Prisma.sql`SELECT s."id" FROM "knowledge_sources" s
          JOIN "context_entries" e ON e."knowledgeSourceId" = s."id" AND e."organizationId" = s."organizationId"
          WHERE e."organizationId" = ${organizationId} AND e."id" IN (${Prisma.join(selectedIds)}) ORDER BY s."id" FOR UPDATE OF s`);
        await tx.$queryRaw(Prisma.sql`SELECT m."id" FROM "agent_memories" m
          JOIN "context_entries" e ON e."sourceAgentMemoryId" = m."id" AND e."organizationId" = m."organizationId"
          WHERE e."organizationId" = ${organizationId} AND e."id" IN (${Prisma.join(selectedIds)}) ORDER BY m."id" FOR UPDATE OF m`);
      }
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "context_bases" WHERE "id" = ${contextBaseId}
        AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`);
      const base = await tx.contextBase.findFirst({
        where: { id: contextBaseId, organizationId, isDeleted: false },
      });
      if (!base) throw new ForbiddenException('Context access denied');
      await this.assertPrincipal(
        tx,
        { origin: 'ACTOR', actor },
        organizationId,
        base,
      );
      await assertKnowledgeGovernance(this.prisma, actor);
      const jobs = [];
      for (const candidate of selected) {
        const job = await this.admitHistoricalEntry(
          tx,
          candidate.id,
          organizationId,
          base,
          actor,
          model,
        );
        if (job) jobs.push(job);
      }
      return { base, jobs };
    });
    for (const job of saved.jobs) {
      try {
        await this.queue.enqueue({
          jobId: job.id,
          organizationId,
          generation: job.generation,
        });
      } catch {
        this.logger.warn(
          'Context embedding transport unavailable; durable intent remains due',
        );
      }
    }
    return {
      contextBase: saved.base,
      admission: {
        admitted: saved.jobs.length,
        skipped: selected.length - saved.jobs.length,
        nextCursor:
          candidates.length > input.maxEntries
            ? (selected.at(-1)?.id ?? null)
            : null,
      },
    };
  }

  private async admitHistoricalEntry(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    base: ContextBase,
    actor: WorkflowInitiatingActor,
    modelIdentifier: string,
  ) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "context_entries" WHERE "id" = ${id}
      AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`);
    const entry = await tx.contextEntry.findFirst({
      where: {
        id,
        contextBaseId: base.id,
        organizationId,
        isDeleted: false,
        knowledgeEmbeddingManifestId: null,
      },
    });
    if (!entry) return null;
    const pending = await tx.contextEmbeddingJob.findFirst({
      where: {
        contextEntryId: id,
        organizationId,
        isDeleted: false,
        status: { in: ['PENDING', 'RETRYABLE', 'PROCESSING'] },
      },
    });
    if (pending) return null;
    const eligible = await tx.$queryRaw<
      Array<{ eligible: boolean }>
    >(Prisma.sql`
      SELECT ((e."embedding" IS NULL OR e."embeddingStoredGeneration" <> e."embeddingGeneration")
        AND (e."knowledgeSourceVersionId" IS NULL OR (
          v."embeddingGeneration" = 0 AND v."isDeleted" = false AND v."isCurrent" = true
          AND v."processingState" = 'READY' AND v."retrievalState" = 'ACTIVE' AND v."retentionState" = 'RETAINED'
          AND (v."expiresAt" IS NULL OR v."expiresAt" > clock_timestamp())
          AND s."isDeleted" = false AND s."isVisible" = true AND s."staleAt" IS NULL AND s."syncState" IS DISTINCT FROM 'STALE'
          AND (s."scope" <> 'personal' OR (s."userId" = ${actor.userId} AND s."userId" = ${base.createdById}))
        ))) AS "eligible"
      FROM "context_entries" e LEFT JOIN "knowledge_source_versions" v
        ON v."id" = e."knowledgeSourceVersionId" AND v."sourceId" = e."knowledgeSourceId" AND v."organizationId" = e."organizationId"
      LEFT JOIN "knowledge_sources" s ON s."id" = e."knowledgeSourceId" AND s."organizationId" = e."organizationId"
      WHERE e."id" = ${id} AND e."organizationId" = ${organizationId} AND e."isDeleted" = false
    `);
    if (!eligible[0]?.eligible) return null;
    const content = record(entry.data).content;
    if (typeof content !== 'string' || !content.trim()) return null;
    const principal: ContextEmbeddingAdmissionPrincipal = {
      origin: 'ACTOR',
      actor,
      ...(entry.sourceAgentMemoryId
        ? { sourceMemoryId: entry.sourceAgentMemoryId }
        : {}),
    };
    if (entry.sourceAgentMemoryId) {
      const memory = await tx.agentMemory.findFirst({
        where: {
          id: entry.sourceAgentMemoryId,
          organizationId,
          isDeleted: false,
        },
        select: { scope: true, userId: true },
      });
      if (
        !memory ||
        (memory.scope === 'personal' && memory.userId !== actor.userId)
      )
        return null;
    }
    const snapshot = await this.memorySnapshot(
      tx,
      principal,
      organizationId,
      content,
    );
    await this.assertPrincipal(tx, principal, organizationId, base, content);
    const generation = entry.embeddingGeneration + 1;
    const admitted = await tx.contextEntry.updateMany({
      where: {
        id,
        contextBaseId: base.id,
        organizationId,
        isDeleted: false,
        embeddingGeneration: entry.embeddingGeneration,
      },
      data: {
        embeddingGeneration: generation,
        embeddingFailedAt: null,
        embeddingClaimedAt: null,
        ...(snapshot ? { sourceSnapshotHash: snapshot.hash } : {}),
      },
    });
    if (admitted.count !== 1) return null;
    return tx.contextEmbeddingJob.create({
      data: {
        contextEntryId: id,
        organizationId,
        generation,
        contentHash: this.contentHash(content),
        modelIdentifier,
        admissionOperation: 'HISTORICAL_BACKFILL',
        ...this.principalData(principal),
        ...(snapshot
          ? { sourceMemoryId: snapshot.id, sourceSnapshotHash: snapshot.hash }
          : {}),
      },
    });
  }

  contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  async assertActor(
    tx: Prisma.TransactionClient,
    value: WorkflowInitiatingActor,
    organizationId: string,
    brandId?: string,
  ): Promise<WorkflowInitiatingActor> {
    const captured = parseWorkflowActor(value, organizationId);
    const [user, organization] = await Promise.all([
      tx.user.findFirst({
        where: { id: captured.userId, isDeleted: false },
        select: { id: true },
      }),
      tx.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
        select: { id: true },
      }),
    ]);
    if (!user || !organization)
      throw new ForbiddenException('Context access denied');
    if (captured.isApiKey) {
      const key = await tx.apiKey.findFirst({
        where: {
          id: captured.apiKeyId,
          userId: captured.userId,
          organizationId,
          isRevoked: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { scopes: true },
      });
      if (
        !captured.apiKeyId ||
        !key ||
        captured.scopes.some((scope) => !key.scopes.includes(scope))
      ) {
        throw new ForbiddenException('Context access denied');
      }
    }
    const current = await refreshWorkflowActor(
      tx,
      this.policy,
      captured,
      organizationId,
    );
    if (
      !current ||
      captured.scopes.some((scope) => !current.scopes.includes(scope))
    ) {
      throw new ForbiddenException('Context access denied');
    }
    if (brandId) await this.policy.assert(current, brandId, tx);
    return current;
  }

  async assertPrincipal(
    tx: Prisma.TransactionClient,
    principal: ContextEmbeddingAdmissionPrincipal,
    organizationId: string,
    base: ContextBaseScopeRow,
    content?: string,
  ): Promise<void> {
    const data = record(base.data);
    const owners = [base.sourceBrandId, data.brandId, data.sourceBrand].filter(
      (owner): owner is string => typeof owner === 'string' && owner.length > 0,
    );
    if (new Set(owners).size > 1)
      throw new ForbiddenException('Context access denied');
    const brandId = owners[0];
    if (
      principal.origin !== 'CODE_OWNED_WORKFLOW' &&
      principal.sourceMemoryId
    ) {
      await this.assertMemoryEligibility(
        tx,
        principal.sourceMemoryId,
        organizationId,
        base,
        brandId,
      );
    }
    if (principal.origin === 'ACTOR') {
      const actor = await this.assertActor(
        tx,
        principal.actor,
        organizationId,
        brandId,
      );
      if (data.knowledgeScope === KnowledgeMemoryScope.PERSONAL) {
        const userOwners = [
          base.createdById,
          data.createdById,
          data.createdBy,
          data.userId,
        ].filter(
          (owner): owner is string =>
            typeof owner === 'string' && owner.length > 0,
        );
        if (
          !userOwners.length ||
          userOwners.some((owner) => owner !== actor.userId)
        )
          throw new ForbiddenException('Context access denied');
      }
      return;
    }
    if (principal.origin === 'DERIVED_MEMORY') return;
    await this.assertWinnerAuthority(
      tx,
      principal,
      organizationId,
      base,
      content,
    );
  }

  async memorySnapshot(
    tx: Prisma.TransactionClient,
    principal: ContextEmbeddingAdmissionPrincipal,
    organizationId: string,
    content: string,
  ) {
    const sourceMemoryId =
      principal.origin === 'CODE_OWNED_WORKFLOW'
        ? undefined
        : principal.sourceMemoryId;
    if (!sourceMemoryId) return null;
    await tx.$queryRaw(
      Prisma.sql`SELECT m."id" FROM "agent_memories" m WHERE m."id" = ${sourceMemoryId} AND m."organizationId" = ${organizationId} AND m."isDeleted" = false FOR UPDATE`,
    );
    const rows = await tx.$queryRaw<
      Array<{ id: string; hash: string; content: string | null }>
    >(Prisma.sql`
      SELECT m."id", m."content", ${buildMemorySourceSnapshotHashQuery()} AS "hash"
      FROM "agent_memories" m WHERE m."id" = ${sourceMemoryId} AND m."organizationId" = ${organizationId} AND m."isDeleted" = false
    `);
    const source = rows[0];
    if (!source || source.content !== content)
      throw new ForbiddenException('Context source identity changed');
    return source;
  }

  private async assertMemoryEligibility(
    tx: Prisma.TransactionClient,
    memoryId: string,
    organizationId: string,
    base: ContextBaseScopeRow,
    brandId?: string,
  ): Promise<void> {
    const memory = await tx.agentMemory.findFirst({
      where: { id: memoryId, organizationId, isDeleted: false },
    });
    const user = memory
      ? await tx.user.findFirst({
          where: { id: memory.userId, isDeleted: false },
          select: { id: true },
        })
      : null;
    const org = await tx.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { id: true },
    });
    const brand = memory?.brandId
      ? await tx.brand.findFirst({
          where: { id: memory.brandId, organizationId, isDeleted: false },
          select: { id: true },
        })
      : null;
    const campaign = memory?.campaignId
      ? await tx.agentCampaign.findFirst({
          where: { id: memory.campaignId, organizationId, isDeleted: false },
          select: { id: true, brandId: true, userId: true },
        })
      : null;
    if (
      !memory ||
      !user ||
      !org ||
      (memory.brandId && !brand) ||
      memory.brandId !== (brandId ?? null)
    )
      throw new ForbiddenException('Context source access denied');
    if (
      memory.campaignId &&
      (!campaign ||
        campaign.brandId !== memory.brandId ||
        campaign.userId !== memory.userId)
    )
      throw new ForbiddenException('Context source access denied');
    if (
      !Object.values(KnowledgeMemoryScope).some(
        (scope) => scope === memory.scope,
      )
    )
      throw new ForbiddenException('Context source access denied');
    if (
      record(base.data).knowledgeScope === KnowledgeMemoryScope.PERSONAL &&
      base.createdById !== memory.userId
    )
      throw new ForbiddenException('Context source access denied');
  }

  private async assertWinnerAuthority(
    tx: Prisma.TransactionClient,
    principal: Extract<
      ContextEmbeddingAdmissionPrincipal,
      { origin: 'CODE_OWNED_WORKFLOW' }
    >,
    organizationId: string,
    base: ContextBaseScopeRow,
    content?: string,
  ): Promise<void> {
    const provenance = principal.provenance;
    if (
      provenance.organizationId !== organizationId ||
      !provenance.workflowVersionId ||
      provenance.nodeId !== 'execute' ||
      provenance.actionId !== 'harness.winners.promote-item'
    )
      throw new ForbiddenException('Context workflow access denied');
    const chain = await validateHiddenExecutionChain(
      tx,
      provenance,
      WINNER_ITEM,
    );
    if (
      chain.actor !== undefined ||
      chain.holder.organizationId !== organizationId ||
      chain.holder.contextBaseId !== base.id ||
      (content !== undefined && record(chain.holder.item).content !== content)
    )
      throw new ForbiddenException('Context workflow access denied');
    const leaf = await tx.workflowExecution.findFirst({
      where: { id: provenance.executionId, organizationId, isDeleted: false },
      select: { result: true },
    });
    const parentId = record(record(leaf?.result).metadata).parentExecutionId;
    if (typeof parentId !== 'string')
      throw new ForbiddenException('Context workflow access denied');
    const parent = await tx.workflowExecution.findFirst({
      where: { id: parentId, organizationId, isDeleted: false },
      select: { result: true },
    });
    const metadata = record(record(parent?.result).metadata);
    const inputs = record(record(parent?.result).inputValues);
    if (
      typeof metadata.parentExecutionId !== 'string' ||
      typeof metadata.workflowForEachIndex !== 'number' ||
      !Number.isInteger(metadata.workflowForEachIndex) ||
      metadata.workflowForEachIndex < 0
    )
      throw new ForbiddenException('Context workflow access denied');
    const discovered = await tx.workflowExecutionNodeResult.findFirst({
      where: {
        organizationId,
        executionId: metadata.parentExecutionId,
        nodeId: 'discover',
      },
      select: { output: true },
    });
    const items = record(discovered?.output).items;
    const brandId = typeof inputs.item === 'string' ? inputs.item : undefined;
    if (
      !Array.isArray(items) ||
      !brandId ||
      items[metadata.workflowForEachIndex] !== brandId ||
      base.sourceBrandId !== brandId
    )
      throw new ForbiddenException('Context workflow access denied');
    const brand = await tx.brand.findFirst({
      where: { id: brandId, organizationId, isDeleted: false },
      select: { id: true },
    });
    const organization = await tx.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!brand || !organization)
      throw new ForbiddenException('Context workflow access denied');
  }

  principalData(principal: ContextEmbeddingAdmissionPrincipal) {
    if (principal.origin === 'ACTOR') {
      const actor = principal.actor;
      return {
        origin: ContextEmbeddingOrigin.ACTOR,
        actorUserId: actor.userId,
        actorIsApiKey: actor.isApiKey,
        actorApiKeyId: actor.isApiKey ? actor.apiKeyId : undefined,
        actorScopes: [...new Set(actor.scopes)].sort(),
      };
    }
    if (principal.origin === 'DERIVED_MEMORY')
      return {
        origin: ContextEmbeddingOrigin.DERIVED_MEMORY,
        sourceMemoryId: principal.sourceMemoryId,
      };
    const provenance = principal.provenance;
    if (!provenance.workflowVersionId)
      throw new ForbiddenException('Context workflow access denied');
    return {
      origin: ContextEmbeddingOrigin.CODE_OWNED_WORKFLOW,
      workflowProvenance: toPrismaJson({
        executionId: provenance.executionId,
        workflowId: provenance.workflowId,
        workflowVersionId: provenance.workflowVersionId,
        userId: provenance.userId,
        nodeId: provenance.nodeId,
        actionId: provenance.actionId,
      }),
    };
  }
}
