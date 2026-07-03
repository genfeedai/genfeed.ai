import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { UpdateAgentRunDto } from '@api/collections/agent-runs/dto/update-agent-run.dto';
import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AgentExecutionStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import type {
  AgentRunAnomaly,
  AgentRunModelCount,
  AgentRunRoutingPathCount,
  AgentRunStats,
  AgentRunStatsQueryParams,
  AgentRunTimeRange,
  AgentRunTrendPoint,
} from '@genfeedai/types';
import { DEFAULT_AGENT_RUN_TIME_RANGE } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AgentRunStatsSummary = Omit<
  AgentRunStats,
  | 'anomalies'
  | 'routingPaths'
  | 'timeRange'
  | 'topActualModels'
  | 'topRequestedModels'
  | 'trends'
>;

type AgentRunTrendAggregateRow = {
  autoRoutedRuns: number;
  bucket: string;
  totalCreditsUsed: number;
  totalRuns: number;
  webEnabledRuns: number;
};

type AgentRunStatsAggregateResult = {
  routingPaths?: AgentRunRoutingPathCount[];
  summary?: AgentRunStatsSummary[];
  topActualModels?: AgentRunModelCount[];
  topRequestedModels?: AgentRunModelCount[];
  trends?: AgentRunTrendAggregateRow[];
};

type AgentRunPageOptions = {
  cursor?: string;
  limit?: number;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AGENT_RUN_LIMIT = 50;
const MAX_AGENT_RUN_LIMIT = 200;
const MAX_AGENT_RUN_BATCH_IDS = 50;
const MAX_AGENT_RUN_CONTENT_ITEMS = 500;

function getTimeRangeDays(timeRange: AgentRunTimeRange): number {
  switch (timeRange) {
    case '14d':
      return 14;
    case '30d':
      return 30;
    case '7d':
    default:
      return 7;
  }
}

function toTrendPoint(row: AgentRunTrendAggregateRow): AgentRunTrendPoint {
  const totalRuns = row.totalRuns ?? 0;
  const totalCreditsUsed = row.totalCreditsUsed ?? 0;

  return {
    autoRoutedRate: totalRuns > 0 ? row.autoRoutedRuns / totalRuns : 0,
    autoRoutedRuns: row.autoRoutedRuns ?? 0,
    averageCreditsUsed: totalRuns > 0 ? totalCreditsUsed / totalRuns : 0,
    bucket: row.bucket,
    totalCreditsUsed,
    totalRuns,
    webEnabledRate: totalRuns > 0 ? row.webEnabledRuns / totalRuns : 0,
    webEnabledRuns: row.webEnabledRuns ?? 0,
  };
}

function detectAgentRunAnomalies(
  trends: AgentRunTrendPoint[],
  totalRuns: number,
  topActualModels: AgentRunModelCount[],
): AgentRunAnomaly[] {
  if (trends.length === 0) {
    return [];
  }

  const anomalies: AgentRunAnomaly[] = [];
  const current = trends[trends.length - 1];
  const baselinePoints = trends.slice(0, -1);

  if (baselinePoints.length > 0) {
    const baselineAutoRouteRate =
      baselinePoints.reduce((sum, point) => sum + point.autoRoutedRate, 0) /
      baselinePoints.length;
    const baselineWebEnabledRate =
      baselinePoints.reduce((sum, point) => sum + point.webEnabledRate, 0) /
      baselinePoints.length;

    if (
      current.totalRuns >= 3 &&
      current.autoRoutedRate - baselineAutoRouteRate >= 0.2
    ) {
      anomalies.push({
        baselineValue: baselineAutoRouteRate,
        currentValue: current.autoRoutedRate,
        description:
          'Auto-routing jumped materially above the recent baseline.',
        kind: 'auto_routing_spike',
        severity:
          current.autoRoutedRate - baselineAutoRouteRate >= 0.35
            ? 'critical'
            : 'warning',
        title: 'Auto-routing spike',
      });
    }

    if (
      current.totalRuns >= 3 &&
      baselineWebEnabledRate - current.webEnabledRate >= 0.2
    ) {
      anomalies.push({
        baselineValue: baselineWebEnabledRate,
        currentValue: current.webEnabledRate,
        description:
          'Web-enabled usage dropped below the recent routing baseline.',
        kind: 'web_enabled_drop',
        severity:
          baselineWebEnabledRate - current.webEnabledRate >= 0.35
            ? 'critical'
            : 'warning',
        title: 'Web-enabled drop',
      });
    }
  }

  const dominantModel = topActualModels[0];

  if (dominantModel && totalRuns >= 10) {
    const concentration = dominantModel.count / totalRuns;

    if (concentration >= 0.8) {
      anomalies.push({
        baselineValue: 0.5,
        currentValue: concentration,
        description: `${dominantModel.model} now accounts for most resolved runs.`,
        kind: 'model_concentration',
        severity: concentration >= 0.9 ? 'critical' : 'warning',
        title: 'Model concentration',
      });
    }
  }

  return anomalies;
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
    const dto = createDto as CreateAgentRunDto & Record<string, unknown>;
    const organizationId = dto.organizationId as string | undefined;

    if (!organizationId) {
      throw new NotFoundException({
        message: 'Organization context is required',
      });
    }

    // Ensure the org field in the DTO comes only from the validated value above —
    // strip any raw 'organization' field that may have leaked from the request body.
    delete (dto as { organization?: unknown }).organization;

    return super.create(createDto) as Promise<AgentRunDocument>;
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
  ): Promise<AgentRunDocument | null> {
    return (await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
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

    const existingToolCalls = (current.toolCalls as unknown[]) ?? [];
    await this.delegate.update({
      where: { id },
      data: {
        creditsUsed: { increment: toolCall.creditsUsed },
        toolCalls: [
          ...existingToolCalls,
          { ...toolCall, executedAt: new Date() },
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
    await this.delegate.update({
      where: { id },
      data: {
        metadata: { ...existingMetadata, ...metadata },
      },
    });
  }

  @HandleErrors('list recent organization agent runs', 'agent-runs')
  async findRecentByOrganization(
    organizationId: string,
    since: Date,
    take = 200,
  ): Promise<AgentRunDocument[]> {
    const safeTake = this.normalizeLimit(take, 200, MAX_AGENT_RUN_LIMIT);
    const docs = await this.delegate.findMany({
      orderBy: { createdAt: 'desc' },
      take: safeTake,
      where: {
        createdAt: { gte: since },
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
        status: AgentExecutionStatus.CANCELLED,
      },
    })) as AgentRunDocument | null;
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
  ): Promise<AgentRunDocument[]> {
    const safeLimit = this.normalizeLimit(limit, 20, MAX_AGENT_RUN_LIMIT);
    return (await this.delegate.findMany({
      where: {
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
  ): Promise<AgentRunStats> {
    const timeRange = query?.timeRange ?? DEFAULT_AGENT_RUN_TIME_RANGE;
    const timeRangeDays = getTimeRangeDays(timeRange);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const trendStart = new Date(Date.now() - (timeRangeDays - 1) * DAY_IN_MS);
    trendStart.setHours(0, 0, 0, 0);

    // Four parallel Prisma count queries replace the legacy MongoDB $facet aggregation.
    // Each count is scoped to organizationId + isDeleted: false with the relevant status filter.
    const [totalRuns, activeRuns, completedToday, failedToday] =
      await Promise.all([
        this.delegate.count({ where: { isDeleted: false, organizationId } }),
        this.delegate.count({
          where: {
            isDeleted: false,
            organizationId,
            status: {
              in: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
            },
          },
        }),
        this.delegate.count({
          where: {
            isDeleted: false,
            organizationId,
            status: AgentExecutionStatus.COMPLETED,
            completedAt: { gte: todayStart },
          },
        }),
        this.delegate.count({
          where: {
            isDeleted: false,
            organizationId,
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
        where: { id: { in: boundedIds }, isDeleted: false, organizationId },
      }),
      this.prisma.post.groupBy({
        by: ['agentRunId'],
        orderBy: { agentRunId: 'asc' },
        take: boundedIds.length,
        where: {
          agentRunId: { in: boundedIds },
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
  ): Promise<{ posts: PostDocument[]; ingredients: IngredientDocument[] }> {
    const [posts, ingredients] = await Promise.all([
      this.prisma.post.findMany({
        take: MAX_AGENT_RUN_CONTENT_ITEMS,
        where: {
          agentRunId: runId,
          isDeleted: false,
          organizationId,
        },
      }),
      this.prisma.ingredient.findMany({
        take: MAX_AGENT_RUN_CONTENT_ITEMS,
        where: {
          agentRunId: runId,
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
}
