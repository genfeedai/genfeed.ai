import { afterEach, describe, expect, it } from 'bun:test';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/contracts/desktop';
import { DesktopCloudService } from './cloud.service';

const environment: IDesktopEnvironment = {
  apiEndpoint: 'https://api.genfeed.ai/v1',
  appEndpoint: 'https://app.genfeed.ai',
  appName: 'desktop',
  appPort: 3230,
  authEndpoint: 'https://app.genfeed.ai/oauth/cli',
  cdnUrl: 'https://cdn.genfeed.ai',
  mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
  serverId: 'cloud',
  serverKind: 'cloud',
  wsEndpoint: 'https://notifications.genfeed.ai',
};

const session: IDesktopSession = {
  issuedAt: '2026-04-01T09:00:00.000Z',
  token: 'gf_desktop_key',
  userEmail: 'desktop@example.com',
  userId: 'user-1',
  userName: 'Desktop User',
};

describe('DesktopCloudService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists projects with the desktop bearer token and maps the response', async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe('https://api.genfeed.ai/v1/editor-projects');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer gf_desktop_key',
        'Content-Type': 'application/json',
      });

      return new Response(
        JSON.stringify({
          data: [
            {
              attributes: {
                name: 'Desktop Launch',
                status: 'active',
              },
              id: 'project-1',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);

    await expect(service.listProjects()).resolves.toEqual({
      data: [
        {
          id: 'project-1',
          name: 'Desktop Launch',
          status: 'active',
        },
      ],
      status: 'success',
    });
  });

  it('publishes an existing draft through the dedicated publish endpoint', async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        'https://api.genfeed.ai/v1/posts/draft-9/publish',
      );
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(
        JSON.stringify({
          content: 'Ship the desktop release today.',
          platform: 'twitter',
        }),
      );

      return new Response(
        JSON.stringify({
          data: {
            id: 'published-1',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const result = await service.publishPost({
      content: 'Ship the desktop release today.',
      draftId: 'draft-9',
      platform: 'twitter',
    });

    expect(result).toEqual({
      data: {
        platform: 'twitter',
        postId: 'published-1',
        publishedAt: expect.any(String),
        status: 'published',
      },
      status: 'success',
    });
  });

  it('generates desktop content through the receipt-backed draft route under one brand', async () => {
    const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer gf_desktop_key',
      });
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          brandedReceipt: { id: 'receipt-1', state: 'needs_review' },
          description: 'Launch faster with Genfeed Desktop.',
          postId: 'post-1',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const result = await service.generateContent({
      brandId: 'brand-1',
      platform: 'twitter',
      prompt: 'Launch Genfeed Desktop',
      publishIntent: 'review',
      type: 'hook',
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      'https://api.genfeed.ai/v1/posts/draft-generations',
    );
    expect(requests[0]?.body).toMatchObject({
      brandId: 'brand-1',
      platform: 'twitter',
      prompt: 'Launch Genfeed Desktop',
    });
    expect(requests[0]?.body.requestKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result).toEqual({
      data: {
        content: 'Launch faster with Genfeed Desktop.',
        hooks: ['Launch faster with Genfeed Desktop.'],
        id: 'post-1',
        platform: 'twitter',
        type: 'hook',
      },
      status: 'success',
    });
  });

  it('uses a fresh request key for every generation so a retry never replays another draft', async () => {
    const keys: string[] = [];
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      keys.push(
        String(
          (JSON.parse(String(init?.body)) as { requestKey: string }).requestKey,
        ),
      );
      return new Response(JSON.stringify({ description: 'Draft.' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    await service.generateHooks('topic', 'brand-1');
    await service.generateHooks('topic', 'brand-1');

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('keeps the draft id the caller supplied for generated content', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ description: 'Draft.', postId: 'post-9' }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      )) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const result = await service.generateContent({
      brandId: 'brand-1',
      platform: 'twitter',
      prompt: 'topic',
      publishIntent: 'review',
      sourceDraftId: 'local-draft-1',
      type: 'post',
    });

    expect(result.data.id).toBe('local-draft-1');
  });

  it('generates a hook through the draft route and returns it as the only hook', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        'https://api.genfeed.ai/v1/posts/draft-generations',
      );
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ description: 'A sharp hook.' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const result = await service.generateHooks('desktop launch', 'brand-1');

    expect(result).toEqual({ data: ['A sharp hook.'], status: 'success' });
    expect(body).toMatchObject({ brandId: 'brand-1', platform: 'twitter' });
    expect(String(body.prompt)).toContain('desktop launch');
  });

  it('refuses cloud generation without a brand before any request is made', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);

    await expect(service.generateHooks('topic')).rejects.toThrow(
      'Link a Genfeed brand',
    );
    await expect(
      service.generateContent({
        platform: 'twitter',
        prompt: 'topic',
        publishIntent: 'review',
        type: 'post',
      }),
    ).rejects.toThrow('Link a Genfeed brand');
    expect(calls).toBe(0);
  });

  it('fails when the server answers without generated text', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ description: '' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);

    await expect(service.generateHooks('topic', 'brand-1')).rejects.toThrow(
      'no generated content',
    );
  });

  it('maps agent run output and queued manual run responses', async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer gf_desktop_key',
      });

      if (String(input).endsWith('/agent-strategies')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  isActive: true,
                  label: 'Trend Scout',
                  platforms: ['linkedin'],
                  runHistory: [
                    {
                      completedAt: '2026-06-11T06:02:00.000Z',
                      contentGenerated: 3,
                      creditsUsed: 12,
                      id: 'run-1',
                      startedAt: '2026-06-11T06:00:00.000Z',
                      status: 'completed',
                      summary:
                        'Generated three LinkedIn hooks for the launch angle.',
                      threadId: 'thread-1',
                    },
                  ],
                },
                id: 'agent-1',
              },
            ],
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }

      expect(String(input)).toBe(
        'https://api.genfeed.ai/v1/agent-strategies/agent-1/run-now',
      );
      expect(init?.method).toBe('POST');
      return new Response(
        JSON.stringify({
          message: 'Proactive run queued. It will execute shortly.',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);

    await expect(service.listAgents()).resolves.toEqual({
      data: [
        {
          id: 'agent-1',
          isActive: true,
          lastRunAt: '2026-06-11T06:02:00.000Z',
          latestRun: {
            completedAt: '2026-06-11T06:02:00.000Z',
            contentGenerated: 3,
            creditsUsed: 12,
            id: 'run-1',
            outputSummary:
              'Generated three LinkedIn hooks for the launch angle.',
            startedAt: '2026-06-11T06:00:00.000Z',
            status: 'completed',
            threadId: 'thread-1',
          },
          name: 'Trend Scout',
          platforms: ['linkedin'],
          recentRuns: [
            {
              completedAt: '2026-06-11T06:02:00.000Z',
              contentGenerated: 3,
              creditsUsed: 12,
              id: 'run-1',
              outputSummary:
                'Generated three LinkedIn hooks for the launch angle.',
              startedAt: '2026-06-11T06:00:00.000Z',
              status: 'completed',
              threadId: 'thread-1',
            },
          ],
          status: 'active',
        },
      ],
      status: 'success',
    });

    await expect(service.runAgent('agent-1')).resolves.toEqual({
      data: {
        message: 'Proactive run queued. It will execute shortly.',
        runId: '',
        status: 'pending',
      },
      status: 'success',
    });
  });

  it('rejects cloud calls without a session', async () => {
    const service = new DesktopCloudService(environment, () => null);

    await expect(service.listProjects()).rejects.toThrow(
      'Desktop session is required',
    );
  });
});

describe('DesktopCloudService agent threads', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates CLI runtime threads and appends external turns', async () => {
    const requests: Array<{ body?: unknown; method?: string; url: string }> =
      [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        method: init?.method,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          data: {
            attributes: {
              brandId: 'brand-1',
              externalRuntime: {
                runtimeKey: 'local/claude-cli',
                sessionId: 'sess-1',
                updatedAt: '2026-09-25T00:00:00.000Z',
              },
              organizationId: 'org-1',
              runtimeKey: 'local/claude-cli',
            },
            id: 'thread-1',
          },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const created = await service.createAgentThread({
      brandId: 'brand-1',
      runtimeKey: 'local/claude-cli',
      source: 'desktop-cli',
      title: 'Launch post',
    });
    await service.appendExternalAgentTurn('thread-1', {
      assistantMessage: 'Done',
      runtimeKey: 'local/claude-cli',
      sessionId: 'sess-1',
      userMessage: 'Hi',
    });

    expect(created).toEqual({
      brandId: 'brand-1',
      externalRuntime: {
        runtimeKey: 'local/claude-cli',
        sessionId: 'sess-1',
        updatedAt: '2026-09-25T00:00:00.000Z',
      },
      id: 'thread-1',
      organizationId: 'org-1',
      runtimeKey: 'local/claude-cli',
    });
    expect(requests).toEqual([
      {
        body: {
          brandId: 'brand-1',
          runtimeKey: 'local/claude-cli',
          source: 'desktop-cli',
          title: 'Launch post',
        },
        method: 'POST',
        url: 'https://api.genfeed.ai/v1/agent/threads',
      },
      {
        body: {
          assistantMessage: 'Done',
          runtimeKey: 'local/claude-cli',
          sessionId: 'sess-1',
          userMessage: 'Hi',
        },
        method: 'POST',
        url: 'https://api.genfeed.ai/v1/agent/threads/thread-1/external-turns',
      },
    ]);
  });
});
