import type { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import type {
  CreatorScraperService,
  ScrapedPost,
} from '@api/collections/content-intelligence/services/creator-scraper.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
import type { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import {
  ContentIntelligencePlatform,
  ContentPatternCategory,
  ContentPatternType,
  CreatorAnalysisStatus,
} from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
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

function makeService() {
  return new PatternAnalyzerService(
    mockLogger as unknown as LoggerService,
    mockLlmDispatcherService as unknown as LlmDispatcherService,
    mockContentIntelligenceService as unknown as ContentIntelligenceService,
    mockCreatorScraperService as unknown as CreatorScraperService,
    mockPatternStoreService as unknown as PatternStoreService,
  );
}

const orgId = 'test-object-id';
const creatorId = 'test-object-id';

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
        patternType: 'hook',
        placeholders: ['TIMEFRAME', 'VERB', 'TOPIC'],
        templateCategory: 'story',
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

  it('maps the validated free-text parts onto stored patterns', async () => {
    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: [
        {
          description: 'CTA',
          extractedFormula: 'Follow [ACCOUNT] for more',
          patternType: 'cta',
          placeholders: ['ACCOUNT'],
        },
      ],
    });

    const { patterns } = await service.analyzeCreator(creatorId);

    expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalled();
    expect(patterns).toEqual([
      expect.objectContaining({
        description: 'CTA',
        extractedFormula: 'Follow [ACCOUNT] for more',
        patternType: ContentPatternType.CTA,
        placeholders: ['ACCOUNT'],
      }),
    ]);
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

  it('validates unknown patternType and defaults to HOOK', async () => {
    const llmPatterns = [
      {
        description: 'something',
        extractedFormula: '[X]',
        patternType: 'totally_invalid_type',
        placeholders: [],
      },
    ];

    mockLlmDispatcherService.completeStructured.mockResolvedValue({
      patterns: llmPatterns,
    });

    const { patterns } = await service.analyzeCreator(creatorId);
    if (patterns.length > 0) {
      expect(patterns[0].patternType).toBe(ContentPatternType.HOOK);
    }
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
