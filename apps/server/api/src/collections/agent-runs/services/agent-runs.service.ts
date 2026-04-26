import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { UpdateAgentRunDto } from '@api/collections/agent-runs/dto/update-agent-run.dto';
import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AgentExecutionStatus } from '@genfeedai/enums';
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  UpdateAgentRunDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'agentRun', logger);
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
  async getActiveRuns(organizationId: string): Promise<AgentRunDocument[]> {
    return (await this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
        status: {
          in: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as AgentRunDocument[];
  }

  @HandleErrors('list recent runs', 'agent-runs')
  async listRecentRuns(
    organizationId: string,
    limit = 20,
  ): Promise<AgentRunDocument[]> {
    return (await this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) as AgentRunDocument[];
  }

  @HandleErrors('get thread runs', 'agent-runs')
  async getByThread(
    threadId: string,
    organizationId: string,
  ): Promise<AgentRunDocument[]> {
    return (await this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
        threadId,
      },
      orderBy: { createdAt: 'desc' },
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

    // TODO: Migrate MongoDB $facet aggregation to Prisma $queryRaw or multiple queries
    // This is a complex multi-facet aggregation. Using raw SQL equivalent below.
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

  @HandleErrors('get run content', 'agent-runs')
  async getRunContent(
    runId: string,
    organizationId: string,
  ): Promise<{ posts: PostDocument[]; ingredients: IngredientDocument[] }> {
    const [posts, ingredients] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          agentRunId: runId,
          isDeleted: false,
          organizationId,
        },
      }),
      this.prisma.ingredient.findMany({
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
}
