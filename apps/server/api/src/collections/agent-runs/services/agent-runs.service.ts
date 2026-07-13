import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { UpdateAgentRunDto } from '@api/collections/agent-runs/dto/update-agent-run.dto';
import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  authorizeAgentArtifactWrite,
  hasAgentArtifactWriteInput,
} from '@api/shared/utils/agent-artifact-reference-write.util';
import { AgentExecutionStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import type { AgentRunJobData } from '@genfeedai/queue-contracts';
import { AgentArtifactReferenceService } from '@genfeedai/server';
import type {
  AgentRunStats,
  AgentRunStatsQueryParams,
  AgentRunTimeRange,
} from '@genfeedai/types';
import { DEFAULT_AGENT_RUN_TIME_RANGE } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

type AgentRunStatsSummary = Omit<
  AgentRunStats,
  | 'anomalies'
  | 'routingPaths'
  | 'timeRange'
  | 'topActualModels'
  | 'topRequestedModels'
  | 'trends'
>;

type AgentRunPageOptions = {
  brandId?: string | null;
  cursor?: string;
  limit?: number;
};

type AgentRunWriteData = Record<string, unknown>;
type AgentRunPopulateInput = (string | PopulateOption)[] | 'none';

type AgentRunRetryOptions = {
  brandId?: string | null;
  retriedBy: string;
};

type AgentRunRetryPreparation = {
  jobData: AgentRunJobData;
  previousStatus: AgentExecutionStatus;
  rollback: AgentRunRetryRollback;
  run: AgentRunDocument;
};

type AgentRunRetryRollback = {
  claimedAt: Date;
  state: Prisma.AgentRunUpdateManyMutationInput;
};

const RETRYABLE_AGENT_RUN_STATUSES: AgentExecutionStatus[] = [
  AgentExecutionStatus.FAILED,
  AgentExecutionStatus.CANCELLED,
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AGENT_RUN_LIMIT = 50;
const MAX_AGENT_RUN_LIMIT = 200;
const MAX_AGENT_RUN_BATCH_IDS = 50;
const MAX_AGENT_RUN_CONTENT_ITEMS = 500;

function readOptionalId(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value === null) {
      return null;
    }
  }
  return undefined;
}

function requireId(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  const value = readOptionalId(record, ...keys);
  return typeof value === 'string' ? value : undefined;
}

function brandScope(brandId: string | null | undefined) {
  return brandId ? { brandId } : {};
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getTimeRangeDays(timeRange: AgentRunTimeRange): number {
  switch (timeRange) {
    case '14d':
      return 14;
    case '30d':
      return 30;
    default:
      return 7;
  }
}

@Injectable()
export class AgentRunsService extends BaseService<
  AgentRunDocument,
  CreateAgentRunDto,
  UpdateAgentRunDto,
  Prisma.AgentRunWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
  ) {
    super(prisma, 'agentRun', logger);
  }

  /**
   * Override create to prevent body-supplied organizationId from being trusted.
   * organizationId MUST be derived from authenticated context before calling this method.
   * The caller (controller) is responsible for stripping body-supplied org and injecting
   * the auth-derived value; this override validates the result is present.
   */
  override async create(
    createDto: CreateAgentRunDto,
  ): Promise<AgentRunDocument> {
    const dto = this.normalizeAgentRunWriteData(createDto);
    const organizationId = dto.organizationId as string | undefined;
    const userId = dto.userId as string | undefined;

    if (!organizationId) {
      throw new NotFoundException({
        message: 'Organization context is required',
      });
    }

    if (!userId) {
      throw new NotFoundException({
        message: 'User context is required',
      });
    }

    const artifactWrite = await authorizeAgentArtifactWrite({
      authorizer: this.agentArtifactReferenceService,
      inputs: [dto],
      readContext: {
        ...(typeof dto.brandId === 'string' ? { brandId: dto.brandId } : {}),
        organizationId,
      },
    });

    return super.create({
      ...dto,
      ...artifactWrite,
    } as unknown as CreateAgentRunDto) as Promise<AgentRunDocument>;
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateAgentRunDto> | AgentRunWriteData,
    populate: AgentRunPopulateInput = [],
  ): Promise<AgentRunDocument> {
    const normalized = this.normalizeAgentRunWriteData(updateDto);
    if (hasAgentArtifactWriteInput(normalized)) {
      const current = (await this.delegate.findFirst({
        select: {
          artifactReferences: true,
          artifactVersionPinIds: true,
          brandId: true,
          id: true,
          organizationId: true,
        },
        where: { id, isDeleted: false },
      })) as AgentRunDocument | null;
      if (!current) {
        throw new NotFoundException({ message: 'Agent run not found' });
      }

      const organizationId = current.organizationId;
      const persisted = current as AgentRunDocument & {
        artifactReferences?: Prisma.JsonValue;
        artifactVersionPinIds?: string[];
      };
      const artifactWrite = await authorizeAgentArtifactWrite({
        authorizer: this.agentArtifactReferenceService,
        inputs: [
          {
            artifactReferences: persisted.artifactReferences ?? [],
            artifactVersionPinIds: persisted.artifactVersionPinIds ?? [],
          },
          normalized,
        ],
        readContext: {
          ...(current.brandId ? { brandId: current.brandId } : {}),
          organizationId,
        },
      });
      Object.assign(normalized, artifactWrite);
    }

    return super.patch(id, normalized, populate) as Promise<AgentRunDocument>;
  }

  /**
   * Override findOne to enforce org-scoped lookup.
   * Pass { id, organizationId, isDeleted: false } as params.
   */
  override async findOne(
    params: Record<string, unknown>,
  ): Promise<AgentRunDocument | null> {
    const id = params.id ?? params._id;
    const organizationId = params.organizationId;

    if (!organizationId) {
      // Fall back to unscoped only when explicitly omitted (e.g. internal admin lookups).
      // All user-facing paths must include organizationId.
      this.logger?.warn(
        'AgentRunsService.findOne called without organizationId',
        {
          params,
        },
      );
    }

    const scopedParams: Record<string, unknown> = {
      ...params,
      isDeleted: params.isDeleted ?? false,
    };

    if (id) {
      scopedParams._id = id;
    }

    return super.findOne(scopedParams) as Promise<AgentRunDocument | null>;
  }

  @HandleErrors('start agent run', 'agent-runs')
  async start(
    id: string,
    organizationId: string,
  ): Promise<AgentRunDocument | null> {
    return (await this.delegate.update({
      where: { id, isDeleted: false, organizationId },
      data: {
        startedAt: new Date(),
        status: AgentExecutionStatus.RUNNING,
      },
    })) as AgentRunDocument | null;
  }

  @HandleErrors('get agent run', 'agent-runs')
  async getById(
    id: string,
    organizationId: string,
    brandId?: string | null,
  ): Promise<AgentRunDocument | null> {
    return (await this.delegate.findFirst({
      where: { id, ...brandScope(brandId), isDeleted: false, organizationId },
    })) as AgentRunDocument | null;
  }

  @HandleErrors('check agent run cancellation', 'agent-runs')
  async isCancelled(id: string, organizationId: string): Promise<boolean> {
    const run = await this.getById(id, organizationId);
    return run?.status === AgentExecutionStatus.CANCELLED;
  }

  @HandleErrors('record tool call', 'agent-runs')
  async recordToolCall(
    id: string,
    organizationId: string,
    toolCall: {
      toolName: string;
      status: 'completed' | 'failed';
      creditsUsed: number;
      durationMs: number;
      error?: string;
    },
  ): Promise<void> {
    const current = (await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    })) as AgentRunDocument | null;
    if (!current) return;

    const existingToolCalls = Array.isArray(current.toolCalls)
      ? current.toolCalls
      : [];
    await this.delegate.update({
      where: { id },
      data: {
        creditsUsed: { increment: toolCall.creditsUsed },
        toolCalls: [
          ...existingToolCalls,
          { ...toolCall, executedAt: new Date().toISOString() },
        ],
      },
    });
  }

  @HandleErrors('update progress', 'agent-runs')
  async updateProgress(
    id: string,
    organizationId: string,
    progress: number,
  ): Promise<void> {
    await this.delegate.updateMany({
      where: { id, isDeleted: false, organizationId },
      data: { progress: Math.min(100, Math.max(0, progress)) },
    });
  }

  @HandleErrors('merge agent run metadata', 'agent-runs')
  async mergeMetadata(
    id: string,
    organizationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const current = (await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    })) as AgentRunDocument | null;
    if (!current) return;

    const existingMetadata =
      (current.metadata as Record<string, unknown>) ?? {};
    const artifactData = current as AgentRunDocument & {
      artifactReferences?: Prisma.JsonValue;
      artifactVersionPinIds?: string[];
    };
    const artifactWrite = hasAgentArtifactWriteInput({ metadata })
      ? await authorizeAgentArtifactWrite({
          authorizer: this.agentArtifactReferenceService,
          inputs: [
            {
              artifactReferences: artifactData.artifactReferences ?? [],
              artifactVersionPinIds: artifactData.artifactVersionPinIds ?? [],
            },
            { metadata },
          ],
          readContext: {
            ...(current.brandId ? { brandId: current.brandId } : {}),
            organizationId,
          },
        })
      : {};
    await this.delegate.update({
      where: { id },
      data: {
        ...artifactWrite,
        metadata: { ...existingMetadata, ...metadata },
      },
    });
  }

  @HandleErrors('list recent organization agent runs', 'agent-runs')
  async findRecentByOrganization(
    organizationId: string,
    since: Date,
    take = 200,
    brandId?: string | null,
  ): Promise<AgentRunDocument[]> {
    const safeTake = this.normalizeLimit(take, 200, MAX_AGENT_RUN_LIMIT);
    const docs = await this.delegate.findMany({
      orderBy: { createdAt: 'desc' },
      take: safeTake,
      where: {
        createdAt: { gte: since },
        ...brandScope(brandId),
        isDeleted: false,
        organizationId,
      },
    });

    return this.normalizeDocuments(docs) as AgentRunDocument[];
  }

  @HandleErrors('complete agent run', 'agent-runs')
  async complete(
    id: string,
    organizationId: string,
    summary?: string,
  ): Promise<AgentRunDocument | null> {
    const completedAt = new Date();
    const run = (await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    })) as AgentRunDocument | null;

    if (!run) return null;

    const durationMs = run.startedAt
      ? completedAt.getTime() - (run.startedAt as Date).getTime()
      : 0;

    return (await this.delegate.update({
      where: { id },
      data: {
        completedAt,
        durationMs,
        progress: 100,
        status: AgentExecutionStatus.COMPLETED,
        ...(summary && { summary }),
      },
    })) as AgentRunDocument | null;
  }

  @HandleErrors('fail agent run', 'agent-runs')
  async fail(
    id: string,
    organizationId: string,
    error: string,
  ): Promise<AgentRunDocument | null> {
    const completedAt = new Date();
    const run = (await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    })) as AgentRunDocument | null;

    if (!run) return null;

    const durationMs = run.startedAt
      ? completedAt.getTime() - (run.startedAt as Date).getTime()
      : 0;

    return (await this.delegate.update({
      where: { id },
      data: {
        completedAt,
        durationMs,
        error,
        retryCount: { increment: 1 },
        status: AgentExecutionStatus.FAILED,
      },
    })) as AgentRunDocument | null;
  }

  @HandleErrors('cancel agent run', 'agent-runs')
  async cancel(
    id: string,
    organizationId: string,
    brandId?: string | null,
  ): Promise<AgentRunDocument | null> {
    const completedAt = new Date();
    const run = (await this.delegate.findFirst({
      where: { id, ...brandScope(brandId), isDeleted: false, organizationId },
    })) as AgentRunDocument | null;

    if (!run) return null;

    const durationMs = run.startedAt
      ? completedAt.getTime() - (run.startedAt as Date).getTime()
      : 0;

    return (await this.delegate.update({
      where: { id },
      data: {
        completedAt,
        durationMs,
        status: AgentExecutionStatus.CANCELLED,
      },
    })) as AgentRunDocument | null;
  }

  /**
   * Reset a failed or cancelled run so it can be re-enqueued, and rebuild the
   * queue job data from the durable run/strategy records. Enqueueing is the
   * caller's responsibility — this method only prepares state.
   */
  @HandleErrors('prepare agent run retry', 'agent-runs')
  async prepareRetry(
    id: string,
    organizationId: string,
    options: AgentRunRetryOptions,
  ): Promise<AgentRunRetryPreparation | null> {
    const run = (await this.delegate.findFirst({
      include: { strategy: true },
      where: {
        id,
        ...brandScope(options.brandId),
        isDeleted: false,
        organizationId,
      },
    })) as
      | (AgentRunDocument & {
          strategy?: { agentType?: string | null; config?: unknown } | null;
        })
      | null;

    if (!run) return null;

    const previousStatus = run.status as AgentExecutionStatus;
    if (!RETRYABLE_AGENT_RUN_STATUSES.includes(previousStatus)) {
      throw new BadRequestException(
        `Only failed or cancelled agent runs can be retried (current status: ${previousStatus})`,
      );
    }

    const metadata = readJsonRecord(run.metadata);
    const strategyConfig = readJsonRecord(run.strategy?.config);
    const claimedAt = new Date();

    const jobData: AgentRunJobData = {
      agentType:
        run.strategy?.agentType ??
        readOptionalId(strategyConfig, 'agentType') ??
        undefined,
      autonomyMode: readOptionalId(strategyConfig, 'autonomyMode') ?? undefined,
      campaignId: readOptionalId(metadata, 'campaignId') ?? undefined,
      creditBudget: run.creditBudget ?? undefined,
      model:
        readOptionalId(metadata, 'requestedModel') ??
        readOptionalId(strategyConfig, 'model') ??
        undefined,
      objective: run.objective ?? undefined,
      organizationId,
      runId: run.id,
      strategyId: run.strategyId ?? undefined,
      userId: run.userId,
    };

    const retryState: Prisma.AgentRunUpdateManyMutationInput = {
      completedAt: null,
      durationMs: null,
      error: null,
      metadata: {
        ...metadata,
        lastRetryAt: claimedAt.toISOString(),
        retriedBy: options.retriedBy,
      },
      progress: 0,
      startedAt: null,
      status: AgentExecutionStatus.PENDING,
      summary: null,
      updatedAt: claimedAt,
    };
    const claim = await this.delegate.updateMany({
      where: {
        id,
        ...brandScope(options.brandId),
        isDeleted: false,
        organizationId,
        status: previousStatus,
      },
      data: retryState,
    });

    if (claim.count !== 1) {
      throw new ConflictException('Agent run retry is already in progress');
    }

    const updated = {
      ...run,
      ...retryState,
    } as AgentRunDocument;
    const rollback: AgentRunRetryRollback = {
      claimedAt,
      state: {
        completedAt: run.completedAt ?? null,
        durationMs: run.durationMs ?? null,
        error: run.error ?? null,
        metadata:
          run.metadata === null
            ? Prisma.JsonNull
            : (run.metadata as Prisma.InputJsonValue),
        progress: run.progress,
        startedAt: run.startedAt ?? null,
        status: previousStatus,
        summary: run.summary ?? null,
      },
    };

    return { jobData, previousStatus, rollback, run: updated };
  }

  @HandleErrors('rollback agent run retry', 'agent-runs')
  async rollbackRetry(
    id: string,
    organizationId: string,
    rollback: AgentRunRetryRollback,
    brandId?: string | null,
  ): Promise<boolean> {
    const result = await this.delegate.updateMany({
      data: rollback.state,
      where: {
        id,
        ...brandScope(brandId),
        isDeleted: false,
        organizationId,
        status: AgentExecutionStatus.PENDING,
        updatedAt: rollback.claimedAt,
      },
    });

    return result.count === 1;
  }

  @HandleErrors('get active runs', 'agent-runs')
  async getActiveRuns(
    organizationId: string,
    options: AgentRunPageOptions = {},
  ): Promise<AgentRunDocument[]> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_AGENT_RUN_LIMIT,
      MAX_AGENT_RUN_LIMIT,
    );
    const cursorDate = this.parseCursorDate(options.cursor);

    return (await this.delegate.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      where: {
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        ...brandScope(options.brandId),
        isDeleted: false,
        organizationId,
        status: {
          in: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
        },
      },
    })) as AgentRunDocument[];
  }

  @HandleErrors('list recent runs', 'agent-runs')
  async listRecentRuns(
    organizationId: string,
    limit = 20,
    brandId?: string | null,
  ): Promise<AgentRunDocument[]> {
    const safeLimit = this.normalizeLimit(limit, 20, MAX_AGENT_RUN_LIMIT);
    return (await this.delegate.findMany({
      where: {
        ...brandScope(brandId),
        isDeleted: false,
        organizationId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: safeLimit,
    })) as AgentRunDocument[];
  }

  @HandleErrors('get thread runs', 'agent-runs')
  async getByThread(
    threadId: string,
    organizationId: string,
    options: AgentRunPageOptions = {},
  ): Promise<AgentRunDocument[]> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_AGENT_RUN_LIMIT,
      MAX_AGENT_RUN_LIMIT,
    );
    const cursorDate = this.parseCursorDate(options.cursor);

    return (await this.delegate.findMany({
      where: {
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        ...brandScope(options.brandId),
        isDeleted: false,
        organizationId,
        threadId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })) as AgentRunDocument[];
  }

  @HandleErrors('get run stats', 'agent-runs')
  async getStats(
    organizationId: string,
    query?: AgentRunStatsQueryParams,
    brandId?: string | null,
  ): Promise<AgentRunStats> {
    const timeRange = query?.timeRange ?? DEFAULT_AGENT_RUN_TIME_RANGE;
    const timeRangeDays = getTimeRangeDays(timeRange);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const trendStart = new Date(Date.now() - (timeRangeDays - 1) * DAY_IN_MS);
    trendStart.setHours(0, 0, 0, 0);

    // Four parallel Prisma count queries replace the legacy MongoDB $facet aggregation.
    // Each count is scoped to organizationId + isDeleted: false with the relevant status filter.
    const scopedWhere = {
      ...brandScope(brandId),
      isDeleted: false,
      organizationId,
    };

    const [totalRuns, activeRuns, completedToday, failedToday] =
      await Promise.all([
        this.delegate.count({ where: scopedWhere }),
        this.delegate.count({
          where: {
            ...scopedWhere,
            status: {
              in: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
            },
          },
        }),
        this.delegate.count({
          where: {
            ...scopedWhere,
            status: AgentExecutionStatus.COMPLETED,
            completedAt: { gte: todayStart },
          },
        }),
        this.delegate.count({
          where: {
            ...scopedWhere,
            status: AgentExecutionStatus.FAILED,
            completedAt: { gte: todayStart },
          },
        }),
      ]);

    const summary: AgentRunStatsSummary = {
      activeRuns,
      autoRoutedRuns: 0,
      completedToday,
      failedToday,
      totalCreditsToday: 0,
      totalRuns,
      webEnabledRuns: 0,
    };

    return {
      ...summary,
      anomalies: [],
      routingPaths: [],
      timeRange,
      topActualModels: [],
      topRequestedModels: [],
      trends: [],
    };
  }

  @HandleErrors('get batch with content', 'agent-runs')
  async getBatchWithContent(
    ids: string[],
    organizationId: string,
    brandId?: string | null,
  ): Promise<
    Array<{ id: string; threadId: string | null; contentCount: number }>
  > {
    if (ids.length === 0) {
      return [];
    }
    const boundedIds = ids.slice(0, MAX_AGENT_RUN_BATCH_IDS);

    const [runs, postGroups, ingredientGroups] = await Promise.all([
      this.prisma.agentRun.findMany({
        select: { id: true, threadId: true },
        take: boundedIds.length,
        where: {
          id: { in: boundedIds },
          ...brandScope(brandId),
          isDeleted: false,
          organizationId,
        },
      }),
      this.prisma.post.groupBy({
        by: ['agentRunId'],
        orderBy: { agentRunId: 'asc' },
        take: boundedIds.length,
        where: {
          agentRunId: { in: boundedIds },
          ...brandScope(brandId),
          isDeleted: false,
          organizationId,
        },
        _count: true,
      }),
      this.prisma.ingredient.groupBy({
        by: ['agentRunId'],
        orderBy: { agentRunId: 'asc' },
        take: boundedIds.length,
        where: {
          agentRunId: { in: boundedIds },
          ...brandScope(brandId),
          isDeleted: false,
          organizationId,
        },
        _count: true,
      }),
    ]);

    const postCountByRunId = new Map<string, number>(
      postGroups.map((g) => [g.agentRunId as string, g._count]),
    );
    const ingredientCountByRunId = new Map<string, number>(
      ingredientGroups.map((g) => [g.agentRunId as string, g._count]),
    );

    return runs.map((run) => ({
      contentCount:
        (postCountByRunId.get(run.id) ?? 0) +
        (ingredientCountByRunId.get(run.id) ?? 0),
      id: run.id,
      threadId: run.threadId ?? null,
    }));
  }

  @HandleErrors('get run content', 'agent-runs')
  async getRunContent(
    runId: string,
    organizationId: string,
    brandId?: string | null,
  ): Promise<{ posts: PostDocument[]; ingredients: IngredientDocument[] }> {
    const [posts, ingredients] = await Promise.all([
      this.prisma.post.findMany({
        take: MAX_AGENT_RUN_CONTENT_ITEMS,
        where: {
          agentRunId: runId,
          ...brandScope(brandId),
          isDeleted: false,
          organizationId,
        },
      }),
      this.prisma.ingredient.findMany({
        take: MAX_AGENT_RUN_CONTENT_ITEMS,
        where: {
          agentRunId: runId,
          ...brandScope(brandId),
          isDeleted: false,
          organizationId,
        },
      }),
    ]);

    return {
      ingredients: ingredients as unknown as IngredientDocument[],
      posts: posts as unknown as PostDocument[],
    };
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

  private normalizeAgentRunWriteData(data: unknown): AgentRunWriteData {
    const dto =
      data !== null && typeof data === 'object'
        ? { ...(data as Record<string, unknown>) }
        : {};

    const organizationId = requireId(dto, 'organizationId', 'organization');
    const userId = requireId(dto, 'userId', 'user');
    const brandId = readOptionalId(dto, 'brandId', 'brand');
    const strategyId = readOptionalId(dto, 'strategyId', 'strategy');
    const threadId = readOptionalId(dto, 'threadId', 'thread');
    const parentRunId = readOptionalId(dto, 'parentRunId', 'parentRun');

    delete dto.organization;
    delete dto.user;
    delete dto.brand;
    delete dto.strategy;
    delete dto.thread;
    delete dto.parentRun;

    if (organizationId) {
      dto.organizationId = organizationId;
    }
    if (userId) {
      dto.userId = userId;
    }
    if (brandId !== undefined) {
      dto.brandId = brandId;
    }
    if (strategyId !== undefined) {
      dto.strategyId = strategyId;
    }
    if (threadId !== undefined) {
      dto.threadId = threadId;
    }
    if (parentRunId !== undefined) {
      dto.parentRunId = parentRunId;
    }

    return dto;
  }
}
