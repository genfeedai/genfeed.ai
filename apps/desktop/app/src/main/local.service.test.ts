import { describe, expect, it } from 'bun:test';
import { DesktopLocalService } from './local.service';

const createPrismaMock = () => {
  const syncJobs: Array<Record<string, unknown>> = [];

  return {
    agentStrategy: {
      findMany: async () => [
        {
          avatar: null,
          id: 'agent-1',
          isActive: true,
          lastRunAt: '2026-04-01T09:00:00.000Z',
          name: 'Trend Scout',
          platformsJson: '["twitter"]',
          status: 'active',
        },
      ],
    },
    desktopSyncJob: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        syncJobs.push(data);
        return data;
      },
    },
    desktopWorkspace: {
      findMany: async () => [
        {
          id: 'workspace-1',
          linkedProjectId: 'project-1',
          name: 'Workspace One',
          updatedAt: '2026-04-01T09:00:00.000Z',
        },
      ],
    },
    ingredient: {
      findMany: async () => [
        {
          content: 'Lead with the decision.',
          id: 'ingredient-1',
          platform: 'twitter',
          title: 'Metric-led hook',
          totalVotes: 12,
        },
      ],
    },
    post: {
      findMany: async () => [
        {
          content: 'Post one',
          engagements: 40,
          id: 'post-1',
          platform: 'twitter',
          views: 200,
        },
      ],
    },
    syncJobs,
    trend: {
      findMany: async () => [
        {
          engagementScore: 77,
          id: 'trend-1',
          platform: 'twitter',
          summary: 'Founder metrics.',
          topic: 'Metric threads',
          viralityScore: 88,
        },
      ],
    },
    workflow: {
      findMany: async () => [
        {
          description: 'Launch workflow',
          id: 'workflow-1',
          lastExecutedAt: '2026-04-01T09:30:00.000Z',
          lifecycle: 'published',
          nodeCount: 5,
          supportsBatch: true,
        },
      ],
    },
    workflowExecution: {
      findFirst: async () => ({
        completedAt: null,
        id: 'workflow-run-1',
        mode: 'batch',
        startedAt: '2026-04-01T09:30:00.000Z',
        status: 'running',
      }),
    },
  };
};

describe('DesktopLocalService', () => {
  it('returns local success results for read methods', async () => {
    const prisma = createPrismaMock();
    const service = new DesktopLocalService(prisma as never);

    await expect(service.listProjects()).resolves.toEqual({
      data: [{ id: 'project-1', name: 'Workspace One', status: 'local' }],
      status: 'success',
    });
    await expect(service.getTrends('twitter')).resolves.toEqual({
      data: [
        {
          engagementScore: 77,
          id: 'trend-1',
          platform: 'twitter',
          summary: 'Founder metrics.',
          topic: 'Metric threads',
          viralityScore: 88,
        },
      ],
      status: 'success',
    });
    await expect(service.getIngredients()).resolves.toEqual({
      data: [
        {
          content: 'Lead with the decision.',
          id: 'ingredient-1',
          platform: 'twitter',
          title: 'Metric-led hook',
          totalVotes: 12,
        },
      ],
      status: 'success',
    });
    await expect(service.listAgents()).resolves.toEqual({
      data: [
        {
          id: 'agent-1',
          isActive: true,
          lastRunAt: '2026-04-01T09:00:00.000Z',
          latestRun: undefined,
          name: 'Trend Scout',
          platforms: ['twitter'],
          recentRuns: [],
          status: 'active',
        },
      ],
      status: 'success',
    });
    await expect(service.listWorkflows()).resolves.toEqual({
      data: [
        {
          description: 'Launch workflow',
          id: 'workflow-1',
          lastExecutedAt: '2026-04-01T09:30:00.000Z',
          latestRun: {
            completedAt: undefined,
            id: 'workflow-run-1',
            mode: 'batch',
            startedAt: '2026-04-01T09:30:00.000Z',
            status: 'running',
          },
          lifecycle: 'published',
          name: 'workflow-1',
          nodeCount: 5,
          supportsBatch: true,
        },
      ],
      status: 'success',
    });
    await expect(service.getAnalytics({ days: 7 })).resolves.toEqual({
      data: {
        recentPosts: [
          {
            content: 'Post one',
            id: 'post-1',
            platform: 'twitter',
            views: 200,
          },
        ],
        topPlatform: 'twitter',
        totalEngagements: 40,
        totalPosts: 1,
        totalViews: 200,
      },
      status: 'success',
    });
  });

  it('queues offline-only actions instead of pretending they succeeded', async () => {
    const prisma = createPrismaMock();
    const service = new DesktopLocalService(prisma as never);

    const results = await Promise.all([
      service.generateHooks('topic'),
      service.generateContent({
        platform: 'twitter',
        prompt: 'topic',
        publishIntent: 'review',
        type: 'hook',
      }),
      service.publishPost({
        content: 'hello',
        platform: 'twitter',
      }),
      service.runAgent('agent-1'),
      service.runWorkflow({ workflowId: 'workflow-1' }),
    ]);

    for (const result of results) {
      expect(result.status).toBe('queued_offline');
      if (result.status === 'queued_offline') {
        expect(result.syncJobId).toEqual(expect.any(String));
        expect(result.message).toContain('Queued for sync');
      }
    }

    expect(prisma.syncJobs).toHaveLength(5);
  });
});
