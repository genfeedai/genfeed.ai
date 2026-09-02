import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { TopPerformerPromptContextService } from '@api/collections/content-intelligence/services/top-performer-prompt-context.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

const ORG_ID = 'test-object-id';
const PATTERN_ID = 'test-object-id';

const BASE_DTO = {
  hashtags: undefined,
  platform: 'instagram',
  brandId: 'brand-123',
  topic: 'AI tools for creators',
  variationsCount: 2,
};

const MOCK_PATTERN = {
  id: PATTERN_ID,
  extractedFormula: '[HOOK] — [PROOF] — [CTA]',
  organizationId: ORG_ID,
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

// The generation graph branches on a condition node and fans patterns out to a
// child workflow, so the double walks that shape explicitly instead of
// replaying a generic node list.
function createContentGenerationRunnerFake(
  actionExecutors: Map<string, (request: never) => unknown>,
) {
  return {
    registerAction: vi.fn(
      (actionId: string, executor: (request: never) => unknown) => {
        actionExecutors.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(
      async (request: {
        canonicalId: string;
        inputValues: { dto: unknown };
        organizationId: string;
        userId?: string;
      }) => {
        const context = {
          organizationId: request.organizationId,
          userId: request.userId ?? 'workflow-owner',
        };
        const invoke = (actionId: string, input: Record<string, unknown>) => {
          const executor = actionExecutors.get(actionId);
          if (!executor)
            throw new Error(`Missing action executor: ${actionId}`);
          return executor({ context, input } as never);
        };
        const loadedContext = await invoke(
          'content-intelligence.load-context',
          {
            dto: request.inputValues.dto,
          },
        );
        const patterns = await invoke('content-intelligence.load-patterns', {
          dto: request.inputValues.dto,
        });
        const plan = (await invoke('content-intelligence.plan', {
          context: loadedContext,
          dto: request.inputValues.dto,
          patterns,
        })) as { hasPatterns: boolean; items: unknown[] };
        if (!plan.hasPatterns) {
          const freeformResults = await invoke(
            'content-intelligence.generate-freeform',
            { state: loadedContext },
          );
          return {
            result: await invoke('content-intelligence.finalize', {
              freeformResults,
            }),
          };
        }
        const generationAction =
          request.canonicalId === 'linkedin-content.generation'
            ? 'content-intelligence.generate-linkedin-pattern'
            : 'content-intelligence.generate';
        const results = [];
        for (const item of plan.items) {
          const state = await invoke(generationAction, { item });
          results.push({
            result: await invoke('content-intelligence.track-pattern', {
              state,
            }),
          });
        }
        return {
          result: await invoke('content-intelligence.finalize', {
            patternResults: { results },
          }),
        };
      },
    ),
  };
}

describe('ContentGeneratorService', () => {
  let service: ContentGeneratorService;
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
  let topPerformerPromptContextService: {
    assembleContext: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let actionExecutors: Map<string, (request: never) => unknown>;

  beforeEach(async () => {
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
    topPerformerPromptContextService = {
      assembleContext: vi.fn().mockResolvedValue(undefined),
    };
    mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    actionExecutors = new Map();
    const workflowRunner = createContentGenerationRunnerFake(actionExecutors);

    const module = await Test.createTestingModule({
      providers: [
        ContentGeneratorService,
        {
          provide: AgentContextAssemblyService,
          useValue: contextAssemblyService,
        },
        { provide: LoggerService, useValue: mockLogger },
        { provide: OpenRouterService, useValue: openRouterService },
        { provide: PatternStoreService, useValue: patternStoreService },
        { provide: PlaybookBuilderService, useValue: playbookBuilderService },
        { provide: SystemWorkflowRunnerService, useValue: workflowRunner },
        {
          provide: TopPerformerPromptContextService,
          useValue: topPerformerPromptContextService,
        },
      ],
    }).compile();

    service = module.get(ContentGeneratorService);
    service.onModuleInit();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates content using available patterns', async () => {
    const results = await service.generateContent(ORG_ID, BASE_DTO as never);

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

    const results = await service.generateContent(ORG_ID, BASE_DTO as never);

    expect(results).toHaveLength(2);
    expect(results[0].patternUsed).toBe('freeform');
    expect(results[0].content).toBe('Freeform post 1');
  });

  it('falls back to template fill when LLM call fails', async () => {
    openRouterService.chatCompletion.mockRejectedValue(
      new Error('LLM timeout'),
    );

    const results = await service.generateContent(ORG_ID, BASE_DTO as never);

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

    const results = await service.generateContent(ORG_ID, dto as never);

    expect(patternStoreService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String) }),
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
    const results = await service.generateContent(ORG_ID, dto as never);

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

    await service.generateContent(ORG_ID, dto as never);

    expect(playbookBuilderService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        organizationId: ORG_ID,
      }),
    );
  });

  it('builds system prompt when brand context is available', async () => {
    contextAssemblyService.assembleContext.mockResolvedValue({
      brandGuidance: 'Use bold, direct language.',
    });

    await service.generateContent(ORG_ID, BASE_DTO as never);

    expect(contextAssemblyService.buildSystemPrompt).toHaveBeenCalled();
    expect(contextAssemblyService.buildSystemPrompt).toHaveBeenCalledWith(
      '',
      expect.anything(),
      { maxBrandContextLength: Number.POSITIVE_INFINITY },
    );
    expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
        ]),
      }),
    );
  });

  it('applies one budget after brand and historical assemblers contribute', async () => {
    contextAssemblyService.assembleContext.mockResolvedValue({
      brandGuidance: 'available',
    });
    contextAssemblyService.buildSystemPrompt.mockReturnValue(
      `## Brand Voice\n- Style: ${'v'.repeat(7000)}`,
    );
    topPerformerPromptContextService.assembleContext.mockResolvedValue(
      `## Historical Performance Context\n- ${'h'.repeat(5000)}`,
    );

    await service.generateContent(ORG_ID, BASE_DTO as never);

    const systemMessage =
      openRouterService.chatCompletion.mock.calls[0]?.[0]?.messages?.find(
        (message: { role?: string }) => message.role === 'system',
      );
    expect(systemMessage?.content.length).toBeLessThanOrEqual(
      BRAND_CONTEXT_CHARACTER_BUDGET,
    );
    expect(systemMessage?.content).toContain('## Brand Voice');
    expect(systemMessage?.content).not.toContain(
      '## Historical Performance Context',
    );
  });

  it('adds scoped top-performer context to the generation system prompt', async () => {
    topPerformerPromptContextService.assembleContext.mockResolvedValue(
      '## Historical Performance Context\n- Reuse hook structure like "Contrarian opener".',
    );

    await service.generateContent(ORG_ID, BASE_DTO as never);

    expect(
      topPerformerPromptContextService.assembleContext,
    ).toHaveBeenCalledWith({
      brandId: 'brand-123',
      organizationId: ORG_ID,
      platform: 'instagram',
      query: BASE_DTO.topic,
    });
    expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(
              '## Historical Performance Context',
            ),
            role: 'system',
          }),
        ]),
      }),
    );
  });

  it('continues generation when top-performer context is unavailable', async () => {
    topPerformerPromptContextService.assembleContext.mockRejectedValue(
      new Error('analytics unavailable'),
    );

    const results = await service.generateContent(ORG_ID, BASE_DTO as never);

    expect(results).toHaveLength(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Top performer context assembly failed'),
      expect.any(Error),
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

    const results = await service.generateContent(ORG_ID, dto as never);

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

    const results = await service.generateContent(ORG_ID, dto as never);

    expect(results[0].hashtags).toEqual(['ai', 'creator']);
  });

  it('fills remaining slots when patterns fewer than variationsCount', async () => {
    patternStoreService.findByOrganization.mockResolvedValue([MOCK_PATTERN]);
    const dto = { ...BASE_DTO, variationsCount: 3 };

    const results = await service.generateContent(ORG_ID, dto as never);

    expect(results).toHaveLength(3);
  });
});

// #3020 — the harness system prompt now flows entirely through
// HarnessGenerationService.resolveBrief (the same seam ContentQualityScorerService,
// AdsResearchService, and ReplyGenerationService already use), so pgvector brand
// content memory is folded in here too instead of only on the standalone harness
// generation path.
const MOCK_PERSONA = {
  bio: 'Founder voice',
  handle: 'founder',
  label: 'Founder Persona',
};

describe('ContentGeneratorService harness prompt via resolveBrief (#3020)', () => {
  let service: ContentGeneratorService;
  let personasService: { findOne: ReturnType<typeof vi.fn> };
  let harnessGenerationService: {
    resolveBrief: ReturnType<typeof vi.fn>;
    formatBrief: ReturnType<typeof vi.fn>;
  };
  let openRouterService: { chatCompletion: ReturnType<typeof vi.fn> };
  let actionExecutors: Map<string, (request: never) => unknown>;

  beforeEach(async () => {
    actionExecutors = new Map();
    personasService = {
      findOne: vi.fn().mockResolvedValue(MOCK_PERSONA),
    };
    harnessGenerationService = {
      formatBrief: vi
        .fn()
        .mockReturnValue('SYSTEM DIRECTIVES:\n- Stay on brand'),
      resolveBrief: vi.fn().mockResolvedValue({
        evaluationCriteria: [],
        guardrails: [],
        metadata: { contentType: 'post', objective: 'engagement' },
        packs: [],
        providerHints: [],
        sources: [],
        styleDirectives: [],
        systemDirectives: ['Stay on brand'],
      }),
    };
    openRouterService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: LLM_JSON_RESPONSE } }],
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ContentGeneratorService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: AgentContextAssemblyService,
          useValue: {
            assembleContext: vi.fn().mockResolvedValue(null),
            buildSystemPrompt: vi.fn().mockReturnValue(''),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: OpenRouterService, useValue: openRouterService },
        {
          provide: PatternStoreService,
          useValue: {
            findByOrganization: vi.fn().mockResolvedValue([]),
            findOne: vi.fn().mockResolvedValue(null),
            incrementUsage: vi.fn(),
          },
        },
        {
          provide: PlaybookBuilderService,
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: TopPerformerPromptContextService,
          useValue: { assembleContext: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: PersonasService, useValue: personasService },
        {
          provide: HarnessGenerationService,
          useValue: harnessGenerationService,
        },
        {
          provide: SystemWorkflowRunnerService,
          useValue: createContentGenerationRunnerFake(actionExecutors),
        },
      ],
    }).compile();

    service = module.get(ContentGeneratorService);
    service.onModuleInit();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the persona and passes it plus the generation topic through resolveBrief', async () => {
    await service.generateContent(ORG_ID, BASE_DTO as never);

    expect(personasService.findOne).toHaveBeenCalledWith({
      brandId: BASE_DTO.brandId,
      organizationId: ORG_ID,
    });
    expect(harnessGenerationService.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: BASE_DTO.brandId,
        contentType: 'post',
        objective: 'engagement',
        organizationId: ORG_ID,
        persona: MOCK_PERSONA,
        platform: BASE_DTO.platform,
        topic: BASE_DTO.topic,
      }),
    );
    // The topic gate lives inside resolveBrief now — ContentGeneratorService
    // must not override includeContentMemory, only supply the topic that
    // drives the gate.
    const callArgs = harnessGenerationService.resolveBrief.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('includeContentMemory');
  });

  it('forwards dto.additionalContext as audience_signal sources', async () => {
    const dto = {
      ...BASE_DTO,
      additionalContext: ['Recent customer testimonial'],
    };

    await service.generateContent(ORG_ID, dto as never);

    expect(harnessGenerationService.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalSources: [
          {
            content: 'Recent customer testimonial',
            id: 'content-context-0',
            kind: 'audience_signal',
          },
        ],
      }),
    );
  });

  it('folds the formatted harness brief into the generation system prompt', async () => {
    await service.generateContent(ORG_ID, BASE_DTO as never);

    const systemMessage =
      openRouterService.chatCompletion.mock.calls[0]?.[0]?.messages?.find(
        (message: { role?: string }) => message.role === 'system',
      );
    expect(systemMessage?.content).toContain('SYSTEM DIRECTIVES');
  });

  it('does not call resolveBrief when brandId is absent', async () => {
    const dto = { ...BASE_DTO, brandId: undefined };

    await service.generateContent(ORG_ID, dto as never);

    expect(harnessGenerationService.resolveBrief).not.toHaveBeenCalled();
  });

  it('falls back to undefined when resolveBrief resolves null', async () => {
    harnessGenerationService.resolveBrief.mockResolvedValue(null);
    harnessGenerationService.formatBrief.mockReturnValue('');

    const results = await service.generateContent(ORG_ID, BASE_DTO as never);

    expect(results.length).toBeGreaterThan(0);
  });
});
