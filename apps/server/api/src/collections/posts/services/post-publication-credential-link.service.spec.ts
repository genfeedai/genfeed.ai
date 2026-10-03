import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});
const scope = {
  organizationId: 'org',
  brandId: 'brand',
  userId: 'canonical-user',
};
const input = { brandId: 'brand', postId: 'post', credentialId: 'credential' };
const record = {
  id: 'post',
  platform: 'twitter',
  source: 'extension',
  externalId: '123',
  url: 'https://twitter.com/alice/status/123',
  description: 'unchanged',
  visibility: null,
  credentialId: null,
  targetExecutionState: 'published',
  analyticsCollectionState: 'failed',
  targetSettings: {
    extensionCapture: {
      version: 1,
      publicationKind: 'post',
      observedVisibility: 'private',
      author: { externalId: 'alice-id', handle: 'alice' },
    },
  },
};
async function fixture(overrides: object = {}) {
  const current = { ...record, ...overrides };
  const post = {
    findFirst: vi.fn().mockResolvedValue(current),
    update: vi.fn().mockResolvedValue(current),
  };
  const credential = {
    findFirst: vi.fn().mockResolvedValue({
      id: 'credential',
      externalId: 'alice-id',
      externalHandle: 'alice',
      username: 'alice',
    }),
  };
  const brand = { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) };
  const lock = vi.fn().mockResolvedValue([]);
  const tx = { post, credential, brand, $queryRaw: lock };
  const transaction = vi.fn(
    async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const cache = { invalidateByTags: vi.fn() };
  const queue = { enqueue: vi.fn() };
  const approvals = {
    createForCurrentPost: vi.fn(),
    assertPostMutable: vi.fn(),
  };
  const credits = { completeMissions: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      PostsService,
      { provide: PrismaService, useValue: { $transaction: transaction, post } },
      { provide: CacheService, useValue: cache },
      {
        provide: LoggerService,
        useValue: {
          log: vi.fn(),
          debug: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
      { provide: OnboardingCreditGrantsService, useValue: credits },
      { provide: ScheduledPostWorkflowQueueService, useValue: queue },
      { provide: PublishApprovalsService, useValue: approvals },
    ],
  }).compile();
  return {
    service: module.get(PostsService),
    post,
    credential,
    brand,
    lock,
    cache,
    queue,
    approvals,
    credits,
    current,
  };
}
describe('explicit own-account recovery', () => {
  it('links only a matched account under capture lock and invalidates cache without publication', async () => {
    const f = await fixture();
    const result = await f.service.linkExternalPublicationCredential(
      input,
      scope,
    );
    expect(result).toEqual({
      postId: 'post',
      credentialId: 'credential',
      analyticsAvailability: 'eligible',
    });
    expect(f.post.findFirst).toHaveBeenCalledTimes(2);
    expect(f.lock.mock.calls[0][1]).toBe(
      JSON.stringify(['extension-publication', 'org', 'brand', 'twitter']),
    );
    expect(f.post.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      id: 'post',
      source: 'extension',
      targetExecutionState: 'published',
      targetSettings: { path: ['extensionCapture', 'version'], equals: 1 },
    });
    expect(f.credential.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: 'org',
      brandId: 'brand',
      id: 'credential',
      platform: 'TWITTER',
      isDeleted: false,
      isConnected: true,
    });
    const data = f.post.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      credentialId: 'credential',
      isAnalyticsEnabled: true,
      analyticsNextCollectAt: expect.any(Date),
    });
    expect(Object.keys(data).sort()).toEqual([
      'analyticsCollectionError',
      'analyticsNextCollectAt',
      'credentialId',
      'isAnalyticsEnabled',
    ]);
    expect(f.current).toEqual(record);
    expect(f.cache.invalidateByTags).toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.credits.completeMissions).not.toHaveBeenCalled();
  });
  it('accepts idempotent same credential but refuses a different linked account', async () => {
    const f = await fixture({ credentialId: 'credential' });
    await expect(
      f.service.linkExternalPublicationCredential(input, scope),
    ).resolves.toMatchObject({ credentialId: 'credential' });
    const conflict = await fixture({ credentialId: 'different' });
    await expect(
      conflict.service.linkExternalPublicationCredential(input, scope),
    ).rejects.toThrow(/already linked/);
    expect(f.post.update).not.toHaveBeenCalled();
    expect(conflict.post.update).not.toHaveBeenCalled();
  });
  it('never falls back from a forged explicit author ID to matching handle', async () => {
    const f = await fixture();
    f.credential.findFirst.mockResolvedValue({
      id: 'credential',
      externalId: 'other',
      externalHandle: 'alice',
      username: 'alice',
    });
    await expect(
      f.service.linkExternalPublicationCredential(input, scope),
    ).rejects.toThrow(/does not match/);
    expect(f.post.update).not.toHaveBeenCalled();
  });
  it('rejects missing author, disconnected/foreign account, missing post and foreign brand', async () => {
    const noAuthor = await fixture({
      targetSettings: { extensionCapture: { version: 1 } },
    });
    await expect(
      noAuthor.service.linkExternalPublicationCredential(input, scope),
    ).rejects.toThrow(/author/);
    const f = await fixture();
    f.credential.findFirst.mockResolvedValue(null);
    await expect(
      f.service.linkExternalPublicationCredential(input, scope),
    ).rejects.toThrow();
    f.post.findFirst.mockResolvedValue(null);
    await expect(
      f.service.linkExternalPublicationCredential(input, scope),
    ).rejects.toThrow();
    await expect(
      f.service.linkExternalPublicationCredential(
        { ...input, brandId: 'foreign' },
        scope,
      ),
    ).rejects.toThrow();
    expect(f.post.update).not.toHaveBeenCalled();
  });
  it('keeps unsupported comment collection disabled while preserving saved state', async () => {
    const f = await fixture({
      platform: 'instagram',
      externalId: 'comment-id',
      analyticsNextCollectAt: new Date('2099-01-01'),
      targetSettings: {
        extensionCapture: {
          version: 1,
          publicationKind: 'reply',
          author: { externalId: 'alice-id' },
          observedVisibility: 'unknown',
        },
      },
    });
    expect(
      await f.service.linkExternalPublicationCredential(input, scope),
    ).toMatchObject({ analyticsAvailability: 'unsupported-publication-kind' });
    expect(f.post.update.mock.calls[0][0].data).toMatchObject({
      isAnalyticsEnabled: false,
    });
    expect(f.post.update.mock.calls[0][0].data).not.toHaveProperty(
      'analyticsNextCollectAt',
    );
    expect(
      f.post.update.mock.calls[0][0].data.analyticsCollectionError,
    ).toMatchObject({ code: 'EXTENSION_CAPTURE_UNSUPPORTED_PUBLICATION_KIND' });
    expect(f.post.update.mock.calls[0][0].data).not.toHaveProperty(
      'analyticsCollectionState',
    );
  });
  it.each([
    null,
    'EXTENSION_CAPTURE_MISSING_CREDENTIAL',
    [],
    { code: 'PROVIDER_FAILURE' },
    { message: 'EXTENSION_CAPTURE_MISSING_CREDENTIAL' },
  ])(
    'preserves equal-credential state without recovery for %j',
    async (error) => {
      const future = new Date('2099-01-01');
      const f = await fixture({
        credentialId: 'credential',
        analyticsCollectionError: error,
        analyticsNextCollectAt: future,
        isAnalyticsEnabled: false,
        totalViews: 42,
      });
      const before = { ...f.current };
      await expect(
        f.service.linkExternalPublicationCredential(input, scope),
      ).resolves.toMatchObject({ analyticsAvailability: 'eligible' });
      expect(f.post.update).not.toHaveBeenCalled();
      expect(f.current).toEqual(before);
      expect(f.queue.enqueue).not.toHaveBeenCalled();
    },
  );
  it('recovers an exact missing-credential error once and reads the cleared state on replay', async () => {
    const f = await fixture({
      credentialId: 'credential',
      analyticsCollectionError: {
        code: 'EXTENSION_CAPTURE_MISSING_CREDENTIAL',
        message: 'missing',
      },
      analyticsNextCollectAt: new Date('2099-01-01'),
      totalViews: 42,
    });
    f.post.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(f.current, data),
    );
    await f.service.linkExternalPublicationCredential(input, scope);
    const recovered = { ...f.current };
    await f.service.linkExternalPublicationCredential(input, scope);
    expect(f.post.update).toHaveBeenCalledTimes(1);
    expect(f.post.findFirst).toHaveBeenCalledTimes(4);
    expect(f.current).toEqual(recovered);
    expect(f.current.analyticsCollectionState).toBe('failed');
    expect(f.post.update.mock.calls[0][0].data).not.toHaveProperty(
      'totalViews',
    );
    expect(f.post.update.mock.calls[0][0].data).not.toHaveProperty(
      'analyticsCollectionState',
    );
  });
});
