import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import {
  AgentRun,
  type AgentRunDocument,
} from '@api/collections/agent-runs/schemas/agent-run.schema';
import {
  AgentRoom,
  type AgentRoomDocument,
} from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import {
  AgentThreadSnapshot,
  type AgentThreadSnapshotDocument,
} from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { AgentExecutionStatus, AgentThreadStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';

type ThreadRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'idle';

type ThreadAttentionState = 'needs-input' | 'running' | 'updated' | null;

type AgentThreadSummary = Partial<{
  attentionState: ThreadAttentionState;
  lastActivityAt: string;
  lastAssistantPreview: string;
  pendingInputCount: number;
  runStatus: ThreadRunStatus;
}>;

type AgentThreadWithSummary = AgentRoomDocument & AgentThreadSummary;

@Injectable()
export class AgentThreadsService extends BaseService<AgentRoomDocument> {
  constructor(
    @InjectModel(AgentRoom.name, DB_CONNECTIONS.AGENT)
    protected readonly model: AggregatePaginateModel<AgentRoomDocument>,
    @InjectModel(AgentThreadSnapshot.name, DB_CONNECTIONS.AGENT)
    private readonly snapshotModel: Model<AgentThreadSnapshotDocument>,
    @InjectModel(AgentRun.name, DB_CONNECTIONS.AGENT)
    private readonly agentRunModel: Model<AgentRunDocument>,
    public readonly logger: LoggerService,
    private readonly agentMessagesService: AgentMessagesService,
  ) {
    super(model, logger);
  }

  getUserThreads(
    userId: string,
    organizationId: string,
    status?: AgentThreadStatus,
  ): Promise<AgentThreadWithSummary[]> {
    this.ensureObjectId(userId, 'userId');
    this.ensureObjectId(organizationId, 'organizationId');

    const filters: Record<string, unknown> = {
      user: this.buildUserOwnershipFilter(userId),
    };

    if (status === AgentThreadStatus.ACTIVE) {
      // Match documents with status 'ACTIVE' OR missing status field entirely.
      // Old threads created before the status field was added won't have it,
      // and Mongoose defaults only apply on document creation, not queries.
      filters.$or = [
        { status: AgentThreadStatus.ACTIVE },
        { status: { $exists: false } },
      ];
    } else if (status) {
      filters.status = status;
    }

    return this.findThreadsWithSnapshots(organizationId, filters);
  }

  archiveThread(
    threadId: string,
    organizationId: string,
  ): Promise<AgentRoomDocument> {
    return this.updateThreadStatus(
      threadId,
      organizationId,
      AgentThreadStatus.ARCHIVED,
    );
  }

  async archiveAllThreads(
    userId: string,
    organizationId: string,
  ): Promise<number> {
    const parsedOrganizationId = this.ensureObjectId(
      organizationId,
      'organizationId',
    );

    const result = await this.model.updateMany(
      {
        $or: [
          { status: AgentThreadStatus.ACTIVE },
          { status: { $exists: false } },
        ],
        isDeleted: false,
        organization: parsedOrganizationId,
        user: this.buildUserOwnershipFilter(userId),
      },
      { $set: { status: AgentThreadStatus.ARCHIVED } },
    );

    return result.modifiedCount ?? 0;
  }

  updateThreadMetadata(
    threadId: string,
    organizationId: string,
    payload: Partial<{
      isPinned: boolean;
      planModeEnabled: boolean;
      title: string;
      systemPrompt: string;
      memoryEntryIds: string[];
    }>,
  ): Promise<AgentRoomDocument> {
    return this.updateThreadFields(threadId, organizationId, payload);
  }

  async branchThread(
    threadId: string,
    organizationId: string,
    userId: string,
  ): Promise<AgentRoomDocument> {
    const parsedConversationId = this.ensureObjectId(threadId, 'threadId');
    const parsedOrganizationId = this.ensureObjectId(
      organizationId,
      'organizationId',
    );
    const parsedUserId = this.ensureObjectId(userId, 'userId');

    const parent = await this.findOne({
      _id: parsedConversationId,
      isDeleted: false,
      organization: parsedOrganizationId,
      user: this.buildUserOwnershipFilter(userId),
    });

    if (!parent) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    const cloned = await this.create({
      organization: parent.organization,
      parentThreadId: parent._id,
      source: parent.source,
      systemPrompt: parent.systemPrompt,
      title: parent.title ? `${parent.title} (branch)` : 'Branched thread',
      user: parsedUserId,
    } as Record<string, unknown>);

    await this.agentMessagesService.copyMessages(
      String(parsedConversationId),
      String(cloned._id),
      String(parsedOrganizationId),
    );

    return cloned;
  }

  unarchiveThread(
    threadId: string,
    organizationId: string,
  ): Promise<AgentRoomDocument> {
    return this.updateThreadStatus(
      threadId,
      organizationId,
      AgentThreadStatus.ACTIVE,
    );
  }

  private async updateThreadStatus(
    threadId: string,
    organizationId: string,
    status: AgentThreadStatus,
  ): Promise<AgentRoomDocument> {
    const parsedConversationId = this.ensureObjectId(threadId, 'threadId');
    const parsedOrganizationId = this.ensureObjectId(
      organizationId,
      'organizationId',
    );

    const updated = await (
      this.model as unknown as {
        findOneAndUpdate: (
          filter: unknown,
          update: unknown,
          options: unknown,
        ) => Promise<AgentRoomDocument | null>;
      }
    ).findOneAndUpdate(
      {
        _id: parsedConversationId,
        isDeleted: false,
        organization: parsedOrganizationId,
      },
      { $set: { status } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    return updated;
  }

  private async updateThreadFields(
    threadId: string,
    organizationId: string,
    update: Record<string, unknown>,
  ): Promise<AgentRoomDocument> {
    const parsedConversationId = this.ensureObjectId(threadId, 'threadId');
    const parsedOrganizationId = this.ensureObjectId(
      organizationId,
      'organizationId',
    );

    const updated = await (
      this.model as unknown as {
        findOneAndUpdate: (
          filter: unknown,
          update: unknown,
          options: unknown,
        ) => Promise<AgentRoomDocument | null>;
      }
    ).findOneAndUpdate(
      {
        _id: parsedConversationId,
        isDeleted: false,
        organization: parsedOrganizationId,
      },
      { $set: update },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    return updated;
  }

  private async findThreadDocuments(
    organizationId: string,
    filters?: Record<string, unknown>,
  ): Promise<AgentRoomDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null) {
          continue;
        }
        query[key] = value;
      }
    }

    return this.model
      .find(query)
      .sort({ updatedAt: -1 })
      .lean() as unknown as Promise<AgentRoomDocument[]>;
  }

  private ensureObjectId(value: string, field: string): Types.ObjectId {
    if (!ObjectIdUtil.isValid(value)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(value);
  }

  private buildUserOwnershipFilter(userId: string): {
    $in: [Types.ObjectId, string];
  } {
    return {
      // Legacy agent rooms stored the Mongo user id as a plain string.
      // Keep writing canonical ObjectIds, but keep reading both forms.
      $in: [this.ensureObjectId(userId, 'userId'), userId],
    };
  }

  private async findThreadsWithSnapshots(
    organizationId: string,
    filters?: Record<string, unknown>,
  ): Promise<AgentThreadWithSummary[]> {
    const threads = await this.findThreadDocuments(organizationId, filters);

    if (threads.length === 0) {
      return [];
    }

    const threadIds = threads
      .map((thread) => this.readThreadId(thread))
      .filter((threadId): threadId is Types.ObjectId => threadId !== null);

    if (threadIds.length === 0) {
      return threads as AgentThreadWithSummary[];
    }

    const snapshots = await this.snapshotModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: { $in: threadIds },
      })
      .lean();

    const snapshotsByThreadId = new Map(
      snapshots.map((snapshot) => [String(snapshot.thread), snapshot]),
    );
    const latestRunsByThreadId = await this.findLatestRunsByThreadIds(
      organizationId,
      threadIds,
    );

    return threads.map((thread) => {
      const snapshot = snapshotsByThreadId.get(String(thread._id));
      const latestRun = latestRunsByThreadId.get(String(thread._id));
      return {
        ...thread,
        ...this.buildThreadSummary(snapshot, latestRun),
      };
    }) as AgentThreadWithSummary[];
  }

  private buildThreadSummary(
    snapshot?: AgentThreadSnapshotDocument | null,
    latestRun?: AgentRunDocument | null,
  ): AgentThreadSummary {
    if (!snapshot) {
      return {
        attentionState: null,
        pendingInputCount: 0,
        runStatus: 'idle',
      };
    }

    const pendingInputCount = Array.isArray(snapshot.pendingInputRequests)
      ? snapshot.pendingInputRequests.length
      : 0;
    const activeRun = this.asRecord(snapshot.activeRun);
    const rawRunStatus = this.readString(activeRun, 'status');
    const runStatus = this.reconcileRunStatus(
      this.normalizeRunStatus(rawRunStatus, pendingInputCount),
      latestRun,
      pendingInputCount,
    );
    const lastAssistantMessage = this.asRecord(snapshot.lastAssistantMessage);
    const lastAssistantPreview = this.readString(
      lastAssistantMessage,
      'content',
    );
    const lastActivityAt =
      this.readString(lastAssistantMessage, 'createdAt') ??
      this.readString(activeRun, 'completedAt') ??
      this.readString(activeRun, 'startedAt') ??
      this.readString(this.asRecord(snapshot), 'updatedAt');

    return {
      attentionState:
        pendingInputCount > 0
          ? 'needs-input'
          : runStatus === 'queued' || runStatus === 'running'
            ? 'running'
            : null,
      lastActivityAt,
      lastAssistantPreview: lastAssistantPreview?.slice(0, 280),
      pendingInputCount,
      runStatus,
    };
  }

  private async findLatestRunsByThreadIds(
    organizationId: string,
    threadIds: Types.ObjectId[],
  ): Promise<Map<string, AgentRunDocument>> {
    const runs = await this.agentRunModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: { $in: threadIds },
      })
      .sort({ createdAt: -1 })
      .lean();

    const latestRunsByThreadId = new Map<string, AgentRunDocument>();

    for (const run of runs) {
      const threadId =
        run.thread instanceof Types.ObjectId ? run.thread.toString() : null;

      if (!threadId || latestRunsByThreadId.has(threadId)) {
        continue;
      }

      latestRunsByThreadId.set(threadId, run);
    }

    return latestRunsByThreadId;
  }

  private normalizeRunStatus(
    rawStatus?: string,
    pendingInputCount = 0,
  ): ThreadRunStatus {
    if (pendingInputCount > 0) {
      return 'waiting_input';
    }

    switch (rawStatus) {
      case 'queued':
      case 'running':
      case 'waiting_input':
      case 'completed':
      case 'failed':
      case 'cancelled':
        return rawStatus;
      default:
        return 'idle';
    }
  }

  private reconcileRunStatus(
    snapshotStatus: ThreadRunStatus,
    latestRun?: AgentRunDocument | null,
    pendingInputCount = 0,
  ): ThreadRunStatus {
    if (pendingInputCount > 0) {
      return 'waiting_input';
    }

    if (!latestRun) {
      return snapshotStatus;
    }

    const latestRunStatus = this.mapAgentRunStatus(latestRun.status);

    if (
      (snapshotStatus === 'queued' || snapshotStatus === 'running') &&
      latestRunStatus !== 'queued' &&
      latestRunStatus !== 'running'
    ) {
      return latestRunStatus;
    }

    return snapshotStatus === 'idle' ? latestRunStatus : snapshotStatus;
  }

  private mapAgentRunStatus(status?: AgentExecutionStatus): ThreadRunStatus {
    switch (status) {
      case AgentExecutionStatus.PENDING:
        return 'queued';
      case AgentExecutionStatus.RUNNING:
        return 'running';
      case AgentExecutionStatus.COMPLETED:
        return 'completed';
      case AgentExecutionStatus.FAILED:
        return 'failed';
      case AgentExecutionStatus.CANCELLED:
        return 'cancelled';
      default:
        return 'idle';
    }
  }

  private readThreadId(thread: AgentRoomDocument): Types.ObjectId | null {
    const threadId: unknown = thread._id;

    if (threadId instanceof Types.ObjectId) {
      return threadId;
    }

    if (typeof threadId === 'string' && ObjectIdUtil.isValid(threadId)) {
      return new Types.ObjectId(threadId);
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private readString(
    value: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const candidate = value?.[key];
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : undefined;
  }
}
