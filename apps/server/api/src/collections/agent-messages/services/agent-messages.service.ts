import type { AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AgentMessageRole } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface AddMessageDto {
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
}

type AgentMessagePageOptions = {
  cursor?: string;
  limit?: number;
  page?: number;
};

const DEFAULT_AGENT_MESSAGE_LIMIT = 50;
const MAX_AGENT_MESSAGE_LIMIT = 100;
const DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT = 500;

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
  ) {
    super(prisma, 'agentMessage', logger);
  }

  async addMessage(dto: AddMessageDto): Promise<AgentMessageDocument> {
    const { room, ...rest } = dto;
    return this.create({
      ...rest,
      threadId: room,
      isDeleted: false,
    } as unknown as Partial<AgentMessageDocument>);
  }

  async getMessagesByRoom(
    roomId: string,
    organizationId: string,
    options: AgentMessagePageOptions = {},
  ): Promise<AgentMessageDocument[]> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_AGENT_MESSAGE_LIMIT,
      MAX_AGENT_MESSAGE_LIMIT,
    );
    const page = Math.max(1, options.page ?? 1);
    const cursorDate = this.parseCursorDate(options.cursor);
    const skip = cursorDate ? undefined : (page - 1) * limit;

    return this.delegate.findMany({
      where: {
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        isDeleted: false,
        organizationId,
        threadId: roomId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }) as Promise<AgentMessageDocument[]>;
  }

  async getRecentMessages(
    roomId: string,
    limit = 20,
  ): Promise<AgentMessageDocument[]> {
    const safeLimit = this.normalizeLimit(limit, 20, MAX_AGENT_MESSAGE_LIMIT);
    const messages = await this.delegate.findMany({
      where: {
        isDeleted: false,
        threadId: roomId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
      const docs = (await this.delegate.findMany({
        ...(cursor ? { cursor, skip: 1 } : {}),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: DEFAULT_AGENT_MESSAGE_BACKLOG_LIMIT,
        where: {
          isDeleted: false,
          organizationId,
          threadId: sourceRoomId,
        },
      })) as Array<Record<string, unknown> & { id: string }>;

      if (docs.length === 0) {
        return;
      }

      await Promise.all(
        docs.map((doc) =>
          this.delegate.create({
            data: {
              brandId: doc.brandId,
              content: doc.content,
              isDeleted: doc.isDeleted,
              metadata: doc.metadata,
              organizationId: doc.organizationId,
              role: doc.role,
              threadId: targetRoomId,
              toolCallId: doc.toolCallId,
              toolCalls: doc.toolCalls,
              userId: doc.userId,
            },
          }),
        ),
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

  private parseCursorDate(cursor: string | undefined): Date | undefined {
    if (!cursor) return undefined;

    const parsed = new Date(cursor);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
