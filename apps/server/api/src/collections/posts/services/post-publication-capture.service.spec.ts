import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { ExtensionPublicationCaptureInput } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type { Post, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

type FixturePost = Pick<
  Post,
  | 'id'
  | 'source'
  | 'externalId'
  | 'url'
  | 'credentialId'
  | 'platform'
  | 'targetSettings'
  | 'visibility'
  | 'targetExecutionState'
  | 'status'
  | 'organizationId'
  | 'brandId'
  | 'isDeleted'
>;
type FixtureCredential = Pick<
  Prisma.CredentialGetPayload<{
    select: {
      id: true;
      externalId: true;
      externalHandle: true;
      username: true;
      isConnected: true;
    };
  }>,
  'id' | 'externalId' | 'externalHandle' | 'username' | 'isConnected'
>;
const scope = { organizationId: 'org-1', userId: 'user-1', brandId: 'brand-1' };
const input: ExtensionPublicationCaptureInput = {
  brandId: 'brand-1',
  platform: 'twitter',
  publicationKind: 'post',
  description: 'Observed content',
  publicationDate: '2026-01-01T00:00:00.000Z',
  url: 'https://x.com/alice/status/123',
};
const row: FixturePost = {
  id: 'existing',
  source: 'api',
  externalId: '123',
  url: 'https://twitter.com/alice/status/123',
  credentialId: null,
  platform: 'twitter',
  targetSettings: {},
  visibility: null,
  targetExecutionState: TargetExecutionState.PUBLISHED,
  status: PostStatus.PUBLIC,
  organizationId: scope.organizationId,
  brandId: scope.brandId,
  isDeleted: false,
};
const authorCredential: FixtureCredential = {
  id: 'credential-1',
  externalId: 'alice-id',
  externalHandle: '@Alice',
  username: 'alice',
  isConnected: true,
};

async function makeService() {
  const rows: FixturePost[] = [];
  const events: string[] = [];
  const brand = { findFirst: vi.fn().mockResolvedValue({ id: scope.brandId }) };
  const credential = { findMany: vi.fn().mockResolvedValue([]) };
  const post = {
    findFirst: vi
      .fn<() => Promise<FixturePost | null>>()
      .mockResolvedValue(null),
    findMany: vi.fn(async () => {
      events.push('read');
      return rows;
    }),
    create: vi.fn(async ({ data }: Prisma.PostCreateArgs) => {
      events.push('create');
      const created: FixturePost = {
        ...row,
        id: 'created',
        source: data.source ?? null,
        externalId: data.externalId ?? null,
        url: data.url ?? null,
        credentialId:
          'credentialId' in data ? (data.credentialId ?? null) : null,
        platform: data.platform ?? null,
        visibility: data.visibility ?? null,
        targetSettings: JSON.parse(JSON.stringify(data.targetSettings ?? {})),
      };
      rows.push(created);
      return created;
    }),
  };
  let lockTail = Promise.resolve();
  const transaction = vi.fn(
    async (callback: (tx: typeof baseTx) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = {
        ...baseTx,
        $queryRaw: vi.fn(async (_sql: TemplateStringsArray, key: string) => {
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          events.push(`lock:${key}`);
          return [];
        }),
      };
      try {
        return await callback(tx);
      } finally {
        release?.();
      }
    },
  );
  const baseTx = { brand, credential, post, $queryRaw: vi.fn() };
  const cache = { invalidateByTags: vi.fn() };
  const approvals = {
    createForCurrentPost: vi.fn(),
    assertPostMutable: vi.fn(),
  };
  const credits = { completeMissions: vi.fn() };
  const queue = { enqueue: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      PostsService,
      { provide: PrismaService, useValue: { $transaction: transaction, post } },
      {
        provide: LoggerService,
        useValue: {
          log: vi.fn(),
          debug: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
        },
      },
      { provide: OnboardingCreditGrantsService, useValue: credits },
      { provide: CacheService, useValue: cache },
      { provide: PublishApprovalsService, useValue: approvals },
      { provide: ScheduledPostWorkflowQueueService, useValue: queue },
    ],
  }).compile();
  return {
    service: module.get(PostsService),
    brand,
    credential,
    post,
    transaction,
    rows,
    cache,
    approvals,
    credits,
    queue,
    events,
  };
}

describe('PostsService reported publication capture', () => {
  it('creates a scoped published client-reported record without provider, approval, learning or credit writes', async () => {
    const f = await makeService();
    const result = await f.service.recordExternalPublication(input, scope);
    expect(result).toEqual({
      postId: 'created',
      created: true,
      source: 'extension',
      externalId: '123',
      url: row.url,
      contextUrl: null,
      urlKind: 'permalink',
      credentialId: null,
      analyticsAvailability: 'missing-credential',
      observedVisibility: 'unknown',
      urlIdentity: { kind: 'platform-publication-id', value: '123' },
    });
    expect(f.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
      select: { id: true },
    });
    expect(f.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        platform: 'twitter',
        category: 'TEXT',
        status: PostStatus.PUBLIC,
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: null,
        publishedAt: new Date(input.publicationDate),
        publicationDate: new Date(input.publicationDate),
        isAnalyticsEnabled: false,
        analyticsCollectionState: 'unavailable',
        analyticsCollectionError: {
          code: 'EXTENSION_CAPTURE_MISSING_CREDENTIAL',
          message: expect.any(String),
        },
        targetSettings: {
          extensionCapture: expect.objectContaining({
            evidence: 'client-reported-publication',
            observedByUserId: 'user-1',
            observedVisibility: 'unknown',
            version: 1,
          }),
        },
      }),
    });
    expect(f.events).toEqual([
      `lock:${JSON.stringify(['extension-publication', 'org-1', 'brand-1', 'twitter'])}`,
      'read',
      'create',
    ]);
    expect(f.cache.invalidateByTags).toHaveBeenCalledOnce();
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.approvals.assertPostMutable).not.toHaveBeenCalled();
    expect(f.credits.completeMissions).not.toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
  it.each(['public', 'private', 'unlisted', 'unknown', undefined] as const)(
    'persists reported audience %s honestly',
    async (observedVisibility) => {
      const f = await makeService();
      const result = await f.service.recordExternalPublication(
        { ...input, observedVisibility },
        scope,
      );
      expect(result.observedVisibility).toBe(observedVisibility ?? 'unknown');
      expect(f.post.create.mock.calls[0][0].data.visibility).toBe(
        observedVisibility === 'unknown' || observedVisibility === undefined
          ? null
          : observedVisibility,
      );
    },
  );
  it.each([
    { ...scope, organizationId: '' },
    { ...scope, userId: '' },
    { ...scope, brandId: 'other' },
  ])(
    'rejects invalid trusted scope %j without a transaction',
    async (invalidScope) => {
      const f = await makeService();
      await expect(
        f.service.recordExternalPublication(input, invalidScope),
      ).rejects.toThrow();
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['foreign', 'deleted'])(
    'rejects a %s brand without reading or writing posts',
    async () => {
      const f = await makeService();
      f.brand.findFirst.mockResolvedValue(null);
      await expect(
        f.service.recordExternalPublication(input, scope),
      ).rejects.toThrow();
      expect(f.post.create).not.toHaveBeenCalled();
      expect(f.post.findMany).not.toHaveBeenCalled();
    },
  );
  it('replays unchanged source, content, audience and location from an existing published row', async () => {
    const f = await makeService();
    f.rows.push({ ...row, url: null, visibility: PostVisibility.PRIVATE });
    const result = await f.service.recordExternalPublication(
      { ...input, observedVisibility: 'public', description: 'changed' },
      scope,
    );
    expect(result).toMatchObject({
      created: false,
      source: 'api',
      observedVisibility: 'private',
      url: null,
      contextUrl: null,
      urlKind: 'unavailable',
    });
    expect(f.post.create).not.toHaveBeenCalled();
    expect(f.credential.findMany).not.toHaveBeenCalled();
    expect(f.cache.invalidateByTags).not.toHaveBeenCalled();
  });
  it('queries both real ID and normalized permalink with exact active scope and bounded ordering', async () => {
    const f = await makeService();
    await f.service.recordExternalPublication(input, scope);
    expect(f.post.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        brandId: 'brand-1',
        platform: 'twitter',
        isDeleted: false,
        OR: [{ externalId: '123' }, { url: row.url }],
      },
      take: 2,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });
  it.each([
    [
      'instagram',
      'https://instagram.com/p/shortcode',
      undefined,
      null,
      'provider-id-unresolved',
    ],
    [
      'instagram',
      'https://instagram.com/p/shortcode',
      '999',
      '999',
      'eligible',
    ],
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123',
      undefined,
      null,
      'provider-id-unresolved',
    ],
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123',
      'urn:li:ugcPost:999',
      'urn:li:ugcPost:999',
      'eligible',
    ],
    [
      'facebook',
      'https://facebook.com/alice/posts/pfbidExample',
      undefined,
      null,
      'provider-id-unresolved',
    ],
    [
      'facebook',
      'https://facebook.com/alice/posts/pfbidExample',
      '111_999',
      '111_999',
      'eligible',
    ],
  ] as const)(
    'persists %s URL identity separately from explicit provider ID %s',
    async (platform, url, externalId, expectedId, availability) => {
      const f = await makeService();
      f.credential.findMany.mockResolvedValue([authorCredential]);
      const result = await f.service.recordExternalPublication(
        {
          ...input,
          platform,
          url,
          externalId,
          author: { externalId: 'alice-id' },
        },
        scope,
      );
      expect(result).toMatchObject({
        externalId: expectedId,
        analyticsAvailability: availability,
        urlIdentity: { kind: expect.any(String), value: expect.any(String) },
      });
      expect(f.post.create.mock.calls[0][0].data).toMatchObject({
        externalId: expectedId,
        isAnalyticsEnabled: availability === 'eligible',
        analyticsNextCollectAt: expect.any(Date),
      });
      const replay = await f.service.recordExternalPublication(
        { ...input, platform, url, externalId },
        scope,
      );
      expect(replay).toMatchObject({ ...result, created: false });
      expect(f.post.create).toHaveBeenCalledOnce();
    },
  );
  it('retries external-ID and URL-only captures without rewriting the active record', async () => {
    for (const publication of [
      input,
      {
        ...input,
        platform: 'instagram' as const,
        url: 'https://instagram.com/p/abc',
      },
    ]) {
      const url = publication.url;
      const f = await makeService();
      const first = await f.service.recordExternalPublication(
        publication,
        scope,
      );
      const replay = await f.service.recordExternalPublication(
        publication,
        scope,
      );
      expect(first.created).toBe(true);
      expect(replay.created).toBe(false);
      expect(replay.postId).toBe(first.postId);
      expect(f.post.create).toHaveBeenCalledOnce();
      if (url?.endsWith('abc'))
        expect(first.analyticsAvailability).toBe('provider-id-unresolved');
    }
  });
  it.each(['org-2', 'brand-2'])(
    'isolates the same identity from a different tenant/brand %s',
    async (other) => {
      const f = await makeService();
      const newScope = other.startsWith('org')
        ? { ...scope, organizationId: other }
        : { ...scope, brandId: other };
      f.post.findMany.mockImplementation(async () => []);
      await f.service.recordExternalPublication(
        { ...input, brandId: newScope.brandId },
        newScope,
      );
      expect(f.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: newScope.organizationId,
            brandId: newScope.brandId,
            isDeleted: false,
          }),
        }),
      );
    },
  );
  it.each([
    [
      'twitter',
      'https://twitter.com/alice/status/123',
      'provider-id-unresolved',
    ],
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123',
      'unsupported-publication-kind',
    ],
    [
      'reddit',
      'https://reddit.com/r/example/comments/abc/title',
      'unsupported-publication-kind',
    ],
    [
      'youtube',
      'https://youtube.com/watch?v=abc',
      'unsupported-publication-kind',
    ],
    [
      'instagram',
      'https://instagram.com/p/abc',
      'unsupported-publication-kind',
    ],
    [
      'facebook',
      'https://facebook.com/alice/posts/123',
      'unsupported-publication-kind',
    ],
    [
      'tiktok',
      'https://tiktok.com/@alice/video/123',
      'unsupported-publication-kind',
    ],
  ] as const)(
    'persists an observed own %s comment as context-only without replacing its ID',
    async (platform, contextUrl, availability) => {
      const f = await makeService();
      const result = await f.service.recordExternalPublication(
        {
          ...input,
          platform,
          url: undefined,
          contextUrl,
          externalId: 'own-comment',
          publicationKind: 'reply',
        },
        scope,
      );
      expect(result).toMatchObject({
        externalId: 'own-comment',
        url: null,
        urlKind: 'context-only',
        contextUrl,
        analyticsAvailability: availability,
      });
      expect(f.post.create.mock.calls[0][0].data).toMatchObject({
        externalId: 'own-comment',
        url: null,
        platform,
        isAnalyticsEnabled: false,
        targetSettings: {
          extensionCapture: expect.objectContaining({
            contextUrl,
            publicationKind: 'reply',
            urlKind: 'context-only',
          }),
        },
      });
    },
  );
  it('does not match deleted records or parent context URLs', async () => {
    const f = await makeService();
    await f.service.recordExternalPublication(
      {
        ...input,
        url: undefined,
        contextUrl: input.url,
        externalId: 'comment-1',
        publicationKind: 'reply',
      },
      scope,
    );
    expect(f.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          OR: [{ externalId: 'comment-1' }],
        }),
      }),
    );
    expect(f.post.create.mock.calls[0][0].data.url).toBeNull();
  });
  it.each([TargetExecutionState.DRAFT, TargetExecutionState.SCHEDULED])(
    'rejects lifecycle conflict %s',
    async (targetExecutionState) => {
      const f = await makeService();
      f.rows.push({ ...row, targetExecutionState });
      await expect(
        f.service.recordExternalPublication(input, scope),
      ).rejects.toThrow();
      expect(f.post.create).not.toHaveBeenCalled();
    },
  );
  it('rejects ambiguous legacy duplicates', async () => {
    const f = await makeService();
    f.rows.push(row, { ...row, id: 'duplicate' });
    await expect(
      f.service.recordExternalPublication(input, scope),
    ).rejects.toThrow();
    expect(f.post.create).not.toHaveBeenCalled();
  });
  it.each([
    [{ externalId: 'alice-id' }, [authorCredential], 'credential-1'],
    [{ handle: ' @ALICE ' }, [authorCredential], 'credential-1'],
    [{ externalId: 'other', handle: '@Alice' }, [authorCredential], null],
    [undefined, [authorCredential], null],
    [
      { handle: '@Alice' },
      [authorCredential, { ...authorCredential, id: 'duplicate' }],
      null,
    ],
    [{ externalId: 'alice-id' }, [], null],
    [
      { externalId: 'alice-id' },
      [authorCredential, { ...authorCredential, id: 'duplicate' }],
      null,
    ],
    [
      { handle: '@Alice' },
      [{ ...authorCredential, externalHandle: '@other' }],
      'credential-1',
    ],
  ] as const)(
    'attaches only a unique matching reported author %j',
    async (author, credentials, expected) => {
      const f = await makeService();
      f.credential.findMany.mockResolvedValue(credentials);
      const result = await f.service.recordExternalPublication(
        { ...input, author },
        scope,
      );
      expect(result.credentialId).toBe(expected);
      expect(result.analyticsAvailability).toBe(
        expected ? 'eligible' : 'missing-credential',
      );
      if (author)
        expect(f.credential.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            organizationId: 'org-1',
            brandId: 'brand-1',
            platform: 'TWITTER',
            isDeleted: false,
            isConnected: true,
          }),
          select: {
            id: true,
            externalId: true,
            externalHandle: true,
            username: true,
            isConnected: true,
          },
        });
      else expect(f.credential.findMany).not.toHaveBeenCalled();
    },
  );
  it('serializes two simultaneous identical captures through the advisory lock before their reads', async () => {
    const f = await makeService();
    let openRead: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      openRead = resolve;
    });
    f.post.findMany.mockImplementationOnce(async () => {
      f.events.push('read');
      await barrier;
      return f.rows;
    });
    const first = f.service.recordExternalPublication(input, scope);
    const second = f.service.recordExternalPublication(input, scope);
    await vi.waitFor(() => expect(f.post.findMany).toHaveBeenCalledOnce());
    openRead?.();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.created).sort()).toEqual([
      false,
      true,
    ]);
    expect(f.rows).toHaveLength(1);
    expect(f.post.create).toHaveBeenCalledOnce();
  });
  it('persists complete text longer than 20000 without truncation', async () => {
    const f = await makeService();
    const description = 'Complete text '.repeat(2000);
    await f.service.recordExternalPublication({ ...input, description }, scope);
    expect(f.post.create.mock.calls[0][0].data.description).toBe(description);
    expect(f.post.create.mock.calls[0][0].data.label).toBe(
      description.slice(0, 80),
    );
  });
  it('keeps private audience eligible when the collector identity and exact author credential match', async () => {
    const f = await makeService();
    f.credential.findMany.mockResolvedValue([authorCredential]);
    const result = await f.service.recordExternalPublication(
      {
        ...input,
        observedVisibility: 'private',
        author: { externalId: 'alice-id' },
      },
      scope,
    );
    expect(result).toMatchObject({
      observedVisibility: 'private',
      analyticsAvailability: 'eligible',
      credentialId: 'credential-1',
    });
    expect(f.post.create.mock.calls[0][0].data).toMatchObject({
      visibility: PostVisibility.PRIVATE,
      status: PostStatus.PRIVATE,
      isAnalyticsEnabled: true,
    });
  });
  it('rejects oversized UTF-8 publication before any database mutation', async () => {
    const f = await makeService();
    await expect(
      f.service.recordExternalPublication(
        { ...input, description: `${'é'.repeat(524288)}a` },
        scope,
      ),
    ).rejects.toThrow(
      'This publication is too large to record automatically. Its full text was not saved.',
    );
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.post.create).not.toHaveBeenCalled();
  });
  it('preserves nullable audience for capture rows and ordinary normalization defaults', async () => {
    const f = await makeService();
    f.rows.push({
      ...row,
      source: 'extension',
      targetSettings: { extensionCapture: { version: 1 } },
      visibility: null,
    });
    // BaseService reads run the service document normalization used by serializers.
    f.post.findFirst.mockResolvedValue(f.rows[0]);
    expect(
      (await f.service.findOne({ id: 'existing' }))?.visibility,
    ).toBeNull();
    f.rows[0] = { ...row, source: 'api', visibility: null };
    f.post.findFirst.mockResolvedValue(f.rows[0]);
    expect((await f.service.findOne({ id: 'existing' }))?.visibility).toBe(
      PostVisibility.PUBLIC,
    );
  });
});
