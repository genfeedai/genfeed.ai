import type { AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
import {
  buildAgentMessageCursorWhere,
  decodeAgentMessageCursor,
  encodeAgentMessageCursor,
} from '@api/collections/agent-messages/utils/agent-message-cursor.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  AgentArtifactReferenceService,
  type AgentArtifactReferenceTelemetryContext,
  scopedWhere,
} from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { authorizeAgentArtifactWrite } from '@api/shared/utils/agent-artifact-reference-write.util';
import type { AgentMessageRole } from '@genfeedai/enums';
import type {
  AgentArtifactReference,
  ResolvedAgentArtifactReference,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface AddMessageDto {
  /** Stable server identity for idempotent queue redelivery. */
  id?: string;
  room: string;
  organizationId: string;
  userId: string;
  brandId?: string;
  role: AgentMessageRole;
  content?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    toolName: string;
    parameters?: Record<string, unknown>;
    result?: Record<string, unknown>;
    status?: string;
    creditsUsed?: number;
    durationMs?: number;
    error?: string;
  }>;
  metadata?: Record<string, unknown>;
  artifactReferences?: AgentArtifactReference[];
  artifactVersionPinIds?: string[];
}

type AgentMessagePageOptions = {
  cursor?: string;
  limit?: number;
  page?: number;
};

/**
 * Keyset-paginated window over a thread's messages, newest-first. `hasMore`
 * / `nextCursor` tell the caller whether an older page exists and how to
 * fetch it; `nextCursor` is `null` once the thread is exhausted.
 */
export interface AgentMessagePage {
  docs: AgentMessageDocument[];
  hasMore: boolean;
  nextCursor: string | null;
}

const DEFAULT_AGENT_MESSAGE_LIMIT = 50;
const MAX_AGENT_MESSAGE_LIMIT = 100;
const DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT = 500;

function dedupeArtifactReferences(
  references: AgentArtifactReference[],
): AgentArtifactReference[] {
  const unique = new Map<string, AgentArtifactReference>();
  for (const reference of references) {
    unique.set(`${reference.kind}:${reference.recordId}`, reference);
  }
  return [...unique.values()];
}

@Injectable()
export class AgentMessagesService extends BaseService<
  AgentMessageDocument,
  Partial<AgentMessageDocument>,
  Partial<AgentMessageDocument>,
  Prisma.AgentMessageWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
  ) {
    super(prisma, 'agentMessage', logger);
  }

  async addMessage(dto: AddMessageDto): Promise<AgentMessageDocument> {
    const { room, ...rest } = dto;
    const artifactWrite = await authorizeAgentArtifactWrite({
      authorizer: this.agentArtifactReferenceService,
      inputs: [dto],
      readContext: {
        ...(dto.brandId ? { brandId: dto.brandId } : {}),
        organizationId: dto.organizationId,
      },
    });
    const metadataReferences =
      await this.agentArtifactReferenceService.resolveReferencesFromMetadata(
        dto.metadata,
        {
          ...(dto.brandId ? { brandId: dto.brandId } : {}),
          organizationId: dto.organizationId,
        },
      );

    const messageData = {
      ...rest,
      ...artifactWrite,
      artifactReferences: dedupeArtifactReferences([
        ...artifactWrite.artifactReferences,
        ...metadataReferences,
      ]),
      threadId: room,
      isDeleted: false,
      isLegacyArtifactReferenceEligible: false,
    } as unknown as Partial<AgentMessageDocument>;

    if (dto.id) {
      return (await this.prisma.agentMessage.upsert({
        create: messageData as Prisma.AgentMessageUncheckedCreateInput,
        update: {},
        where: {
          id: dto.id,
          isDeleted: false,
          organizationId: dto.organizationId,
        },
      })) as AgentMessageDocument;
    }

    return this.create(messageData);
  }

  async resolveMessageArtifactReferences(
    threadId: string,
    messageId: string,
    organizationId: string,
    telemetry?: AgentArtifactReferenceTelemetryContext,
  ): Promise<ResolvedAgentArtifactReference[]> {
    const message = await this.delegate.findFirst({
      select: { brandId: true, id: true },
      where: scopedWhere(organizationId, { id: messageId, threadId }),
    });
    if (!message) {
      throw new NotFoundException({ message: 'Agent message not found' });
    }

    return this.agentArtifactReferenceService.resolveMessageReferences({
      messageId,
      readContext: {
        ...(message.brandId ? { brandId: message.brandId } : {}),
        organizationId,
      },
      telemetry,
    });
  }

  /**
   * Messages for a thread, newest-first, bounded array (no pagination
   * metadata). Used by internal callers (task planning, orchestrator,
   * runtime controller) that only ever page by `page`/`limit` and consume a
   * plain array. Kept return-shape stable for those callers; use
   * `getMessagesPage` for a UI-facing paginated read.
   */
  async getMessagesByRoom(
    roomId: string,
    organizationId: string,
    options: AgentMessagePageOptions = {},
  ): Promise<AgentMessageDocument[]> {
    const { rows } = await this.queryMessagesByRoom(
      roomId,
      organizationId,
      options,
      false,
    );
    return rows;
  }

  /**
   * Keyset-paginated window over a thread's messages, newest-first, walking
   * backward (older) as the cursor advances. Stable under concurrent
   * inserts: the composite `(createdAt, id)` cursor (see
   * `agent-message-cursor.util.ts`) never drops or duplicates rows that
   * share a `createdAt` millisecond, unlike a `createdAt`-only comparison.
   *
   * Fetches `limit + 1` rows to detect `hasMore` without a separate COUNT
   * query, then slices back to `limit`.
   */
  async getMessagesPage(
    roomId: string,
    organizationId: string,
    options: AgentMessagePageOptions = {},
  ): Promise<AgentMessagePage> {
    const { rows, limit } = await this.queryMessagesByRoom(
      roomId,
      organizationId,
      options,
      true,
    );

    const hasMore = rows.length > limit;
    const docs = hasMore ? rows.slice(0, limit) : rows;
    const boundary = docs[docs.length - 1];
    const nextCursor =
      hasMore && boundary
        ? encodeAgentMessageCursor({
            createdAt: boundary.createdAt.toISOString(),
            id: boundary.id,
          })
        : null;

    return { docs, hasMore, nextCursor };
  }

  /**
   * Shared keyset/offset query behind `getMessagesByRoom` and
   * `getMessagesPage`. When `fetchExtra` is true, requests one row past
   * `limit` so the caller can detect `hasMore` without a COUNT query.
   */
  private async queryMessagesByRoom(
    roomId: string,
    organizationId: string,
    options: AgentMessagePageOptions,
    fetchExtra: boolean,
  ): Promise<{ rows: AgentMessageDocument[]; limit: number }> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_AGENT_MESSAGE_LIMIT,
      MAX_AGENT_MESSAGE_LIMIT,
    );
    const cursorPosition = decodeAgentMessageCursor(options.cursor);
    const page = Math.max(1, options.page ?? 1);
    const skip = cursorPosition ? undefined : (page - 1) * limit;

    const rows = (await this.delegate.findMany({
      where: scopedWhere(organizationId, {
        ...buildAgentMessageCursorWhere(cursorPosition),
        threadId: roomId,
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: fetchExtra ? limit + 1 : limit,
    })) as AgentMessageDocument[];

    return { limit, rows };
  }

  async getRecentMessages(
    roomId: string,
    limit = 20,
    organizationId?: string,
  ): Promise<AgentMessageDocument[]> {
    const safeLimit = this.normalizeLimit(limit, 20, MAX_AGENT_MESSAGE_LIMIT);
    // Prefer org-scoped reads so Postgres can use the composite
    // (organizationId, threadId, isDeleted, createdAt, id) cursor index
    // instead of a threadId-only filter that may sequential-scan.
    const messages = await this.delegate.findMany({
      where: organizationId
        ? scopedWhere(organizationId, { threadId: roomId })
        : {
            isDeleted: false,
            threadId: roomId,
          },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Chat context only needs content + role + ids — skip oversized JSON
      // payloads (toolCalls / artifactReferences) on the hot LLM window path.
      select: {
        brandId: true,
        content: true,
        createdAt: true,
        id: true,
        metadata: true,
        organizationId: true,
        role: true,
        threadId: true,
        userId: true,
      },
      take: safeLimit,
    });

    // Reverse to chronological order for LLM context
    return (messages as AgentMessageDocument[]).reverse();
  }

  /**
   * Get the latest N messages after a compaction boundary for the sliding window.
   * Uses createdAt as a cursor boundary.
   * Returns messages in chronological order (oldest first).
   * TODO: For strictly monotonic cursor behavior, consider using a sequence field.
   */
  async getMessagesAfter(
    roomId: string,
    afterMessageId: string,
    limit = 5,
  ): Promise<AgentMessageDocument[]> {
    const safeLimit = this.normalizeLimit(limit, 5, MAX_AGENT_MESSAGE_LIMIT);
    // Sort descending to get the LATEST N, then reverse to chronological
    const messages = await this.delegate.findMany({
      where: {
        id: { gt: afterMessageId },
        isDeleted: false,
        threadId: roomId,
      },
      orderBy: { id: 'desc' },
      take: safeLimit,
    });

    return (messages as AgentMessageDocument[]).reverse();
  }

  /**
   * Count all non-deleted messages in a thread.
   */
  async countMessages(roomId: string): Promise<number> {
    return this.delegate.count({
      where: {
        isDeleted: false,
        threadId: roomId,
      },
    });
  }

  /**
   * Count messages after a compaction boundary.
   */
  async countMessagesAfter(
    roomId: string,
    afterMessageId: string,
  ): Promise<number> {
    return this.delegate.count({
      where: {
        id: { gt: afterMessageId },
        isDeleted: false,
        threadId: roomId,
      },
    });
  }

  /**
   * Get a bounded page of non-deleted messages in a thread, in chronological
   * order. Used by compaction; callers must pass a cursor or repeat if they
   * need to process more than DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT messages.
   */
  async getAllMessages(
    roomId: string,
    options: Pick<AgentMessagePageOptions, 'limit'> = {},
  ): Promise<AgentMessageDocument[]> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT,
      DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT,
    );

    return this.delegate.findMany({
      where: {
        isDeleted: false,
        threadId: roomId,
      },
      orderBy: { id: 'asc' },
      take: limit,
    }) as Promise<AgentMessageDocument[]>;
  }

  /**
   * Get a bounded page of non-deleted messages after a boundary, in
   * chronological order.
   */
  async getAllMessagesAfter(
    roomId: string,
    afterMessageId: string,
    options: Pick<AgentMessagePageOptions, 'limit'> = {},
  ): Promise<AgentMessageDocument[]> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT,
      DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT,
    );

    return this.delegate.findMany({
      where: {
        id: { gt: afterMessageId },
        isDeleted: false,
        threadId: roomId,
      },
      orderBy: { id: 'asc' },
      take: limit,
    }) as Promise<AgentMessageDocument[]>;
  }

  async copyMessages(
    sourceRoomId: string,
    targetRoomId: string,
    organizationId: string,
  ): Promise<void> {
    let cursor: { id: string } | undefined;

    while (true) {
      const docs = await this.delegate.findMany({
        ...(cursor ? { cursor, skip: 1 } : {}),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT,
        where: scopedWhere(organizationId, { threadId: sourceRoomId }),
      });

      if (docs.length === 0) {
        return;
      }

      await Promise.all(
        docs.map(async (doc) => {
          const persisted = doc as AgentMessageDocument & {
            artifactReferences?: Prisma.JsonValue;
            artifactVersionPinIds?: string[];
          };
          const readContext = {
            ...(doc.brandId ? { brandId: doc.brandId } : {}),
            organizationId: doc.organizationId,
          };
          const [artifactWrite, metadataReferences] = await Promise.all([
            authorizeAgentArtifactWrite({
              authorizer: this.agentArtifactReferenceService,
              inputs: [
                {
                  artifactReferences: persisted.artifactReferences ?? [],
                  artifactVersionPinIds: persisted.artifactVersionPinIds ?? [],
                },
              ],
              readContext,
            }),
            this.agentArtifactReferenceService.resolveReferencesFromMetadata(
              doc.metadata,
              readContext,
            ),
          ]);

          return this.delegate.create({
            data: {
              artifactReferences: dedupeArtifactReferences([
                ...artifactWrite.artifactReferences,
                ...metadataReferences,
              ]),
              artifactVersionPinIds: artifactWrite.artifactVersionPinIds,
              brandId: doc.brandId,
              content: doc.content,
              isDeleted: doc.isDeleted,
              isLegacyArtifactReferenceEligible: false,
              metadata: doc.metadata,
              organizationId: doc.organizationId,
              role: doc.role,
              threadId: targetRoomId,
              toolCalls: doc.toolCalls,
              userId: doc.userId,
            },
          });
        }),
      );

      if (docs.length < DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT) {
        return;
      }

      cursor = { id: docs[docs.length - 1].id };
    }
  }

  private normalizeLimit(
    value: number | undefined,
    defaultLimit: number,
    maxLimit: number,
  ): number {
    if (!Number.isFinite(value) || value == null || value <= 0) {
      return defaultLimit;
    }

    return Math.min(Math.floor(value), maxLimit);
  }
}
