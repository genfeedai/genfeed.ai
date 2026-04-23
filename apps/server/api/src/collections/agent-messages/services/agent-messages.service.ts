import type { AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AgentMessageRole } from '@genfeedai/enums';
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

@Injectable()
export class AgentMessagesService extends BaseService<AgentMessageDocument> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'agentMessage', logger);
  }

  async addMessage(dto: AddMessageDto): Promise<AgentMessageDocument> {
    return this.create({
      ...dto,
      isDeleted: false,
    } as unknown as Partial<AgentMessageDocument>);
  }

  async getMessagesByRoom(
    roomId: string,
    organizationId: string,
    options: { limit?: number; page?: number } = {},
  ): Promise<AgentMessageDocument[]> {
    const { limit = 50, page = 1 } = options;
    const skip = (page - 1) * limit;

    return this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
        roomId,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }) as Promise<AgentMessageDocument[]>;
  }

  async getRecentMessages(
    roomId: string,
    limit = 20,
  ): Promise<AgentMessageDocument[]> {
    const messages = await this.delegate.findMany({
      where: {
        isDeleted: false,
        roomId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
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
    // Sort descending to get the LATEST N, then reverse to chronological
    const messages = await this.delegate.findMany({
      where: {
        id: { gt: afterMessageId },
        isDeleted: false,
        roomId,
      },
      orderBy: { id: 'desc' },
      take: limit,
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
        roomId,
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
        roomId,
      },
    });
  }

  /**
   * Get ALL non-deleted messages in a thread, in chronological order.
   * Used by compaction to process the full backlog when no prior state exists.
   */
  async getAllMessages(roomId: string): Promise<AgentMessageDocument[]> {
    return this.delegate.findMany({
      where: {
        isDeleted: false,
        roomId,
      },
      orderBy: { id: 'asc' },
    }) as Promise<AgentMessageDocument[]>;
  }

  /**
   * Get ALL non-deleted messages after a boundary, in chronological order.
   * Used by compaction to process uncompacted messages without a fixed cap.
   */
  async getAllMessagesAfter(
    roomId: string,
    afterMessageId: string,
  ): Promise<AgentMessageDocument[]> {
    return this.delegate.findMany({
      where: {
        id: { gt: afterMessageId },
        isDeleted: false,
        roomId,
      },
      orderBy: { id: 'asc' },
    }) as Promise<AgentMessageDocument[]>;
  }

  async copyMessages(
    sourceRoomId: string,
    targetRoomId: string,
    organizationId: string,
  ): Promise<void> {
    const docs = await this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
        roomId: sourceRoomId,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!docs || docs.length === 0) {
      return;
    }

    await Promise.all(
      docs.map((doc: Record<string, unknown>) =>
        this.delegate.create({
          data: {
            brandId: doc.brandId,
            content: doc.content,
            isDeleted: doc.isDeleted,
            metadata: doc.metadata,
            organizationId: doc.organizationId,
            role: doc.role,
            roomId: targetRoomId,
            toolCallId: doc.toolCallId,
            toolCalls: doc.toolCalls,
            userId: doc.userId,
          },
        }),
      ),
    );
  }
}
