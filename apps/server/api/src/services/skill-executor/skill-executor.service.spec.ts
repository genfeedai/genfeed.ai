import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { ByokProvider, ContentRunStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('SkillExecutorService', () => {
  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const runId = 'test-object-id';

  const baseContext = {
    brandId,
    brandVoice: 'Friendly and concise',
    organizationId: orgId,
    platforms: ['instagram'],
  };

  const mockSkillsService = {
    assertBrandSkillEnabled: vi.fn(),
    getSkillById: vi.fn(),
  };

  const mockContentRunsService = {
    createRun: vi.fn(),
    patchRun: vi.fn(),
  };

  const mockByokProviderFactoryService = {
    resolveProvider: vi.fn(),
  };

  const mockHandler = {
    execute: vi.fn(),
  };

  let service: SkillExecutorService;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockContentRunsService.createRun.mockResolvedValue({ _id: runId });
    mockContentRunsService.patchRun.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillExecutorService,
        {
          provide: SkillsService,
          useValue: mockSkillsService,
        },
        {
          provide: ContentRunsService,
          useValue: mockContentRunsService,
        },
        {
          provide: ByokProviderFactoryService,
          useValue: mockByokProviderFactoryService,
        },
        { provide: ContentWritingHandler, useValue: mockHandler },
        { provide: ImageGenerationHandler, useValue: mockHandler },
        { provide: TrendDiscoveryHandler, useValue: mockHandler },
        { provide: TrendRemixHandler, useValue: mockHandler },
      ],
    }).compile();

    service = module.get(SkillExecutorService);
  });

  it('executes a registered skill and tracks content run', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [],
      slug: 'content-writing',
    });
    mockHandler.execute.mockResolvedValue({
      content: 'Generated content',
      metadata: {},
      platforms: ['instagram'],
      skillSlug: 'content-writing',
      type: 'text',
    });

    const result = await service.execute('content-writing', baseContext, {
      audience: 'founders',
      channelFit: 'X thread',
      confidence: 0.72,
      hypothesis: 'founder pain wins',
      risk: 'Avoid hype claims',
      sourceReferenceId: 'source-ref-1',
      sourceUrl: 'https://x.com/builderx/status/1',
      topic: 'AI strategy',
    });

    expect(result.draft.skillSlug).toBe('content-writing');
    expect(result.source).toBe('hosted');
    expect(mockContentRunsService.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({
          audience: 'founders',
          channelFit: 'X thread',
          confidence: 0.72,
          hypothesis: 'founder pain wins',
          risk: 'Avoid hype claims',
          sourceId: 'source-ref-1',
          sourceUrl: 'https://x.com/builderx/status/1',
        }),
        input: expect.objectContaining({
          audience: 'founders',
          hypothesis: 'founder pain wins',
          topic: 'AI strategy',
        }),
      }),
    );
    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({ status: ContentRunStatus.RUNNING }),
    );
    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({
        status: ContentRunStatus.COMPLETED,
        variants: [
          expect.objectContaining({
            content: 'Generated content',
            id: `${runId}-content-writing-1`,
            platform: 'instagram',
            status: 'generated',
            type: 'text',
          }),
        ],
      }),
    );
  });

  it('throws when skill does not exist', async () => {
    mockSkillsService.getSkillById.mockResolvedValue(null);

    await expect(
      service.execute('unknown-skill', baseContext),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws when skill is disabled', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: false,
      slug: 'content-writing',
    });

    await expect(
      service.execute('content-writing', baseContext),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('marks run as failed when handler throws', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [],
      slug: 'content-writing',
    });
    mockHandler.execute.mockRejectedValue(
      new Error('content-writing requires a topic'),
    );

    await expect(
      service.execute('content-writing', baseContext, {}),
    ).rejects.toThrow('content-writing requires a topic');

    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({
        error: 'content-writing requires a topic',
        status: ContentRunStatus.FAILED,
      }),
    );
  });

  it('resolves BYOK source when skill has required providers', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [ByokProvider.OPENAI],
      slug: 'content-writing',
    });
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'user-key',
      source: 'byok',
    });
    mockHandler.execute.mockResolvedValue({
      content: 'BYOK content',
      metadata: {},
      platforms: ['instagram'],
      skillSlug: 'content-writing',
      type: 'text',
    });

    const result = await service.execute('content-writing', baseContext, {
      topic: 'test',
    });

    expect(result.source).toBe('byok');
    expect(mockByokProviderFactoryService.resolveProvider).toHaveBeenCalledWith(
      orgId,
      ByokProvider.OPENAI,
    );
  });

  it('marks run as failed for unregistered handler slug', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [],
      slug: 'video-editing',
    });

    await expect(
      service.execute('video-editing', baseContext),
    ).rejects.toMatchObject({ status: 404 });

    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({
        error: 'No handler registered for skill: video-editing',
        status: ContentRunStatus.FAILED,
      }),
    );
  });

  it('records duration on both success and failure', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [],
      slug: 'content-writing',
    });
    mockHandler.execute.mockResolvedValue({
      content: 'done',
      metadata: {},
      platforms: ['instagram'],
      skillSlug: 'content-writing',
      type: 'text',
    });

    const result = await service.execute('content-writing', baseContext, {
      topic: 'test',
    });

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({ duration: expect.any(Number) }),
    );
  });

  it('stores Remix Pack definitions as run variants', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [],
      slug: 'trend-remix',
    });
    mockHandler.execute.mockResolvedValue({
      content: 'Primary thread content',
      metadata: {
        remixPackVariants: [
          {
            angle: 'Operator pain point',
            content: 'Primary thread content',
            format: 'post-thread',
            hypothesis: 'Pain-first threads convert',
            platform: 'twitter',
            type: 'text',
          },
          {
            angle: 'Visual proof',
            content: 'Image creative prompt',
            format: 'social-image-creative',
            hypothesis: 'A proof visual increases shares',
            platform: 'twitter',
            type: 'image',
          },
          {
            angle: 'Video hook',
            content: 'Short-form script',
            format: 'short-form-video-script',
            hypothesis: 'Fast hooks retain attention',
            platform: 'twitter',
            type: 'video-script',
          },
          {
            angle: 'Long-form breakdown',
            content: 'Newsletter outline',
            format: 'article-newsletter-angle',
            hypothesis: 'Deeper analysis captures high-intent users',
            platform: 'newsletter',
            type: 'article',
          },
          {
            angle: 'Reply derivative',
            content: 'Follow-up reply',
            format: 'follow-up-reply',
            hypothesis: 'Replies extend the loop',
            platform: 'twitter',
            type: 'reply',
          },
        ],
        trendId: 'trend-1',
      },
      platforms: ['twitter'],
      skillSlug: 'trend-remix',
      type: 'text',
    });

    await service.execute('trend-remix', baseContext, {
      trendId: 'trend-1',
    });

    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({
        status: ContentRunStatus.COMPLETED,
        variants: [
          expect.objectContaining({
            angle: 'Operator pain point',
            format: 'post-thread',
            hypothesis: 'Pain-first threads convert',
            id: `${runId}-trend-remix-post-thread`,
            metadata: expect.objectContaining({
              remixPack: true,
              trendId: 'trend-1',
            }),
            platform: 'twitter',
            type: 'text',
          }),
          expect.objectContaining({ format: 'social-image-creative' }),
          expect.objectContaining({ format: 'short-form-video-script' }),
          expect.objectContaining({ format: 'article-newsletter-angle' }),
          expect.objectContaining({ format: 'follow-up-reply' }),
        ],
      }),
    );
  });

  it('captures publish context when scheduling metadata is present', async () => {
    mockSkillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [],
      slug: 'content-writing',
    });
    mockHandler.execute.mockResolvedValue({
      content: 'Scheduled content',
      metadata: {},
      platforms: ['instagram'],
      skillSlug: 'content-writing',
      type: 'text',
    });

    await service.execute('content-writing', baseContext, {
      channel: 'organic-social',
      experimentId: 'exp-123',
      platform: 'instagram',
      scheduledFor: '2026-04-14T09:00:00.000Z',
      topic: 'Scheduling test',
      variantId: 'variant-a',
    });

    expect(mockContentRunsService.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: expect.objectContaining({
          channel: 'organic-social',
          experimentId: 'exp-123',
          platform: 'instagram',
          scheduledFor: new Date('2026-04-14T09:00:00.000Z'),
          variantId: 'variant-a',
        }),
      }),
    );
  });

  it('tracks variants for gateway execution runs', async () => {
    mockHandler.execute.mockResolvedValue({
      confidence: 0.91,
      content: 'Gateway content',
      metadata: { assetIds: ['asset-1'] },
      platforms: ['linkedin'],
      skillSlug: 'content-writing',
      type: 'text',
    });

    const result = await service.executeSkill(
      {
        brandId,
        organizationId: orgId,
        signalType: 'manual',
      },
      'content-writing',
      {
        audience: 'operators',
        topic: 'Gateway test',
      },
    );

    expect(result.runId).toBe(runId);
    expect(mockContentRunsService.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({
          audience: 'operators',
        }),
      }),
    );
    expect(mockContentRunsService.patchRun).toHaveBeenCalledWith(
      orgId,
      runId,
      expect.objectContaining({
        status: ContentRunStatus.COMPLETED,
        variants: [
          expect.objectContaining({
            assetIds: ['asset-1'],
            content: 'Gateway content',
            id: `${runId}-content-writing-1`,
            metadata: {
              assetIds: ['asset-1'],
            },
            platform: 'linkedin',
            status: 'generated',
            type: 'text',
          }),
        ],
      }),
    );
  });
});
