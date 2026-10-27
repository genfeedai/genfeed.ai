import { createHash } from 'node:crypto';
import { toWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { assertKnowledgeGovernance } from '@api/collections/contexts/utils/knowledge-actor.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { hasOrganizationBilling } from '@genfeedai/config';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import type {
  AgentMemoryRevisionKind,
  ICorrectAgentMemoryInput,
} from '@genfeedai/contracts/interfaces';
import {
  type AgentMemory,
  type AgentMemoryRevision,
  Prisma,
} from '@genfeedai/prisma';
import { stableStringify } from '@libs/utils/canonical-hash.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export const AGENT_MEMORY_REVISION_PAGE_DEFAULT = 20;
export const AGENT_MEMORY_REVISION_PAGE_MAX = 50;

export interface AgentMemoryRevisionView {
  actorUserId: string | null;
  confidence: number | null;
  content: string;
  createdAt: Date;
  id: string;
  importance: number | null;
  isCurrent: boolean;
  kind: AgentMemoryRevisionKind;
  memoryId: string;
  provenance: Record<string, unknown>;
  reason: string | null;
  revision: number;
  summary: string | null;
  tags: string[];
}

export interface AgentMemoryRevisionPage {
  items: AgentMemoryRevisionView[];
  nextCursor: string | null;
}

export interface AgentMemoryCorrectionResult {
  isReplay: boolean;
  memory: AgentMemoryDocument;
  revision: AgentMemoryRevisionView;
}

const SUMMARY_LENGTH = 220;

function summarize(content: string): string {
  const flat = content.trim().replace(/\s+/g, ' ');
  return flat.length <= SUMMARY_LENGTH
    ? flat
    : `${flat.slice(0, SUMMARY_LENGTH - 3)}...`;
}

/**
 * Corrections to an agent memory. A correction never edits what was stored: it
 * appends an immutable revision, moves the memory's current pointer to it, and
 * replaces the context entries derived from the memory, all in one transaction.
 */
@Injectable()
export class AgentMemoryRevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingWriter: ContextEmbeddingWriteService,
  ) {}

  async correct(
    actor: KnowledgeActor,
    memoryId: string,
    input: ICorrectAgentMemoryInput,
  ): Promise<AgentMemoryCorrectionResult> {
    const workflowActor = toWorkflowActor(actor);
    const organizationId = actor.organizationId;
    const correction = this.normalize(input);
    const requestHash = this.hashRequest(actor.userId, memoryId, correction);
    const modelIdentifier = await this.embeddingWriter.selectModel();

    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "agent_memories" WHERE "id" = ${memoryId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
      const memory = await tx.agentMemory.findFirst({
        include: { currentRevision: true },
        where: { id: memoryId, isDeleted: false, organizationId },
      });
      if (!memory) {
        throw new NotFoundException('Memory entry', memoryId);
      }
      await this.assertCanCorrect(tx, memory, actor);
      await this.embeddingWriter.assertActor(
        tx,
        workflowActor,
        organizationId,
        memory.brandId ?? undefined,
      );

      const replayed = await tx.agentMemoryRevision.findFirst({
        where: {
          isDeleted: false,
          memoryId,
          organizationId,
          requestId: correction.requestId,
        },
      });
      if (replayed) {
        if (replayed.requestHash !== requestHash) {
          throw new ConflictException(
            'This requestId was already used for a different correction.',
          );
        }
        return { isReplay: true, jobs: [], memory, revision: replayed };
      }

      if (
        !memory.currentRevision ||
        memory.currentRevision.id !== correction.expectedRevisionId
      ) {
        throw new ConflictException(
          'This memory was changed since you read it. Reload it and try again.',
        );
      }
      const latest = await tx.agentMemoryRevision.aggregate({
        _max: { revision: true },
        where: { isDeleted: false, memoryId, organizationId },
      });

      const current = memory.currentRevision;
      const summary = correction.summary ?? summarize(correction.content);
      const tags = correction.tags ?? current.tags;
      const importance = correction.importance ?? current.importance;
      const revision = await tx.agentMemoryRevision.create({
        data: {
          actorUserId: actor.userId,
          confidence: current.confidence,
          content: correction.content,
          importance,
          kind: 'correction',
          memoryId,
          organizationId,
          originalCreatedAt: current.originalCreatedAt,
          originalOwnerUserId: current.originalOwnerUserId,
          provenance: current.provenance as Prisma.InputJsonValue,
          reason: correction.reason,
          requestHash,
          requestId: correction.requestId,
          revision: (latest._max.revision ?? current.revision) + 1,
          summary,
          tags,
        },
      });
      const updated = await tx.agentMemory.update({
        data: {
          content: correction.content,
          currentRevisionId: revision.id,
          importance,
          summary,
          tags,
        },
        where: scopedWhere(organizationId, { id: memoryId }),
      });
      const jobs = await this.embeddingWriter.replaceMemoryDerivatives(tx, {
        actor: workflowActor,
        content: correction.content,
        memoryId,
        modelIdentifier,
        organizationId,
        relevanceWeight: correction.importance,
        tags: correction.tags,
      });
      return { isReplay: false, jobs, memory: updated, revision };
    });

    await this.embeddingWriter.enqueueJobs(saved.jobs);
    return {
      isReplay: saved.isReplay,
      memory: saved.memory as AgentMemoryDocument,
      revision: this.toView(saved.revision, saved.memory.currentRevisionId),
    };
  }

  async list(
    actor: KnowledgeActor,
    memoryId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<AgentMemoryRevisionPage> {
    const memory = await this.readableMemory(actor, memoryId);
    const limit = Math.min(
      Math.max(
        Math.trunc(options.limit ?? AGENT_MEMORY_REVISION_PAGE_DEFAULT),
        1,
      ),
      AGENT_MEMORY_REVISION_PAGE_MAX,
    );
    const before = this.decodeCursor(options.cursor);
    const rows = await this.prisma.agentMemoryRevision.findMany({
      orderBy: { revision: 'desc' },
      take: limit + 1,
      where: scopedWhere(actor.organizationId, {
        memoryId,
        ...(before === undefined ? {} : { revision: { lt: before } }),
      }),
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.toView(row, memory.currentRevisionId)),
      nextCursor:
        rows.length > limit && page.length > 0
          ? this.encodeCursor(page[page.length - 1].revision)
          : null,
    };
  }

  async get(
    actor: KnowledgeActor,
    memoryId: string,
    revisionId: string,
  ): Promise<AgentMemoryRevisionView> {
    const memory = await this.readableMemory(actor, memoryId);
    const row = await this.prisma.agentMemoryRevision.findFirst({
      where: {
        id: revisionId,
        isDeleted: false,
        memoryId,
        organizationId: actor.organizationId,
      },
    });
    if (!row) {
      throw new NotFoundException('Memory revision', revisionId);
    }
    return this.toView(row, memory.currentRevisionId);
  }

  /** The live memory a caller may read history for, or a 404 that says nothing about it. */
  private async readableMemory(
    actor: KnowledgeActor,
    memoryId: string,
  ): Promise<AgentMemory> {
    const memory = await this.prisma.agentMemory.findFirst({
      where: {
        id: memoryId,
        isDeleted: false,
        organizationId: actor.organizationId,
      },
    });
    if (!memory) {
      throw new NotFoundException('Memory entry', memoryId);
    }
    if (memory.scope === KnowledgeMemoryScope.PERSONAL) {
      if (memory.userId !== actor.userId) {
        throw new NotFoundException('Memory entry', memoryId);
      }
      return memory;
    }
    if (
      memory.scope === KnowledgeMemoryScope.ORG &&
      !hasOrganizationBilling()
    ) {
      throw new ForbiddenException(
        'Organization-wide memory requires organization billing.',
      );
    }
    if (memory.brandId) {
      const brand = await this.prisma.brand.findFirst({
        select: { id: true },
        where: {
          id: memory.brandId,
          isDeleted: false,
          organizationId: actor.organizationId,
        },
      });
      if (!brand) {
        throw new NotFoundException('Memory entry', memoryId);
      }
    }
    return memory;
  }

  private async assertCanCorrect(
    tx: Prisma.TransactionClient,
    memory: AgentMemory,
    actor: KnowledgeActor,
  ): Promise<void> {
    if (memory.scope === KnowledgeMemoryScope.PERSONAL) {
      // A personal memory belongs to its author alone, organization admins included.
      if (memory.userId !== actor.userId) {
        throw new NotFoundException('Memory entry', memory.id);
      }
      return;
    }
    if (
      memory.scope === KnowledgeMemoryScope.ORG &&
      !hasOrganizationBilling()
    ) {
      throw new ForbiddenException(
        'Organization-wide memory requires organization billing.',
      );
    }
    if (memory.brandId) {
      const brand = await tx.brand.findFirst({
        select: { id: true },
        where: {
          id: memory.brandId,
          isDeleted: false,
          organizationId: memory.organizationId,
        },
      });
      if (!brand) {
        throw new NotFoundException('Memory entry', memory.id);
      }
    }
    await assertKnowledgeGovernance(this.prisma, actor);
  }

  /** The correction in the one form that is stored and hashed. */
  private normalize(input: ICorrectAgentMemoryInput): ICorrectAgentMemoryInput {
    if (!input.content.trim() || !input.reason.trim()) {
      throw new BadRequestException(
        'A correction needs new text and a reason.',
      );
    }
    return {
      content: input.content.trim(),
      expectedRevisionId: input.expectedRevisionId,
      ...(input.importance === undefined
        ? {}
        : { importance: input.importance }),
      reason: input.reason.trim(),
      requestId: input.requestId,
      ...(input.summary === undefined ? {} : { summary: input.summary.trim() }),
      ...(input.tags === undefined
        ? {}
        : {
            tags: [
              ...new Set(
                input.tags.map((tag) => tag.trim()).filter((tag) => tag),
              ),
            ],
          }),
    };
  }

  private hashRequest(
    userId: string,
    memoryId: string,
    correction: ICorrectAgentMemoryInput,
  ): string {
    return createHash('sha256')
      .update(stableStringify({ correction, memoryId, userId }))
      .digest('hex');
  }

  private toView(
    row: AgentMemoryRevision,
    currentRevisionId: string | null,
  ): AgentMemoryRevisionView {
    const provenance =
      row.provenance && typeof row.provenance === 'object'
        ? (row.provenance as Record<string, unknown>)
        : {};
    return {
      actorUserId: row.actorUserId,
      confidence: row.confidence,
      content: row.content,
      createdAt: row.createdAt,
      id: row.id,
      importance: row.importance,
      isCurrent: row.id === currentRevisionId,
      kind: row.kind as AgentMemoryRevisionKind,
      memoryId: row.memoryId,
      provenance: {
        originalCreatedAt: row.originalCreatedAt?.toISOString() ?? null,
        sourceContentId: provenance.sourceContentId ?? null,
        sourceMessageId: provenance.sourceMessageId ?? null,
        sourceType: provenance.sourceType ?? null,
        sourceUrl: provenance.sourceUrl ?? null,
      },
      reason: row.reason,
      revision: row.revision,
      summary: row.summary,
      tags: row.tags,
    };
  }

  private encodeCursor(revision: number): string {
    return Buffer.from(JSON.stringify({ revision }), 'utf8').toString(
      'base64url',
    );
  }

  private decodeCursor(cursor?: string): number | undefined {
    if (!cursor) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      );
      if (
        parsed &&
        typeof parsed === 'object' &&
        'revision' in parsed &&
        typeof parsed.revision === 'number' &&
        Number.isInteger(parsed.revision) &&
        parsed.revision >= 1
      ) {
        return parsed.revision;
      }
    } catch {
      // Falls through to the shared refusal below.
    }
    throw new BadRequestException('The revision cursor is not valid.');
  }
}
