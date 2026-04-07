import {
  AgentMessageDoc,
  type AgentMessageDocument,
} from '@api/collections/agent-messages/schemas/agent-message.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { AgentMessageRole } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export interface AddMessageDto {
  room: string | Types.ObjectId;
  organization: string | Types.ObjectId;
  user: string | Types.ObjectId;
  brand?: string | Types.ObjectId;
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

type AgentMessageInsert = Omit<AddMessageDto, 'room'> & {
  createdAt?: Date;
  isDeleted: boolean;
  organization: Types.ObjectId;
  room: Types.ObjectId;
  updatedAt?: Date;
  user: Types.ObjectId;
};

@Injectable()
export class AgentMessagesService extends BaseService<AgentMessageDocument> {
  constructor(
    @InjectModel(AgentMessageDoc.name, DB_CONNECTIONS.AGENT)
    protected readonly model: AggregatePaginateModel<AgentMessageDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  async addMessage(dto: AddMessageDto): Promise<AgentMessageDocument> {
    return this.create({
      ...dto,
      ...(dto.brand ? { brand: this.toObjectId(dto.brand, 'brand') } : {}),
      organization: this.toObjectId(dto.organization, 'organization'),
      room: this.toObjectId(dto.room, 'room'),
      user: this.toObjectId(dto.user, 'user'),
    } as unknown as Partial<AgentMessageDocument>);
  }

  async getMessagesByRoom(
    roomId: string,
    organizationId: string,
    options: { limit?: number; page?: number } = {},
  ): Promise<AgentMessageDocument[]> {
    const { limit = 50, page = 1 } = options;
    const skip = (page - 1) * limit;

    return (
      this.model as unknown as {
        find: (filter: Record<string, unknown>) => {
          sort: (sort: Record<string, number>) => {
            skip: (skip: number) => {
              limit: (limit: number) => {
                lean: () => Promise<AgentMessageDocument[]>;
              };
            };
          };
        };
      }
    )
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        room: new Types.ObjectId(roomId),
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as Promise<AgentMessageDocument[]>;
  }

  async getRecentMessages(
    roomId: string,
    limit = 20,
  ): Promise<AgentMessageDocument[]> {
    const messages = await (
      this.model as unknown as {
        find: (filter: Record<string, unknown>) => {
          sort: (sort: Record<string, number>) => {
            limit: (limit: number) => {
              lean: () => Promise<AgentMessageDocument[]>;
            };
          };
        };
      }
    )
      .find({
        isDeleted: false,
        room: new Types.ObjectId(roomId),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Reverse to chronological order for LLM context
    return (messages as AgentMessageDocument[]).reverse();
  }

  /**
   * Get the latest N messages after a compaction boundary for the sliding window.
   * Uses _id as a monotonic cursor — same boundary as ThreadContextState.
   * Returns messages in chronological order (oldest first).
   */
  async getMessagesAfter(
    roomId: string,
    afterMessageId: Types.ObjectId,
    limit = 5,
  ): Promise<AgentMessageDocument[]> {
    // Sort descending to get the LATEST N, then reverse to chronological
    const messages = await (
      this.model as unknown as {
        find: (filter: Record<string, unknown>) => {
          sort: (sort: Record<string, number>) => {
            limit: (limit: number) => {
              lean: () => Promise<AgentMessageDocument[]>;
            };
          };
        };
      }
    )
      .find({
        _id: { $gt: afterMessageId },
        isDeleted: false,
        room: new Types.ObjectId(roomId),
      })
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    return (messages as AgentMessageDocument[]).reverse();
  }

  /**
   * Count all non-deleted messages in a thread.
   */
  async countMessages(roomId: string): Promise<number> {
    return (
      this.model as unknown as {
        countDocuments: (filter: Record<string, unknown>) => Promise<number>;
      }
    ).countDocuments({
      isDeleted: false,
      room: new Types.ObjectId(roomId),
    });
  }

  /**
   * Count messages after a compaction boundary.
   */
  async countMessagesAfter(
    roomId: string,
    afterMessageId: Types.ObjectId,
  ): Promise<number> {
    return (
      this.model as unknown as {
        countDocuments: (filter: Record<string, unknown>) => Promise<number>;
      }
    ).countDocuments({
      _id: { $gt: afterMessageId },
      isDeleted: false,
      room: new Types.ObjectId(roomId),
    });
  }

  /**
   * Get ALL non-deleted messages in a thread, in chronological order.
   * Used by compaction to process the full backlog when no prior state exists.
   */
  async getAllMessages(roomId: string): Promise<AgentMessageDocument[]> {
    return (
      this.model as unknown as {
        find: (filter: Record<string, unknown>) => {
          sort: (sort: Record<string, number>) => {
            lean: () => Promise<AgentMessageDocument[]>;
          };
        };
      }
    )
      .find({
        isDeleted: false,
        room: new Types.ObjectId(roomId),
      })
      .sort({ _id: 1 })
      .lean() as Promise<AgentMessageDocument[]>;
  }

  /**
   * Get ALL non-deleted messages after a boundary, in chronological order.
   * Used by compaction to process uncompacted messages without a fixed cap.
   */
  async getAllMessagesAfter(
    roomId: string,
    afterMessageId: Types.ObjectId,
  ): Promise<AgentMessageDocument[]> {
    return (
      this.model as unknown as {
        find: (filter: Record<string, unknown>) => {
          sort: (sort: Record<string, number>) => {
            lean: () => Promise<AgentMessageDocument[]>;
          };
        };
      }
    )
      .find({
        _id: { $gt: afterMessageId },
        isDeleted: false,
        room: new Types.ObjectId(roomId),
      })
      .sort({ _id: 1 })
      .lean() as Promise<AgentMessageDocument[]>;
  }

  async copyMessages(
    sourceRoomId: string,
    targetRoomId: string,
    organizationId: string,
  ): Promise<void> {
    const docs = await (
      this.model as unknown as {
        find: (filter: Record<string, unknown>) => {
          sort: (sort: Record<string, number>) => {
            lean: () => Promise<AgentMessageDocument[]>;
          };
        };
      }
    )
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        room: new Types.ObjectId(sourceRoomId),
      })
      .sort({ createdAt: 1 })
      .lean();

    if (!docs || docs.length === 0) {
      return;
    }

    const clones: AgentMessageInsert[] = docs.map((doc) => ({
      brand: doc.brand,
      content: doc.content,
      createdAt:
        'createdAt' in doc && doc.createdAt instanceof Date
          ? doc.createdAt
          : undefined,
      isDeleted: doc.isDeleted,
      metadata: doc.metadata,
      organization: doc.organization,
      role: doc.role,
      room: new Types.ObjectId(targetRoomId),
      toolCallId: doc.toolCallId,
      toolCalls: doc.toolCalls,
      updatedAt:
        'updatedAt' in doc && doc.updatedAt instanceof Date
          ? doc.updatedAt
          : undefined,
      user: doc.user,
    }));

    await (
      this.model as unknown as {
        insertMany: (docs: unknown[]) => Promise<void>;
      }
    ).insertMany(clones);
  }

  private toObjectId(
    value: string | Types.ObjectId,
    field: string,
  ): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    return new Types.ObjectId(value);
  }
}
