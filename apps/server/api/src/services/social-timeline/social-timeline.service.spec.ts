import type {
  RunSystemWorkflowInput,
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { SocialTimelineService } from '@api/services/social-timeline/social-timeline.service';
import type { SocialTimelineProviderService } from '@api/services/social-timeline/social-timeline-provider.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = { organizationId: 'org-a', brandId: 'brand-a', userId: 'user-a' };
const input = {
  action: 'reply' as const,
  credentialId: 'credential-a',
  idempotencyKey: 'request-a',
  text: 'An actual reply',
};
const post = { id: 'post-a', platform: 'twitter', externalId: 'tweet-a' };

describe('connected timeline isolation and action delivery', () => {
  const prisma = {
    credential: { findFirst: vi.fn(), findMany: vi.fn() },
    socialSource: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    sourcePost: { findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    sourcePostNativeAction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const provider = { collect: vi.fn(), execute: vi.fn() };
  let executor: SystemWorkflowActionExecutor;
  const workflows = {
    registerWorkflow: vi.fn(),
    registerAction: vi.fn(
      (_id: string, action: SystemWorkflowActionExecutor) => {
        executor = action;
      },
    ),
    runWorkflow: vi.fn(),
  };
  const service = new SocialTimelineService(
    prisma as unknown as PrismaService,
    provider as unknown as SocialTimelineProviderService,
    workflows as unknown as SystemWorkflowRunnerService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    workflows.registerAction.mockImplementation(
      (_id: string, action: SystemWorkflowActionExecutor) => {
        executor = action;
      },
    );
    service.onModuleInit();
    workflows.runWorkflow.mockImplementation(
      async (request: RunSystemWorkflowInput) => ({
        result: await executor({
          input: request.inputValues ?? {},
          context: {
            organizationId: request.organizationId,
            userId: request.userId ?? '',
            workflowId: 'workflow',
            workflowVersionId: 'version',
            runId: 'run',
          },
          provenance: {
            executionId: 'run',
            workflowId: 'workflow',
            workflowLabel: 'Following',
          },
        }),
      }),
    );
    prisma.credential.findMany.mockResolvedValue([]);
    prisma.socialSource.findMany.mockResolvedValue([]);
    prisma.sourcePost.findFirst.mockResolvedValue(post);
    prisma.credential.findFirst.mockResolvedValue({
      id: 'credential-a',
      platform: 'TWITTER',
    });
    prisma.sourcePostNativeAction.create.mockResolvedValue({ id: 'receipt-a' });
    prisma.sourcePostNativeAction.updateMany.mockResolvedValue({ count: 1 });
    provider.execute.mockResolvedValue('published-reply-a');
  });

  it('never ingests on GET, and scopes credentials, sources and nested posts', async () => {
    expect(await service.read(scope)).toEqual({ accounts: [] });
    expect(provider.collect).not.toHaveBeenCalled();
    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          brandId: 'brand-a',
          isDeleted: false,
        }),
      }),
    );
    expect(prisma.socialSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          brandId: 'brand-a',
          sourceType: 'timeline',
          isDeleted: false,
        }),
        include: expect.objectContaining({
          posts: expect.objectContaining({
            where: expect.objectContaining({
              organizationId: 'org-a',
              brandId: 'brand-a',
              isDeleted: false,
            }),
          }),
        }),
      }),
    );
  });

  it('does not substitute own-account uploads or watched profiles for home feeds', async () => {
    prisma.credential.findMany.mockResolvedValue([
      {
        id: 'ig-a',
        platform: 'INSTAGRAM',
        externalName: 'My Instagram',
        isConnected: true,
      },
    ]);
    const result = await service.read(scope);
    expect(result.accounts[0]).toMatchObject({
      credentialId: 'ig-a',
      kind: 'unsupported',
      status: 'unsupported',
      posts: [],
      actions: [],
    });
    expect(provider.collect).not.toHaveBeenCalled();
  });

  it('reserves before publishing, validates both post and selected account in the tenant, and saves the platform receipt', async () => {
    expect(await service.act(scope, post.id, input)).toMatchObject({
      status: 'completed',
      externalId: 'published-reply-a',
    });
    expect(workflows.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'social.timeline.native-action',
        organizationId: scope.organizationId,
        userId: scope.userId,
      }),
    );
    expect(prisma.sourcePost.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: post.id,
        organizationId: 'org-a',
        brandId: 'brand-a',
        isDeleted: false,
      }),
    });
    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: input.credentialId,
        organizationId: 'org-a',
        brandId: 'brand-a',
        platform: 'TWITTER',
        isConnected: true,
        isDeleted: false,
      }),
    });
    expect(
      prisma.sourcePostNativeAction.create.mock.invocationCallOrder[0],
    ).toBeLessThan(provider.execute.mock.invocationCallOrder[0]);
    expect(prisma.sourcePostNativeAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'completed', externalId: 'published-reply-a' },
        where: expect.objectContaining({
          organizationId: 'org-a',
          brandId: 'brand-a',
          id: 'receipt-a',
        }),
      }),
    );
  });

  it('rejects a workflow request whose actor or organization differs from its execution context', async () => {
    workflows.runWorkflow.mockImplementationOnce(
      async (request: RunSystemWorkflowInput) => ({
        result: await executor({
          input: request.inputValues ?? {},
          context: {
            organizationId: 'another-org',
            userId: 'another-user',
            workflowId: 'workflow',
            workflowVersionId: 'version',
            runId: 'run',
          },
          provenance: {
            executionId: 'run',
            workflowId: 'workflow',
            workflowLabel: 'Following',
          },
        }),
      }),
    );
    await expect(service.act(scope, post.id, input)).rejects.toThrow(
      'scope does not match',
    );
    expect(prisma.sourcePostNativeAction.create).not.toHaveBeenCalled();
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it('does not execute the same request twice, including uncertain delivery', async () => {
    provider.execute.mockRejectedValue(
      new Error('socket closed after publication'),
    );
    const first = await service.act(scope, post.id, input);
    const saved = prisma.sourcePostNativeAction.create.mock.calls[0][0].data;
    prisma.sourcePostNativeAction.create.mockRejectedValue({ code: 'P2002' });
    prisma.sourcePostNativeAction.findFirst.mockResolvedValue({
      ...saved,
      id: first.id,
      status: 'uncertain',
      message: first.message,
    });
    const retried = await service.act(scope, post.id, input);
    expect(first.status).toBe('uncertain');
    expect(retried).toMatchObject(first);
    expect(provider.execute).toHaveBeenCalledTimes(1);
  });

  it('can confirm a saved action after a refresh removes the post, without republishing', async () => {
    await service.act(scope, post.id, input);
    const saved = prisma.sourcePostNativeAction.create.mock.calls[0][0].data;
    prisma.sourcePost.findFirst.mockResolvedValue(null);
    prisma.sourcePostNativeAction.findFirst.mockResolvedValue({
      ...saved,
      id: 'receipt-a',
      status: 'completed',
      externalId: 'published-reply-a',
    });
    expect(await service.act(scope, post.id, input)).toMatchObject({
      status: 'completed',
      externalId: 'published-reply-a',
    });
    expect(provider.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an action key for changed text', async () => {
    await service.act(scope, post.id, input);
    const saved = prisma.sourcePostNativeAction.create.mock.calls[0][0].data;
    prisma.sourcePostNativeAction.create.mockRejectedValue({ code: 'P2002' });
    prisma.sourcePostNativeAction.findFirst.mockResolvedValue({
      ...saved,
      status: 'completed',
    });
    await expect(
      service.act(scope, post.id, { ...input, text: 'Different reply' }),
    ).rejects.toThrow('another request');
    expect(provider.execute).toHaveBeenCalledTimes(1);
  });

  it('never publishes when another tenant owns the post or credential', async () => {
    prisma.sourcePost.findFirst.mockResolvedValue(null);
    await expect(service.act(scope, 'foreign-post', input)).rejects.toThrow();
    prisma.sourcePost.findFirst.mockResolvedValue(post);
    prisma.credential.findFirst.mockResolvedValue(null);
    await expect(service.act(scope, post.id, input)).rejects.toThrow();
    expect(prisma.sourcePostNativeAction.create).not.toHaveBeenCalled();
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it('rejects empty text and unsupported native actions before reserving', async () => {
    await expect(
      service.act(scope, post.id, { ...input, text: '  ' }),
    ).rejects.toThrow('Enter the text');
    prisma.sourcePost.findFirst.mockResolvedValue({
      ...post,
      platform: 'instagram',
    });
    await expect(service.act(scope, post.id, input)).rejects.toThrow(
      'does not support',
    );
    expect(prisma.sourcePostNativeAction.create).not.toHaveBeenCalled();
  });
});
