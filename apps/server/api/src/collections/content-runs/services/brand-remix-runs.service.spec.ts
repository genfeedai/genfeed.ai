import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentRunStatus,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/enums';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');
const updatedAt = new Date('2026-08-20T10:01:00.000Z');

const brand = {
  agentConfig: {
    defaultAvatarIngredientId: 'avatar-1',
    defaultVoiceId: 'voice-1',
    strategy: { goals: ['Grow qualified demand'] },
    voice: { audience: ['founders'], tone: 'direct' },
  },
  description: 'Operational content systems for founder-led teams.',
  id: 'brand-1',
  isActive: true,
  label: 'Acme',
  organizationId: 'org-1',
  text: 'Turn content signals into approved campaigns.',
};

const sourcePost = {
  authorHandle: 'creator',
  collectedAt: new Date('2026-08-20T09:00:00.000Z'),
  contentType: 'video',
  id: 'source-post-1',
  mediaUrls: ['https://media.example/video.mp4'],
  metrics: { comments: 18, likes: 1200, views: 25000 },
  platform: 'tiktok',
  sourceUrl:
    'https://tiktok.example/@creator/video/1?token=must-not-persist#preview',
  text: 'Show the painful old workflow, then reveal the one-click fix.',
  thumbnailUrl: 'https://media.example/thumb.jpg',
};

const makeRun = (config: Record<string, unknown>) => ({
  brandId: 'brand-1',
  config,
  createdAt,
  id: 'run-1',
  isDeleted: false,
  organizationId: 'org-1',
  status: ContentRunStatus.PENDING,
  updatedAt,
});

describe('BrandRemixRunsService', () => {
  const contentRun = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    asset: { findMany: vi.fn() },
    contentRun,
    credential: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn() },
    post: { findFirst: vi.fn(), findMany: vi.fn() },
    sourcePost: { findFirst: vi.fn() },
    trendSourceReference: { findFirst: vi.fn() },
  } as unknown as PrismaService;
  const brandsService = {
    findOne: vi.fn(),
    resolveBrandKitAssets: vi.fn(),
  };
  const organizationSettingsService = { findOne: vi.fn() };
  const adsResearchService = {
    getAdDetail: vi.fn(),
    prepareCampaignForReview: vi.fn(),
  };
  const imageGenerationService = { generateImage: vi.fn() };
  const videoGenerationService = { generateVideo: vi.fn() };
  const avatarVideoGenerationService = { generateAvatarVideo: vi.fn() };
  const batchGenerationService = { createManualReviewBatch: vi.fn() };
  const trendReferenceCorpusService = { recordPostRemixLineage: vi.fn() };
  const runtime = {
    now: () => new Date('2026-08-20T10:00:00.000Z'),
    randomId: vi.fn(),
  };
  const request = { context: { organizationId: 'org-1' } } as Request;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as AuthenticatedUser;
  let service: BrandRemixRunsService;

  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (
        operation: (transaction: { contentRun: typeof contentRun }) => unknown,
      ) => operation({ contentRun }),
    );
    contentRun.findFirst.mockResolvedValue(null);
    let variantSequence = 0;
    runtime.randomId
      .mockReset()
      .mockImplementation(() => `variant-${++variantSequence}`);
    brandsService.findOne.mockResolvedValue(brand);
    brandsService.resolveBrandKitAssets.mockResolvedValue({
      references: [
        {
          id: 'brand-reference-1',
          label: 'Product reference',
          role: 'reference',
          url: 'https://signed.example/reference?token=must-not-persist',
        },
      ],
    });
    organizationSettingsService.findOne.mockResolvedValue({
      organizationId: 'org-1',
    });
    (prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      sourcePost,
    );
    (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'brand-reference-1' },
    ]);
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brandId: 'brand-1',
        category: 'AVATAR',
        id: 'avatar-1',
        status: IngredientStatus.GENERATED,
      },
      {
        brandId: 'brand-1',
        category: 'VOICE',
        externalVoiceId: 'voice-external-1',
        id: 'voice-1',
        isCloned: true,
        status: IngredientStatus.GENERATED,
      },
    ]);

    service = new BrandRemixRunsService(
      prisma,
      brandsService as never,
      organizationSettingsService as never,
      adsResearchService as never,
      imageGenerationService as never,
      videoGenerationService as never,
      avatarVideoGenerationService as never,
      batchGenerationService as never,
      trendReferenceCorpusService as never,
      runtime,
    );
  });

  it('prefills a durable run exclusively from a server-authorized source and live brand defaults', async () => {
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );

    const result = await service.create('org-1', 'brand-1', {
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(prisma.sourcePost.findFirst).toHaveBeenCalledWith({
      select: expect.any(Object),
      where: {
        brandId: 'brand-1',
        id: 'source-post-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(result).toMatchObject({
      brand: { contextMode: 'brand', id: 'brand-1', name: 'Acme' },
      contract: 'brand-remix-run',
      draft: {
        identity: {
          avatarAssetId: 'avatar-1',
          speechVoiceId: 'voice-1',
        },
        output: { aspectRatio: '9:16', count: 3, kind: 'avatar' },
        references: [
          {
            assetId: 'brand-reference-1',
            role: 'product',
            source: 'brand_default',
          },
        ],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'tiktok' },
      },
      phase: 'prefilled',
      recipeVersion: 1,
      revision: 1,
      sourceSnapshot: {
        canonicalUrl: 'https://tiktok.example/@creator/video/1',
        platform: 'tiktok',
        selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
        sourceId: 'source-post-1',
      },
      status: ContentRunStatus.PENDING,
      version: 1,
    });
    const persisted = contentRun.create.mock.calls[0]?.[0]?.data?.config;
    expect(JSON.stringify(persisted)).not.toContain('signed.example');
    expect(JSON.stringify(persisted)).not.toContain('media.example');
    expect(JSON.stringify(persisted)).not.toContain('must-not-persist');
    expect(result.draft.intent.objective).toBe(
      'Meet Acme. Put the outcome first, make the next step clear, and discover what Acme can do for you.',
    );
    expect(result.draft.intent.objective).not.toContain(sourcePost.text);
    expect(result.draft.intent.objective).not.toContain('Create an original');
    expect(result.source).toBeUndefined();
  });

  it('recommends a brand avatar for vertical video when paired identity defaults are ready', async () => {
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );

    const result = await service.create('org-1', 'brand-1', {
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(result.draft.output).toEqual({
      aspectRatio: '9:16',
      count: 3,
      kind: 'avatar',
    });
  });

  it('rejects an owned Post outside the requested organization and brand scope', async () => {
    (prisma.post.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      service.create('org-1', 'brand-1', {
        source: { kind: 'owned_post', postId: 'post-other-brand' },
      }),
    ).rejects.toThrow();

    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: 'post-other-brand',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('resolves a trend reference only through a live tenant-visible trend link', async () => {
    (
      prisma.trendSourceReference.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      authorHandle: 'creator',
      canonicalUrl: 'https://tiktok.example/trend/1?token=secret',
      currentEngagementTotal: 2400,
      data: {
        caption: 'A source caption that remains snapshot-only.',
        contentType: 'video',
      },
      id: 'reference-1',
      latestTrendViralityScore: 82,
      platform: 'tiktok',
    });
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );

    const result = await service.create('org-1', 'brand-1', {
      source: {
        kind: 'trend_reference',
        sourceReferenceId: 'reference-1',
        trendId: 'trend-1',
      },
    });

    expect(prisma.trendSourceReference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'reference-1',
          isDeleted: false,
          links: {
            some: {
              isDeleted: false,
              trend: {
                OR: [{ brandId: 'brand-1' }, { brandId: null }],
                id: 'trend-1',
                isDeleted: false,
                organizationId: 'org-1',
              },
              trendId: 'trend-1',
            },
          },
        },
      }),
    );
    expect(result.sourceSnapshot.canonicalUrl).toBe(
      'https://tiktok.example/trend/1',
    );
  });

  it('keeps source copy in the snapshot but never compiles it into generation intent', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      },
    });
    contentRun.findFirst.mockResolvedValue(created);
    contentRun.updateMany.mockResolvedValue({ count: 1 });
    imageGenerationService.generateImage.mockResolvedValue({
      data: { id: 'image-1', type: 'ingredient' },
    });
    let stored = created;
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      contentRun.findFirst.mockResolvedValue(stored);
      return Promise.resolve({ count: 1 });
    });

    const result = await service.start(
      'org-1',
      'run-1',
      user,
      request as never,
      { expectedRevision: 1 },
    );

    const compiled = JSON.stringify(result.execution?.generationBrief);
    expect(result.sourceSnapshot.title).toContain('painful old workflow');
    expect(compiled).not.toContain(sourcePost.text);
    expect(compiled).not.toContain('painful old workflow');
    expect(imageGenerationService.generateImage).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        text: expect.not.stringContaining('painful old workflow'),
      }),
      request,
      expect.any(Function),
    );
  });

  it('authorizes a connected-ad credential against both organization and brand before provider reads', async () => {
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      service.create('org-1', 'brand-1', {
        source: {
          adAccountId: 'act-1',
          adId: 'ad-1',
          credentialId: 'credential-other-brand',
          kind: 'connected_ad',
          platform: 'meta',
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'credential-other-brand',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'FACEBOOK',
      },
    });
    expect(adsResearchService.getAdDetail).not.toHaveBeenCalled();
  });

  it('normalizes empty provider ad labels into durable safe snapshot fallbacks', async () => {
    adsResearchService.getAdDetail.mockResolvedValue({
      channel: 'all',
      creative: {},
      explanation: '   ',
      id: 'public:meta:ad-1',
      metrics: {},
      platform: 'meta',
      source: 'public',
      sourceId: '   ',
      title: '   ',
    });
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );

    const result = await service.create('org-1', 'brand-1', {
      source: { adPerformanceId: 'performance-1', kind: 'public_ad' },
    });

    expect(result.sourceSnapshot).toMatchObject({
      evidence: ['Performance evidence is available for this ad.'],
      sourceId: 'performance-1',
      title: 'Performance meta ad',
    });
  });

  it('uses an atomic revision compare-and-swap and rejects stale editors', async () => {
    const created = await createPersistedRun();
    contentRun.findFirst.mockResolvedValue(created);
    contentRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.revise('org-1', 'run-1', {
        edits: { intent: { hook: 'A sharper hook' } },
        expectedRevision: 1,
      }),
    ).rejects.toThrow(ConflictException);

    expect(contentRun.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ config: expect.any(Object) }),
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { config: { equals: 1, path: ['revision'] } },
          { config: { equals: 'prefilled', path: ['phase'] } },
        ]),
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
      }),
    });
  });

  it('replaces an unchanged visual directive with safe speech when switching to Avatar', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '9:16', count: 1, kind: 'video' },
      },
    });
    contentRun.findFirst.mockResolvedValue(created);
    contentRun.updateMany.mockImplementation(({ data }) => {
      contentRun.findFirst.mockResolvedValue(
        makeRun(data.config as Record<string, unknown>),
      );
      return Promise.resolve({ count: 1 });
    });

    const result = await service.revise('org-1', 'run-1', {
      edits: { output: { kind: 'avatar' } },
      expectedRevision: 1,
    });

    expect(result.draft.intent.objective).toBe(
      'Meet Acme. Put the outcome first, make the next step clear, and discover what Acme can do for you.',
    );
  });

  it('lets explicit semantic references outrank same-role brand defaults', async () => {
    (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'explicit-product' },
    ]);
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );

    const result = await service.create('org-1', 'brand-1', {
      edits: {
        references: [
          {
            assetId: 'explicit-product',
            role: 'product',
          },
        ],
      },
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(result.draft.references).toEqual([
      {
        assetId: 'explicit-product',
        role: 'product',
        source: 'explicit',
      },
    ]);
  });

  it('authorizes every reference before invoking credits or a provider', async () => {
    const created = await createPersistedRun({
      draft: {
        references: [
          { assetId: 'missing-reference', role: 'product', source: 'explicit' },
        ],
      },
    });
    contentRun.findFirst.mockResolvedValue(created);
    (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    await expect(
      service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
    expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).not.toHaveBeenCalled();
    expect(contentRun.updateMany).not.toHaveBeenCalled();
  });

  it('reuses the latest editable run for the same scoped source selector', async () => {
    const created = await createPersistedRun();
    contentRun.findFirst.mockResolvedValue(created);

    const result = await service.create('org-1', 'brand-1', {
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(result.id).toBe('run-1');
    expect(contentRun.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      select: expect.any(Object),
      where: expect.objectContaining({
        AND: [
          {
            config: {
              equals: {
                kind: 'source_post',
                sourcePostId: 'source-post-1',
              },
              path: ['sourceSnapshot', 'selector'],
            },
          },
          { config: { equals: 'prefilled', path: ['phase'] } },
        ],
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: ContentRunStatus.PENDING,
      }),
    });
    expect(contentRun.create).toHaveBeenCalledTimes(1);
  });

  it('serializes the final reuse-or-create boundary for rapid Remix clicks', async () => {
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );

    await service.create('org-1', 'brand-1', {
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(contentRun.findFirst).toHaveBeenCalledTimes(2);
    expect(contentRun.create).toHaveBeenCalledTimes(1);
  });

  it('dispatches one durable variant per requested image and preserves the canonical generation brief', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '1:1', count: 2, kind: 'image' },
      },
    });
    contentRun.findFirst.mockResolvedValue(created);
    contentRun.updateMany.mockResolvedValue({ count: 1 });
    imageGenerationService.generateImage
      .mockResolvedValueOnce({ data: { id: 'image-1', type: 'ingredient' } })
      .mockResolvedValueOnce({ data: { id: 'image-2', type: 'ingredient' } });

    let stored = created;
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      contentRun.findFirst.mockResolvedValue(stored);
      return Promise.resolve({ count: 1 });
    });

    const result = await service.start(
      'org-1',
      'run-1',
      user,
      request as never,
      { expectedRevision: 1 },
    );

    expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(2);
    expect(imageGenerationService.generateImage).toHaveBeenNthCalledWith(
      1,
      user,
      expect.objectContaining({
        brandId: 'brand-1',
        brandingMode: 'brand',
        height: 1024,
        outputs: 1,
        references: ['brand-reference-1'],
        width: 1024,
      }),
      request,
      expect.any(Function),
    );
    expect(result.execution).toMatchObject({
      actualCount: 0,
      generationBrief: {
        mediaKind: 'image',
        references: [{ assetId: 'brand-reference-1', role: 'product' }],
        version: 1,
      },
      requestedCount: 2,
      variants: [
        {
          assetIds: ['image-1'],
          id: 'variant-1',
          recipeRevision: 1,
          status: 'processing',
        },
        {
          assetIds: ['image-2'],
          id: 'variant-2',
          recipeRevision: 1,
          status: 'processing',
        },
      ],
    });
  });

  it('persists the placeholder ID before image provider dispatch continues', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      },
    });
    let stored = created;
    const order: string[] = [];
    contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      const execution = (
        stored.config as {
          execution?: { variants?: Array<{ assetIds?: string[] }> };
        }
      ).execution;
      if (
        execution?.variants?.some((variant) =>
          variant.assetIds?.includes('image-linked-before-provider'),
        )
      ) {
        order.push('linked');
      }
      return Promise.resolve({ count: 1 });
    });
    imageGenerationService.generateImage.mockImplementation(
      async (_user, _dto, _request, onPlaceholderCreated) => {
        await onPlaceholderCreated?.('image-linked-before-provider');
        order.push('provider');
        return {
          data: {
            id: 'image-linked-before-provider',
            type: 'ingredient',
          },
        };
      },
    );

    const result = await service.start(
      'org-1',
      'run-1',
      user,
      request as never,
      { expectedRevision: 1 },
    );

    expect(order.indexOf('linked')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('linked')).toBeLessThan(order.indexOf('provider'));
    expect(result.execution?.variants[0]?.assetIds).toEqual([
      'image-linked-before-provider',
    ]);
  });

  it('blocks strict fidelity before any generation provider call', async () => {
    const created = await createPersistedRun({
      draft: {
        fidelityMode: 'strict',
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      },
    });
    contentRun.findFirst.mockResolvedValue(created);

    await expect(
      service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      }),
    ).rejects.toThrow(ConflictException);

    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
    expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).not.toHaveBeenCalled();
  });

  it('resumes only unlinked queued or processing variants after a crash', async () => {
    const created = await createPersistedRun({
      draft: {
        identity: {},
        output: { aspectRatio: '1:1', count: 4, kind: 'image' },
      },
      execution: {
        actualCount: 1,
        generationBrief: {
          constraints: [
            {
              kind: 'avoid',
              required: true,
              value: 'Do not copy the source creative.',
            },
          ],
          fidelityMode: 'guided',
          intent: {
            objective: 'Create an original TikTok execution for Acme.',
            requestedText: [],
            subjects: ['Acme'],
            visualDirection: 'Use an original product-led composition.',
          },
          mediaKind: 'image',
          output: { aspectRatio: '1:1' },
          provenance: [],
          references: [{ assetId: 'brand-reference-1', role: 'product' }],
          version: 1,
        },
        requestedCount: 4,
        variants: [
          {
            assetIds: [],
            id: 'variant-queued',
            recipeRevision: 1,
            status: 'queued',
          },
          {
            assetIds: [],
            id: 'variant-crashed-before-link',
            recipeRevision: 1,
            status: 'processing',
          },
          {
            assetIds: ['image-in-flight'],
            id: 'variant-in-flight',
            recipeRevision: 1,
            status: 'processing',
          },
          {
            assetIds: ['image-ready'],
            id: 'variant-ready',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'partially_ready',
    });
    let stored = created;
    contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      return Promise.resolve({ count: 1 });
    });
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-in-flight', status: IngredientStatus.PROCESSING },
      { id: 'image-ready', status: IngredientStatus.GENERATED },
    ]);
    imageGenerationService.generateImage
      .mockImplementationOnce(async (_user, _dto, _request, onCreated) => {
        await onCreated?.('image-resumed-1');
        return { data: { id: 'image-resumed-1', type: 'ingredient' } };
      })
      .mockImplementationOnce(async (_user, _dto, _request, onCreated) => {
        await onCreated?.('image-resumed-2');
        return { data: { id: 'image-resumed-2', type: 'ingredient' } };
      });

    const result = await service.start(
      'org-1',
      'run-1',
      user,
      request as never,
      { expectedRevision: 1 },
    );

    expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(2);
    expect(result.execution?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetIds: ['image-in-flight'],
          id: 'variant-in-flight',
        }),
        expect.objectContaining({
          assetIds: ['image-ready'],
          id: 'variant-ready',
          status: 'ready',
        }),
        expect.objectContaining({
          assetIds: ['image-resumed-1'],
          id: 'variant-queued',
        }),
        expect.objectContaining({
          assetIds: ['image-resumed-2'],
          id: 'variant-crashed-before-link',
        }),
      ]),
    );
  });

  it('re-authorizes the durable source selector before generation dispatch', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      },
    });
    contentRun.findFirst.mockResolvedValue(created);
    (prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      }),
    ).rejects.toThrow();

    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
    expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).not.toHaveBeenCalled();
  });

  it('re-checks a connected credential before any generation provider call', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      },
    });
    const config = created.config as Record<string, unknown>;
    const sourceSnapshot = config.sourceSnapshot as Record<string, unknown>;
    const connected = makeRun({
      ...config,
      sourceSnapshot: {
        ...sourceSnapshot,
        platform: 'meta',
        selector: {
          adAccountId: 'act-1',
          adId: 'ad-1',
          credentialId: 'credential-1',
          kind: 'connected_ad',
          platform: 'meta',
        },
        sourceId: 'ad-1',
      },
    });
    contentRun.findFirst.mockResolvedValue(connected);
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(adsResearchService.getAdDetail).not.toHaveBeenCalled();
    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
  });

  it('compiles the canonical brief into safe semantic provider input', async () => {
    const created = await createPersistedRun({
      draft: {
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      },
    });
    let stored = created;
    contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      return Promise.resolve({ count: 1 });
    });
    imageGenerationService.generateImage.mockImplementation(
      async (_user, _dto, _request, onCreated) => {
        await onCreated?.('image-semantic-1');
        return { data: { id: 'image-semantic-1', type: 'ingredient' } };
      },
    );

    await service.start('org-1', 'run-1', user, request as never, {
      expectedRevision: 1,
    });

    const providerInput = imageGenerationService.generateImage.mock
      .calls[0]?.[1].text as string;
    expect(providerInput).toContain('Brand subjects: Acme');
    expect(providerInput).toContain('Reference 1 role: product');
    expect(providerInput).toContain('Required avoid constraint:');
    expect(providerInput).toContain('Output aspect ratio: 1:1');
    expect(providerInput).not.toContain(sourcePost.text);
  });

  it('sends Avatar a speakable brand script instead of provider instructions', async () => {
    const created = await createPersistedRun();
    let stored = created;
    contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      return Promise.resolve({ count: 1 });
    });
    avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
      async (_params, _context, onCreated) => {
        await onCreated?.('avatar-semantic-1');
        return {
          externalId: 'heygen-1',
          ingredientId: 'avatar-semantic-1',
          status: 'processing',
        };
      },
    );

    await service.start('org-1', 'run-1', user, request as never, {
      expectedRevision: 1,
    });

    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '9:16',
        clonedVoiceId: 'voice-1',
        photoIngredientId: 'avatar-1',
        text: expect.stringContaining('Acme'),
      }),
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
      expect.any(Function),
    );
    const providerText =
      avatarVideoGenerationService.generateAvatarVideo.mock.calls[0]?.[0].text;
    expect(providerText).not.toContain('Objective:');
    expect(providerText).not.toContain('Reference 1 role:');
    expect(providerText).not.toContain('constraint:');
    expect(providerText).not.toContain('Create an original');
    expect(providerText).not.toContain(sourcePost.text);
  });

  it('passes an operator-authored Avatar script verbatim after trimming', async () => {
    const exactScript = '  Here is the exact line our avatar should say.  ';
    const created = await createPersistedRun({
      draft: { intent: { objective: exactScript } },
    });
    let stored = created;
    contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      stored.status = (data.status ?? stored.status) as ContentRunStatus;
      return Promise.resolve({ count: 1 });
    });
    avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
      async (_params, _context, onCreated) => {
        await onCreated?.('avatar-script-1');
        return {
          externalId: 'heygen-script-1',
          ingredientId: 'avatar-script-1',
          status: 'processing',
        };
      },
    );

    await service.start('org-1', 'run-1', user, request as never, {
      expectedRevision: 1,
    });

    expect(
      avatarVideoGenerationService.generateAvatarVideo.mock.calls[0]?.[0].text,
    ).toBe(exactScript.trim());
  });

  it('hands ready brand-owned variants to the existing manual Review queue idempotently', async () => {
    const created = await createPersistedRun({
      execution: {
        actualCount: 1,
        generationBrief: {
          constraints: [],
          fidelityMode: 'guided',
          intent: {
            objective: 'Create an original TikTok visual.',
            requestedText: [],
            subjects: ['Acme'],
          },
          mediaKind: 'image',
          output: { aspectRatio: '9:16' },
          provenance: [],
          references: [],
          version: 1,
        },
        requestedCount: 1,
        variants: [
          {
            assetIds: ['image-1'],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'ready_for_review',
    });
    contentRun.findFirst.mockResolvedValue(created);
    contentRun.updateMany.mockResolvedValue({ count: 1 });
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brandId: 'brand-1',
        category: 'IMAGE',
        id: 'image-1',
        status: IngredientStatus.GENERATED,
      },
    ]);
    batchGenerationService.createManualReviewBatch.mockResolvedValue({
      id: 'batch-1',
      items: [{ id: 'item-1', postId: 'post-1' }],
    });
    let stored = created;
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      contentRun.findFirst.mockResolvedValue(stored);
      return Promise.resolve({ count: 1 });
    });

    const result = await service.submitForReview('org-1', 'run-1', 'user-1', {
      variantIds: ['variant-1'],
    });

    expect(batchGenerationService.createManualReviewBatch).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        items: [
          expect.objectContaining({
            contentRunId: 'run-1',
            ingredientId: 'image-1',
            sourceActionId: 'source-post-1',
            variantId: 'variant-1',
          }),
        ],
      },
      'user-1',
      'org-1',
      'brand-remix:run-1:review:1:variant-1',
    );
    expect(result).toMatchObject({
      phase: 'in_review',
      review: { approvedPostIds: [], batchId: 'batch-1', postIds: ['post-1'] },
    });
  });

  it('returns an explicit blocked readiness result instead of faking a Meta campaign', async () => {
    const created = await createPersistedRun({
      draft: { target: { kind: 'paid', platform: 'meta' } },
      phase: 'approved',
      review: {
        approvedPostIds: ['post-1'],
        batchId: 'batch-1',
        postIds: ['post-1'],
      },
    });
    contentRun.findFirst.mockResolvedValue(created);
    contentRun.updateMany.mockResolvedValue({ count: 1 });
    (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'post-1',
        reviewDecision: PersistedReviewDecision.APPROVED,
      },
    ]);
    let stored = created;
    contentRun.updateMany.mockImplementation(({ data }) => {
      stored = makeRun(data.config as Record<string, unknown>);
      contentRun.findFirst.mockResolvedValue(stored);
      return Promise.resolve({ count: 1 });
    });

    const result = await service.preparePausedMetaDraft(
      'org-1',
      'run-1',
      'user-1',
      {},
    );

    expect(result.readiness).toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'missing_required_reference',
          severity: 'blocked',
        }),
      ],
      state: 'blocked',
    });
    expect(adsResearchService.prepareCampaignForReview).not.toHaveBeenCalled();
  });

  async function createPersistedRun(
    overrides: {
      draft?: Record<string, unknown>;
      execution?: Record<string, unknown>;
      phase?: string;
      review?: Record<string, unknown>;
    } = {},
  ) {
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );
    const result = await service.create('org-1', 'brand-1', {
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });
    const config = contentRun.create.mock.calls[0]?.[0]?.data?.config as Record<
      string,
      unknown
    >;
    const run = makeRun({
      ...config,
      ...(overrides.draft
        ? {
            draft: {
              ...(config.draft as Record<string, unknown>),
              ...overrides.draft,
            },
          }
        : {}),
      ...(overrides.execution ? { execution: overrides.execution } : {}),
      ...(overrides.phase ? { phase: overrides.phase } : {}),
      ...(overrides.review ? { review: overrides.review } : {}),
    });
    expect(result.id).toBe('run-1');
    return run;
  }
});
