import {
  Article,
  type ArticleDocument,
} from '@api/collections/articles/schemas/article.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ArticleStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

export interface GenerateArticleConfig {
  model: 'gpt-4-turbo-preview' | 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus';
  topic: string;
  tone?: 'professional' | 'casual' | 'inspirational' | 'technical' | 'friendly';
  length?: 'short' | 'medium' | 'long'; // ~300, ~800, ~1500 words
  keywords?: string[]; // SEO keywords
  includeImages?: boolean;
  seoOptimized?: boolean;
  targetAudience?: string;
  style?: string;
  outline?: string[]; // Optional article structure
  language?: string;
}

export interface GenerateArticleResult {
  success: boolean;
  articleId?: string;
  error?: string;
  metadata?: {
    model: string;
    topic: string;
    wordCount?: number;
    generationTime?: number;
  };
}

/**
 * Task handler for generating AI articles
 * Uses Replicate GPT-5.2 for content generation
 */
@Injectable()
export class GenerateArticleTask {
  constructor(
    @InjectModel(Article.name, DB_CONNECTIONS.CLOUD)
    private readonly articleModel: Model<ArticleDocument>,
    private readonly replicateService: ReplicateService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Execute article generation task
   */
  async execute(
    config: GenerateArticleConfig,
    userId: string,
    organizationId: string,
  ): Promise<GenerateArticleResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Executing generate:article task with model: ${config.model}`,
        'GenerateArticleTask',
      );

      // Generate the article content
      const articleContent = await this.generateContent(config);

      // Extract title from content or generate one
      const title =
        this.extractTitle(articleContent) || this.generateTitle(config);

      // Calculate word count
      const wordCount = this.countWords(articleContent);

      // Generate SEO metadata if enabled
      let seoMetadata: unknown = {};
      if (config.seoOptimized) {
        seoMetadata = await this.generateSEOMetadata(
          title,
          articleContent,
          config.keywords || [],
        );
      }

      // Save generated article to database
      const article = new this.articleModel({
        content: articleContent,
        isDeleted: false,
        metadata: {
          generatedBy: 'workflow',
          keywords: config.keywords,
          length: config.length,
          model: config.model,
          seo: seoMetadata,
          targetAudience: config.targetAudience,
          tone: config.tone,
          topic: config.topic,
        },
        model: config.model,
        organization: new Types.ObjectId(organizationId),
        status: ArticleStatus.DRAFT, // Articles start as draft
        title,
        tone: config.tone || 'professional',
        topic: config.topic,
        user: new Types.ObjectId(userId),
        wordCount,
      });

      await article.save();

      const generationTime = Date.now() - startTime;

      this.logger.log(
        `Article generated successfully: ${article._id} (${wordCount} words) in ${generationTime}ms`,
        'GenerateArticleTask',
      );

      return {
        articleId: article._id.toString(),
        metadata: {
          generationTime,
          model: config.model,
          topic: config.topic,
          wordCount,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to generate article',
        error,
        'GenerateArticleTask',
      );

      return {
        error: (error as Error)?.message || 'Article generation failed',
        metadata: {
          model: config.model,
          topic: config.topic,
        },
        success: false,
      };
    }
  }

  /**
   * Generate article content using Replicate GPT-5.2
   */
  private async generateContent(
    config: GenerateArticleConfig,
  ): Promise<string> {
    const prompt = this.buildPrompt(config);
    const systemPrompt = this.getSystemPrompt(config);

    const result = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      {
        max_completion_tokens: this.getMaxTokens(config.length),
        prompt: `${systemPrompt}\n\n${prompt}`,
        system_prompt: systemPrompt,
      },
    );

    return result || '';
  }

  /**
   * Build the main generation prompt
   */
  private buildPrompt(config: GenerateArticleConfig): string {
    const parts: string[] = [];

    parts.push(
      `Write a ${config.length || 'medium'}-length article about: ${config.topic}`,
    );

    if (config.targetAudience) {
      parts.push(`Target audience: ${config.targetAudience}`);
    }

    if (config.keywords && config.keywords.length > 0) {
      parts.push(
        `Include these keywords naturally: ${config.keywords.join(', ')}`,
      );
    }

    if (config.outline && config.outline.length > 0) {
      parts.push(
        `Follow this outline:\n${config.outline.map((section, i) => `${i + 1}. ${section}`).join('\n')}`,
      );
    }

    if (config.seoOptimized) {
      parts.push(
        'Optimize for SEO with clear headings, subheadings, and keyword placement.',
      );
    }

    if (config.includeImages) {
      parts.push(
        'Include [IMAGE] placeholders with descriptions where images would enhance the content.',
      );
    }

    parts.push('Write in markdown format with proper headings and structure.');

    return parts.join('\n\n');
  }

  /**
   * Get system prompt based on configuration
   */
  private getSystemPrompt(config: GenerateArticleConfig): string {
    const tone = config.tone || 'professional';
    const style = config.style || 'informative';

    return `You are an expert content writer. Write in a ${tone} tone with a ${style} style. Create engaging, well-structured content that is informative and valuable to readers. Use proper markdown formatting with headings, lists, and emphasis where appropriate.`;
  }

  /**
   * Get max tokens based on desired length
   */
  private getMaxTokens(length?: string): number {
    const lengthMap: Record<string, number> = {
      long: 4000, // ~1500 words
      medium: 2000, // ~800 words
      short: 800, // ~300 words
    };

    return lengthMap[length || 'medium'];
  }

  /**
   * Generate SEO metadata using Replicate GPT-5.2
   */
  private async generateSEOMetadata(
    title: string,
    content: string,
    keywords: string[],
  ): Promise<unknown> {
    const prompt = `Generate SEO metadata for this article:

Title: ${title}

Content preview: ${content.substring(0, 500)}...

Keywords: ${keywords.join(', ')}

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "meta_description": "string (155 characters max)",
  "meta_keywords": "string (comma-separated)",
  "og_title": "string",
  "og_description": "string",
  "suggested_slug": "string"
}`;

    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      {
        max_completion_tokens: 512,
        prompt,
      },
    );

    return JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      {},
    );
  }

  /**
   * Extract title from content (looks for first # heading)
   */
  private extractTitle(content: string): string | null {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  /**
   * Generate title from config if not found in content
   */
  private generateTitle(config: GenerateArticleConfig): string {
    // Capitalize first letter of each word
    return config.topic
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    return content
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Validate configuration before execution
   */
  validateConfig(config: GenerateArticleConfig): {
    valid: boolean;
    error?: string;
  } {
    if (!config.topic || config.topic.trim().length === 0) {
      return { error: 'Topic is required', valid: false };
    }

    if (config.topic.length > 500) {
      return { error: 'Topic is too long (max 500 characters)', valid: false };
    }

    const validModels = [
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-3.5-turbo',
      'claude-3-opus',
    ];
    if (!validModels.includes(config.model)) {
      return {
        error: `Invalid model. Must be one of: ${validModels.join(', ')}`,
        valid: false,
      };
    }

    const validLengths = ['short', 'medium', 'long'];
    if (config.length && !validLengths.includes(config.length)) {
      return {
        error: `Invalid length. Must be one of: ${validLengths.join(', ')}`,
        valid: false,
      };
    }

    const validTones = [
      'professional',
      'casual',
      'inspirational',
      'technical',
      'friendly',
    ];
    if (config.tone && !validTones.includes(config.tone)) {
      return {
        error: `Invalid tone. Must be one of: ${validTones.join(', ')}`,
        valid: false,
      };
    }

    if (config.keywords && config.keywords.length > 20) {
      return { error: 'Maximum 20 keywords allowed', valid: false };
    }

    return { valid: true };
  }

  /**
   * Estimate generation time based on config
   */
  estimateGenerationTime(config: GenerateArticleConfig): number {
    // Base time in seconds
    let estimatedTime = 20;

    // Add time based on length
    const lengthMultiplier: Record<string, number> = {
      long: 3,
      medium: 2,
      short: 1,
    };
    estimatedTime *= lengthMultiplier[config.length || 'medium'];

    // SEO generation adds extra time
    if (config.seoOptimized) {
      estimatedTime += 10;
    }

    return estimatedTime;
  }
}
