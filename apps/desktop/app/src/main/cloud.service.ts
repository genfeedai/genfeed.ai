import type {
  IDesktopAgent,
  IDesktopAgentRunResult,
  IDesktopAnalytics,
  IDesktopCloudProject,
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

export class DesktopCloudService {
  constructor(private readonly environment: IDesktopEnvironment) {}

  private requireSession(session: IDesktopSession | null): IDesktopSession {
    if (!session) {
      throw new Error('Desktop session is required');
    }

    return session;
  }

  private async fetchJson<T>(
    session: IDesktopSession | null,
    pathname: string,
    init?: RequestInit,
  ): Promise<T> {
    const activeSession = this.requireSession(session);
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

  async listProjects(
    session: IDesktopSession | null,
  ): Promise<IDesktopCloudProject[]> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>(session, '/editor-projects');

    return (response.data ?? []).map((project) => ({
      id: project.id ?? '',
      name: String(project.attributes?.name ?? 'Untitled Project'),
      status: project.attributes?.status
        ? String(project.attributes.status)
        : undefined,
    }));
  }

  async generateHooks(
    session: IDesktopSession | null,
    topic: string,
  ): Promise<string[]> {
    const response = await this.fetchJson<{ hooks: string[] }>(
      session,
      '/posts/hook-generations',
      {
        body: JSON.stringify({
          platform: 'twitter',
          topic,
        }),
        method: 'POST',
      },
    );

    return response.hooks;
  }

  async generateContent(
    session: IDesktopSession | null,
    params: IDesktopGenerationOptions,
  ): Promise<IDesktopGeneratedContent> {
    const response = await this.fetchJson<{
      data?: {
        attributes?: Record<string, unknown>;
        id?: string;
      };
    }>(session, '/posts', {
      body: JSON.stringify({
        content: params.prompt,
        contentType: params.type,
        metadata: {
          desktopDraftId: params.sourceDraftId,
          projectId: params.projectId,
          publishIntent: params.publishIntent,
          sourceTrendId: params.sourceTrendId,
          sourceTrendTopic: params.sourceTrendTopic,
        },
        platform: params.platform,
        status: 'draft',
      }),
      method: 'POST',
    });

    const data = response.data;
    return {
      content: String(data?.attributes?.content ?? params.prompt),
      hooks: Array.isArray(data?.attributes?.hooks)
        ? (data.attributes.hooks as string[])
        : undefined,
      id: String(data?.id ?? ''),
      platform: String(data?.attributes?.platform ?? params.platform),
      type: String(data?.attributes?.contentType ?? params.type),
    };
  }

  async getTrends(
    session: IDesktopSession | null,
    platform: string,
  ): Promise<IDesktopTrend[]> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>(session, `/trends?platform=${encodeURIComponent(platform)}`);

    return (response.data ?? []).map((item) => ({
      engagementScore: Number(item.attributes?.engagementScore ?? 0),
      id: String(item.id ?? ''),
      platform: String(item.attributes?.platform ?? platform),
      summary: item.attributes?.summary
        ? String(item.attributes.summary)
        : undefined,
      topic: String(item.attributes?.topic ?? ''),
      viralityScore: Number(item.attributes?.viralityScore ?? 0),
    }));
  }

  async getIngredients(
    session: IDesktopSession | null,
    filter?: { limit?: number; platform?: string },
  ): Promise<IDesktopIngredient[]> {
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
    }>(session, pathname);

    return (response.data ?? []).map((item) => ({
      content: String(item.attributes?.content ?? ''),
      id: String(item.id ?? ''),
      platform: item.attributes?.platform
        ? String(item.attributes.platform)
        : undefined,
      title: String(item.attributes?.title ?? 'Untitled'),
      totalVotes: Number(item.attributes?.totalVotes ?? 0),
    }));
  }

  async publishPost(
    session: IDesktopSession | null,
    params: { content: string; draftId?: string; platform: string },
  ): Promise<IDesktopPublishResult> {
    const publishedAt = new Date().toISOString();

    if (params.draftId) {
      const response = await this.fetchJson<{
        data?: { id?: string };
      }>(session, `/posts/${params.draftId}/publish`, {
        body: JSON.stringify({
          content: params.content,
          platform: params.platform,
        }),
        method: 'POST',
      });
      return {
        platform: params.platform,
        postId: String(response.data?.id ?? params.draftId),
        publishedAt,
        status: 'published',
      };
    }

    const response = await this.fetchJson<{
      data?: { id?: string };
    }>(session, '/posts', {
      body: JSON.stringify({
        content: params.content,
        platform: params.platform,
        status: 'published',
      }),
      method: 'POST',
    });
    return {
      platform: params.platform,
      postId: String(response.data?.id ?? ''),
      publishedAt,
      status: 'published',
    };
  }

  async getAnalytics(
    session: IDesktopSession | null,
    params: { days: number },
  ): Promise<IDesktopAnalytics> {
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
    }>(session, `/analytics/overview?days=${params.days}`);

    return {
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
    };
  }

  async listAgents(session: IDesktopSession | null): Promise<IDesktopAgent[]> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>(session, '/agent-strategies');

    return (response.data ?? []).map((item) => {
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
    });
  }

  async runAgent(
    session: IDesktopSession | null,
    agentId: string,
  ): Promise<IDesktopAgentRunResult> {
    const response = await this.fetchJson<{
      data?: { id?: string; attributes?: Record<string, unknown> };
    }>(session, `/agent-strategies/${agentId}/run-now`, {
      method: 'POST',
    });

    return {
      runId: String(response.data?.id ?? ''),
      status: String(response.data?.attributes?.status ?? 'pending') as
        | 'pending'
        | 'running',
    };
  }

  async listWorkflows(
    session: IDesktopSession | null,
  ): Promise<IDesktopWorkflow[]> {
    const response = await this.fetchJson<{
      data?: Array<{
        attributes?: Record<string, unknown>;
        id?: string;
      }>;
    }>(session, '/workflows');

    return (response.data ?? []).map((item) => {
      const attrs = item.attributes ?? {};
      const nodes = Array.isArray(attrs.nodes) ? attrs.nodes : [];
      const runHistory = Array.isArray(attrs.runHistory)
        ? (attrs.runHistory as Array<Record<string, unknown>>)
        : [];
      const latestRun = runHistory[0];
      return {
        description: attrs.description ? String(attrs.description) : undefined,
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
        lifecycle: String(attrs.lifecycle ?? 'draft') as
          | 'archived'
          | 'draft'
          | 'published',
        name: String(attrs.name ?? 'Untitled Workflow'),
        nodeCount: Number(attrs.nodeCount ?? nodes.length ?? 0),
        supportsBatch: Boolean(attrs.supportsBatch ?? false),
      };
    });
  }

  async runWorkflow(
    session: IDesktopSession | null,
    params: { batch?: boolean; workflowId: string },
  ): Promise<IDesktopWorkflowRunResult> {
    const endpoint = params.batch
      ? `/workflows/${params.workflowId}/batch`
      : '/workflow-executions';
    const body = params.batch ? {} : { workflow: params.workflowId };

    const response = await this.fetchJson<{
      data?: { id?: string; attributes?: Record<string, unknown> };
      runId?: string;
    }>(session, endpoint, {
      body: JSON.stringify(body),
      method: 'POST',
    });

    return {
      runId: String(response.data?.id ?? response.runId ?? ''),
      status: 'running' as const,
    };
  }
}
