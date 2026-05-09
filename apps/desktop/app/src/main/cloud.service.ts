import type {
  IDesktopAgent,
  IDesktopAgentRunResult,
  IDesktopAnalytics,
  IDesktopCloudProject,
  IDesktopDataResult,
  IDesktopDataService,
  IDesktopEnvironment,
  IDesktopGeneratedContent,
  IDesktopGenerationOptions,
  IDesktopIngredient,
  IDesktopPublishResult,
  IDesktopSession,
  IDesktopTrend,
  IDesktopWorkflow,
  IDesktopWorkflowRunResult,
} from '@genfeedai/desktop-contracts';

export class DesktopCloudService implements IDesktopDataService {
  constructor(
    private readonly environment: IDesktopEnvironment,
    private readonly getSession: () => IDesktopSession | null,
  ) {}

  private requireSession(session: IDesktopSession | null): IDesktopSession {
    if (!session) {
      throw new Error('Desktop session is required');
    }

    return session;
  }

  private async fetchJson<T>(pathname: string, init?: RequestInit): Promise<T> {
    const activeSession = this.requireSession(this.getSession());
    const response = await fetch(`${this.environment.apiEndpoint}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${activeSession.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(
        `Desktop cloud request failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  async listProjects(): Promise<IDesktopDataResult<IDesktopCloudProject[]>> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>('/editor-projects');

    return {
      data: (response.data ?? []).map((project) => ({
        id: project.id ?? '',
        name: String(project.attributes?.name ?? 'Untitled Project'),
        status: project.attributes?.status
          ? String(project.attributes.status)
          : undefined,
      })),
      status: 'success',
    };
  }

  async generateHooks(topic: string): Promise<IDesktopDataResult<string[]>> {
    const response = await this.fetchJson<{ hooks: string[] }>(
      '/posts/hook-generations',
      {
        body: JSON.stringify({
          platform: 'twitter',
          topic,
        }),
        method: 'POST',
      },
    );

    return {
      data: response.hooks,
      status: 'success',
    };
  }

  async generateContent(
    params: IDesktopGenerationOptions,
  ): Promise<IDesktopDataResult<IDesktopGeneratedContent>> {
    const response = await this.fetchJson<{ hooks?: string[] }>(
      '/posts/hook-generations',
      {
        body: JSON.stringify({
          count: 1,
          platform: params.platform,
          topic: params.sourceTrendTopic ?? params.prompt,
        }),
        method: 'POST',
      },
    );
    const generatedContent = response.hooks?.[0];

    if (!generatedContent) {
      throw new Error('Genfeed server returned no generated content.');
    }

    return {
      data: {
        content: generatedContent,
        hooks: response.hooks,
        id: params.sourceDraftId ?? '',
        platform: params.platform,
        type: params.type,
      },
      status: 'success',
    };
  }

  async getTrends(
    platform: string,
  ): Promise<IDesktopDataResult<IDesktopTrend[]>> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>(`/trends?platform=${encodeURIComponent(platform)}`);

    return {
      data: (response.data ?? []).map((item) => ({
        engagementScore: Number(item.attributes?.engagementScore ?? 0),
        id: String(item.id ?? ''),
        platform: String(item.attributes?.platform ?? platform),
        summary: item.attributes?.summary
          ? String(item.attributes.summary)
          : undefined,
        topic: String(item.attributes?.topic ?? ''),
        viralityScore: Number(item.attributes?.viralityScore ?? 0),
      })),
      status: 'success',
    };
  }

  async getIngredients(filter?: {
    limit?: number;
    platform?: string;
  }): Promise<IDesktopDataResult<IDesktopIngredient[]>> {
    const params = new URLSearchParams();
    if (filter?.platform) {
      params.set('platform', filter.platform);
    }
    if (filter?.limit) {
      params.set('limit', String(filter.limit));
    }
    const query = params.toString();
    const pathname = query ? `/ingredients?${query}` : '/ingredients';

    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>(pathname);

    return {
      data: (response.data ?? []).map((item) => ({
        content: String(item.attributes?.content ?? ''),
        id: String(item.id ?? ''),
        platform: item.attributes?.platform
          ? String(item.attributes.platform)
          : undefined,
        title: String(item.attributes?.title ?? 'Untitled'),
        totalVotes: Number(item.attributes?.totalVotes ?? 0),
      })),
      status: 'success',
    };
  }

  async publishPost(params: {
    content: string;
    draftId?: string;
    platform: string;
  }): Promise<IDesktopDataResult<IDesktopPublishResult>> {
    const publishedAt = new Date().toISOString();

    if (params.draftId) {
      const response = await this.fetchJson<{
        data?: { id?: string };
      }>(`/posts/${params.draftId}/publish`, {
        body: JSON.stringify({
          content: params.content,
          platform: params.platform,
        }),
        method: 'POST',
      });
      return {
        data: {
          platform: params.platform,
          postId: String(response.data?.id ?? params.draftId),
          publishedAt,
          status: 'published',
        },
        status: 'success',
      };
    }

    const response = await this.fetchJson<{
      data?: { id?: string };
    }>('/posts', {
      body: JSON.stringify({
        content: params.content,
        platform: params.platform,
        status: 'published',
      }),
      method: 'POST',
    });

    return {
      data: {
        platform: params.platform,
        postId: String(response.data?.id ?? ''),
        publishedAt,
        status: 'published',
      },
      status: 'success',
    };
  }

  async getAnalytics(params: {
    days: number;
  }): Promise<IDesktopDataResult<IDesktopAnalytics>> {
    const response = await this.fetchJson<{
      recentPosts?: Array<{
        content?: string;
        id?: string;
        platform?: string;
        views?: number;
      }>;
      topPlatform?: string;
      totalEngagements?: number;
      totalPosts?: number;
      totalViews?: number;
    }>(`/analytics/overview?days=${params.days}`);

    return {
      data: {
        recentPosts: (response.recentPosts ?? []).map((post) => ({
          content: String(post.content ?? ''),
          id: String(post.id ?? ''),
          platform: String(post.platform ?? ''),
          views: Number(post.views ?? 0),
        })),
        topPlatform: String(response.topPlatform ?? 'unknown'),
        totalEngagements: Number(response.totalEngagements ?? 0),
        totalPosts: Number(response.totalPosts ?? 0),
        totalViews: Number(response.totalViews ?? 0),
      },
      status: 'success',
    };
  }

  async listAgents(): Promise<IDesktopDataResult<IDesktopAgent[]>> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>('/agent-strategies');

    return {
      data: (response.data ?? []).map((item) => {
        const attrs = item.attributes ?? {};
        const runHistory = Array.isArray(attrs.runHistory)
          ? (attrs.runHistory as Array<Record<string, unknown>>)
          : [];
        const recentRuns = runHistory.slice(0, 5).map((run) => ({
          completedAt: run.endedAt ? String(run.endedAt) : undefined,
          id: String(run._id ?? run.id ?? ''),
          startedAt: String(run.startedAt ?? ''),
          status: String(run.status ?? 'completed') as
            | 'completed'
            | 'failed'
            | 'pending'
            | 'running',
        }));

        const isActive = Boolean(attrs.isActive ?? attrs.enabled ?? false);
        return {
          avatar: attrs.avatar ? String(attrs.avatar) : undefined,
          id: String(item.id ?? ''),
          isActive,
          lastRunAt: recentRuns[0]?.startedAt,
          latestRun: recentRuns[0],
          name: String(attrs.name ?? 'Unnamed Agent'),
          platforms: Array.isArray(attrs.platforms)
            ? (attrs.platforms as string[])
            : [],
          recentRuns,
          status: isActive ? ('active' as const) : ('paused' as const),
        };
      }),
      status: 'success',
    };
  }

  async runAgent(
    agentId: string,
  ): Promise<IDesktopDataResult<IDesktopAgentRunResult>> {
    const response = await this.fetchJson<{
      data?: { id?: string; attributes?: Record<string, unknown> };
    }>(`/agent-strategies/${agentId}/run-now`, {
      method: 'POST',
    });

    return {
      data: {
        runId: String(response.data?.id ?? ''),
        status: String(response.data?.attributes?.status ?? 'pending') as
          | 'pending'
          | 'running',
      },
      status: 'success',
    };
  }

  async listWorkflows(): Promise<IDesktopDataResult<IDesktopWorkflow[]>> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>('/workflows');

    return {
      data: (response.data ?? []).map((item) => {
        const attrs = item.attributes ?? {};
        const nodes = Array.isArray(attrs.nodes) ? attrs.nodes : [];
        const runHistory = Array.isArray(attrs.runHistory)
          ? (attrs.runHistory as Array<Record<string, unknown>>)
          : [];
        const latestRun = runHistory[0];

        return {
          description: attrs.description
            ? String(attrs.description)
            : undefined,
          id: String(item.id ?? ''),
          lastExecutedAt: attrs.lastExecutedAt
            ? String(attrs.lastExecutedAt)
            : undefined,
          latestRun: latestRun
            ? {
                completedAt: latestRun.endedAt
                  ? String(latestRun.endedAt)
                  : undefined,
                id: String(latestRun._id ?? latestRun.id ?? ''),
                mode: latestRun.mode === 'batch' ? 'batch' : 'single',
                startedAt: String(latestRun.startedAt ?? ''),
                status: String(latestRun.status ?? 'completed') as
                  | 'completed'
                  | 'failed'
                  | 'pending'
                  | 'running',
              }
            : undefined,
          lifecycle:
            attrs.lifecycle === 'archived'
              ? 'archived'
              : attrs.lifecycle === 'published'
                ? 'published'
                : 'draft',
          name: String(attrs.name ?? 'Unnamed Workflow'),
          nodeCount: nodes.length,
          supportsBatch: Boolean(attrs.supportsBatch ?? false),
        };
      }),
      status: 'success',
    };
  }

  async runWorkflow(params: {
    batch?: boolean;
    workflowId: string;
  }): Promise<IDesktopDataResult<IDesktopWorkflowRunResult>> {
    const response = await this.fetchJson<{
      data?: { id?: string; attributes?: Record<string, unknown> };
    }>(`/workflows/${params.workflowId}/run`, {
      body: JSON.stringify({
        mode: params.batch ? 'batch' : 'single',
      }),
      method: 'POST',
    });

    return {
      data: {
        runId: String(response.data?.id ?? ''),
        status: String(response.data?.attributes?.status ?? 'pending') as
          | 'pending'
          | 'running',
      },
      status: 'success',
    };
  }
}
