import { randomUUID } from 'node:crypto';
import type {
  IDesktopAgent,
  IDesktopAgentRunResult,
  IDesktopAnalytics,
  IDesktopCloudProject,
  IDesktopDataResult,
  IDesktopDataService,
  IDesktopGeneratedContent,
  IDesktopGenerationOptions,
  IDesktopIngredient,
  IDesktopPublishResult,
  IDesktopTrend,
  IDesktopWorkflow,
  IDesktopWorkflowRunResult,
} from '@genfeedai/desktop-contracts';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { toIso } from './time.util';

const LOCAL_ORGANIZATION_ID = 'local-org';
const OFFLINE_MESSAGE = 'Queued for sync - will complete when you sign in';

function parsePlatforms(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

export class DesktopLocalService implements IDesktopDataService {
  constructor(private readonly prisma: PrismaClient) {}

  async listProjects(): Promise<IDesktopDataResult<IDesktopCloudProject[]>> {
    const workspaces = await this.prisma.desktopWorkspace.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return {
      data: workspaces.map((workspace) => ({
        id: workspace.linkedProjectId ?? workspace.id,
        name: workspace.name,
        status: 'local',
      })),
      status: 'success',
    };
  }

  async getTrends(
    platform: string,
  ): Promise<IDesktopDataResult<IDesktopTrend[]>> {
    const trends = await this.prisma.trend.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
        platform,
      },
    });

    return {
      data: trends.map((trend) => ({
        engagementScore: trend.engagementScore,
        id: trend.id,
        platform: trend.platform,
        summary: trend.summary ?? undefined,
        topic: trend.topic,
        viralityScore: trend.viralityScore,
      })),
      status: 'success',
    };
  }

  async getIngredients(filter?: {
    limit?: number;
    platform?: string;
  }): Promise<IDesktopDataResult<IDesktopIngredient[]>> {
    const ingredients = await this.prisma.ingredient.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      take: filter?.limit,
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
        ...(filter?.platform ? { platform: filter.platform } : {}),
      },
    });

    return {
      data: ingredients.map((ingredient) => ({
        content: ingredient.content,
        id: ingredient.id,
        platform: ingredient.platform ?? undefined,
        title: ingredient.title,
        totalVotes: ingredient.totalVotes,
      })),
      status: 'success',
    };
  }

  async listAgents(): Promise<IDesktopDataResult<IDesktopAgent[]>> {
    const agents = await this.prisma.agentStrategy.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
      },
    });

    return {
      data: agents.map((agent) => ({
        avatar: agent.avatar ?? undefined,
        id: agent.id,
        isActive: agent.isActive,
        lastRunAt: agent.lastRunAt ?? undefined,
        latestRun: undefined,
        name: agent.name,
        platforms: parsePlatforms(agent.platformsJson),
        recentRuns: [],
        status: agent.status as IDesktopAgent['status'],
      })),
      status: 'success',
    };
  }

  async listWorkflows(): Promise<IDesktopDataResult<IDesktopWorkflow[]>> {
    const workflows = await this.prisma.workflow.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
      },
    });

    const data = await Promise.all(
      workflows.map(async (workflow) => {
        const latestRun = await this.prisma.workflowExecution.findFirst({
          orderBy: {
            startedAt: 'desc',
          },
          where: {
            workflowId: workflow.id,
          },
        });

        return {
          description: workflow.description ?? undefined,
          id: workflow.id,
          lastExecutedAt: workflow.lastExecutedAt ?? undefined,
          latestRun: latestRun
            ? {
                completedAt: latestRun.completedAt ?? undefined,
                id: latestRun.id,
                mode: latestRun.mode as 'batch' | 'single',
                startedAt: latestRun.startedAt,
                status: latestRun.status as
                  | 'completed'
                  | 'failed'
                  | 'pending'
                  | 'running',
              }
            : undefined,
          lifecycle: workflow.lifecycle as 'archived' | 'draft' | 'published',
          name: workflow.name || workflow.id,
          nodeCount: workflow.nodeCount,
          supportsBatch: workflow.supportsBatch,
        } satisfies IDesktopWorkflow;
      }),
    );

    return { data, status: 'success' };
  }

  async getAnalytics(params: {
    days: number;
  }): Promise<IDesktopDataResult<IDesktopAnalytics>> {
    const cutoff = new Date(
      Date.now() - params.days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const posts = await this.prisma.post.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
        updatedAt: {
          gte: cutoff,
        },
      },
    });

    const totalsByPlatform = new Map<string, number>();
    for (const post of posts) {
      totalsByPlatform.set(
        post.platform,
        (totalsByPlatform.get(post.platform) ?? 0) + 1,
      );
    }

    let topPlatform = 'unknown';
    let topPlatformCount = -1;
    for (const [platform, count] of totalsByPlatform.entries()) {
      if (count > topPlatformCount) {
        topPlatform = platform;
        topPlatformCount = count;
      }
    }

    return {
      data: {
        recentPosts: posts.slice(0, 5).map((post) => ({
          content: post.content,
          id: post.id,
          platform: post.platform,
          views: post.views,
        })),
        topPlatform,
        totalEngagements: posts.reduce(
          (sum, post) => sum + post.engagements,
          0,
        ),
        totalPosts: posts.length,
        totalViews: posts.reduce((sum, post) => sum + post.views, 0),
      },
      status: 'success',
    };
  }

  async generateHooks(topic: string): Promise<IDesktopDataResult<string[]>> {
    return this.queueOfflineJob('generateHooks', { topic });
  }

  async generateContent(
    params: IDesktopGenerationOptions,
  ): Promise<IDesktopDataResult<IDesktopGeneratedContent>> {
    return this.queueOfflineJob('generateContent', {
      ...params,
    });
  }

  async publishPost(params: {
    content: string;
    draftId?: string;
    platform: string;
  }): Promise<IDesktopDataResult<IDesktopPublishResult>> {
    return this.queueOfflineJob('publishPost', params);
  }

  async runAgent(
    agentId: string,
  ): Promise<IDesktopDataResult<IDesktopAgentRunResult>> {
    return this.queueOfflineJob('runAgent', { agentId });
  }

  async runWorkflow(params: {
    batch?: boolean;
    workflowId: string;
  }): Promise<IDesktopDataResult<IDesktopWorkflowRunResult>> {
    return this.queueOfflineJob('runWorkflow', params);
  }

  private async queueOfflineJob<T>(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<IDesktopDataResult<T>> {
    const now = toIso();
    const job = await this.prisma.desktopSyncJob.create({
      data: {
        createdAt: now,
        id: randomUUID(),
        payload: JSON.stringify(payload),
        retryCount: 0,
        status: 'pending',
        type,
        updatedAt: now,
      },
    });

    return {
      message: OFFLINE_MESSAGE,
      status: 'queued_offline',
      syncJobId: job.id,
    };
  }
}
