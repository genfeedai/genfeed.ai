import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { UpdateAgentRunDto } from '@api/collections/agent-runs/dto/update-agent-run.dto';
import {
  AgentRun,
  type AgentRunDocument,
} from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
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
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

type AgentRunQueryModel = {
  find: (filter: Record<string, unknown>) => {
    sort: (sort: Record<string, number>) => {
      limit: (limit: number) => {
        lean: () => {
          exec: () => Promise<AgentRunDocument[]>;
        };
      };
      lean: () => {
        exec: () => Promise<AgentRunDocument[]>;
      };
    };
  };
  findOne: (
    filter: Record<string, unknown>,
  ) => Promise<AgentRunDocument | null>;
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<AgentRunDocument | null>;
  updateOne: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => Promise<unknown>;
};

type AgentRunStatsSummary = Omit<
  AgentRunStats,
  'anomalies' | 'routingPaths' | 'timeRange' | 'trends'
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
  private get queryModel(): AgentRunQueryModel {
    return this.model as unknown as AgentRunQueryModel;
  }

  constructor(
    @InjectModel(AgentRun.name, DB_CONNECTIONS.AGENT)
    model: AggregatePaginateModel<AgentRunDocument>,
    private readonly prisma: PrismaService,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  @HandleErrors('start agent run', 'agent-runs')
  async start(
    id: string,
    organizationId: string,
  ): Promise<AgentRunDocument | null> {
    return await this.queryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        startedAt: new Date(),
        status: AgentExecutionStatus.RUNNING,
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('get agent run', 'agent-runs')
  async getById(
    id: string,
    organizationId: string,
  ): Promise<AgentRunDocument | null> {
    return await this.queryModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
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
    await this.queryModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $inc: { creditsUsed: toolCall.creditsUsed },
        $push: {
          toolCalls: {
            ...toolCall,
            executedAt: new Date(),
          },
        },
      },
    );
  }

  @HandleErrors('update progress', 'agent-runs')
  async updateProgress(
    id: string,
    organizationId: string,
    progress: number,
  ): Promise<void> {
    await this.queryModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: { progress: Math.min(100, Math.max(0, progress)) } },
    );
  }

  @HandleErrors('merge agent run metadata', 'agent-runs')
  async mergeMetadata(
    id: string,
    organizationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const metadataSet = Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        `metadata.${key}`,
        value,
      ]),
    );

    await this.queryModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: metadataSet,
      },
    );
  }

  @HandleErrors('complete agent run', 'agent-runs')
  async complete(
    id: string,
    organizationId: string,
    summary?: string,
  ): Promise<AgentRunDocument | null> {
    const completedAt = new Date();
    const run = await this.queryModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!run) return null;

    const durationMs = run.startedAt
      ? completedAt.getTime() - run.startedAt.getTime()
      : 0;

    return await this.queryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        completedAt,
        durationMs,
        progress: 100,
        status: AgentExecutionStatus.COMPLETED,
        ...(summary && { summary }),
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('fail agent run', 'agent-runs')
  async fail(
    id: string,
    organizationId: string,
    error: string,
  ): Promise<AgentRunDocument | null> {
    const completedAt = new Date();
    const run = await this.queryModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!run) return null;

    const durationMs = run.startedAt
      ? completedAt.getTime() - run.startedAt.getTime()
      : 0;

    return await this.queryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $inc: { retryCount: 1 },
        $set: {
          completedAt,
          durationMs,
          error,
          status: AgentExecutionStatus.FAILED,
        },
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('cancel agent run', 'agent-runs')
  async cancel(
    id: string,
    organizationId: string,
  ): Promise<AgentRunDocument | null> {
    const completedAt = new Date();
    const run = await this.queryModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!run) return null;

    const durationMs = run.startedAt
      ? completedAt.getTime() - run.startedAt.getTime()
      : 0;

    return await this.queryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        completedAt,
        durationMs,
        status: AgentExecutionStatus.CANCELLED,
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('get active runs', 'agent-runs')
  async getActiveRuns(organizationId: string): Promise<AgentRunDocument[]> {
    return await this.queryModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        status: {
          $in: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
        },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  @HandleErrors('list recent runs', 'agent-runs')
  async listRecentRuns(
    organizationId: string,
    limit = 20,
  ): Promise<AgentRunDocument[]> {
    return await this.queryModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  @HandleErrors('get thread runs', 'agent-runs')
  async getByThread(
    threadId: string,
    organizationId: string,
  ): Promise<AgentRunDocument[]> {
    return await this.queryModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: new Types.ObjectId(threadId),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
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

    const stats = await this.model.aggregate<AgentRunStatsAggregateResult>([
      {
        $match: {
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
      },
      {
        $facet: {
          routingPaths: [
            {
              $match: {
                'metadata.actualModel': {
                  $exists: true,
                  $ne: null,
                  $type: 'string',
                },
                'metadata.requestedModel': {
                  $exists: true,
                  $ne: null,
                  $type: 'string',
                },
              },
            },
            {
              $group: {
                _id: {
                  actualModel: '$metadata.actualModel',
                  requestedModel: '$metadata.requestedModel',
                },
                count: { $sum: 1 },
              },
            },
            {
              $sort: {
                '_id.actualModel': 1,
                '_id.requestedModel': 1,
                count: -1,
              },
            },
            { $limit: 8 },
            {
              $project: {
                _id: 0,
                actualModel: '$_id.actualModel',
                count: 1,
                requestedModel: '$_id.requestedModel',
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                activeRuns: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          '$status',
                          [
                            AgentExecutionStatus.PENDING,
                            AgentExecutionStatus.RUNNING,
                          ],
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                autoRoutedRuns: {
                  $sum: {
                    $cond: [
                      { $eq: ['$metadata.requestedModel', 'openrouter/auto'] },
                      1,
                      0,
                    ],
                  },
                },
                completedToday: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$status', AgentExecutionStatus.COMPLETED] },
                          { $gte: ['$completedAt', todayStart] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                failedToday: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$status', AgentExecutionStatus.FAILED] },
                          { $gte: ['$completedAt', todayStart] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                totalCreditsToday: {
                  $sum: {
                    $cond: [
                      { $gte: ['$createdAt', todayStart] },
                      '$creditsUsed',
                      0,
                    ],
                  },
                },
                totalRuns: { $sum: 1 },
                webEnabledRuns: {
                  $sum: {
                    $cond: [
                      { $eq: ['$metadata.webSearchEnabled', true] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          topActualModels: [
            {
              $match: {
                'metadata.actualModel': {
                  $exists: true,
                  $ne: null,
                  $type: 'string',
                },
              },
            },
            {
              $group: {
                _id: '$metadata.actualModel',
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1, count: -1 } },
            { $limit: 5 },
            {
              $project: {
                _id: 0,
                count: 1,
                model: '$_id',
              },
            },
          ],
          topRequestedModels: [
            {
              $match: {
                'metadata.requestedModel': {
                  $exists: true,
                  $ne: null,
                  $type: 'string',
                },
              },
            },
            {
              $group: {
                _id: '$metadata.requestedModel',
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1, count: -1 } },
            { $limit: 5 },
            {
              $project: {
                _id: 0,
                count: 1,
                model: '$_id',
              },
            },
          ],
          trends: [
            {
              $match: {
                createdAt: { $gte: trendStart },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: '$createdAt',
                    format: '%Y-%m-%d',
                  },
                },
                autoRoutedRuns: {
                  $sum: {
                    $cond: [
                      { $eq: ['$metadata.requestedModel', 'openrouter/auto'] },
                      1,
                      0,
                    ],
                  },
                },
                totalCreditsUsed: { $sum: { $ifNull: ['$creditsUsed', 0] } },
                totalRuns: { $sum: 1 },
                webEnabledRuns: {
                  $sum: {
                    $cond: [
                      { $eq: ['$metadata.webSearchEnabled', true] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                autoRoutedRuns: 1,
                bucket: '$_id',
                totalCreditsUsed: 1,
                totalRuns: 1,
                webEnabledRuns: 1,
              },
            },
          ],
        },
      },
    ]);

    const summary = stats[0]?.summary?.[0];
    const topActualModels = stats[0]?.topActualModels ?? [];
    const trends = (stats[0]?.trends ?? []).map(toTrendPoint);

    if (!summary) {
      return {
        activeRuns: 0,
        anomalies: [],
        autoRoutedRuns: 0,
        completedToday: 0,
        failedToday: 0,
        routingPaths: [],
        timeRange,
        topActualModels: [],
        topRequestedModels: [],
        totalCreditsToday: 0,
        totalRuns: 0,
        trends: [],
        webEnabledRuns: 0,
      };
    }

    return {
      ...summary,
      anomalies: detectAgentRunAnomalies(
        trends,
        summary.totalRuns,
        topActualModels,
      ),
      routingPaths: stats[0]?.routingPaths ?? [],
      timeRange,
      topActualModels,
      topRequestedModels: stats[0]?.topRequestedModels ?? [],
      trends,
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
