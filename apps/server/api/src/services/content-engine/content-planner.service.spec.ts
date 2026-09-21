import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { PlanPerformanceContextService } from '@api/services/content-engine/plan-performance-context.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { ContentPlanItemType, ContentPlanStatus } from '@genfeedai/contracts';
import type { ContentPlanGeneration } from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

const mockOrgId = 'test-object-id';
const mockBrandId = 'test-object-id';
const mockUserId = 'test-object-id';
const mockPlanId = 'test-object-id';

const baseBrand = {
  _id: mockBrandId,
  agentConfig: {
    strategy: {
      contentTypes: ['short-video', 'image'],
      frequency: 'daily',
      goals: ['engagement', 'growth'],
      platforms: ['instagram', 'tiktok'],
    },
    voice: {
      audience: ['gen-z', 'millennials'],
      style: 'casual',
      tone: 'playful',
      values: ['authenticity', 'fun'],
    },
  },
};

const brandWithoutAgentConfig = {
  _id: mockBrandId,
  agentConfig: null,
};

const baseDto = {
  additionalInstructions: 'Keep it short',
  itemCount: 3,
  name: 'My Plan',
  periodEnd: '2026-03-07',
  periodStart: '2026-03-01',
  platforms: ['instagram', 'twitter'],
  topics: ['AI trends', 'startup life'],
};

const llmPlan: ContentPlanGeneration = {
  items: [
    {
      platforms: ['instagram'],
      prompt: 'Write about AI trends',
      scheduledAt: '2026-03-01T10:00:00Z',
      skillSlug: 'content-writing',
      topic: 'AI trends',
      type: ContentPlanItemType.SKILL,
    },
    {
      pipelineSteps: [
        {
          aspectRatio: '1:1',
          model: 'fal-ai/flux-pro/v1.1',
          prompt: 'Epic visual',
          type: 'text-to-image',
        },
      ],
      platforms: ['tiktok'],
      prompt: 'Create visual for product launch',
      topic: 'Product launch',
      type: ContentPlanItemType.MEDIA_PIPELINE,
    },
  ],
  name: 'AI Content Plan',
};

type BrandLookup = Awaited<ReturnType<BrandsService['findOne']>>;
type PlanRecord = Awaited<ReturnType<ContentPlansService['createInternal']>>;
type ItemRecords = Awaited<ReturnType<ContentPlanItemsService['createMany']>>;

function asBrandLookup(
  brand: typeof baseBrand | typeof brandWithoutAgentConfig | null,
): BrandLookup {
  return brand as unknown as BrandLookup;
}

function asPlan(plan: { _id: string }): PlanRecord {
  return plan as unknown as PlanRecord;
}

function asItems(items: Array<{ _id?: string; topic?: string }>): ItemRecords {
  return items as unknown as ItemRecords;
}

describe('ContentPlannerService', () => {
  let service: ContentPlannerService;
  let brandsService: vi.Mocked<BrandsService>;
  let contentPlansService: vi.Mocked<ContentPlansService>;
  let contentPlanItemsService: vi.Mocked<ContentPlanItemsService>;
  let llmDispatcherService: vi.Mocked<LlmDispatcherService>;
  let logger: vi.Mocked<LoggerService>;
  let planPerformanceContextService: vi.Mocked<PlanPerformanceContextService>;

  function stubGeneratePlan(options?: {
    brand?: typeof baseBrand | typeof brandWithoutAgentConfig | null;
    generated?: ContentPlanGeneration;
    plan?: { _id: string };
    items?: Array<{ _id?: string; topic?: string }>;
  }) {
    const brand = options && 'brand' in options ? options.brand : baseBrand;
    brandsService.findOne.mockResolvedValue(asBrandLookup(brand ?? null));
    llmDispatcherService.completeStructured.mockResolvedValue(
      options?.generated ?? llmPlan,
    );
    contentPlansService.createInternal.mockResolvedValue(
      asPlan(options?.plan ?? { _id: mockPlanId }),
    );
    contentPlanItemsService.createMany.mockResolvedValue(
      asItems(options?.items ?? []),
    );
  }

  beforeEach(() => {
    brandsService = {
      findOne: vi.fn(),
    } as unknown as vi.Mocked<BrandsService>;
    contentPlansService = {
      createInternal: vi.fn(),
    } as unknown as vi.Mocked<ContentPlansService>;
    contentPlanItemsService = {
      createMany: vi.fn(),
    } as unknown as vi.Mocked<ContentPlanItemsService>;
    llmDispatcherService = {
      completeStructured: vi.fn(),
    } as unknown as vi.Mocked<LlmDispatcherService>;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    planPerformanceContextService = {
      build: vi.fn().mockResolvedValue({
        dataset: {
          confidence: 'none',
          genfeedPosts: 0,
          importedPosts: 0,
          totalPosts: 0,
        },
        isColdStart: true,
        section: '',
      }),
    } as unknown as vi.Mocked<PlanPerformanceContextService>;

    service = new ContentPlannerService(
      contentPlansService,
      contentPlanItemsService,
      brandsService,
      llmDispatcherService,
      logger,
      planPerformanceContextService,
    );
  });

  it('grounds the user prompt in the plan performance context', async () => {
    stubGeneratePlan();
    planPerformanceContextService.build.mockResolvedValueOnce({
      dataset: {
        confidence: 'low',
        genfeedPosts: 1,
        importedPosts: 2,
        totalPosts: 3,
      },
      isColdStart: true,
      section:
        'Cold start: only 3 own posts in the window.\n- "Stop scrolling, start shipping" — by Rival Co, on meta (score 91)',
    });

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(planPerformanceContextService.build).toHaveBeenCalledWith({
      brandId: mockBrandId,
      organizationId: mockOrgId,
    });
    const chatArgs = llmDispatcherService.completeStructured.mock.calls[0][0];
    const userMessage = chatArgs.messages.find(
      (message: { role: string }) => message.role === 'user',
    );
    expect(userMessage?.content).toContain('Performance grounding:');
    expect(userMessage?.content).toContain('Stop scrolling, start shipping');
    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('cold-start plan'),
      }),
    );
  });

  it('forwards the seed selection to the performance context and persists it on the plan', async () => {
    stubGeneratePlan();
    planPerformanceContextService.build.mockResolvedValueOnce({
      dataset: {
        confidence: 'low',
        genfeedPosts: 0,
        importedPosts: 1,
        totalPosts: 1,
      },
      isColdStart: true,
      section: 'Cold start: only 1 own post in the window.',
    });
    const seeds = {
      advertiserIds: ['adv-1'],
      isImportedHistoryIncluded: false,
      isPatternsIncluded: false,
      sourceIds: ['source-1'],
    };

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, {
      ...baseDto,
      seeds,
    });

    expect(planPerformanceContextService.build).toHaveBeenCalledWith({
      brandId: mockBrandId,
      organizationId: mockOrgId,
      seeds,
    });
    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        seeds: {
          advertiserIds: ['adv-1'],
          isColdStart: true,
          isImportedHistoryIncluded: false,
          isPatternsIncluded: false,
          sourceIds: ['source-1'],
        },
      }),
    );
  });

  it('persists default seed flags when no selection is provided', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        seeds: {
          advertiserIds: [],
          isColdStart: true,
          isImportedHistoryIncluded: true,
          isPatternsIncluded: true,
          sourceIds: [],
        },
      }),
    );
  });

  it('describes a grounded plan when own history is sufficient', async () => {
    stubGeneratePlan();
    planPerformanceContextService.build.mockResolvedValueOnce({
      dataset: {
        confidence: 'high',
        genfeedPosts: 30,
        importedPosts: 12,
        totalPosts: 42,
      },
      isColdStart: false,
      section:
        'Own history (last 30 days): 30 Genfeed posts and 12 imported posts.',
    });

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('42 own posts, 12 imported'),
      }),
    );
  });

  // ─── instantiation ────────────────────────────────────────────────────────

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── generatePlan – happy path ────────────────────────────────────────────

  it('should throw BadRequestException when brand is not found', async () => {
    stubGeneratePlan({ brand: null });

    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).rejects.toThrow('Brand not found');
  });

  it('should call brandsService.findOne with correct ObjectId filters', async () => {
    stubGeneratePlan({ brand: null });

    try {
      await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);
    } catch {}

    expect(brandsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mockBrandId,
        organizationId: mockOrgId,
      }),
    );
  });

  it('asks the dispatcher for the plan schema with the right model and messages', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(llmDispatcherService.completeStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        model: LLM_DEFAULTS.planning,
        schemaName: 'content_plan_generation',
        temperature: 0.7,
      }),
      mockOrgId,
    );
  });

  it('stops telling the model to return JSON — the schema carries the shape', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const chatArgs = llmDispatcherService.completeStructured.mock.calls[0][0];
    const systemMessage = chatArgs.messages.find(
      (message: { role: string }) => message.role === 'system',
    );
    expect(systemMessage?.content).not.toContain('valid JSON');
  });

  it('should include platform-specific format guidance in the user prompt', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const chatArgs = llmDispatcherService.completeStructured.mock.calls[0][0];
    const userMessage = chatArgs.messages.find(
      (message: { role: string }) => message.role === 'user',
    );

    expect(userMessage.content).toContain(
      'instagram: carousel (2-10 images) or reel (9:16 video under 90s)',
    );
    expect(userMessage.content).toContain(
      'twitter: text + image by default, use a thread when depth is needed',
    );
  });

  it('should use strategy platforms for format guidance when dto platforms are omitted', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, {
      ...baseDto,
      platforms: undefined,
    });

    const chatArgs = llmDispatcherService.completeStructured.mock.calls[0][0];
    const userMessage = chatArgs.messages.find(
      (message: { role: string }) => message.role === 'user',
    );

    expect(userMessage.content).toContain(
      'instagram: carousel (2-10 images) or reel (9:16 video under 90s)',
    );
    expect(userMessage.content).toContain(
      'tiktok: short-form vertical video (9:16, ideally under 60s)',
    );
  });

  it('should create a plan with DRAFT status', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ status: ContentPlanStatus.DRAFT }),
    );
  });

  it('should use dto.name when provided', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ name: baseDto.name }),
    );
  });

  it('should fallback to LLM plan name when dto.name is not set', async () => {
    stubGeneratePlan();

    const dto = { ...baseDto, name: undefined };
    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, dto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AI Content Plan' }),
    );
  });

  it('should return plan and items from generatePlan', async () => {
    const mockPlan = { _id: mockPlanId };
    const mockItems = [{ topic: 'AI trends' }, { topic: 'Product launch' }];

    stubGeneratePlan({ items: mockItems, plan: mockPlan });

    const result = await service.generatePlan(
      mockOrgId,
      mockBrandId,
      mockUserId,
      baseDto,
    );

    expect(result.plan).toBe(asPlan(mockPlan));
    expect(result.items).toBe(asItems(mockItems));
  });

  it('should map skill type items to ContentPlanItemType.SKILL', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    const skillItems = createManyArg.filter(
      (i: { type: string }) => i.type === ContentPlanItemType.SKILL,
    );
    expect(skillItems.length).toBeGreaterThan(0);
  });

  it('should map media_pipeline type items to ContentPlanItemType.MEDIA_PIPELINE', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    const pipelineItems = createManyArg.filter(
      (i: { type: string }) => i.type === ContentPlanItemType.MEDIA_PIPELINE,
    );
    expect(pipelineItems.length).toBeGreaterThan(0);
  });

  it('should pass scheduledAt as Date when provided', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    const withDate = createManyArg.find(
      (i: { scheduledAt?: unknown }) => i.scheduledAt !== undefined,
    );
    expect(withDate?.scheduledAt).toBeInstanceOf(Date);
  });

  it('should log success after plan creation', async () => {
    stubGeneratePlan({
      items: [{ _id: '1' }, { _id: '2' }],
    });

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Generated plan with 2 items'),
      expect.objectContaining({
        brandId: mockBrandId,
        organizationId: mockOrgId,
      }),
    );
  });

  it('should set itemCount to parsed items length on createInternal', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 2 }),
    );
  });

  // ─── unusable model output ─────────────────────────────────────────────────

  it('surfaces the typed error instead of emitting canned template items', async () => {
    stubGeneratePlan();
    const error = new LlmStructuredOutputError('content_plan_generation', [
      { code: 'too_small', message: 'expected >= 1', path: 'items' },
    ]);
    llmDispatcherService.completeStructured.mockRejectedValue(error);

    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).rejects.toBe(error);

    expect(contentPlansService.createInternal).not.toHaveBeenCalled();
    expect(contentPlanItemsService.createMany).not.toHaveBeenCalled();
  });

  it('never persists a plan when the provider call fails', async () => {
    stubGeneratePlan();
    llmDispatcherService.completeStructured.mockRejectedValue(
      new Error('provider down'),
    );

    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).rejects.toThrow('provider down');

    expect(contentPlanItemsService.createMany).not.toHaveBeenCalled();
  });

  // ─── brand without agentConfig ─────────────────────────────────────────────

  it('should handle brand with no agentConfig gracefully', async () => {
    stubGeneratePlan({ brand: brandWithoutAgentConfig });

    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).resolves.toMatchObject({
      items: [],
      plan: expect.objectContaining({ _id: expect.any(String) }),
    });

    expect(llmDispatcherService.completeStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Professional and engaging'),
            role: 'system',
          }),
        ]),
      }),
      mockOrgId,
    );
  });

  // ─── parsed item defaults ─────────────────────────────────────────────────

  it('should use dto.platforms for items the model left without platforms', async () => {
    stubGeneratePlan({
      generated: {
        items: [
          {
            prompt: 'p',
            topic: 'test',
            type: ContentPlanItemType.SKILL,
          },
        ],
        name: 'Plan',
      },
    });

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg[0].platforms).toEqual(baseDto.platforms);
  });

  it('should set periodStart and periodEnd as Date objects on createInternal', async () => {
    stubGeneratePlan();

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        periodEnd: new Date(baseDto.periodEnd),
        periodStart: new Date(baseDto.periodStart),
      }),
    );
  });
});
