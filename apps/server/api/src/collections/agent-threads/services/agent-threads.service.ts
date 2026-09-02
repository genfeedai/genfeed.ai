import { randomUUID } from 'node:crypto';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { AgentRoomDocument } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { resolveLastGeneratedAsset } from '@genfeedai/agent/server';
import {
  AgentThreadStatus,
  IngredientCategory,
  WorkflowExecutionStatus,
} from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
  brandLabel: string;
  lastActivityAt: string;
  lastAssistantPreview: string;
  lastGeneratedAssetUrl: string;
  pendingInputCount: number;
  runStatus: ThreadRunStatus;
}>;

type ThreadGeneratedAsset = {
  createdAt: string;
  url: string;
};

type WorkflowExecutionRecord = {
  id: string;
  status: WorkflowExecutionStatus | string;
};

/**
 * One row of the thread -> execution join. `threadId` is not a column: agent
 * turns store it inside the execution `result` JSON at `metadata.threadId`
 * (written by `AgentOrchestratorService`), so it is projected out in SQL.
 */
type ThreadExecutionRow = {
  id: string;
  status: string;
  threadId: string;
};

const LIST_THUMB_INGREDIENT_CATEGORIES: IngredientCategory[] = [
  IngredientCategory.AVATAR,
  IngredientCategory.GIF,
  IngredientCategory.IMAGE,
  IngredientCategory.IMAGE_EDIT,
];

/**
 * Upper bound on the thread -> execution scan. Rows arrive newest-first, so
 * both consumers (latest run status, latest generated thumbnail) stay correct
 * under the bound; only very old executions of very chatty threads fall out.
 */
const THREAD_EXECUTION_SCAN_LIMIT = 500;

type AgentThreadWithSummary = AgentRoomDocument & AgentThreadSummary;

@Injectable()
export class AgentThreadsService extends BaseService<
  AgentRoomDocument,
  Partial<AgentRoomDocument>,
  Partial<AgentRoomDocument>,
  Prisma.AgentThreadWhereInput
> {
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
    /**
     * When set, list is single-brand only. When omitted, list is full org
     * (every brand + org-scoped threads) for the user.
     */
    brandId?: string | null,
    /**
     * When set, list is narrowed to threads created from that entry point
     * (`onboarding`, `agent`, `proactive`). Onboarding resume relies on this
     * so the newest onboarding thread is never hidden behind newer standard
     * threads.
     */
    source?: string | null,
  ): Promise<AgentThreadWithSummary[]> {
    const where: Record<string, unknown> = scopedWhere(organizationId, {
      userId,
    });

    if (status === AgentThreadStatus.ACTIVE) {
      where.status = AgentThreadStatus.ACTIVE;
    } else if (status) {
      where.status = status;
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (source) {
      where.source = source;
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
    brandId?: string | null,
  ): Promise<number> {
    const result = await this.delegate.updateMany({
      data: { status: AgentThreadStatus.ARCHIVED },
      where: scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        status: AgentThreadStatus.ACTIVE,
        userId,
      }),
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
    const parent = await this.findOne(
      scopedWhere(organizationId, { id: threadId, userId }),
    );

    if (!parent) {
      throw new NotFoundException('Thread', threadId);
    }

    const cloned = await this.create({
      brandId: parent.brandId,
      contextVersion: 1,
      isLegacyBrandFallbackEligible: false,
      organizationId: parent.organizationId,
      parentThreadId: parent.id,
      source: parent.source,
      systemPrompt: parent.systemPrompt,
      scopeChangeProvenance: parent.brandId
        ? [
            {
              acceptedAt: new Date().toISOString(),
              actorUserId: userId,
              brandId: parent.brandId,
              fromContextVersion: 0,
              id: randomUUID(),
              previousBrandId: null,
              source: 'thread_created',
              toContextVersion: 1,
            },
          ]
        : [],
      title: parent.title ? `${parent.title} (branch)` : 'Branched thread',
      userId,
    });

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
      where: scopedWhere(organizationId, { id: threadId }),
      data: { status },
    })) as AgentRoomDocument | null;

    if (!updated) {
      throw new NotFoundException('Thread', threadId);
    }

    return updated;
  }

  private async updateThreadFields(
    threadId: string,
    organizationId: string,
    update: Record<string, unknown>,
  ): Promise<AgentRoomDocument> {
    const updated = (await this.delegate.update({
      where: scopedWhere(organizationId, { id: threadId }),
      data: update,
    })) as AgentRoomDocument | null;

    if (!updated) {
      throw new NotFoundException('Thread', threadId);
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
      where: scopedWhere(organizationId, { threadId: { in: threadIds } }),
    });

    const snapshotsByThreadId = new Map(
      snapshots.map((snapshot) => [
        String((snapshot as Record<string, unknown>).threadId),
        this.normalizeSnapshot(snapshot as unknown as Record<string, unknown>),
      ]),
    );
    const executionRows = await this.findExecutionsByThreadIds(
      organizationId,
      threadIds,
    );
    // Rows arrive newest-first, so the first row per thread is that thread's
    // latest execution.
    const latestExecutionsByThreadId = new Map<string, WorkflowExecutionRecord>(
      executionRows
        .map(
          (row) => [row.threadId, { id: row.id, status: row.status }] as const,
        )
        .reverse(),
    );
    const latestAssetsByThreadId =
      await this.findLatestGeneratedAssetsByThreadIds(
        organizationId,
        new Map(executionRows.map((row) => [row.id, row.threadId])),
      );
    const brandLabelsById = await this.findBrandLabelsByIds(
      organizationId,
      threads
        .map((thread) => thread.brandId)
        .filter((brandId): brandId is string => Boolean(brandId)),
    );

    return threads.map((thread) => {
      const snapshot = snapshotsByThreadId.get(String(thread.id));
      const latestExecution = latestExecutionsByThreadId.get(String(thread.id));
      const brandLabel = thread.brandId
        ? brandLabelsById.get(thread.brandId)
        : undefined;
      return {
        ...thread,
        ...(brandLabel ? { brandLabel } : {}),
        ...this.buildThreadSummary(
          snapshot,
          latestExecution,
          latestAssetsByThreadId.get(String(thread.id)),
        ),
      };
    }) as AgentThreadWithSummary[];
  }

  private buildThreadSummary(
    snapshot?: AgentThreadSnapshotDocument | null,
    latestExecution?: WorkflowExecutionRecord | null,
    latestAsset?: ThreadGeneratedAsset,
  ): AgentThreadSummary {
    const lastGeneratedAsset = resolveLastGeneratedAsset({
      ingredient: latestAsset,
      metadata: snapshot
        ? this.asRecord(snapshot.lastAssistantMessage)?.metadata
        : undefined,
      metadataCreatedAt: snapshot
        ? this.readString(
            this.asRecord(snapshot.lastAssistantMessage),
            'createdAt',
          )
        : undefined,
    });

    if (!snapshot) {
      return {
        attentionState: null,
        lastGeneratedAssetUrl: lastGeneratedAsset?.url,
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
      latestExecution,
      pendingInputCount,
    );
    const lastAssistantMessage = this.asRecord(snapshot.lastAssistantMessage);
    const lastMeaningfulTimelineAssistant = [...(snapshot.timeline ?? [])]
      .reverse()
      .map((entry) => this.asRecord(entry))
      .find(
        (entry) =>
          this.readString(entry, 'kind') === 'assistant' &&
          Boolean(this.readString(entry, 'detail')?.trim()),
      );
    const lastAssistantPreview =
      this.readString(lastAssistantMessage, 'content')?.trim() ||
      this.readString(lastMeaningfulTimelineAssistant, 'detail')?.trim();
    const lastActivityAt =
      (lastAssistantPreview
        ? this.readString(lastAssistantMessage, 'content')?.trim()
          ? this.readString(lastAssistantMessage, 'createdAt')
          : this.readString(lastMeaningfulTimelineAssistant, 'createdAt')
        : undefined) ??
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
      lastGeneratedAssetUrl: lastGeneratedAsset?.url,
      pendingInputCount,
      runStatus,
    };
  }

  /**
   * Latest workflow executions for the listed threads. Agent turns record the
   * originating thread in the execution `result` JSON (`metadata.threadId`),
   * not in a column, so the join is projected in SQL rather than scanned in
   * memory over every execution in the organization.
   */
  private async findExecutionsByThreadIds(
    organizationId: string,
    threadIds: string[],
  ): Promise<ThreadExecutionRow[]> {
    if (threadIds.length === 0) {
      return [];
    }

    return this.prisma.$queryRaw<ThreadExecutionRow[]>`
      SELECT
        execution.id AS "id",
        execution.status::text AS "status",
        execution.result -> 'metadata' ->> 'threadId' AS "threadId"
      FROM workflow_executions AS execution
      WHERE execution."organizationId" = ${organizationId}
        AND execution."isDeleted" = false
        AND execution.result -> 'metadata' ->> 'threadId' IN (${Prisma.join(
          threadIds,
        )})
      ORDER BY execution."createdAt" DESC
      LIMIT ${THREAD_EXECUTION_SCAN_LIMIT}
    `;
  }

  private async findLatestGeneratedAssetsByThreadIds(
    organizationId: string,
    threadIdByExecutionId: Map<string, string>,
  ): Promise<Map<string, ThreadGeneratedAsset>> {
    const executionIds = [...threadIdByExecutionId.keys()];
    if (executionIds.length === 0) {
      return new Map();
    }

    const ingredients = await this.prisma.ingredient.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        cdnUrl: true,
        createdAt: true,
        workflowExecutionId: true,
      },
      where: scopedWhere(organizationId, {
        category: { in: LIST_THUMB_INGREDIENT_CATEGORIES },
        cdnUrl: { not: null },
        workflowExecutionId: { in: executionIds },
      }),
    });

    const latestByThreadId = new Map<string, ThreadGeneratedAsset>();

    for (const ingredient of ingredients) {
      const threadId = ingredient.workflowExecutionId
        ? threadIdByExecutionId.get(ingredient.workflowExecutionId)
        : undefined;
      const url = ingredient.cdnUrl;
      if (!threadId || !url || latestByThreadId.has(threadId)) {
        continue;
      }

      latestByThreadId.set(threadId, {
        createdAt:
          ingredient.createdAt instanceof Date
            ? ingredient.createdAt.toISOString()
            : String(ingredient.createdAt),
        url,
      });
    }

    return latestByThreadId;
  }

  private async findBrandLabelsByIds(
    organizationId: string,
    brandIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueBrandIds = [...new Set(brandIds)];
    if (uniqueBrandIds.length === 0) {
      return new Map();
    }

    const brands = await this.prisma.brand.findMany({
      select: {
        id: true,
        label: true,
      },
      where: scopedWhere(organizationId, { id: { in: uniqueBrandIds } }),
    });

    return new Map(
      brands
        .filter((brand) => Boolean(brand.label))
        .map((brand) => [brand.id, brand.label]),
    );
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
    latestExecution?: WorkflowExecutionRecord | null,
    pendingInputCount = 0,
  ): ThreadRunStatus {
    if (pendingInputCount > 0) {
      return 'waiting_input';
    }

    if (!latestExecution) {
      return snapshotStatus;
    }

    const latestExecutionStatus = this.mapWorkflowExecutionStatus(
      latestExecution.status,
    );

    if (
      (snapshotStatus === 'queued' || snapshotStatus === 'running') &&
      latestExecutionStatus !== 'queued' &&
      latestExecutionStatus !== 'running'
    ) {
      return latestExecutionStatus;
    }

    return snapshotStatus === 'idle' ? latestExecutionStatus : snapshotStatus;
  }

  private normalizeSnapshot(
    record: Record<string, unknown>,
  ): AgentThreadSnapshotDocument {
    const data = this.asRecord(record.data) ?? {};

    return {
      ...(record as unknown as AgentThreadSnapshotDocument),
      organization:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : undefined,
      ...(data as Partial<AgentThreadSnapshotDocument>),
    };
  }

  private mapWorkflowExecutionStatus(
    status?: WorkflowExecutionStatus | string | null,
  ): ThreadRunStatus {
    const normalized = String(status ?? '').toUpperCase();
    switch (normalized) {
      case WorkflowExecutionStatus.PENDING:
      case 'QUEUED':
        return 'queued';
      case WorkflowExecutionStatus.RUNNING:
        return 'running';
      case WorkflowExecutionStatus.COMPLETED:
        return 'completed';
      case WorkflowExecutionStatus.FAILED:
      case 'BUDGET_EXHAUSTED':
        return 'failed';
      case WorkflowExecutionStatus.CANCELLED:
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
