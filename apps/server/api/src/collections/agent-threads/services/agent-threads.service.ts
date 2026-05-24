import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { AgentRoomDocument } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AgentExecutionStatus, AgentThreadStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

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
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly agentMessagesService: AgentMessagesService,
  ) {
    super(prisma, 'agentThread', logger);
  }

  async getUserThreads(
    userId: string,
    organizationId: string,
    status?: AgentThreadStatus,
  ): Promise<AgentThreadWithSummary[]> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
      userId,
    };

    if (status === AgentThreadStatus.ACTIVE) {
      where.status = AgentThreadStatus.ACTIVE;
    } else if (status) {
      where.status = status;
    }

    return this.findThreadsWithSnapshots(organizationId, where);
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
    const result = await this.delegate.updateMany({
      where: {
        isDeleted: false,
        organizationId,
        status: AgentThreadStatus.ACTIVE,
        userId,
      },
      data: { status: AgentThreadStatus.ARCHIVED },
    });

    return result.count ?? 0;
  }

  updateThreadMetadata(
    threadId: string,
    organizationId: string,
    payload: Partial<{
      isPinned: boolean;
      planModeEnabled: boolean;
      requestedModel: string;
      runtimeKey: string;
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
    const parent = await this.findOne({
      id: threadId,
      isDeleted: false,
      organizationId,
      userId,
    });

    if (!parent) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    const cloned = await this.create({
      organizationId: parent.organizationId,
      parentThreadId: parent.id,
      source: parent.source,
      systemPrompt: parent.systemPrompt,
      title: parent.title ? `${parent.title} (branch)` : 'Branched thread',
      userId,
    } as Record<string, unknown>);

    await this.agentMessagesService.copyMessages(
      threadId,
      cloned.id,
      organizationId,
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
    const updated = (await this.delegate.update({
      where: { id: threadId, isDeleted: false, organizationId },
      data: { status },
    })) as AgentRoomDocument | null;

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
    const updated = (await this.delegate.update({
      where: { id: threadId, isDeleted: false, organizationId },
      data: update,
    })) as AgentRoomDocument | null;

    if (!updated) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    return updated;
  }

  private async findThreadDocuments(
    organizationId: string,
    filters?: Record<string, unknown>,
  ): Promise<AgentRoomDocument[]> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
      ...filters,
    };

    return this.delegate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    }) as Promise<AgentRoomDocument[]>;
  }

  private async findThreadsWithSnapshots(
    organizationId: string,
    filters?: Record<string, unknown>,
  ): Promise<AgentThreadWithSummary[]> {
    const threads = await this.findThreadDocuments(organizationId, filters);

    if (threads.length === 0) {
      return [];
    }

    const threadIds = threads.map((thread) => thread.id);

    if (threadIds.length === 0) {
      return threads as AgentThreadWithSummary[];
    }

    const snapshots = await this.prisma.agentThreadSnapshot.findMany({
      where: {
        isDeleted: false,
        organizationId,
        threadId: { in: threadIds },
      },
    });

    const snapshotsByThreadId = new Map(
      snapshots.map((snapshot) => [
        String((snapshot as Record<string, unknown>).threadId),
        this.normalizeSnapshot(snapshot as unknown as Record<string, unknown>),
      ]),
    );
    const latestRunsByThreadId = await this.findLatestRunsByThreadIds(
      organizationId,
      threadIds,
    );

    return threads.map((thread) => {
      const snapshot = snapshotsByThreadId.get(String(thread.id));
      const latestRun = latestRunsByThreadId.get(String(thread.id));
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
    threadIds: string[],
  ): Promise<Map<string, AgentRunDocument>> {
    const runs = await this.prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        organizationId,
        threadId: { in: threadIds },
      },
    });

    const latestRunsByThreadId = new Map<string, AgentRunDocument>();

    for (const run of runs) {
      const threadId = (run as Record<string, unknown>).threadId as
        | string
        | null;

      if (!threadId || latestRunsByThreadId.has(threadId)) {
        continue;
      }

      latestRunsByThreadId.set(threadId, run as unknown as AgentRunDocument);
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

  private normalizeSnapshot(
    record: Record<string, unknown>,
  ): AgentThreadSnapshotDocument {
    const data = this.asRecord(record.data) ?? {};

    return {
      ...(record as unknown as AgentThreadSnapshotDocument),
      _id:
        typeof record.mongoId === 'string' && record.mongoId.length > 0
          ? record.mongoId
          : String(record.id ?? ''),
      organization:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : undefined,
      ...(data as Partial<AgentThreadSnapshotDocument>),
    };
  }

  private mapAgentRunStatus(
    status?: AgentExecutionStatus | string | null,
  ): ThreadRunStatus {
    switch (String(status ?? '').toLowerCase()) {
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
