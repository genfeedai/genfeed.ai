import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import {
  CreatorScraperService,
  type ScrapedPost,
} from '@api/collections/content-intelligence/services/creator-scraper.service';
import { resolvePatternAnalyzerDecisionSettings } from '@api/collections/content-intelligence/services/pattern-analyzer-decision.config';
import {
  type CreatePatternDto,
  PatternStoreService,
} from '@api/collections/content-intelligence/services/pattern-store.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import {
  ContentIntelligencePlatform,
  ContentPatternCategory,
  ContentPatternType,
  CreatorAnalysisStatus,
} from '@genfeedai/contracts';
import {
  CONTENT_PATTERN_EXTRACTION_SCHEMA_NAME,
  type ContentPatternExtractionItem,
  contentPatternExtractionSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { ContentPatternLabels } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Telemetry keys of the two label decisions (#4868). #4874 queries shadow-mode
 * agreement by them, so they are stable and must not be renamed.
 */
export const CONTENT_PATTERN_TYPE_DECISION_POINT =
  'content_pattern.pattern_type';
export const CONTENT_PATTERN_TEMPLATE_CATEGORY_DECISION_POINT =
  'content_pattern.template_category';

/**
 * The analyzer's label vocabulary, from #4868. `headline` and `giveaway` are
 * on the enums for other surfaces; no path in this service produces them, so
 * offering them here would only invite a label nothing downstream expects.
 */
const PATTERN_TYPE_OPTIONS: readonly ContentPatternType[] = [
  ContentPatternType.HOOK,
  ContentPatternType.TEMPLATE,
  ContentPatternType.CTA,
  ContentPatternType.STRUCTURE,
];

const TEMPLATE_CATEGORY_OPTIONS: readonly ContentPatternCategory[] = [
  ContentPatternCategory.STORY,
  ContentPatternCategory.CONTRARIAN,
  ContentPatternCategory.CASE_STUDY,
  ContentPatternCategory.LIST,
  ContentPatternCategory.CURATION,
  ContentPatternCategory.QUESTION,
  ContentPatternCategory.THREAD,
];

/** Same budget as the extraction prompt: the decision judges the same post. */
const DECISION_STATE_TEXT_LIMIT = 1000;

interface ExtractedPattern extends ContentPatternLabels {
  description: string;
  extractedFormula: string;
  placeholders: string[];
  rawExample: string;
}

@Injectable()
export class PatternAnalyzerService {
  private readonly constructorName = this.constructor.name;
  private readonly defaultModel: string;

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  constructor(
    private readonly logger: LoggerService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly contentIntelligenceService: ContentIntelligenceService,
    private readonly creatorScraperService: CreatorScraperService,
    private readonly patternStoreService: PatternStoreService,
    private readonly typedDecisionService: TypedDecisionService,
    private readonly configService: ConfigService,
  ) {
    this.defaultModel = LLM_DEFAULTS.background;
  }

  async analyzeCreator(creatorId: string): Promise<{
    patternsExtracted: number;
    patterns: CreatePatternDto[];
  }> {
    const creator = await this.contentIntelligenceService.findOne({
      id: creatorId,
    });

    if (!creator) {
      throw new Error('Creator not found');
    }

    try {
      // Scrape the creator's content
      const scrapeResult =
        await this.creatorScraperService.scrapeCreator(creatorId);

      if (!scrapeResult || scrapeResult.posts.length === 0) {
        await this.contentIntelligenceService.updateStatus(
          creatorId,
          CreatorAnalysisStatus.FAILED,
          'No posts found for analysis',
        );
        return { patterns: [], patternsExtracted: 0 };
      }

      // Calculate metrics
      const metrics = this.creatorScraperService.calculateAggregateMetrics(
        scrapeResult.posts,
      );

      // Extract patterns from posts
      const patterns = await this.extractPatterns(
        scrapeResult.posts,
        creator.organizationId,
        creatorId,
        this.readCreatorPlatform(creator),
      );

      // Store patterns
      const storedPatterns =
        await this.patternStoreService.storeBulkPatterns(patterns);

      // Update creator with metrics and status
      await this.contentIntelligenceService.updateMetrics(
        creatorId,
        metrics,
        scrapeResult.posts.length,
        storedPatterns.length,
      );

      await this.contentIntelligenceService.updateStatus(
        creatorId,
        CreatorAnalysisStatus.COMPLETED,
      );

      return {
        patterns,
        patternsExtracted: storedPatterns.length,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`${this.constructorName}: Analysis failed`, {
        creatorId,
        error: errorMessage,
      });

      await this.contentIntelligenceService.updateStatus(
        creatorId,
        CreatorAnalysisStatus.FAILED,
        errorMessage,
      );

      throw error;
    }
  }

  private async extractPatterns(
    posts: ScrapedPost[],
    organizationId: string,
    creatorId: string,
    platform: ContentIntelligencePlatform,
  ): Promise<CreatePatternDto[]> {
    const patterns: CreatePatternDto[] = [];

    // Sort by engagement to focus on high-performing posts
    const sortedPosts = [...posts].sort(
      (a, b) => b.engagementRate - a.engagementRate,
    );
    const topPosts = sortedPosts.slice(0, 30);

    // Extract hooks from high-performing posts with per-post error handling
    for (const post of topPosts) {
      try {
        const hookPatterns = await this.extractHookPatterns(
          post,
          organizationId,
          platform,
        );

        for (const pattern of hookPatterns) {
          patterns.push({
            description: pattern.description,
            extractedFormula: pattern.extractedFormula,
            isLowConfidence: pattern.isLowConfidence,
            organizationId,
            patternType: pattern.patternType,
            placeholders: pattern.placeholders,
            platform,
            rawExample: pattern.rawExample,
            sourceCreatorId: creatorId,
            sourceMetrics: {
              comments: post.comments,
              engagementRate: post.engagementRate,
              likes: post.likes,
              shares: post.shares,
              views: post.views,
              viralScore: this.calculateViralScore(post),
            },
            sourcePostDate: post.publishedAt,
            sourcePostId: post.id,
            sourcePostUrl: post.url,
            tags: post.hashtags,
            templateCategory: pattern.templateCategory,
          });
        }
      } catch (error: unknown) {
        // Log error but continue processing remaining posts
        this.logger.warn('Failed to extract patterns from post', {
          error: (error as Error)?.message,
          postId: post.id,
          postUrl: post.url,
        });
      }
    }

    return patterns;
  }

  private async extractHookPatterns(
    post: ScrapedPost,
    organizationId: string,
    platform: ContentIntelligencePlatform,
  ): Promise<ExtractedPattern[]> {
    const text = post.text;
    if (!text || text.length < 20) {
      return [];
    }

    // The rule-based extractor is both the fallback and the deterministic
    // answer the label decisions are measured against, so it always runs.
    const ruleBasedPatterns = this.extractPatternsRuleBased(text);

    let extractedItems: ContentPatternExtractionItem[];
    try {
      extractedItems = await this.extractPatternsWithLLM(text, organizationId);
    } catch {
      return ruleBasedPatterns;
    }

    if (extractedItems.length === 0) {
      return [];
    }

    const labels = await this.decidePatternLabels(
      text,
      platform,
      ruleBasedPatterns,
      organizationId,
    );

    return extractedItems.map((item) => ({
      description: item.description,
      extractedFormula: item.extractedFormula,
      placeholders: item.placeholders,
      rawExample: text,
      ...labels,
    }));
  }

  /**
   * The two closed labels of a post (#4868).
   *
   * Only an enum member is ever returned: a decided label above the
   * configured floor, or the rule-based answer. A `null` decision and a
   * sub-threshold one are the same thing, and a label neither source produced
   * ships as `isLowConfidence` rather than as a plausible default.
   */
  private async decidePatternLabels(
    text: string,
    platform: ContentIntelligencePlatform,
    ruleBasedPatterns: ExtractedPattern[],
    organizationId: string,
  ): Promise<ContentPatternLabels> {
    const fallback = this.readRuleBasedLabels(ruleBasedPatterns);
    const hasRuleBasedAnswer = ruleBasedPatterns.length > 0;
    const { minConfidence, mode } = resolvePatternAnalyzerDecisionSettings(
      this.configService,
    );

    if (mode === 'off') {
      return { ...fallback, isLowConfidence: !hasRuleBasedAnswer };
    }

    const state: Record<string, unknown> = {
      platform,
      postText: text.slice(0, DECISION_STATE_TEXT_LIMIT),
    };

    const [typeAnswer, categoryAnswer] = await Promise.all([
      this.typedDecisionService.choose(
        {
          options: PATTERN_TYPE_OPTIONS,
          question:
            'Which reusable pattern does this social post primarily demonstrate?',
          state,
        },
        {
          decisionPoint: CONTENT_PATTERN_TYPE_DECISION_POINT,
          deterministicAnswer: fallback.patternType,
          mode,
          organizationId,
        },
      ),
      this.typedDecisionService.choose(
        {
          options: TEMPLATE_CATEGORY_OPTIONS,
          question: 'Which template category does this social post follow?',
          state,
        },
        {
          decisionPoint: CONTENT_PATTERN_TEMPLATE_CATEGORY_DECISION_POINT,
          mode,
          organizationId,
          ...(fallback.templateCategory === undefined
            ? {}
            : { deterministicAnswer: fallback.templateCategory }),
        },
      ),
    ]);

    // Shadow mode buys the agreement number that gates the flip to live; the
    // deterministic labels still ship.
    if (mode !== 'live') {
      return { ...fallback, isLowConfidence: !hasRuleBasedAnswer };
    }

    const decidedType =
      typeAnswer !== null && typeAnswer.confidence >= minConfidence
        ? typeAnswer.value
        : undefined;
    const decidedCategory =
      categoryAnswer !== null && categoryAnswer.confidence >= minConfidence
        ? categoryAnswer.value
        : undefined;
    const templateCategory = decidedCategory ?? fallback.templateCategory;
    const isLowConfidence =
      (decidedType === undefined || decidedCategory === undefined) &&
      !hasRuleBasedAnswer;

    return {
      isLowConfidence,
      patternType: decidedType ?? fallback.patternType,
      ...(templateCategory === undefined ? {} : { templateCategory }),
    };
  }

  /**
   * The rule-based answer for one post: the labels of its first matched rule.
   * A post no rule matches has no answer, so the caller flags the pattern
   * instead of treating `hook` as one.
   */
  private readRuleBasedLabels(
    ruleBasedPatterns: ExtractedPattern[],
  ): Omit<ContentPatternLabels, 'isLowConfidence'> {
    const [first] = ruleBasedPatterns;

    return {
      patternType: first?.patternType ?? ContentPatternType.HOOK,
      ...(first?.templateCategory === undefined
        ? {}
        : { templateCategory: first.templateCategory }),
    };
  }

  private async extractPatternsWithLLM(
    text: string,
    organizationId: string,
  ): Promise<ContentPatternExtractionItem[]> {
    try {
      const extraction = await this.llmDispatcherService.completeStructured(
        {
          max_tokens: 1500,
          messages: [
            { content: this.buildExtractionPrompt(text), role: 'user' },
          ],
          model: this.defaultModel,
          schema: contentPatternExtractionSchema,
          schemaName: CONTENT_PATTERN_EXTRACTION_SCHEMA_NAME,
          temperature: 0.3,
        },
        organizationId,
      );

      return extraction.patterns;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName}: LLM extraction failed`,
        error,
      );
      throw error;
    }
  }

  private buildExtractionPrompt(text: string): string {
    return `Analyze this social media post and extract any reusable patterns.

POST:
"""
${text.slice(0, 1000)}
"""

Look for:
1. Hook patterns (attention-grabbing opening lines)
2. Template structure (story, list, contrarian, case study, etc.)
3. CTA patterns (call to action phrases)

For each pattern, give:
- extractedFormula: the reusable formula with [PLACEHOLDER] markers
- description: why this works, in one line
- placeholders: the placeholder names used in the formula

Do not label the pattern; the formula and the description are the answer.

If no patterns are worth reusing, return an empty list.`;
  }

  private extractPatternsRuleBased(text: string): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const lines = text.split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Rule 1: Question hooks
    if (firstLine.endsWith('?') && firstLine.length < 100) {
      patterns.push({
        description: 'Question hook pattern',
        extractedFormula: '[QUESTION]?',
        isLowConfidence: false,
        patternType: ContentPatternType.HOOK,
        placeholders: ['QUESTION'],
        rawExample: text,
        templateCategory: ContentPatternCategory.QUESTION,
      });
    }

    // Rule 2: Contrarian hooks (starts with "Stop", "Don't", "Never", etc.)
    const contrarianStarters = [
      'stop',
      "don't",
      'never',
      'forget',
      'unpopular opinion',
      'hot take',
    ];
    if (contrarianStarters.some((s) => firstLine.toLowerCase().startsWith(s))) {
      patterns.push({
        description: 'Contrarian hook pattern',
        extractedFormula: "[CONTRARIAN_STATEMENT]. Here's why:",
        isLowConfidence: false,
        patternType: ContentPatternType.HOOK,
        placeholders: ['CONTRARIAN_STATEMENT'],
        rawExample: text,
        templateCategory: ContentPatternCategory.CONTRARIAN,
      });
    }

    // Rule 3: Story hooks (starts with "I", personal experience)
    const storyStarters = [
      'i spent',
      'i made',
      'i learned',
      'i failed',
      'i quit',
      'last year',
      'yesterday',
    ];
    if (storyStarters.some((s) => firstLine.toLowerCase().startsWith(s))) {
      patterns.push({
        description: 'Personal story hook',
        extractedFormula: "[TIMEFRAME] I [EXPERIENCE]. Here's what happened:",
        isLowConfidence: false,
        patternType: ContentPatternType.HOOK,
        placeholders: ['TIMEFRAME', 'EXPERIENCE'],
        rawExample: text,
        templateCategory: ContentPatternCategory.STORY,
      });
    }

    // Rule 4: List posts (contains numbered items)
    const numberPattern = /^\d+[.)]/gm;
    const numberedItems = text.match(numberPattern);
    if (numberedItems && numberedItems.length >= 3) {
      patterns.push({
        description: 'Numbered list template',
        extractedFormula:
          '[NUMBER] [TOPIC_TIPS]:\n\n1. [TIP_1]\n2. [TIP_2]\n...',
        isLowConfidence: false,
        patternType: ContentPatternType.TEMPLATE,
        placeholders: ['NUMBER', 'TOPIC_TIPS', 'TIP_1', 'TIP_2'],
        rawExample: text,
        templateCategory: ContentPatternCategory.LIST,
      });
    }

    // Rule 5: Thread indicator
    if (text.toLowerCase().includes('thread') || text.includes('🧵')) {
      patterns.push({
        description: 'Thread format',
        extractedFormula: '[HOOK]\n\n🧵 Thread:',
        isLowConfidence: false,
        patternType: ContentPatternType.STRUCTURE,
        placeholders: ['HOOK'],
        rawExample: text,
        templateCategory: ContentPatternCategory.THREAD,
      });
    }

    // Rule 6: CTA patterns
    const ctaPatterns = [
      'follow for',
      'like if',
      'comment below',
      'share this',
      'save this',
      'link in bio',
    ];
    for (const cta of ctaPatterns) {
      if (text.toLowerCase().includes(cta)) {
        patterns.push({
          description: `CTA pattern: ${cta}`,
          extractedFormula: `[ACTION] ${cta.split(' ')[0]} [VALUE]`,
          isLowConfidence: false,
          patternType: ContentPatternType.CTA,
          placeholders: ['ACTION', 'VALUE'],
          rawExample: text,
        });
        break;
      }
    }

    return patterns;
  }

  private readCreatorPlatform(creator: {
    data: unknown;
  }): ContentIntelligencePlatform {
    const data = this.isPlainObject(creator.data) ? creator.data : {};
    const platform = data.platform;
    const validPlatforms = Object.values(ContentIntelligencePlatform);

    if (
      typeof platform === 'string' &&
      validPlatforms.includes(platform as ContentIntelligencePlatform)
    ) {
      return platform as ContentIntelligencePlatform;
    }

    return ContentIntelligencePlatform.LINKEDIN;
  }

  private calculateViralScore(post: ScrapedPost): number {
    const baseScore = post.engagementRate;
    const likesBonus = Math.min(post.likes / 1000, 10);
    const commentsBonus = Math.min(post.comments / 100, 5);
    const sharesBonus = Math.min(post.shares / 50, 5);

    return (
      Math.round((baseScore + likesBonus + commentsBonus + sharesBonus) * 10) /
      10
    );
  }
}
