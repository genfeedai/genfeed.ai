import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { ConfigService } from '@api/config/config.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

const ORG_ID = 'test-object-id';
const PATTERN_ID = 'test-object-id';

const BASE_DTO = {
  hashtags: undefined,
  platform: 'instagram',
  topic: 'AI tools for creators',
  variationsCount: 2,
};

const MOCK_PATTERN = {
  _id: PATTERN_ID,
  extractedFormula: '[HOOK] — [PROOF] — [CTA]',
  organization: ORG_ID,
  placeholders: ['HOOK', 'PROOF', 'CTA'],
  rawExample: 'From broke to $10k/mo — here is what changed',
  templateCategory: 'educational',
};

const LLM_JSON_RESPONSE = JSON.stringify({
  body: 'Main body copy',
  content: 'Full post content',
  cta: 'Follow for more',
  hook: 'Did you know AI can 10x output?',
});

describe('ContentGeneratorService', () => {
  let service: ContentGeneratorService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let contextAssemblyService: {
    assembleContext: ReturnType<typeof vi.fn>;
    buildSystemPrompt: ReturnType<typeof vi.fn>;
  };
  let openRouterService: { chatCompletion: ReturnType<typeof vi.fn> };
  let patternStoreService: {
    findOne: ReturnType<typeof vi.fn>;
    findByOrganization: ReturnType<typeof vi.fn>;
    incrementUsage: ReturnType<typeof vi.fn>;
  };
  let playbookBuilderService: { findOne: ReturnType<typeof vi.fn> };
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    configService = { get: vi.fn().mockReturnValue('x-ai/grok-4-fast') };
    contextAssemblyService = {
      assembleContext: vi.fn().mockResolvedValue(null),
      buildSystemPrompt: vi
        .fn()
        .mockReturnValue('You are a brand voice assistant.'),
    };
    openRouterService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: LLM_JSON_RESPONSE } }],
      }),
    };
    patternStoreService = {
      findByOrganization: vi.fn().mockResolvedValue([MOCK_PATTERN]),
      findOne: vi.fn().mockResolvedValue(null),
      incrementUsage: vi.fn().mockResolvedValue(undefined),
    };
    playbookBuilderService = { findOne: vi.fn().mockResolvedValue(null) };
    mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ContentGeneratorService,
        { provide: ConfigService, useValue: configService },
        {
          provide: AgentContextAssemblyService,
          useValue: contextAssemblyService,
        },
        { provide: LoggerService, useValue: mockLogger },
        { provide: OpenRouterService, useValue: openRouterService },
        { provide: PatternStoreService, useValue: patternStoreService },
        { provide: PlaybookBuilderService, useValue: playbookBuilderService },
      ],
    }).compile();

    service = module.get(ContentGeneratorService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates content using available patterns', async () => {
    const results = await service.generateContent(ORG_ID, BASE_DTO as any);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      content: 'Full post content',
      hook: 'Did you know AI can 10x output?',
      patternId: PATTERN_ID.toString(),
      patternUsed: MOCK_PATTERN.extractedFormula,
    });
    expect(patternStoreService.incrementUsage).toHaveBeenCalledWith(PATTERN_ID);
  });

  it('generates freeform content when no patterns found', async () => {
    patternStoreService.findByOrganization.mockResolvedValue([]);
    openRouterService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { content: 'Freeform post 1' },
              { content: 'Freeform post 2' },
            ]),
          },
        },
      ],
    });

    const results = await service.generateContent(ORG_ID, BASE_DTO as any);

    expect(results).toHaveLength(2);
    expect(results[0].patternUsed).toBe('freeform');
    expect(results[0].content).toBe('Freeform post 1');
  });

  it('falls back to template fill when LLM call fails', async () => {
    openRouterService.chatCompletion.mockRejectedValue(
      new Error('LLM timeout'),
    );

    const results = await service.generateContent(ORG_ID, BASE_DTO as any);

    expect(results).toHaveLength(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Generation failed'),
      expect.anything(),
    );
    // Template fill uses the formula with topic substituted for placeholders
    for (const result of results) {
      expect(result.content).toBeTruthy();
      expect(result.patternUsed).toBe(MOCK_PATTERN.extractedFormula);
    }
  });

  it('uses a specific pattern when patternId is provided in dto', async () => {
    patternStoreService.findOne.mockResolvedValue(MOCK_PATTERN);
    const dto = {
      ...BASE_DTO,
      patternId: PATTERN_ID.toString(),
      variationsCount: 1,
    };

    const results = await service.generateContent(ORG_ID, dto as any);

    expect(patternStoreService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.any(String) }),
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when patternId given but pattern not found and no fallback patterns', async () => {
    patternStoreService.findOne.mockResolvedValue(null);
    patternStoreService.findByOrganization.mockResolvedValue([]);
    openRouterService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: '[]' } }],
    });

    const dto = { ...BASE_DTO, patternId: PATTERN_ID.toString() };
    const results = await service.generateContent(ORG_ID, dto as any);

    expect(results).toHaveLength(0);
  });

  it('fetches playbook insights when playbookId is provided', async () => {
    const playbookId = 'test-object-id';
    playbookBuilderService.findOne.mockResolvedValue({
      insights: {
        contentMix: { educational: 0.6 },
        hashtagStrategy: { optimalCount: 5 },
      },
    });

    const dto = { ...BASE_DTO, playbookId };

    await service.generateContent(ORG_ID, dto as any);

    expect(playbookBuilderService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.any(String),
        organization: ORG_ID,
      }),
    );
  });

  it('builds system prompt when brand context is available', async () => {
    contextAssemblyService.assembleContext.mockResolvedValue({
      brandGuidance: 'Use bold, direct language.',
    });

    await service.generateContent(ORG_ID, BASE_DTO as any);

    expect(contextAssemblyService.buildSystemPrompt).toHaveBeenCalled();
    expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
        ]),
      }),
    );
  });

  it('extracts hashtags from generated content when none provided in dto', async () => {
    openRouterService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'AI tools #marketing #productivity are essential',
              hook: 'Hook',
            }),
          },
        },
      ],
    });

    const dto = { ...BASE_DTO, hashtags: undefined, variationsCount: 1 };

    const results = await service.generateContent(ORG_ID, dto as any);

    expect(results[0].hashtags).toEqual(
      expect.arrayContaining(['marketing', 'productivity']),
    );
  });

  it('passes provided hashtags through without extraction', async () => {
    const dto = {
      ...BASE_DTO,
      hashtags: ['ai', 'creator'],
      variationsCount: 1,
    };

    const results = await service.generateContent(ORG_ID, dto as any);

    expect(results[0].hashtags).toEqual(['ai', 'creator']);
  });

  it('fills remaining slots when patterns fewer than variationsCount', async () => {
    patternStoreService.findByOrganization.mockResolvedValue([MOCK_PATTERN]);
    const dto = { ...BASE_DTO, variationsCount: 3 };

    const results = await service.generateContent(ORG_ID, dto as any);

    expect(results).toHaveLength(3);
  });
});
