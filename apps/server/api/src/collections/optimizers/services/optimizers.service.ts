import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { AnalyzeContentDto } from '@api/collections/optimizers/dto/analyze.dto';
import {
  type GeneratedPromptConfig,
  GeneratePromptsDto,
} from '@api/collections/optimizers/dto/generate-prompts.dto';
import { SuggestHashtagsDto } from '@api/collections/optimizers/dto/hashtags.dto';
import { OptimizeContentDto } from '@api/collections/optimizers/dto/optimize.dto';
import { GenerateVariantsDto } from '@api/collections/optimizers/dto/variants.dto';
import {
  ContentScore,
  type ContentScoreDocument,
  type IOptimizationSuggestion,
  type IScoreBreakdown,
} from '@api/collections/optimizers/schemas/content-score.schema';
import {
  type IContentChange,
  Optimization,
  type OptimizationDocument,
} from '@api/collections/optimizers/schemas/optimization.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

type HashtagSuggestionResult = {
  optimal?: string[];
  score?: number;
  suggested?: string[];
  trending?: string[];
};

type GeneratedVariant = {
  content: string;
  description: string;
  type: string;
};

type GenerateVariantsResult = {
  variants?: GeneratedVariant[];
};

type PromptGenerationResult = {
  prompts?: Array<Omit<GeneratedPromptConfig, 'id'>>;
};

type PostingTimeRecommendation = {
  confidence: number;
  day: string;
  reason: string;
  time: string;
};

type PostingTimesResult = {
  recommendedTimes?: PostingTimeRecommendation[];
};

type AIAnalysisResult = {
  breakdown?: IScoreBreakdown;
  overallScore?: number;
  suggestions?: IOptimizationSuggestion[];
};

type AIOptimizationResult = {
  changes?: IContentChange[];
  improvementScore?: number;
  optimized?: string;
};

@Injectable()
export class OptimizersService {
  constructor(
    @InjectModel(ContentScore.name, DB_CONNECTIONS.CLOUD)
    private contentScoreModel: Model<ContentScoreDocument>,
    @InjectModel(Optimization.name, DB_CONNECTIONS.CLOUD)
    private optimizationModel: Model<OptimizationDocument>,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  /**
   * Analyze content and return score + suggestions
   */
  @HandleErrors('analyze content', 'optimizers')
  async analyzeContent(
    dto: AnalyzeContentDto,
    organizationId: string,
    userId?: string,
    onBilling?: (amount: number) => void,
  ): Promise<ContentScore> {
    this.logger.debug('Analyzing content', {
      contentType: dto.contentType,
      organizationId,
      platform: dto.platform,
    });

    // Analyze with OpenAI
    const analysis = await this.performAIAnalysis(
      dto.content,
      dto.contentType,
      dto.platform,
      dto.goals,
      onBilling,
    );

    // Get metadata
    const metadata = this.extractMetadata(dto.content);

    // Create and save score
    const score = new this.contentScoreModel({
      breakdown: analysis.breakdown,
      content: dto.content,
      contentType: dto.contentType,
      goals: dto.goals || [],
      metadata,
      organization: organizationId,
      overallScore: analysis.overallScore,
      platform: dto.platform,
      suggestions: analysis.suggestions,
      user: userId,
    });

    await score.save();

    this.logger.debug('Content analyzed successfully', {
      overallScore: analysis.overallScore,
      scoreId: score._id,
    });

    return score.toObject();
  }

  /**
   * Optimize content based on analysis
   */
  async optimizeContent(
    dto: OptimizeContentDto,
    organizationId: string,
    userId?: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    original: string;
    optimized: string;
    changes: IContentChange[];
    improvementScore: number;
  }> {
    try {
      this.logger.debug('Optimizing content', {
        contentType: dto.contentType,
        organizationId,
        platform: dto.platform,
      });

      // Get optimized version from AI
      const result = await this.performAIOptimization(
        dto.content,
        dto.contentType,
        dto.platform,
        dto.goals,
        onBilling,
      );

      // Save optimization record
      const optimization = new this.optimizationModel({
        changes: result.changes,
        contentType: dto.contentType,
        goals: dto.goals || [],
        improvementScore: result.improvementScore,
        optimizedContent: result.optimized,
        organization: organizationId,
        originalContent: dto.content,
        platform: dto.platform,
        score: dto.scoreId,
        user: userId,
      });

      await optimization.save();

      this.logger.debug('Content optimized successfully', {
        improvementScore: result.improvementScore,
        optimizationId: optimization._id,
      });

      return {
        changes: result.changes,
        improvementScore: result.improvementScore,
        optimized: result.optimized,
        original: dto.content,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to optimize content', { error });
      throw error;
    }
  }

  /**
   * Suggest hashtags for content
   */
  async suggestHashtags(
    dto: SuggestHashtagsDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    suggested: string[];
    trending: string[];
    optimal: string[];
    score: number;
  }> {
    try {
      this.logger.debug('Suggesting hashtags', {
        organizationId,
        platform: dto.platform,
        strategy: dto.strategy,
      });

      const count = dto.count || 10;
      const strategy = dto.strategy || 'balanced';

      // Get hashtag suggestions from AI
      const prompt = this.buildHashtagPrompt(
        dto.content,
        dto.platform,
        dto.niche,
        count,
        strategy,
      );

      const input = {
        max_completion_tokens: 1024,
        prompt,
      };
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<HashtagSuggestionResult>(
        response,
        {},
      );

      this.logger.debug('Hashtags suggested successfully', {
        count: result.suggested?.length,
      });

      return {
        optimal: result.optimal || [],
        score: result.score || 0,
        suggested: result.suggested || [],
        trending: result.trending || [],
      };
    } catch (error: unknown) {
      this.logger.error('Failed to suggest hashtags', { error });
      throw error;
    }
  }

  /**
   * Generate A/B test variants
   */
  async generateVariants(
    dto: GenerateVariantsDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    original: string;
    variants: Array<{
      content: string;
      type: string;
      description: string;
    }>;
  }> {
    try {
      this.logger.debug('Generating variants', {
        contentType: dto.contentType,
        count: dto.count,
        organizationId,
        variationType: dto.variationType,
      });

      const count = dto.count || 3;
      const variationType = dto.variationType || 'tone';

      // Generate variants with AI
      const prompt = this.buildVariantsPrompt(
        dto.content,
        dto.contentType,
        dto.platform,
        variationType,
        count,
      );

      const input = {
        max_completion_tokens: 2048,
        prompt,
      };
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<GenerateVariantsResult>(
        response,
        {},
      );

      this.logger.debug('Variants generated successfully', {
        count: result.variants?.length,
      });

      return {
        original: dto.content,
        variants: result.variants || [],
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate variants', { error });
      throw error;
    }
  }

  /**
   * Generate creative prompts from idea or variations
   */
  async generatePrompts(
    dto: GeneratePromptsDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<GeneratedPromptConfig[]> {
    try {
      this.logger.debug('Generating prompts', {
        count: dto.count,
        mode: dto.mode,
        organizationId,
        targetMedia: dto.targetMedia,
      });

      const prompt = this.buildPromptGeneratorPrompt(dto);

      const input = {
        max_completion_tokens: 2048,
        prompt,
      };
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<PromptGenerationResult>(
        response,
        {},
      );

      // Add unique IDs to each prompt
      const prompts: GeneratedPromptConfig[] = (result.prompts || []).map(
        (p: Omit<GeneratedPromptConfig, 'id'>, index: number) => ({
          camera: p.camera || 'medium shot',
          cameraMovement:
            dto.targetMedia === 'video' ? p.cameraMovement : undefined,
          format: p.format || 'portrait',
          id: `prompt-${Date.now()}-${index}`,
          lighting: p.lighting || 'natural',
          mood: p.mood || 'dramatic',
          style: p.style || 'cinematic',
          text: p.text || '',
        }),
      );

      this.logger.debug('Prompts generated successfully', {
        count: prompts.length,
      });

      return prompts;
    } catch (error: unknown) {
      this.logger.error('Failed to generate prompts', { error });
      throw error;
    }
  }

  /**
   * Get best posting times for platform
   */
  async getBestPostingTimes(
    platform: string,
    timezone: string = 'UTC',
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    recommendedTimes: Array<{
      day: string;
      time: string;
      confidence: number;
      reason: string;
    }>;
    timezone: string;
  }> {
    try {
      this.logger.debug('Getting best posting times', {
        organizationId,
        platform,
        timezone,
      });

      // Get AI recommendations for posting times
      const prompt = `Based on ${platform} best practices and audience engagement patterns, provide the best posting times in ${timezone} timezone.

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "recommendedTimes": [
    { "day": "Monday", "time": "09:00 AM", "confidence": 85, "reason": "Peak morning engagement" }
  ]
}`;

      const input = {
        max_completion_tokens: 1024,
        prompt,
      };
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<PostingTimesResult>(
        response,
        {},
      );

      return {
        recommendedTimes: result.recommendedTimes || [],
        timezone,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get posting times', { error });
      throw error;
    }
  }

  /**
   * Get optimization history
   */
  async getOptimizationHistory(
    organizationId: string,
    userId?: string,
    limit: number = 20,
  ): Promise<Optimization[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (userId) {
      query.user = userId;
    }

    return await this.optimizationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Private: Perform AI analysis
   */
  private async performAIAnalysis(
    content: string,
    contentType: string,
    platform?: string,
    goals?: string[],
    onBilling?: (amount: number) => void,
  ): Promise<{
    overallScore: number;
    breakdown: IScoreBreakdown;
    suggestions: IOptimizationSuggestion[];
  }> {
    const prompt = this.buildAnalysisPrompt(
      content,
      contentType,
      platform,
      goals,
    );

    const input = {
      max_completion_tokens: 2048,
      prompt,
    };
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<AIAnalysisResult>(
      response,
      {},
    );

    return {
      breakdown: result.breakdown || {
        clarity: 0,
        engagement: 0,
        platformOptimization: 0,
        readability: 0,
        viralPotential: 0,
      },
      overallScore: result.overallScore || 0,
      suggestions: result.suggestions || [],
    };
  }

  /**
   * Private: Perform AI optimization
   */
  private async performAIOptimization(
    content: string,
    contentType: string,
    platform?: string,
    goals?: string[],
    onBilling?: (amount: number) => void,
  ): Promise<{
    optimized: string;
    changes: IContentChange[];
    improvementScore: number;
  }> {
    const prompt = this.buildOptimizationPrompt(
      content,
      contentType,
      platform,
      goals,
    );

    const input = {
      max_completion_tokens: 2048,
      prompt,
    };
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<AIOptimizationResult>(
      response,
      {},
    );

    return {
      changes: result.changes || [],
      improvementScore: result.improvementScore || 0,
      optimized: result.optimized || content,
    };
  }

  /**
   * Private: Build analysis prompt
   */
  private buildAnalysisPrompt(
    content: string,
    contentType: string,
    platform?: string,
    goals?: string[],
  ): string {
    const platformText = platform ? ` for ${platform}` : '';
    const goalsText = goals?.length ? ` focusing on: ${goals.join(', ')}` : '';

    return `Analyze this ${contentType} content${platformText}${goalsText}.

Content: "${content}"

Provide a detailed analysis in JSON format:
{
  "overallScore": 75,
  "breakdown": {
    "engagement": 80,
    "clarity": 70,
    "viralPotential": 65,
    "platformOptimization": 75,
    "readability": 85
  },
  "suggestions": [
    {
      "type": "improvement",
      "category": "engagement",
      "message": "Add a strong call-to-action at the end",
      "suggestedText": "What do you think? Comment below!",
      "priority": "high"
    }
  ]
}

Score each aspect 0-100. Provide actionable suggestions with priority.`;
  }

  /**
   * Private: Build optimization prompt
   */
  private buildOptimizationPrompt(
    content: string,
    contentType: string,
    platform?: string,
    goals?: string[],
  ): string {
    const platformText = platform ? ` for ${platform}` : '';
    const goalsText = goals?.length ? ` to achieve: ${goals.join(', ')}` : '';

    return `Optimize this ${contentType} content${platformText}${goalsText}.

Original: "${content}"

Return JSON:
{
  "optimized": "Improved version here",
  "changes": [
    {
      "field": "call-to-action",
      "original": "Thanks for reading",
      "optimized": "What's your take? Drop a comment!",
      "reason": "More engaging CTA"
    }
  ],
  "improvementScore": 25
}

Make it more engaging, clear, and optimized for the platform.`;
  }

  /**
   * Private: Build hashtag prompt
   */
  private buildHashtagPrompt(
    content: string,
    platform: string,
    niche?: string,
    count: number = 10,
    strategy: string = 'balanced',
  ): string {
    const nicheText = niche ? ` in the ${niche} niche` : '';

    return `Suggest ${count} hashtags for ${platform}${nicheText} using a ${strategy} strategy.

Content: "${content}"

Return JSON:
{
  "suggested": ["#hashtag1", "#hashtag2"],
  "trending": ["#trending1"],
  "optimal": ["#best1", "#best2"],
  "score": 85
}

Strategy:
- trending: Focus on viral/trending hashtags
- relevant: Focus on niche-specific relevant hashtags
- balanced: Mix of both

Provide the best combination for maximum reach and engagement.`;
  }

  /**
   * Private: Build variants prompt
   */
  private buildVariantsPrompt(
    content: string,
    contentType: string,
    platform?: string,
    variationType: string = 'tone',
    count: number = 3,
  ): string {
    const platformText = platform ? ` for ${platform}` : '';

    return `Generate ${count} A/B test variants of this ${contentType}${platformText}.

Original: "${content}"

Variation type: ${variationType}
- tone: Different tones (professional, casual, energetic)
- length: Different lengths (short, medium, long)
- cta: Different calls-to-action
- style: Different writing styles

Return JSON:
{
  "variants": [
    {
      "content": "Variant text here",
      "type": "Professional Tone",
      "description": "More formal and authoritative"
    }
  ]
}`;
  }

  /**
   * Private: Build prompt generator prompt
   */
  private buildPromptGeneratorPrompt(dto: GeneratePromptsDto): string {
    const mediaType = dto.targetMedia === 'image' ? 'AI image' : 'AI video';
    const styleHintText = dto.styleHint
      ? ` Style preference: ${dto.styleHint}.`
      : '';

    if (dto.mode === 'idea') {
      return `You are an expert AI prompt engineer. Generate ${dto.count} unique, creative ${mediaType} generation prompts based on this concept: "${dto.input}"${styleHintText}

REQUIREMENTS:
- Each prompt must be detailed (80-200 words) with rich visual descriptions
- Vary the style, mood, perspective, and composition across prompts
- Include specific details about lighting, colors, textures, and atmosphere
- Make each prompt distinct and imaginative

For each prompt, provide complete configuration:
- text: The detailed prompt text
- format: "portrait", "landscape", or "square" (vary these)
- style: artistic style (e.g., "cinematic", "photorealistic", "anime", "oil painting", "watercolor", "digital art", "vintage film")
- mood: emotional tone (e.g., "dramatic", "serene", "energetic", "mysterious", "romantic", "melancholic", "triumphant")
- camera: camera angle (e.g., "close-up", "wide shot", "bird's eye view", "low angle", "dutch angle", "over-the-shoulder")
${dto.targetMedia === 'video' ? '- cameraMovement: camera motion (e.g., "slow pan right", "tracking shot", "static", "dolly zoom", "crane up", "orbit around subject")' : ''}
- lighting: lighting description (e.g., "golden hour", "dramatic rim lighting", "soft diffused", "neon glow", "chiaroscuro", "backlit silhouette")

Return JSON format:
{
  "prompts": [
    {
      "text": "...",
      "format": "portrait",
      "style": "...",
      "mood": "...",
      "camera": "...",
      ${dto.targetMedia === 'video' ? '"cameraMovement": "...",' : ''}
      "lighting": "..."
    }
  ]
}`;
    } else {
      return `You are an expert AI prompt engineer. Generate ${dto.count} creative variations of this ${mediaType} prompt: "${dto.input}"${styleHintText}

REQUIREMENTS:
- Keep the core concept but significantly vary the execution
- Each variation should feel fresh and distinct
- Modify style, mood, camera angle, lighting, or perspective
- Maintain or improve upon the original's quality and detail level

For each variation, provide complete configuration with the same fields as the original but reimagined.

Return JSON format:
{
  "prompts": [
    {
      "text": "...",
      "format": "portrait" | "landscape" | "square",
      "style": "...",
      "mood": "...",
      "camera": "...",
      ${dto.targetMedia === 'video' ? '"cameraMovement": "...",' : ''}
      "lighting": "..."
    }
  ]
}`;
    }
  }

  /**
   * Private: Extract metadata from content
   */
  private extractMetadata(content: string): Record<string, unknown> {
    const words = content.trim().split(/\s+/);
    const hashtags = content.match(/#\w+/g) || [];
    const emojis =
      content.match(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      ) || [];

    const ctaKeywords = [
      'click',
      'shop',
      'buy',
      'sign up',
      'learn more',
      'comment',
      'share',
    ];
    const hasCallToAction = ctaKeywords.some((keyword) =>
      content.toLowerCase().includes(keyword),
    );

    return {
      characterCount: content.length,
      emojiCount: emojis.length,
      hasCallToAction,
      hashtagCount: hashtags.length,
      wordCount: words.length,
    };
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }
}
