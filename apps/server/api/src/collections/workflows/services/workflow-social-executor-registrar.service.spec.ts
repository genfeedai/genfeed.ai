import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import {
  formatReportDeliveryError,
  formatSocialReadProviderError,
  WorkflowSocialExecutorRegistrarService,
} from '@api/collections/workflows/services/workflow-social-executor-registrar.service';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createHelper(): WorkflowEngineExecutorHelperService {
  return {
    wrapEngineExecutor:
      (executor: INodeExecutor) =>
      async (...args: Parameters<NodeExecutor>) =>
        (
          await executor.execute({
            context: args[2],
            inputs: args[1],
            node: args[0],
          })
        ).data,
  } as unknown as WorkflowEngineExecutorHelperService;
}

function register(
  overrides: {
    twitterService?: {
      getUserTimelineByUsername?: ReturnType<typeof vi.fn>;
      resolveBrandUserAccessToken?: ReturnType<typeof vi.fn>;
      searchRecentTweets?: ReturnType<typeof vi.fn>;
    };
    notificationsService?: {
      sendEmail?: ReturnType<typeof vi.fn>;
      sendNotification?: ReturnType<typeof vi.fn>;
    };
    credentialsService?: {
      findOne?: ReturnType<typeof vi.fn>;
      resolveBrandAccount?: ReturnType<typeof vi.fn>;
    };
  } = {},
) {
  const engine = new WorkflowEngine();
  new WorkflowSocialExecutorRegistrarService(
    createHelper(),
    createLogger() as never,
    undefined,
    undefined,
    undefined,
    overrides.twitterService as never,
    overrides.credentialsService as never,
    overrides.notificationsService as never,
  ).register(engine);
  return engine;
}

const digestContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'wf-digest',
  workflowVersionId: 'version-1',
};

function executeAction(
  engine: WorkflowEngine,
  actionId: string,
  parameters: Record<string, unknown>,
  inputs: Map<string, unknown> = new Map(),
) {
  return engine.getExecutor('genfeedAction')?.(
    createExecutableActionNode({
      actionId,
      id: actionId,
      parameters,
    }),
    inputs,
    digestContext,
  );
}

describe('formatSocialReadProviderError', () => {
  it('names twitter and includes reset timing for 429s', () => {
    const error = formatSocialReadProviderError({
      code: 429,
      rateLimitReset: new Date('2026-08-13T08:00:00.000Z'),
    });
    expect(error.message).toBe(
      'socialRead twitter rate limited; reset at 2026-08-13T08:00:00.000Z',
    );
  });

  it('wraps non-rate-limit failures with provider identity', () => {
    expect(
      formatSocialReadProviderError(new Error('upstream 503')).message,
    ).toBe('socialRead twitter provider failed: upstream 503');
  });
});

describe('formatReportDeliveryError', () => {
  it('names the destination and reason', () => {
    expect(
      formatReportDeliveryError('notification', new Error('bus down')).message,
    ).toBe('reportDelivery notification failed: bus down');
  });
});

describe('WorkflowSocialExecutorRegistrarService (#2664)', () => {
  it('registers socialRead and reportDelivery even when providers are missing', () => {
    const engine = register();
    expect(engine.getRegisteredActionIds()).toEqual(
      expect.arrayContaining(['socialRead', 'reportDelivery']),
    );
  });

  it('fails closed when TwitterService is not wired', async () => {
    const engine = register();
    await expect(
      executeAction(engine, 'socialRead', {
        mode: 'timeline',
        username: 'genfeed',
      }),
    ).rejects.toThrow(/provider not configured/i);
  });

  it('maps a timeline fetch onto the structured socialRead output', async () => {
    const getUserTimelineByUsername = vi.fn().mockResolvedValue([
      {
        authorName: 'Genfeed',
        authorUsername: 'genfeed',
        createdAt: new Date('2026-08-12T07:00:00.000Z'),
        id: '1',
        metrics: { comments: 1, likes: 4, shares: 2 },
        text: 'morning update',
      },
    ]);
    const engine = register({
      twitterService: {
        getUserTimelineByUsername,
        resolveBrandUserAccessToken: vi.fn().mockResolvedValue(null),
        searchRecentTweets: vi.fn(),
      },
    });

    const result = await executeAction(engine, 'socialRead', {
      mode: 'timeline',
      username: 'genfeed',
    });

    expect(getUserTimelineByUsername).toHaveBeenCalledWith(
      'genfeed',
      expect.objectContaining({ maxResults: 20 }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        count: 1,
        mode: 'timeline',
        platform: 'twitter',
      }),
    );
    const posts = JSON.parse((result as { posts: string }).posts) as Array<
      Record<string, unknown>
    >;
    expect(posts[0]).toEqual(
      expect.objectContaining({
        authorUsername: 'genfeed',
        likes: 4,
        text: 'morning update',
      }),
    );
  });

  it('surfaces twitter rate limits with provider identity and reset time', async () => {
    const engine = register({
      twitterService: {
        getUserTimelineByUsername: vi.fn().mockRejectedValue({
          code: 429,
          rateLimitReset: new Date('2026-08-13T08:00:00.000Z'),
        }),
        resolveBrandUserAccessToken: vi.fn(),
        searchRecentTweets: vi.fn(),
      },
    });

    await expect(
      executeAction(engine, 'socialRead', {
        mode: 'timeline',
        username: 'genfeed',
      }),
    ).rejects.toThrow(
      'socialRead twitter rate limited; reset at 2026-08-13T08:00:00.000Z',
    );
  });

  it('delivers an in-app report and records destination', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const engine = register({
      notificationsService: {
        sendEmail: vi.fn(),
        sendNotification,
      },
    });

    const result = await executeAction(
      engine,
      'reportDelivery',
      { channel: 'notification', subject: 'Morning X digest' },
      new Map([['content', 'Morning digest body']]),
    );

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workflow_report',
        userId: 'user-1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        delivered: true,
        destination: 'notification',
      }),
    );
  });

  it('fails closed when notification delivery throws, naming the destination', async () => {
    const engine = register({
      notificationsService: {
        sendEmail: vi.fn(),
        sendNotification: vi.fn().mockRejectedValue(new Error('bus down')),
      },
    });

    await expect(
      executeAction(
        engine,
        'reportDelivery',
        { channel: 'notification' },
        new Map([['content', 'Digest']]),
      ),
    ).rejects.toThrow('reportDelivery notification failed: bus down');
  });
});
