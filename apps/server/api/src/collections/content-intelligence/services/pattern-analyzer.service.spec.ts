import type { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import type {
  CreatorScraperService,
  ScrapedPost,
} from '@api/collections/content-intelligence/services/creator-scraper.service';
import {
  CONTENT_PATTERN_TEMPLATE_CATEGORY_DECISION_POINT,
  CONTENT_PATTERN_TYPE_DECISION_POINT,
  PatternAnalyzerService,
} from '@api/collections/content-intelligence/services/pattern-analyzer.service';
import type { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import type { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import {
  ContentIntelligencePlatform,
  ContentPatternCategory,
  ContentPatternType,
  CreatorAnalysisStatus,
} from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockLogger = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

const mockLlmDispatcherService = {
  completeStructured: vi.fn(),
};

const mockContentIntelligenceService = {
  findOne: vi.fn(),
  updateMetrics: vi.fn(),
  updateStatus: vi.fn(),
};

const mockCreatorScraperService = {
  calculateAggregateMetrics: vi.fn(),
  scrapeCreator: vi.fn(),
};

const mockPatternStoreService = {
  storeBulkPatterns: vi.fn(),
};

// The Jev provider is never exercised here: the service under test only has to
// treat `null` and a sub-threshold confidence identically.
const mockTypedDecisionService = {
  choose: vi.fn(),
};

const configValues: Record<string, unknown> = {};

const mockConfigService = {
  get: vi.fn((key: string) => configValues[key]),
};

function setDecisionConfig(mode: string, minConfidence?: number): void {
  configValues.PATTERN_ANALYZER_DECISION_MODE = mode;
  configValues.PATTERN_ANALYZER_MIN_CONFIDENCE = minConfidence;
}

function makeService() {
  return new PatternAnalyzerService(
    mockLogger as unknown as LoggerService,
    mockLlmDispatcherService as unknown as LlmDispatcherService,
    mockContentIntelligenceService as unknown as ContentIntelligenceService,
    mockCreatorScraperService as unknown as CreatorScraperService,
    mockPatternStoreService as unknown as PatternStoreService,
    mockTypedDecisionService as unknown as TypedDecisionService,
    mockConfigService as unknown as ConfigService,
  );
}

const orgId = 'test-object-id';
const creatorId = 'test-object-id';

// Default posture for every suite: the decision path is off, exactly as a
// deployment that sets neither key.
beforeEach(() => {
  setDecisionConfig('off');
  mockTypedDecisionService.choose.mockResolvedValue(null);
});

function makePost(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
  return {
    comments: 50,
    engagementRate: 5.75,
    hashtags: ['ai', 'tech'],
    id: 'post1',
    likes: 500,
    publishedAt: new Date('2024-01-15T10:00:00Z'),
    shares: 25,
    text: 'Test post content',
    url: 'https://twitter.com/test/status/1',
    views: 10000,
    ...overrides,
  };
}

// ─── analyzeCreator ────────────────────────────────────────────────────────

describe('PatternAnalyzerService.analyzeCreator', () => {
  let service: PatternAnalyzerService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();
  });

  it('throws when creator not found', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(null);

    await expect(service.analyzeCreator(creatorId)).rejects.toThrow(
      'Creator not found',
    );
  });

  it('returns empty result and sets FAILED when no posts scraped', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [],
      profile: {},
    });
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);

    const result = await service.analyzeCreator(creatorId);
    expect(result.patternsExtracted).toBe(0);
    expect(result.patterns).toHaveLength(0);
    expect(mockContentIntelligenceService.updateStatus).toHaveBeenCalledWith(
      creatorId,
      CreatorAnalysisStatus.FAILED,
      'No posts found for analysis',
    );
  });

  it('returns empty result when scrapeCreator returns null', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });
    mockCreatorScraperService.scrapeCreator.mockResolvedValue(null);
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);

    const result = await service.analyzeCreator(creatorId);
    expect(result.patternsExtracted).toBe(0);
  });

  it('calls updateStatus COMPLETED on success', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });

    const post = makePost({ text: 'What if you could 10x your productivity?' });
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [post],
      profile: {},
    });
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({
      avgEngagementRate: 5.75,
    });

    // LLM returns empty to fall through to rule-based
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('LLM error'),
    );
    mockPatternStoreService.storeBulkPatterns.mockResolvedValue([
      { id: 'test-object-id' },
    ]);
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);

    const result = await service.analyzeCreator(creatorId);
    expect(mockContentIntelligenceService.updateStatus).toHaveBeenCalledWith(
      creatorId,
      CreatorAnalysisStatus.COMPLETED,
    );
    expect(result.patternsExtracted).toBe(1);
  });

  it('sets FAILED status and re-throws on unexpected error', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });
    mockCreatorScraperService.scrapeCreator.mockRejectedValue(
      new Error('Apify crashed'),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);

    await expect(service.analyzeCreator(creatorId)).rejects.toThrow(
      'Apify crashed',
    );
    expect(mockContentIntelligenceService.updateStatus).toHaveBeenCalledWith(
      creatorId,
      CreatorAnalysisStatus.FAILED,
      'Apify crashed',
    );
  });

  it('falls back to rule-based when LLM throws (platform propagated to pattern)', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.LINKEDIN,
    });

    // Story hook post + LLM throws = rule-based kicks in
    const post = makePost({ text: 'I spent 5 years learning the hard way.' });
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [post],
      profile: {},
    });
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({});

    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('LLM timeout'),
    );
    mockPatternStoreService.storeBulkPatterns.mockResolvedValue([
      { id: 'test-object-id' },
    ]);
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);

    const result = await service.analyzeCreator(creatorId);
    expect(result.patterns.length).toBeGreaterThanOrEqual(1);
    expect(result.patterns[0].patternType).toBe(ContentPatternType.HOOK);
    expect(result.patterns[0].platform).toBe(
      ContentIntelligencePlatform.LINKEDIN,
    );
  });
});

// ─── Rule-based pattern extraction (via analyzeCreator) ───────────────────

describe('PatternAnalyzerService rule-based extraction', () => {
  let service: PatternAnalyzerService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();

    // Force LLM to fail so rule-based is used
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('LLM unavailable'),
    );

    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({});
    mockPatternStoreService.storeBulkPatterns.mockImplementation(
      async (p) => p,
    );
  });

  function withPost(text: string) {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [makePost({ text })],
      profile: {},
    });
  }

  it('extracts QUESTION hook when first line ends with ?', async () => {
    withPost('What if you could 10x your productivity?\n\nHere is how...');

    const { patterns } = await service.analyzeCreator(creatorId);
    const hook = patterns.find(
      (p) =>
        p.patternType === ContentPatternType.HOOK &&
        p.templateCategory === ContentPatternCategory.QUESTION,
    );
    expect(hook).toBeDefined();
    expect(hook?.placeholders).toContain('QUESTION');
  });

  it('extracts CONTRARIAN hook when starting with "stop"', async () => {
    withPost(
      "Stop trying to work harder. It doesn't work.\n\nWork smarter instead.",
    );

    const { patterns } = await service.analyzeCreator(creatorId);
    const hook = patterns.find(
      (p) =>
        p.patternType === ContentPatternType.HOOK &&
        p.templateCategory === ContentPatternCategory.CONTRARIAN,
    );
    expect(hook).toBeDefined();
  });

  it('extracts CONTRARIAN hook when starting with "hot take"', async () => {
    withPost('Hot take: most productivity advice is wrong.\n\nHere is why.');

    const { patterns } = await service.analyzeCreator(creatorId);
    const hook = patterns.find(
      (p) => p.templateCategory === ContentPatternCategory.CONTRARIAN,
    );
    expect(hook).toBeDefined();
  });

  it('extracts STORY hook when starting with "i spent"', async () => {
    withPost(
      'I spent 3 years building the wrong thing.\n\nHere is what happened:',
    );

    const { patterns } = await service.analyzeCreator(creatorId);
    const hook = patterns.find(
      (p) => p.templateCategory === ContentPatternCategory.STORY,
    );
    expect(hook).toBeDefined();
    expect(hook?.placeholders).toContain('TIMEFRAME');
    expect(hook?.placeholders).toContain('EXPERIENCE');
  });

  it('extracts LIST template when 3+ numbered items', async () => {
    withPost(
      '5 things I wish I knew:\n\n1. First thing\n2. Second thing\n3. Third thing',
    );

    const { patterns } = await service.analyzeCreator(creatorId);
    const list = patterns.find(
      (p) =>
        p.patternType === ContentPatternType.TEMPLATE &&
        p.templateCategory === ContentPatternCategory.LIST,
    );
    expect(list).toBeDefined();
    expect(list?.placeholders).toContain('NUMBER');
  });

  it('does NOT extract LIST for only 2 numbered items', async () => {
    withPost('Two tips:\n\n1. First thing\n2. Second thing');

    const { patterns } = await service.analyzeCreator(creatorId);
    const list = patterns.find(
      (p) => p.templateCategory === ContentPatternCategory.LIST,
    );
    expect(list).toBeUndefined();
  });

  it('extracts STRUCTURE for thread indicator', async () => {
    withPost(
      'How to build a startup:\n\n🧵 Thread:\n\n1. Start with problem...',
    );

    const { patterns } = await service.analyzeCreator(creatorId);
    const thread = patterns.find(
      (p) => p.patternType === ContentPatternType.STRUCTURE,
    );
    expect(thread).toBeDefined();
  });

  it('extracts CTA for "follow for" pattern', async () => {
    withPost(
      'Great content here.\n\nFollow for daily tips on AI and productivity.',
    );

    const { patterns } = await service.analyzeCreator(creatorId);
    const cta = patterns.find((p) => p.patternType === ContentPatternType.CTA);
    expect(cta).toBeDefined();
  });

  it('extracts CTA for "save this" pattern', async () => {
    withPost('Save this post. You will need it later.\n\nHere are 5 tips...');

    const { patterns } = await service.analyzeCreator(creatorId);
    const cta = patterns.find((p) => p.patternType === ContentPatternType.CTA);
    expect(cta).toBeDefined();
  });

  it('returns no patterns for very short text', async () => {
    withPost('Short.');

    const { patterns } = await service.analyzeCreator(creatorId);
    expect(patterns).toHaveLength(0);
  });

  it('skips posts with no text', async () => {
    withPost('');

    const { patterns } = await service.analyzeCreator(creatorId);
    expect(patterns).toHaveLength(0);
  });
});

// ─── LLM response parsing ─────────────────────────────────────────────────

describe('PatternAnalyzerService LLM response parsing', () => {
  let service: PatternAnalyzerService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();

    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({});
    mockPatternStoreService.storeBulkPatterns.mockImplementation(
      async (p) => p,
    );
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [
        makePost({
          text: 'I spent 2 years building this framework. Here are my learnings:',
        }),
      ],
      profile: {},
    });
  });

  it('calls openrouter chatCompletion with correct model and post text', async () => {
    const llmPatterns = [
      {
        description: 'Personal journey hook',
        extractedFormula:
          '[TIMEFRAME] I [VERB] [TOPIC]. Here are my learnings:',
        placeholders: ['TIMEFRAME', 'VERB', 'TOPIC'],
      },
    ];

    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: llmPatterns,
    });

    await service.analyzeCreator(creatorId);
    expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 1500,
        model: LLM_DEFAULTS.background,
        schemaName: 'content_pattern_extraction',
        temperature: 0.3,
      }),
      orgId,
    );
  });

  it('stops asking the model for a bare JSON array', async () => {
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [],
    });

    await service.analyzeCreator(creatorId);

    const [params] = mockLlmDispatcherService.completeStructured.mock
      .calls[0] as [{ messages: Array<{ content: string }> }];
    expect(params.messages[0].content).not.toContain('ONLY the JSON');
  });

  it('maps the free-text parts onto stored patterns and labels them locally', async () => {
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [
        {
          description: 'CTA',
          extractedFormula: 'Follow [ACCOUNT] for more',
          placeholders: ['ACCOUNT'],
        },
      ],
    });

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalled();
    // The post opens with "I spent ...", so the rule-based answer is a story
    // hook; the model is no longer asked for either label.
    expect(patterns).toEqual([
      expect.objectContaining({
        description: 'CTA',
        extractedFormula: 'Follow [ACCOUNT] for more',
        isLowConfidence: false,
        patternType: ContentPatternType.HOOK,
        placeholders: ['ACCOUNT'],
        templateCategory: ContentPatternCategory.STORY,
      }),
    ]);
  });

  it('stops asking the model to label the pattern', async () => {
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [],
    });

    await service.analyzeCreator(creatorId);

    const [params] = mockLlmDispatcherService.completeStructured.mock
      .calls[0] as [{ messages: Array<{ content: string }> }];
    expect(params.messages[0].content).not.toContain('patternType');
    expect(params.messages[0].content).not.toContain('templateCategory');
  });

  it('falls back to rule-based when the model misses the schema twice', async () => {
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new LlmStructuredOutputError('content_pattern_extraction', [
        { code: 'invalid_format', message: 'not JSON', path: '<root>' },
      ]),
    );

    // Post that triggers rule-based (question hook)
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [
        makePost({
          text: 'Are you making this mistake?\n\nHere is what to avoid.',
        }),
      ],
      profile: {},
    });

    const { patterns } = await service.analyzeCreator(creatorId);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].patternType).toBe(ContentPatternType.HOOK);
  });

  it('falls back to rule-based when LLM throws', async () => {
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('timeout'),
    );

    // Post that triggers story rule
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [
        makePost({
          text: 'I failed at my first startup.\n\nHere is what I learned:',
        }),
      ],
      profile: {},
    });

    const { patterns } = await service.analyzeCreator(creatorId);
    const story = patterns.find(
      (p) => p.templateCategory === ContentPatternCategory.STORY,
    );
    expect(story).toBeDefined();
  });

  it('returns no patterns when the model reports none', async () => {
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [],
    });

    const { patterns } = await service.analyzeCreator(creatorId);
    expect(patterns).toHaveLength(0);
  });

  it('marks a pattern uncertain when no rule matched and nothing was decided', async () => {
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [
        makePost({
          text: 'The framework we use to price enterprise deals at scale.',
        }),
      ],
      profile: {},
    });
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [
        {
          description: 'something',
          extractedFormula: '[X]',
          placeholders: [],
        },
      ],
    });

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(patterns).toHaveLength(1);
    // A placeholder label, visibly flagged rather than quietly plausible.
    expect(patterns[0].isLowConfidence).toBe(true);
    expect(patterns[0].patternType).toBe(ContentPatternType.HOOK);
    expect(patterns[0].templateCategory).toBeUndefined();
  });
});

// ─── calculateViralScore ──────────────────────────────────────────────────

describe('PatternAnalyzerService.calculateViralScore (via sourceMetrics)', () => {
  let service: PatternAnalyzerService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();

    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({});
    mockPatternStoreService.storeBulkPatterns.mockImplementation(
      async (p) => p,
    );

    // Force LLM fail to use rule-based
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('no'),
    );
  });

  it('calculates viral score and includes it in sourceMetrics', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });

    const post = makePost({
      comments: 300,
      engagementRate: 8.5,
      likes: 2000,
      shares: 150,
      text: 'What makes a product go viral?\n\nHere is the answer...',
    });

    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [post],
      profile: {},
    });

    const { patterns } = await service.analyzeCreator(creatorId);
    expect(patterns.length).toBeGreaterThan(0);

    const pattern = patterns[0];
    expect(pattern.sourceMetrics).toBeDefined();
    expect(pattern.sourceMetrics.viralScore).toBeGreaterThan(0);
    // viralScore = engagementRate + likesBonus + commentsBonus + sharesBonus
    // = 8.5 + min(2000/1000, 10) + min(300/100, 5) + min(150/50, 5)
    // = 8.5 + 2 + 3 + 3 = 16.5
    expect(pattern.sourceMetrics.viralScore).toBe(16.5);
  });

  it('caps bonuses at their max values', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });

    const post = makePost({
      comments: 50000, // commentsBonus should cap at 5
      engagementRate: 5.0,
      likes: 100000, // likesBonus should cap at 10
      shares: 25000, // sharesBonus should cap at 5
      text: 'What is the future of AI?\n\nThoughts...',
    });

    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [post],
      profile: {},
    });

    const { patterns } = await service.analyzeCreator(creatorId);
    const pattern = patterns[0];
    // 5.0 + 10 + 5 + 5 = 25.0
    expect(pattern.sourceMetrics.viralScore).toBe(25);
  });
});

// ─── Top 30 posts sorting ─────────────────────────────────────────────────

describe('PatternAnalyzerService post sorting and capping', () => {
  let service: PatternAnalyzerService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();

    mockContentIntelligenceService.findOne.mockResolvedValue({
      id: creatorId,
      organizationId: orgId,
      platform: ContentIntelligencePlatform.TWITTER,
    });
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({});

    // LLM fails → rule-based
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('no'),
    );
  });

  it('processes top 30 posts by engagement rate', async () => {
    // Create 35 posts, alternating high/low engagement
    const posts: ScrapedPost[] = Array.from({ length: 35 }, (_, i) =>
      makePost({
        engagementRate: i < 30 ? 10 - i * 0.1 : 0.1, // top 30 have high engagement
        id: String(i),
        text:
          i < 30
            ? `What is lesson ${i}?\n\nHere is what I found:` // question hook, high engagement
            : `Short post ${i}`, // no pattern, low engagement
      }),
    );

    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts,
      profile: {},
    });
    mockPatternStoreService.storeBulkPatterns.mockImplementation(
      async (p) => p,
    );

    const { patterns } = await service.analyzeCreator(creatorId);
    // Only top 30 by engagement should be processed; the 5 low-engagement posts won't contribute
    // All question hook posts should generate patterns
    expect(patterns.length).toBeGreaterThan(0);
  });
});

// ─── Typed-decision labels (#4868) ────────────────────────────────────────

describe('PatternAnalyzerService typed-decision labels', () => {
  let service: PatternAnalyzerService;

  const questionHookPost =
    'What if you could 10x your output?\n\nHere is the system I use.';

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();

    mockContentIntelligenceService.findOne.mockResolvedValue({
      // The creator's platform lives in the JSON `data` column.
      data: { platform: ContentIntelligencePlatform.TWITTER },
      id: creatorId,
      organizationId: orgId,
    });
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateMetrics.mockResolvedValue(undefined);
    mockCreatorScraperService.calculateAggregateMetrics.mockReturnValue({});
    mockPatternStoreService.storeBulkPatterns.mockImplementation(
      async (p) => p,
    );
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [makePost({ text: questionHookPost })],
      profile: {},
    });
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [
        {
          description: 'Opens on an outcome question',
          extractedFormula: 'What if you could [OUTCOME]?',
          placeholders: ['OUTCOME'],
        },
      ],
    });
  });

  function answer(value: string, confidence: number) {
    return { confidence, value };
  }

  function decide(
    patternType: string,
    templateCategory: string,
    confidence = 0.95,
  ) {
    mockTypedDecisionService.choose.mockImplementation(
      async (_params: unknown, context: { decisionPoint: string }) =>
        context.decisionPoint === CONTENT_PATTERN_TYPE_DECISION_POINT
          ? answer(patternType, confidence)
          : answer(templateCategory, confidence),
    );
  }

  it('never calls the provider in off mode', async () => {
    setDecisionConfig('off');

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(mockTypedDecisionService.choose).not.toHaveBeenCalled();
    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });

  it('records the rule-based answer in shadow mode without acting on the decision', async () => {
    setDecisionConfig('shadow');
    decide(ContentPatternType.TEMPLATE, ContentPatternCategory.LIST);

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(mockTypedDecisionService.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [
          ContentPatternType.HOOK,
          ContentPatternType.TEMPLATE,
          ContentPatternType.CTA,
          ContentPatternType.STRUCTURE,
        ],
        state: {
          platform: ContentIntelligencePlatform.TWITTER,
          postText: questionHookPost,
        },
      }),
      expect.objectContaining({
        decisionPoint: CONTENT_PATTERN_TYPE_DECISION_POINT,
        deterministicAnswer: ContentPatternType.HOOK,
        mode: 'shadow',
        organizationId: orgId,
      }),
    );
    expect(mockTypedDecisionService.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [
          ContentPatternCategory.STORY,
          ContentPatternCategory.CONTRARIAN,
          ContentPatternCategory.CASE_STUDY,
          ContentPatternCategory.LIST,
          ContentPatternCategory.CURATION,
          ContentPatternCategory.QUESTION,
          ContentPatternCategory.THREAD,
        ],
      }),
      expect.objectContaining({
        decisionPoint: CONTENT_PATTERN_TEMPLATE_CATEGORY_DECISION_POINT,
        deterministicAnswer: ContentPatternCategory.QUESTION,
        mode: 'shadow',
      }),
    );
    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });

  it('caps a configured live mode at shadow — a confident decided label never overrides the rule-based one', async () => {
    setDecisionConfig('live', 0.8);
    decide(ContentPatternType.TEMPLATE, ContentPatternCategory.LIST, 0.81);

    const { patterns } = await service.analyzeCreator(creatorId);

    // Jev still computed and was called (shadow telemetry), but the pattern
    // analyzer's two label decisions (#4868, release-blocker follow-up to
    // epic #4863) can no longer dispatch on it — `live` is not reachable.
    expect(mockTypedDecisionService.choose).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'shadow' }),
    );
    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });

  it('treats a sub-threshold confidence exactly like no answer', async () => {
    setDecisionConfig('live');
    decide(ContentPatternType.TEMPLATE, ContentPatternCategory.LIST, 0.84);

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });

  it('falls back to the rule-based answer when the provider resolves null', async () => {
    setDecisionConfig('live');
    mockTypedDecisionService.choose.mockResolvedValue(null);

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });

  it('flags the pattern when neither the decision nor a rule produced a label', async () => {
    setDecisionConfig('live');
    mockTypedDecisionService.choose.mockResolvedValue(null);
    mockCreatorScraperService.scrapeCreator.mockResolvedValue({
      posts: [
        makePost({
          text: 'The pricing framework we use for enterprise deals at scale.',
        }),
      ],
      profile: {},
    });

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(patterns[0]).toMatchObject({
      isLowConfidence: true,
      patternType: ContentPatternType.HOOK,
    });
    expect(patterns[0].templateCategory).toBeUndefined();
  });

  it('keeps the rule-based type and category even when a decided pattern type is confident — shadowed, not applied', async () => {
    setDecisionConfig('live');
    mockTypedDecisionService.choose.mockImplementation(
      async (_params: unknown, context: { decisionPoint: string }) =>
        context.decisionPoint === CONTENT_PATTERN_TYPE_DECISION_POINT
          ? answer(ContentPatternType.STRUCTURE, 0.99)
          : null,
    );

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });

  it('does not decide labels when the model returns no pattern', async () => {
    setDecisionConfig('live');
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [],
    });

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(patterns).toHaveLength(0);
    expect(mockTypedDecisionService.choose).not.toHaveBeenCalled();
  });

  it('does not decide labels when the model call fails', async () => {
    setDecisionConfig('live');
    mockLlmDispatcherService.completeStructured.mockRejectedValue(
      new Error('LLM timeout'),
    );

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(mockTypedDecisionService.choose).not.toHaveBeenCalled();
    expect(patterns[0]).toMatchObject({
      isLowConfidence: false,
      patternType: ContentPatternType.HOOK,
      templateCategory: ContentPatternCategory.QUESTION,
    });
  });
});
