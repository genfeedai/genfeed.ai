import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

// ─── Interfaces ──────────────────────────────────────────────────────

export type QualityStatus = 'unrated' | 'good' | 'needs_review';

export interface ContentQualityResult {
  score: number; // 1-10
  category: 'excellent' | 'good' | 'needs_work' | 'poor';
  feedback: string[];
  suggestions: string[];
  contentType: string;
}

export interface QualityScoreResult {
  score: number;
  feedback: string[];
  status: QualityStatus;
}

interface ScoringLlmResponse {
  score: number;
  feedback: string[];
  suggestions: string[];
}

// ─── Constants ───────────────────────────────────────────────────────

const IMAGE_SCORING_PROMPT = `You are a professional social media content quality analyst.
Rate this image content quality 1-10 for social media use.
Return ONLY valid JSON with no markdown: { "score": <number>, "feedback": ["..."], "suggestions": ["..."] }

Criteria:
- Composition & framing (rule of thirds, balance, focal point)
- Visual clarity & resolution
- Visual appeal & aesthetics
- Brand-readiness (professional look, no artifacts)
- Hook strength (would this stop someone from scrolling?)
- Color harmony & contrast`;

const VIDEO_SCORING_PROMPT = `You are a professional social media content quality analyst.
Rate this video content quality 1-10 for social media use.
Return ONLY valid JSON with no markdown: { "score": <number>, "feedback": ["..."], "suggestions": ["..."] }

Criteria:
- Visual quality & resolution
- Composition & framing
- Hook strength in first 3 seconds
- Pacing & engagement retention
- Brand-readiness (professional production quality)
- Audio quality (if applicable)`;

const TEXT_SCORING_PROMPT = `You are a professional social media content quality analyst.
Rate this social media post 1-10.
Return ONLY valid JSON with no markdown: { "score": <number>, "feedback": ["..."], "suggestions": ["..."] }

Criteria:
- Hook strength (first line grabs attention)
- Clarity & conciseness
- CTA presence (clear call to action)
- Engagement potential (would people comment/share?)
- Readability (sentence flow, formatting)
- Emotional resonance`;

// ─── Service ─────────────────────────────────────────────────────────

@Injectable()
export class ContentQualityScorerService {
  private readonly constructorName = String(this.constructor.name);
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly openRouterService: OpenRouterService,
    @Optional()
    private readonly ingredientsService: IngredientsService,
    @Optional()
    private readonly postsService: PostsService,
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || 'x-ai/grok-4-fast';
  }

  /**
   * Score content quality by ID and type.
   */
  async scoreContent(
    contentId: string,
    contentType: string,
    context?: string,
    organizationId?: string,
  ): Promise<ContentQualityResult> {
    this.logger.log(
      `${this.constructorName} scoring ${contentType} content: ${contentId}`,
    );

    switch (contentType) {
      case 'image':
        return this.scoreImageContent(contentId, context, organizationId);
      case 'video':
        return this.scoreVideoContent(contentId, context, organizationId);
      case 'post':
        return this.scorePostContent(contentId, context, organizationId);
      default:
        return this.scoreGenericContent(
          contentId,
          contentType,
          context,
          organizationId,
        );
    }
  }

  /**
   * Score content and persist quality fields on the ingredient.
   * Designed for fire-and-forget usage — callers should NOT await in the generation path.
   */
  async scoreAndTag(
    ingredientId: string,
    contentType: 'image' | 'video' | 'audio',
    context?: Record<string, unknown>,
  ): Promise<QualityScoreResult> {
    this.logger.log(
      `${this.constructorName} scoreAndTag for ingredient=${ingredientId} type=${contentType}`,
    );

    const organizationId =
      typeof context?.organizationId === 'string'
        ? context.organizationId
        : undefined;
    const result = await this.scoreContent(
      ingredientId,
      contentType,
      undefined,
      organizationId,
    );
    const status = ContentQualityScorerService.resolveStatus(result.score);

    // Persist quality fields on the ingredient
    if (this.ingredientsService) {
      await this.ingredientsService.patch(ingredientId, {
        qualityFeedback: result.feedback,
        qualityScore: result.score,
        qualityStatus: status,
      });
    }

    this.logger.log(
      `${this.constructorName} scored ingredient=${ingredientId}: score=${result.score} status=${status}`,
    );

    return {
      feedback: result.feedback,
      score: result.score,
      status,
    };
  }

  /**
   * Determine quality status from a numeric score.
   */
  static resolveStatus(score: number): QualityStatus {
    if (score >= 6) {
      return 'good';
    }
    return 'needs_review';
  }

  /**
   * Score image ingredient by analyzing its visual content.
   */
  private async scoreImageContent(
    contentId: string,
    context?: string,
    organizationId?: string,
  ): Promise<ContentQualityResult> {
    const imageUrl = await this.resolveIngredientUrl(contentId, organizationId);

    if (!imageUrl) {
      return this.buildErrorResult('image', 'Could not resolve image URL');
    }

    const prompt = context
      ? `${IMAGE_SCORING_PROMPT}\n\nAdditional context: ${context}`
      : IMAGE_SCORING_PROMPT;

    const llmResult = await this.callVisionModel(imageUrl, prompt);

    return this.buildResult(llmResult, 'image');
  }

  /**
   * Score video ingredient by analyzing thumbnail or metadata.
   */
  private async scoreVideoContent(
    contentId: string,
    context?: string,
    organizationId?: string,
  ): Promise<ContentQualityResult> {
    const videoUrl = await this.resolveIngredientUrl(contentId, organizationId);

    if (!videoUrl) {
      return this.buildErrorResult('video', 'Could not resolve video URL');
    }

    // For video, we analyze the thumbnail/preview frame via vision
    // and supplement with metadata analysis
    const prompt = context
      ? `${VIDEO_SCORING_PROMPT}\n\nAdditional context: ${context}`
      : VIDEO_SCORING_PROMPT;

    const llmResult = await this.callVisionModel(videoUrl, prompt);

    return this.buildResult(llmResult, 'video');
  }

  /**
   * Score text-based post content.
   */
  private async scorePostContent(
    contentId: string,
    context?: string,
    organizationId?: string,
  ): Promise<ContentQualityResult> {
    const postText = await this.resolvePostText(contentId, organizationId);

    if (!postText) {
      return this.buildErrorResult('post', 'Could not resolve post content');
    }

    const prompt = context
      ? `${TEXT_SCORING_PROMPT}\n\nAdditional context: ${context}`
      : TEXT_SCORING_PROMPT;

    const llmResult = await this.callTextModel(
      `${prompt}\n\nPost content:\n${postText}`,
    );

    return this.buildResult(llmResult, 'post');
  }

  /**
   * Score generic content type by treating it as text.
   */
  private async scoreGenericContent(
    contentId: string,
    contentType: string,
    context?: string,
    organizationId?: string,
  ): Promise<ContentQualityResult> {
    // Try to resolve as ingredient first, then as post
    const ingredientUrl = await this.resolveIngredientUrl(
      contentId,
      organizationId,
    );

    if (ingredientUrl) {
      const prompt = context
        ? `${IMAGE_SCORING_PROMPT}\n\nAdditional context: ${context}`
        : IMAGE_SCORING_PROMPT;
      const llmResult = await this.callVisionModel(ingredientUrl, prompt);
      return this.buildResult(llmResult, contentType);
    }

    const postText = await this.resolvePostText(contentId, organizationId);

    if (postText) {
      const prompt = context
        ? `${TEXT_SCORING_PROMPT}\n\nAdditional context: ${context}`
        : TEXT_SCORING_PROMPT;
      const llmResult = await this.callTextModel(
        `${prompt}\n\nContent:\n${postText}`,
      );
      return this.buildResult(llmResult, contentType);
    }

    return this.buildErrorResult(contentType, 'Could not resolve content');
  }

  // ─── LLM Calls ──────────────────────────────────────────────────────

  /**
   * Call vision-capable model with an image URL.
   */
  private async callVisionModel(
    imageUrl: string,
    prompt: string,
  ): Promise<ScoringLlmResponse> {
    try {
      const params: OpenRouterChatCompletionParams = {
        max_tokens: 1024,
        messages: [
          {
            content: prompt,
            role: 'system',
          },
          {
            content: `Analyze this content: ${imageUrl}`,
            role: 'user',
          },
        ],
        model: 'openai/gpt-4o-mini',
        temperature: 0.3,
      };

      const response: OpenRouterChatCompletionResponse =
        await this.openRouterService.chatCompletion(params);

      return this.parseLlmResponse(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `${this.constructorName} vision model call failed: ${errorMessage}`,
      );
      return { feedback: ['Analysis failed'], score: 5, suggestions: [] };
    }
  }

  /**
   * Call text model for post/article scoring.
   */
  private async callTextModel(prompt: string): Promise<ScoringLlmResponse> {
    try {
      const params: OpenRouterChatCompletionParams = {
        max_tokens: 1024,
        messages: [
          {
            content: prompt,
            role: 'user',
          },
        ],
        model: this.defaultModel,
        temperature: 0.3,
      };

      const response: OpenRouterChatCompletionResponse =
        await this.openRouterService.chatCompletion(params);

      return this.parseLlmResponse(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `${this.constructorName} text model call failed: ${errorMessage}`,
      );
      return { feedback: ['Analysis failed'], score: 5, suggestions: [] };
    }
  }

  // ─── Data Resolution ────────────────────────────────────────────────

  private async resolveIngredientUrl(
    contentId: string,
    organizationId?: string,
  ): Promise<string | undefined> {
    if (!this.ingredientsService) {
      return undefined;
    }

    try {
      const query: Record<string, unknown> = {
        _id: contentId,
        isDeleted: false,
      };
      if (organizationId) {
        query.organization = organizationId;
      }
      const ingredient = await this.ingredientsService.findOne(query);
      return ingredient?.cdnUrl || ingredient?.s3Key || undefined;
    } catch {
      return undefined;
    }
  }

  private async resolvePostText(
    contentId: string,
    organizationId?: string,
  ): Promise<string | undefined> {
    if (!this.postsService) {
      return undefined;
    }

    try {
      const query: Record<string, unknown> = {
        _id: contentId,
        isDeleted: false,
      };
      if (organizationId) {
        query.organization = organizationId;
      }
      const post = await this.postsService.findOne(query);
      return post?.description || post?.label || undefined;
    } catch {
      return undefined;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private parseLlmResponse(
    response: OpenRouterChatCompletionResponse,
  ): ScoringLlmResponse {
    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      return {
        feedback: ['No response from quality analysis'],
        score: 5,
        suggestions: [],
      };
    }

    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return {
          feedback: ['Could not parse quality analysis response'],
          score: 5,
          suggestions: [],
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as ScoringLlmResponse;
      const score = Math.max(1, Math.min(10, Math.round(parsed.score || 5)));

      return {
        feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
        score,
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions
          : [],
      };
    } catch {
      return {
        feedback: ['Could not parse quality analysis response'],
        score: 5,
        suggestions: [],
      };
    }
  }

  /**
   * Map a numeric score to a category label.
   */
  static mapCategory(
    score: number,
  ): 'excellent' | 'good' | 'needs_work' | 'poor' {
    if (score >= 8) {
      return 'excellent';
    }
    if (score >= 6) {
      return 'good';
    }
    if (score >= 4) {
      return 'needs_work';
    }
    return 'poor';
  }

  private buildResult(
    llmResult: ScoringLlmResponse,
    contentType: string,
  ): ContentQualityResult {
    return {
      category: ContentQualityScorerService.mapCategory(llmResult.score),
      contentType,
      feedback: llmResult.feedback,
      score: llmResult.score,
      suggestions: llmResult.suggestions,
    };
  }

  private buildErrorResult(
    contentType: string,
    error: string,
  ): ContentQualityResult {
    return {
      category: 'poor',
      contentType,
      feedback: [error],
      score: 0,
      suggestions: ['Ensure content is accessible and properly uploaded'],
    };
  }
}
