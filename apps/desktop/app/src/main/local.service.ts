import { randomUUID } from 'node:crypto';
import type {
  DesktopContentPlatform,
  IDesktopAgent,
  IDesktopAgentRunResult,
  IDesktopAnalytics,
  IDesktopCloudProject,
  IDesktopDataService,
  IDesktopGeneratedContent,
  IDesktopGenerationOptions,
  IDesktopIngredient,
  IDesktopPublishResult,
  IDesktopWorkflow,
  IDesktopWorkflowRunResult,
} from '@genfeedai/desktop-contracts';
import type { DesktopGenerationService } from './generation.service';
import type { DesktopPrismaService } from './prisma.service';

const LOCAL_ORGANIZATION_ID = 'desktop-local-org';
const LOCAL_DEFAULT_PROJECT_ID = 'desktop-local-project';

const DEFAULT_TRENDS: Array<{
  engagementScore: number;
  platform: DesktopContentPlatform;
  summary: string;
  topic: string;
  viralityScore: number;
}> = [
  {
    engagementScore: 74,
    platform: 'twitter',
    summary: 'Founder takes with a concrete metric and one contrarian lesson.',
    topic: 'Founders sharing a metric that changed how they operate',
    viralityScore: 81,
  },
  {
    engagementScore: 69,
    platform: 'twitter',
    summary: 'Before/after workflow threads with screenshots and one mistake.',
    topic: 'Threaded breakdowns of AI-assisted product shipping',
    viralityScore: 78,
  },
  {
    engagementScore: 76,
    platform: 'instagram',
    summary: 'Carousel-style checklists with a strong first-frame headline.',
    topic: 'Three-step content systems for small teams',
    viralityScore: 73,
  },
  {
    engagementScore: 84,
    platform: 'linkedin',
    summary: 'Operator lessons framed as a decision memo instead of advice.',
    topic: 'Revenue lessons from founders who replaced meetings with systems',
    viralityScore: 71,
  },
  {
    engagementScore: 82,
    platform: 'tiktok',
    summary:
      'Direct voiceover scripts with a pattern interrupt in the first 2 seconds.',
    topic: 'Fast teardown videos of product positioning mistakes',
    viralityScore: 88,
  },
  {
    engagementScore: 79,
    platform: 'youtube',
    summary: 'Longer walkthrough content anchored in one repeatable framework.',
    topic: 'How creators turn one idea into a week of cross-platform content',
    viralityScore: 75,
  },
];

const DEFAULT_INGREDIENTS: Array<{
  content: string;
  platform?: string;
  title: string;
  totalVotes: number;
}> = [
  {
    content:
      'Lead with the decision, then explain the constraint that forced it.',
    platform: 'linkedin',
    title: 'Decision-first LinkedIn opener',
    totalVotes: 42,
  },
  {
    content:
      'Use a hard number in line one, then reveal the tradeoff in line two.',
    platform: 'twitter',
    title: 'Metric-led hook',
    totalVotes: 37,
  },
  {
    content:
      'Cut to the mistake first, then rewind into the system that fixes it.',
    platform: 'tiktok',
    title: 'Mistake-first short-form script',
    totalVotes: 31,
  },
  {
    content:
      'Frame the post as a checklist your future team can audit against.',
    platform: 'instagram',
    title: 'Checklist carousel backbone',
    totalVotes: 28,
  },
];

const DEFAULT_AGENTS: Array<{
  avatar?: string;
  name: string;
  platforms: string[];
  status: 'active' | 'paused';
}> = [
  {
    name: 'Trend Scout',
    platforms: ['twitter', 'linkedin'],
    status: 'active',
  },
  {
    name: 'Repurpose Operator',
    platforms: ['instagram', 'tiktok'],
    status: 'active',
  },
  {
    name: 'Workflow QA',
    platforms: ['youtube'],
    status: 'paused',
  },
];

const DEFAULT_WORKFLOWS: Array<{
  description?: string;
  lifecycle: 'archived' | 'draft' | 'published';
  name: string;
  nodeCount: number;
  supportsBatch: boolean;
}> = [
  {
    description: 'Generate hooks, draft copy, and a publishing checklist.',
    lifecycle: 'published',
    name: 'Launch Post',
    nodeCount: 6,
    supportsBatch: false,
  },
  {
    description: 'Take one insight and fan it out across short-form surfaces.',
    lifecycle: 'published',
    name: 'Repurpose Sprint',
    nodeCount: 9,
    supportsBatch: true,
  },
  {
    description: 'Review drafts queued for founder sign-off.',
    lifecycle: 'draft',
    name: 'Review Queue',
    nodeCount: 4,
    supportsBatch: false,
  },
];

const toIso = (): string => new Date().toISOString();

function buildHookVariants(topic: string): string[] {
  const trimmed = topic.trim() || 'this idea';

  return [
    `The fastest way to make ${trimmed} useful is to cut the first 20% of the process.`,
    `Most teams overcomplicate ${trimmed}. Start with one hard constraint instead.`,
    `If ${trimmed} feels slow, your bottleneck is probably approvals, not effort.`,
  ];
}

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

export interface DesktopLocalIdentitySnapshot {
  clerkId: string | null;
  localUserId: string;
  userEmail?: string;
  userName?: string;
}

export class DesktopLocalService implements IDesktopDataService {
  constructor(
    private readonly prismaService: DesktopPrismaService,
    private readonly generationService: DesktopGenerationService,
    private readonly getIdentity: () => DesktopLocalIdentitySnapshot,
  ) {}

  async ensureBootstrapData(): Promise<void> {
    const client = await this.prismaService.getClient();
    const now = toIso();
    const identity = this.getIdentity();

    await client.desktopOrganization.upsert({
      create: {
        createdAt: now,
        id: LOCAL_ORGANIZATION_ID,
        name: 'Local Workspace',
        slug: 'local-workspace',
        updatedAt: now,
      },
      update: {
        name: 'Local Workspace',
        updatedAt: now,
      },
      where: {
        id: LOCAL_ORGANIZATION_ID,
      },
    });

    await client.desktopUser.upsert({
      create: {
        clerkId: identity.clerkId,
        createdAt: now,
        email: identity.userEmail ?? null,
        id: identity.localUserId,
        name: identity.userName ?? 'Local Desktop User',
        organizationId: LOCAL_ORGANIZATION_ID,
        updatedAt: now,
      },
      update: {
        clerkId: identity.clerkId,
        email: identity.userEmail ?? null,
        name: identity.userName ?? 'Local Desktop User',
        updatedAt: now,
      },
      where: {
        id: identity.localUserId,
      },
    });

    await client.desktopProject.upsert({
      create: {
        createdAt: now,
        id: LOCAL_DEFAULT_PROJECT_ID,
        name: 'Local Drafts',
        organizationId: LOCAL_ORGANIZATION_ID,
        status: 'active',
        updatedAt: now,
      },
      update: {
        name: 'Local Drafts',
        status: 'active',
        updatedAt: now,
      },
      where: {
        id: LOCAL_DEFAULT_PROJECT_ID,
      },
    });

    if ((await client.desktopTrend.count()) === 0) {
      await client.desktopTrend.createMany({
        data: DEFAULT_TRENDS.map((trend) => ({
          createdAt: now,
          engagementScore: trend.engagementScore,
          id: randomUUID(),
          organizationId: LOCAL_ORGANIZATION_ID,
          platform: trend.platform,
          summary: trend.summary,
          topic: trend.topic,
          viralityScore: trend.viralityScore,
        })),
      });
    }

    if ((await client.desktopIngredient.count()) === 0) {
      await client.desktopIngredient.createMany({
        data: DEFAULT_INGREDIENTS.map((ingredient) => ({
          content: ingredient.content,
          createdAt: now,
          id: randomUUID(),
          organizationId: LOCAL_ORGANIZATION_ID,
          platform: ingredient.platform ?? null,
          title: ingredient.title,
          totalVotes: ingredient.totalVotes,
          updatedAt: now,
        })),
      });
    }

    if ((await client.desktopAgent.count()) === 0) {
      await client.desktopAgent.createMany({
        data: DEFAULT_AGENTS.map((agent) => ({
          avatar: agent.avatar ?? null,
          createdAt: now,
          id: randomUUID(),
          isActive: agent.status === 'active',
          name: agent.name,
          organizationId: LOCAL_ORGANIZATION_ID,
          platformsJson: JSON.stringify(agent.platforms),
          status: agent.status,
          updatedAt: now,
        })),
      });
    }

    if ((await client.desktopWorkflow.count()) === 0) {
      await client.desktopWorkflow.createMany({
        data: DEFAULT_WORKFLOWS.map((workflow) => ({
          createdAt: now,
          description: workflow.description ?? null,
          id: randomUUID(),
          lastExecutedAt: null,
          lifecycle: workflow.lifecycle,
          name: workflow.name,
          nodeCount: workflow.nodeCount,
          organizationId: LOCAL_ORGANIZATION_ID,
          supportsBatch: workflow.supportsBatch,
          updatedAt: now,
        })),
      });
    }
  }

  async listProjects(): Promise<IDesktopCloudProject[]> {
    const client = await this.prismaService.getClient();
    const projects = await client.desktopProject.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
      },
    });

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
    }));
  }

  async generateHooks(topic: string): Promise<string[]> {
    return buildHookVariants(topic);
  }

  async generateContent(
    params: IDesktopGenerationOptions,
  ): Promise<IDesktopGeneratedContent> {
    const client = await this.prismaService.getClient();
    const now = toIso();
    const hooks = buildHookVariants(params.sourceTrendTopic ?? params.prompt);
    const generatedContent =
      await this.generationService.generateContent(params);
    const contentItemId = randomUUID();

    await client.desktopContentItem.create({
      data: {
        content: generatedContent,
        createdAt: now,
        engagements: 0,
        id: contentItemId,
        organizationId: LOCAL_ORGANIZATION_ID,
        platform: params.platform,
        projectId: params.projectId ?? LOCAL_DEFAULT_PROJECT_ID,
        prompt: params.prompt,
        publishIntent: params.publishIntent,
        sourceDraftId: params.sourceDraftId ?? null,
        sourceTrendId: params.sourceTrendId ?? null,
        sourceTrendTopic: params.sourceTrendTopic ?? null,
        status: 'generated',
        type: params.type,
        updatedAt: now,
        views: 0,
      },
    });

    await client.desktopIngredient.create({
      data: {
        content: generatedContent,
        createdAt: now,
        id: randomUUID(),
        organizationId: LOCAL_ORGANIZATION_ID,
        platform: params.platform,
        sourceContentItemId: contentItemId,
        title: `${params.platform} ${params.type}`,
        totalVotes: 0,
        updatedAt: now,
      },
    });

    return {
      content: generatedContent,
      hooks,
      id: contentItemId,
      platform: params.platform,
      type: params.type,
    };
  }

  async getTrends(platform: string) {
    const client = await this.prismaService.getClient();
    const trends = await client.desktopTrend.findMany({
      orderBy: [{ viralityScore: 'desc' }, { engagementScore: 'desc' }],
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
        platform,
      },
    });

    return trends.map((trend) => ({
      engagementScore: trend.engagementScore,
      id: trend.id,
      platform: trend.platform,
      summary: trend.summary ?? undefined,
      topic: trend.topic,
      viralityScore: trend.viralityScore,
    }));
  }

  async getIngredients(filter?: {
    limit?: number;
    platform?: string;
  }): Promise<IDesktopIngredient[]> {
    const client = await this.prismaService.getClient();
    const ingredients = await client.desktopIngredient.findMany({
      orderBy: [{ totalVotes: 'desc' }, { updatedAt: 'desc' }],
      take: filter?.limit,
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
        ...(filter?.platform ? { platform: filter.platform } : {}),
      },
    });

    return ingredients.map((ingredient) => ({
      content: ingredient.content,
      id: ingredient.id,
      platform: ingredient.platform ?? undefined,
      title: ingredient.title,
      totalVotes: ingredient.totalVotes,
    }));
  }

  async publishPost(params: {
    content: string;
    draftId?: string;
    platform: string;
  }): Promise<IDesktopPublishResult> {
    const client = await this.prismaService.getClient();
    const now = toIso();
    const existing = params.draftId
      ? await client.desktopContentItem.findFirst({
          where: {
            sourceDraftId: params.draftId,
          },
        })
      : null;

    const views = params.content.length * 17;
    const engagements = Math.max(12, Math.floor(params.content.length / 8));

    if (existing) {
      await client.desktopContentItem.update({
        data: {
          content: params.content,
          engagements,
          platform: params.platform,
          publishedAt: now,
          status: 'published',
          updatedAt: now,
          views,
        },
        where: {
          id: existing.id,
        },
      });

      return {
        platform: params.platform,
        postId: existing.id,
        publishedAt: now,
        status: 'published',
      };
    }

    const created = await client.desktopContentItem.create({
      data: {
        content: params.content,
        createdAt: now,
        engagements,
        id: randomUUID(),
        organizationId: LOCAL_ORGANIZATION_ID,
        platform: params.platform,
        projectId: LOCAL_DEFAULT_PROJECT_ID,
        prompt: params.content,
        publishIntent: 'publish',
        publishedAt: now,
        sourceDraftId: params.draftId ?? null,
        status: 'published',
        type: 'post',
        updatedAt: now,
        views,
      },
    });

    return {
      platform: params.platform,
      postId: created.id,
      publishedAt: now,
      status: 'published',
    };
  }

  async getAnalytics(params: { days: number }): Promise<IDesktopAnalytics> {
    const client = await this.prismaService.getClient();
    const since = new Date(
      Date.now() - params.days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const items = await client.desktopContentItem.findMany({
      orderBy: {
        publishedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
        status: 'published',
        ...(since ? { publishedAt: { gte: since } } : {}),
      },
    });

    const platformStats = new Map<string, number>();
    for (const item of items) {
      platformStats.set(
        item.platform,
        (platformStats.get(item.platform) ?? 0) + item.views,
      );
    }

    const topPlatform =
      [...platformStats.entries()].sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0] ?? 'local';

    return {
      recentPosts: items.slice(0, 5).map((item) => ({
        content: item.content,
        id: item.id,
        platform: item.platform,
        views: item.views,
      })),
      topPlatform,
      totalEngagements: items.reduce(
        (total, item) => total + item.engagements,
        0,
      ),
      totalPosts: items.length,
      totalViews: items.reduce((total, item) => total + item.views, 0),
    };
  }

  async listAgents(): Promise<IDesktopAgent[]> {
    const client = await this.prismaService.getClient();
    const agents = await client.desktopAgent.findMany({
      include: {
        runs: {
          orderBy: {
            startedAt: 'desc',
          },
          take: 5,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
      },
    });

    return agents.map((agent) => ({
      avatar: agent.avatar ?? undefined,
      id: agent.id,
      isActive: agent.isActive,
      lastRunAt: agent.lastRunAt ?? undefined,
      latestRun: agent.runs[0]
        ? {
            completedAt: agent.runs[0].completedAt ?? undefined,
            id: agent.runs[0].id,
            startedAt: agent.runs[0].startedAt,
            status: agent.runs[0].status as
              | 'completed'
              | 'failed'
              | 'pending'
              | 'running',
          }
        : undefined,
      name: agent.name,
      platforms: parsePlatforms(agent.platformsJson),
      recentRuns: agent.runs.map((run) => ({
        completedAt: run.completedAt ?? undefined,
        id: run.id,
        startedAt: run.startedAt,
        status: run.status as 'completed' | 'failed' | 'pending' | 'running',
      })),
      status: agent.status as 'active' | 'paused',
    }));
  }

  async runAgent(agentId: string): Promise<IDesktopAgentRunResult> {
    const client = await this.prismaService.getClient();
    const now = toIso();
    const runId = randomUUID();

    await client.desktopAgentRun.create({
      data: {
        agentId,
        completedAt: now,
        id: runId,
        startedAt: now,
        status: 'completed',
      },
    });

    await client.desktopAgent.update({
      data: {
        lastRunAt: now,
        updatedAt: now,
      },
      where: {
        id: agentId,
      },
    });

    return {
      runId,
      status: 'running',
    };
  }

  async listWorkflows(): Promise<IDesktopWorkflow[]> {
    const client = await this.prismaService.getClient();
    const workflows = await client.desktopWorkflow.findMany({
      include: {
        runs: {
          orderBy: {
            startedAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        organizationId: LOCAL_ORGANIZATION_ID,
      },
    });

    return workflows.map((workflow) => ({
      description: workflow.description ?? undefined,
      id: workflow.id,
      lastExecutedAt: workflow.lastExecutedAt ?? undefined,
      latestRun: workflow.runs[0]
        ? {
            completedAt: workflow.runs[0].completedAt ?? undefined,
            id: workflow.runs[0].id,
            mode: workflow.runs[0].mode === 'batch' ? 'batch' : 'single',
            startedAt: workflow.runs[0].startedAt,
            status: workflow.runs[0].status as
              | 'completed'
              | 'failed'
              | 'pending'
              | 'running',
          }
        : undefined,
      lifecycle: workflow.lifecycle as 'archived' | 'draft' | 'published',
      name: workflow.name,
      nodeCount: workflow.nodeCount,
      supportsBatch: workflow.supportsBatch,
    }));
  }

  async runWorkflow(params: {
    batch?: boolean;
    workflowId: string;
  }): Promise<IDesktopWorkflowRunResult> {
    const client = await this.prismaService.getClient();
    const now = toIso();
    const runId = randomUUID();

    await client.desktopWorkflowRun.create({
      data: {
        completedAt: now,
        id: runId,
        mode: params.batch ? 'batch' : 'single',
        startedAt: now,
        status: 'completed',
        workflowId: params.workflowId,
      },
    });

    await client.desktopWorkflow.update({
      data: {
        lastExecutedAt: now,
        updatedAt: now,
      },
      where: {
        id: params.workflowId,
      },
    });

    return {
      runId,
      status: 'running',
    };
  }
}
