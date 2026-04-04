import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import {
  CreatorScraperService,
  type ScrapedPost,
} from '@api/collections/content-intelligence/services/creator-scraper.service';
import {
  type CreatePatternDto,
  PatternStoreService,
} from '@api/collections/content-intelligence/services/pattern-store.service';
import { ConfigService } from '@api/config/config.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import {
  ContentIntelligencePlatform,
  ContentPatternCategory,
  ContentPatternType,
  CreatorAnalysisStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

interface ExtractedPattern {
  patternType: ContentPatternType;
  templateCategory?: ContentPatternCategory;
  rawExample: string;
  extractedFormula: string;
  description: string;
  placeholders: string[];
}

@Injectable()
export class PatternAnalyzerService {
  private readonly constructorName = this.constructor.name;
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly contentIntelligenceService: ContentIntelligenceService,
    private readonly creatorScraperService: CreatorScraperService,
    private readonly patternStoreService: PatternStoreService,
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || 'x-ai/grok-4-fast';
  }

  async analyzeCreator(creatorId: Types.ObjectId | string): Promise<{
    patternsExtracted: number;
    patterns: CreatePatternDto[];
  }> {
    const creator = await this.contentIntelligenceService.findOne({
      _id: creatorId,
      isDeleted: false,
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
        creator.organization,
        new Types.ObjectId(creatorId.toString()),
        creator.platform,
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
    organizationId: Types.ObjectId,
    creatorId: Types.ObjectId,
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
        const hookPatterns = await this.extractHookPatterns(post);

        for (const pattern of hookPatterns) {
          patterns.push({
            description: pattern.description,
            extractedFormula: pattern.extractedFormula,
            organization: organizationId,
            patternType: pattern.patternType,
            placeholders: pattern.placeholders,
            platform,
            rawExample: pattern.rawExample,
            sourceCreator: creatorId,
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
            // @ts-expect-error TS2322
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
  ): Promise<ExtractedPattern[]> {
    const text = post.text;
    if (!text || text.length < 20) {
      return [];
    }

    // Try to use LLM for extraction, fall back to rule-based
    try {
      return await this.extractPatternsWithLLM(text);
    } catch {
      return this.extractPatternsRuleBased(text);
    }
  }

  private async extractPatternsWithLLM(
    text: string,
  ): Promise<ExtractedPattern[]> {
    const prompt = this.buildExtractionPrompt(text);

    try {
      const response = await this.openRouterService.chatCompletion({
        max_tokens: 1500,
        messages: [{ content: prompt, role: 'user' }],
        model: this.defaultModel,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      return this.parseLLMResponse(content, text);
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

Identify:
1. Hook patterns (attention-grabbing opening lines)
2. Template structure (story, list, contrarian, case study, etc.)
3. CTA patterns (call to action phrases)

For each pattern found, respond in JSON format:
[{
  "patternType": "hook" | "template" | "cta" | "structure",
  "templateCategory": "story" | "contrarian" | "case_study" | "list" | "curation" | "question" | "thread" | null,
  "extractedFormula": "The reusable formula with [PLACEHOLDER] markers",
  "description": "Brief description of why this works",
  "placeholders": ["PLACEHOLDER1", "PLACEHOLDER2"]
}]

Return ONLY the JSON array. If no patterns found, return [].`;
  }

  private parseLLMResponse(
    content: string,
    originalText: string,
  ): ExtractedPattern[] {
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '');
      }

      const patterns = JSON.parse(jsonStr) as ExtractedPattern[];

      if (!Array.isArray(patterns)) {
        return [];
      }

      // @ts-expect-error TS2322
      return patterns.map((p) => ({
        description: p.description || 'Extracted pattern',
        extractedFormula: p.extractedFormula || originalText.slice(0, 100),
        patternType: this.validatePatternType(p.patternType),
        placeholders: Array.isArray(p.placeholders) ? p.placeholders : [],
        rawExample: originalText,
        templateCategory: this.validateTemplateCategory(p.templateCategory),
      }));
    } catch {
      return [];
    }
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
        patternType: ContentPatternType.HOOK,
        placeholders: ['TIMEFRAME', 'EXPERIENCE'],
        rawExample: text,
        templateCategory: ContentPatternCategory.STORY,
      });
    }

    // Rule 4: List posts (contains numbered items)
    const numberPattern = /^\d+[.)]/gm;
    // @ts-expect-error TS2532
    if (text.match(numberPattern) && text.match(numberPattern)?.length >= 3) {
      patterns.push({
        description: 'Numbered list template',
        extractedFormula:
          '[NUMBER] [TOPIC_TIPS]:\n\n1. [TIP_1]\n2. [TIP_2]\n...',
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
          patternType: ContentPatternType.CTA,
          placeholders: ['ACTION', 'VALUE'],
          rawExample: text,
        });
        break;
      }
    }

    return patterns;
  }

  private validatePatternType(type: unknown): ContentPatternType {
    const validTypes = Object.values(ContentPatternType);
    if (validTypes.includes(type)) {
      return type;
    }
    return ContentPatternType.HOOK;
  }

  private validateTemplateCategory(category: unknown): string | undefined {
    // @ts-expect-error TS2304
    const validCategories = Object.values(TemplateCategory);
    if (validCategories.includes(category)) {
      return category;
    }
    return undefined;
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
