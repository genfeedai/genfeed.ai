import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import type { IExtractedBrandData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const makeBrandData = (
  overrides: Partial<IExtractedBrandData> = {},
): IExtractedBrandData => ({
  companyName: 'TestCo',
  description: 'A test company',
  scrapedAt: new Date(),
  sourceUrl: 'https://testco.com',
  tagline: 'We test things',
  ...overrides,
});

describe('MasterPromptGeneratorService', () => {
  let service: MasterPromptGeneratorService;

  const mockReplicateService = {
    generateTextCompletionSync: vi.fn(),
    run: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockCreditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
  };

  const mockModelsService = {
    findOne: vi.fn().mockResolvedValue({
      inputTokenPricePerMillion: 1,
      key: 'openai/gpt-5',
      minCost: 1,
      outputTokenPricePerMillion: 1,
      pricingType: 'per-token',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterPromptGeneratorService,
        { provide: CreditsUtilsService, useValue: mockCreditsUtilsService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ModelsService, useValue: mockModelsService },
        { provide: ReplicateService, useValue: mockReplicateService },
      ],
    }).compile();

    service = module.get<MasterPromptGeneratorService>(
      MasterPromptGeneratorService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse brand voice analysis from JSON response', async () => {
    const voiceJson = JSON.stringify({
      audience: 'Developers',
      hashtags: ['tech', 'ai'],
      taglines: ['Build faster'],
      tone: 'Professional',
      values: ['innovation', 'quality'],
      voice: 'Expert and approachable',
    });
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      voiceJson,
    );

    const result = await service.analyzeBrandVoice(makeBrandData());

    expect(result.tone).toBe('Professional');
    expect(result.voice).toBe('Expert and approachable');
    expect(result.audience).toBe('Developers');
    expect(result.values).toEqual(['innovation', 'quality']);
    expect(result.hashtags).toEqual(['tech', 'ai']);
    expect(result.taglines).toEqual(['Build faster']);
  });

  it('should extract JSON from markdown code blocks', async () => {
    const response =
      '```json\n{"tone":"Casual","voice":"Fun","audience":"Teens","values":[],"taglines":[],"hashtags":[]}\n```';
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      response,
    );

    const result = await service.analyzeBrandVoice(makeBrandData());
    expect(result.tone).toBe('Casual');
  });

  it('should return defaults when AI returns null', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(null);

    const result = await service.analyzeBrandVoice(makeBrandData());

    expect(result.tone).toBe('Professional');
    expect(result.voice).toBe('Friendly and informative');
    expect(result.audience).toBe('General audience');
  });

  it('should return defaults when AI returns invalid JSON', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      'This is not JSON at all',
    );

    const result = await service.analyzeBrandVoice(makeBrandData());

    expect(result.tone).toBe('Professional');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should return defaults when AI call throws', async () => {
    mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
      new Error('API error'),
    );

    const result = await service.analyzeBrandVoice(makeBrandData());
    expect(result.tone).toBe('Professional');
  });

  it('should parse master prompts from JSON array response', async () => {
    const prompts = [
      {
        category: 'brand_voice',
        guidance: 'Use this as system prompt',
        prompt: 'You are TestCo...',
        title: 'Brand Voice',
      },
      {
        category: 'content_guidelines',
        guidance: 'Content rules',
        prompt: 'Follow these guidelines...',
        title: 'Content Guidelines',
      },
    ];
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify(prompts),
    );

    const result = await service.generateMasterPrompts(makeBrandData());

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Brand Voice');
  });

  it('should handle response wrapped in { prompts: [...] }', async () => {
    const response = JSON.stringify({
      prompts: [{ category: 'tone_style', prompt: 'Be bold', title: 'Tone' }],
    });
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      response,
    );

    const result = await service.generateMasterPrompts(makeBrandData());
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Tone');
  });

  it('should return default prompts when AI returns null', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(null);

    const result = await service.generateMasterPrompts(makeBrandData());

    expect(result.length).toBe(4);
    expect(result[0].prompt).toContain('TestCo');
  });

  it('should include brand voice context in prompt when available', async () => {
    const brandData = makeBrandData({
      brandVoice: {
        audience: 'Devs',
        hashtags: [],
        taglines: [],
        tone: 'Playful',
        values: ['fun'],
        voice: 'Witty',
      },
    });

    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify([]),
    );

    await service.generateMasterPrompts(brandData);

    const callArgs =
      mockReplicateService.generateTextCompletionSync.mock.calls[0];
    const prompt = callArgs[1].prompt as string;
    expect(prompt).toContain('Playful');
    expect(prompt).toContain('Witty');
  });

  it('should include all brand data fields in context', async () => {
    const brandData = makeBrandData({
      aboutText: 'About us',
      heroText: 'Hero text',
      metaDescription: 'Meta desc',
      metaKeywords: ['kw1', 'kw2'],
      valuePropositions: ['VP1', 'VP2'],
    });

    mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify([]),
    );

    await service.analyzeBrandVoice(brandData);

    const prompt = mockReplicateService.generateTextCompletionSync.mock
      .calls[0][1].prompt as string;
    expect(prompt).toContain('Hero text');
    expect(prompt).toContain('About us');
    expect(prompt).toContain('VP1');
    expect(prompt).toContain('kw1');
    expect(prompt).toContain('Meta desc');
  });

  it('should return default prompts with company name on generation failure', async () => {
    mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
      new Error('timeout'),
    );

    const result = await service.generateMasterPrompts(
      makeBrandData({ companyName: 'FailCo' }),
    );

    expect(result.length).toBe(4);
    expect(result[0].prompt).toContain('FailCo');
    expect(result[1].prompt).toContain('FailCo');
  });
});
