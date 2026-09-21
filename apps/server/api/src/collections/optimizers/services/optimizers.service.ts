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
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CONTENT_ANALYSIS_SCHEMA_NAME,
  CONTENT_OPTIMIZATION_SCHEMA_NAME,
  CONTENT_VARIANTS_SCHEMA_NAME,
  type ContentAnalysis,
  contentAnalysisSchema,
  type ContentOptimization,
  contentOptimizationSchema,
  contentVariantsSchema,
  GENERATED_PROMPTS_SCHEMA_NAME,
  generatedPromptsSchema,
  HASHTAG_SUGGESTIONS_SCHEMA_NAME,
  hashtagSuggestionsSchema,
  POSTING_TIME_RECOMMENDATIONS_SCHEMA_NAME,
  postingTimeRecommendationsSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class OptimizersService {
  constructor(
    private readonly prisma: PrismaService,
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
  ): Promise<Record<string, unknown>> {
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
    const score = await this.prisma.contentScore.create({
      data: {
        organizationId,
        data: {
          breakdown: analysis.breakdown,
          content: dto.content,
          contentType: dto.contentType,
          goals: dto.goals || [],
          metadata,
          overallScore: analysis.overallScore,
          platform: dto.platform,
          suggestions: analysis.suggestions,
          userId,
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.debug('Content analyzed successfully', {
      overallScore: analysis.overallScore,
      scoreId: score.id,
    });

    return score as unknown as Record<string, unknown>;
  }

  /**
   * Optimize content based on analysis
   */
  async optimizeContent(
    dto: OptimizeContentDto,
    organizationId: string,
    userId?: string,
    onBilling?: (amount: number) => void,
  ): Promise<ContentOptimization & { original: string }> {
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

      let optimizationId: string | undefined;
      if (userId) {
        const optimization = await this.prisma.optimization.create({
          data: {
            data: {
              changes: result.changes,
              contentType: dto.contentType,
              goals: dto.goals || [],
              improvementScore: result.improvementScore,
              optimizedContent: result.optimized,
              originalContent: dto.content,
              platform: dto.platform,
            } as Prisma.InputJsonValue,
            organizationId,
            scoreId: dto.scoreId,
            userId,
          },
        });
        optimizationId = optimization.id;
      }

      this.logger.debug('Content optimized successfully', {
        improvementScore: result.improvementScore,
        optimizationId,
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

      const result = await this.completeStructured(
        prompt,
        1024,
        hashtagSuggestionsSchema,
        HASHTAG_SUGGESTIONS_SCHEMA_NAME,
        onBilling,
      );

      this.logger.debug('Hashtags suggested successfully', {
        count: result.suggested.length,
      });

      return result;
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

      const result = await this.completeStructured(
        prompt,
        2048,
        contentVariantsSchema,
        CONTENT_VARIANTS_SCHEMA_NAME,
        onBilling,
      );

      this.logger.debug('Variants generated successfully', {
        count: result.variants.length,
      });

      return {
        original: dto.content,
        variants: result.variants,
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

      const result = await this.completeStructured(
        prompt,
        2048,
        generatedPromptsSchema,
        GENERATED_PROMPTS_SCHEMA_NAME,
        onBilling,
      );

      // Ids are ours to mint — the model never sees them.
      const prompts: GeneratedPromptConfig[] = result.prompts.map(
        (generated, index) => ({
          camera: generated.camera,
          cameraMovement:
            dto.targetMedia === 'video'
              ? (generated.cameraMovement ?? undefined)
              : undefined,
          format: generated.format,
          id: `prompt-${Date.now()}-${index}`,
          lighting: generated.lighting,
          mood: generated.mood,
          style: generated.style,
          text: generated.text,
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

Give each slot a day, a time like "09:00 AM", a 0-100 confidence and the reason it works.`;

      const result = await this.completeStructured(
        prompt,
        1024,
        postingTimeRecommendationsSchema,
        POSTING_TIME_RECOMMENDATIONS_SCHEMA_NAME,
        onBilling,
      );

      return {
        recommendedTimes: result.recommendedTimes,
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
  ): Promise<Record<string, unknown>[]> {
    return (await this.prisma.optimization.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      where: scopedWhere(organizationId, { ...(userId ? { userId } : {}) }),
    })) as unknown as Record<string, unknown>[];
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
  ): Promise<ContentAnalysis> {
    const prompt = this.buildAnalysisPrompt(
      content,
      contentType,
      platform,
      goals,
    );

    return this.completeStructured(
      prompt,
      2048,
      contentAnalysisSchema,
      CONTENT_ANALYSIS_SCHEMA_NAME,
      onBilling,
    );
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
  ): Promise<ContentOptimization> {
    const prompt = this.buildOptimizationPrompt(
      content,
      contentType,
      platform,
      goals,
    );

    return this.completeStructured(
      prompt,
      2048,
      contentOptimizationSchema,
      CONTENT_OPTIMIZATION_SCHEMA_NAME,
      onBilling,
    );
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

Score each aspect 0-100. Provide actionable suggestions with a category,
a type, a priority, and — where you are rewriting a line — the original and
suggested text.`;
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

Make it more engaging, clear, and optimized for the platform. List each
change you made with the field it touches, the original and optimized text,
and why, and score the overall improvement.`;
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

Return the suggested tags, the ones currently trending, the optimal subset to
post, and a 0-100 score for how well they fit.

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

Give each variant its text, a short type label like "Professional Tone", and
a one-line description of what makes it different.`;
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
- lighting: lighting description (e.g., "golden hour", "dramatic rim lighting", "soft diffused", "neon glow", "chiaroscuro", "backlit silhouette")`;
    } else {
      return `You are an expert AI prompt engineer. Generate ${dto.count} creative variations of this ${mediaType} prompt: "${dto.input}"${styleHintText}

REQUIREMENTS:
- Keep the core concept but significantly vary the execution
- Each variation should feel fresh and distinct
- Modify style, mood, camera angle, lighting, or perspective
- Maintain or improve upon the original's quality and detail level

For each variation, provide complete configuration with the same fields as the original but reimagined:
text, format (portrait, landscape or square), style, mood, camera${dto.targetMedia === 'video' ? ', cameraMovement' : ''} and lighting.`;
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

  /**
   * One schema-validated text completion on the default Replicate text model.
   *
   * Replicate cannot enforce a JSON Schema, so the adapter carries it in the
   * prompt and validates the answer, repairing once before raising the typed
   * error. Every attempt is billed through `onBilling`, repair included —
   * a retry is a second prediction we paid for.
   */
  private async completeStructured<TResult>(
    prompt: string,
    maxCompletionTokens: number,
    schema: ZodType<TResult>,
    schemaName: string,
    onBilling?: (amount: number) => void,
  ): Promise<TResult> {
    return this.replicateService.generateStructuredTextSync(
      DEFAULT_TEXT_MODEL,
      {
        input: { max_completion_tokens: maxCompletionTokens },
        onAttempt: async (attemptInput, output) => {
          onBilling?.(
            await this.calculateDefaultTextCharge(attemptInput, output),
          );
        },
        prompt,
        schema,
        schemaName,
      },
    );
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
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
