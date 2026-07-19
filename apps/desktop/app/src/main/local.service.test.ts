import { describe, expect, it } from 'bun:test';
import { DesktopLocalService } from './local.service';

const createPrismaMock = () => {
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

  it('rejects cloud-only actions without creating unsupported queue work', async () => {
    const prisma = createPrismaMock();
    const service = new DesktopLocalService(prisma as never);

    await expect(service.generateHooks('topic')).rejects.toThrow(
      'Configure a local generation provider',
    );
    await expect(
      service.publishPost({
        content: 'hello',
        platform: 'twitter',
      }),
    ).rejects.toThrow('Connect Genfeed Cloud');
    await expect(service.runAgent('agent-1')).rejects.toThrow(
      'Connect Genfeed Cloud',
    );
    await expect(
      service.runWorkflow({ workflowId: 'workflow-1' }),
    ).rejects.toThrow('Connect Genfeed Cloud');
  });

  it('uses the configured local provider for account-less generation', async () => {
    const prisma = createPrismaMock();
    const generation = {
      generateContent: async () => 'Generated on this device',
    };
    const service = new DesktopLocalService(prisma as never, generation);

    await expect(
      service.generateContent({
        platform: 'twitter',
        prompt: 'topic',
        publishIntent: 'review',
        sourceDraftId: 'draft-1',
        type: 'hook',
      }),
    ).resolves.toEqual({
      data: {
        content: 'Generated on this device',
        id: 'draft-1',
        platform: 'twitter',
        type: 'hook',
      },
      status: 'success',
    });
  });
});
