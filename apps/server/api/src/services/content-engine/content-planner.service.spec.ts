import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { ContentPlanItemType, ContentPlanStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

const mockOrgId = 'test-object-id'.toHexString();
const mockBrandId = 'test-object-id'.toHexString();
const mockUserId = 'test-object-id'.toHexString();
const mockPlanId = 'test-object-id'.toHexString();

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

const baseDto = {
  additionalInstructions: 'Keep it short',
  itemCount: 3,
  name: 'My Plan',
  periodEnd: '2026-03-07',
  periodStart: '2026-03-01',
  platforms: ['instagram', 'twitter'],
  topics: ['AI trends', 'startup life'],
};

const llmSkillResponse = JSON.stringify({
  items: [
    {
      platforms: ['instagram'],
      prompt: 'Write about AI trends',
      scheduledAt: '2026-03-01T10:00:00Z',
      skillSlug: 'content-writing',
      topic: 'AI trends',
      type: 'skill',
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
      type: 'media_pipeline',
    },
  ],
  name: 'AI Content Plan',
});

describe('ContentPlannerService', () => {
  let service: ContentPlannerService;
  let brandsService: vi.Mocked<BrandsService>;
  let contentPlansService: vi.Mocked<ContentPlansService>;
  let contentPlanItemsService: vi.Mocked<ContentPlanItemsService>;
  let llmDispatcherService: vi.Mocked<LlmDispatcherService>;
  let logger: vi.Mocked<LoggerService>;

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
      chatCompletion: vi.fn(),
    } as unknown as vi.Mocked<LlmDispatcherService>;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    service = new ContentPlannerService(
      contentPlansService,
      contentPlanItemsService,
      brandsService,
      llmDispatcherService,
      logger,
    );
  });

  // ─── instantiation ────────────────────────────────────────────────────────

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── generatePlan – happy path ────────────────────────────────────────────

  it('should throw BadRequestException when brand is not found', async () => {
    brandsService.findOne.mockResolvedValue(null as any);

    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).rejects.toThrow('Brand not found');
  });

  it('should call brandsService.findOne with correct ObjectId filters', async () => {
    brandsService.findOne.mockResolvedValue(null as any);

    try {
      await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);
    } catch {}

    expect(brandsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
      }),
    );
  });

  it('should call llmDispatcherService.chatCompletion with correct model and messages', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(llmDispatcherService.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        model: 'anthropic/claude-sonnet-4-20250514',
        temperature: 0.7,
      }),
      mockOrgId,
    );
  });

  it('should include platform-specific format guidance in the user prompt', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const chatArgs = llmDispatcherService.chatCompletion.mock.calls[0][0];
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
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, {
      ...baseDto,
      platforms: undefined,
    });

    const chatArgs = llmDispatcherService.chatCompletion.mock.calls[0][0];
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
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ status: ContentPlanStatus.DRAFT }),
    );
  });

  it('should use dto.name when provided', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ name: baseDto.name }),
    );
  });

  it('should fallback to LLM plan name when dto.name is not set', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    const dto = { ...baseDto, name: undefined };
    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, dto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AI Content Plan' }),
    );
  });

  it('should return plan and items from generatePlan', async () => {
    const mockPlan = { _id: mockPlanId };
    const mockItems = [{ topic: 'AI trends' }, { topic: 'Product launch' }];

    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue(mockPlan as any);
    contentPlanItemsService.createMany.mockResolvedValue(mockItems as any);

    const result = await service.generatePlan(
      mockOrgId,
      mockBrandId,
      mockUserId,
      baseDto,
    );

    expect(result.plan).toBe(mockPlan);
    expect(result.items).toBe(mockItems);
  });

  it('should map skill type items to ContentPlanItemType.SKILL', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    const skillItems = createManyArg.filter(
      (i: { type: string }) => i.type === ContentPlanItemType.SKILL,
    );
    expect(skillItems.length).toBeGreaterThan(0);
  });

  it('should map media_pipeline type items to ContentPlanItemType.MEDIA_PIPELINE', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    const pipelineItems = createManyArg.filter(
      (i: { type: string }) => i.type === ContentPlanItemType.MEDIA_PIPELINE,
    );
    expect(pipelineItems.length).toBeGreaterThan(0);
  });

  it('should pass scheduledAt as Date when provided', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    const withDate = createManyArg.find(
      (i: { scheduledAt?: unknown }) => i.scheduledAt !== undefined,
    );
    expect(withDate?.scheduledAt).toBeInstanceOf(Date);
  });

  it('should log success after plan creation', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([
      { _id: '1' },
      { _id: '2' },
    ] as any);

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
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 2 }),
    );
  });

  // ─── LLM fallback behavior ─────────────────────────────────────────────────

  it('should use fallback items when LLM response has no JSON', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Sorry, I cannot help.' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg.length).toBe(baseDto.itemCount);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should use fallback items when LLM response is invalid JSON', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: '{ bad json {{' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg.length).toBe(baseDto.itemCount);
  });

  it('should use fallback items when LLM JSON is missing items array', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"name":"Plan"}' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg.length).toBe(baseDto.itemCount);
  });

  it('should use fallback when LLM response choices is empty', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg.length).toBe(baseDto.itemCount);
  });

  it('fallback items should default to skill type', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'no json here' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    for (const item of createManyArg) {
      expect(item.type).toBe(ContentPlanItemType.SKILL);
    }
  });

  it('fallback items use content-writing skillSlug', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'no json' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    for (const item of createManyArg) {
      expect(item.skillSlug).toBe('content-writing');
    }
  });

  it('fallback uses dto.itemCount defaulting to 7 when not set', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'no json' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    const dto = { ...baseDto, itemCount: undefined };
    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, dto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg.length).toBe(7);
  });

  it('fallback cycles through topics for item prompts', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'no json' } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    const dto = { ...baseDto, itemCount: 4, topics: ['Topic A', 'Topic B'] };
    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, dto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg[0].topic).toBe('Topic A');
    expect(createManyArg[1].topic).toBe('Topic B');
    expect(createManyArg[2].topic).toBe('Topic A');
    expect(createManyArg[3].topic).toBe('Topic B');
  });

  // ─── brand without agentConfig ─────────────────────────────────────────────

  it('should handle brand with no agentConfig gracefully', async () => {
    brandsService.findOne.mockResolvedValue({
      _id: mockBrandId,
      agentConfig: null,
    } as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await expect(
      service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto),
    ).resolves.toMatchObject({
      items: [],
      plan: expect.objectContaining({ _id: expect.any(String) }),
    });

    expect(llmDispatcherService.chatCompletion).toHaveBeenCalledWith(
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

  it('should default unknown LLM item types to skill', async () => {
    const weirdResponse = JSON.stringify({
      items: [
        { platforms: [], prompt: 'p', topic: 'test', type: 'unknown_type' },
      ],
      name: 'Plan',
    });
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: weirdResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg[0].type).toBe(ContentPlanItemType.SKILL);
  });

  it('should use dto.platforms for items missing platforms in LLM response', async () => {
    const noPlatformResponse = JSON.stringify({
      items: [{ prompt: 'p', topic: 'test', type: 'skill' }],
      name: 'Plan',
    });
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: noPlatformResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    const createManyArg = contentPlanItemsService.createMany.mock.calls[0][0];
    expect(createManyArg[0].platforms).toEqual(baseDto.platforms);
  });

  it('should set periodStart and periodEnd as Date objects on createInternal', async () => {
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: llmSkillResponse } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        periodEnd: new Date(baseDto.periodEnd),
        periodStart: new Date(baseDto.periodStart),
      }),
    );
  });

  it('should extract JSON embedded in surrounding text in LLM response', async () => {
    const wrappedJson = `Here is your plan:\n${llmSkillResponse}\nEnjoy!`;
    brandsService.findOne.mockResolvedValue(baseBrand as any);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: wrappedJson } }],
    } as any);
    contentPlansService.createInternal.mockResolvedValue({
      _id: mockPlanId,
    } as any);
    contentPlanItemsService.createMany.mockResolvedValue([]);

    await service.generatePlan(mockOrgId, mockBrandId, mockUserId, baseDto);

    expect(contentPlansService.createInternal).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 2 }),
    );
  });
});
