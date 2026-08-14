import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type AiActionResult,
  AiActionsService,
} from '@api/endpoints/ai-actions/ai-actions.service';
import {
  AiActionType,
  type ExecuteAiActionDto,
} from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { BatchGenerationQueueService } from '@api/queues/batch-generation/batch-generation-queue.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  BATCH_POST_PREVIEW_LIMIT,
  takeBatchPostPreviews,
} from '@api/services/agent-orchestrator/tools/batch-post-preview.util';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationStreamService } from '@api/services/batch-generation/batch-generation-stream.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import {
  chargeBatchGenerationCredits,
  estimateBatchGenerationCredits,
} from '@genfeedai/constants';
import {
  ActivitySource,
  ContentFormat,
  formatPlatformLabel,
  RouterPriority,
  Status,
} from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Effect } from 'effect';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

/**
 * `contentMix` as the `generate_content_batch` tool schema advertises it, and
 * as `CreateBatchDto`'s nested `ContentMixDto` consumes it.
 */
interface ContentMixPercents {
  imagePercent: number;
  videoPercent: number;
  carouselPercent: number;
  reelPercent: number;
  storyPercent: number;
}

/**
 * The batch credit estimator keys its mix by {@link ContentFormat} (`image`,
 * `video`, …), not by the DTO's `*Percent` names. The two shapes were bridged
 * by `as never`, so the estimator only ever saw unknown keys and silently fell
 * back to `DEFAULT_BATCH_CONTENT_MIX` — a video-heavy batch was pre-flighted at
 * the default 60/25/10/5 mix and under-quoted.
 */
const CONTENT_MIX_PERCENT_KEYS: Readonly<
  Record<ContentFormat, keyof ContentMixPercents>
> = {
  [ContentFormat.IMAGE]: 'imagePercent',
  [ContentFormat.VIDEO]: 'videoPercent',
  [ContentFormat.CAROUSEL]: 'carouselPercent',
  [ContentFormat.REEL]: 'reelPercent',
  [ContentFormat.STORY]: 'storyPercent',
};

/** Read a tool-call `contentMix` argument; `undefined` when absent or unusable. */
function parseContentMixPercents(
  input: unknown,
): ContentMixPercents | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const raw = input as Record<string, unknown>;
  const readPercent = (key: keyof ContentMixPercents): number => {
    const value = raw[key];

    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  };

  const percents: ContentMixPercents = {
    carouselPercent: readPercent('carouselPercent'),
    imagePercent: readPercent('imagePercent'),
    reelPercent: readPercent('reelPercent'),
    storyPercent: readPercent('storyPercent'),
    videoPercent: readPercent('videoPercent'),
  };

  const total = Object.values(percents).reduce(
    (sum, percent) => sum + percent,
    0,
  );

  return total > 0 ? percents : undefined;
}

/** Re-key a DTO-shaped mix onto {@link ContentFormat} for the credit estimator. */
function toContentFormatMix(
  percents: ContentMixPercents | undefined,
): Partial<Record<ContentFormat, number>> | undefined {
  if (!percents) {
    return undefined;
  }

  const mix: Partial<Record<ContentFormat, number>> = {};

  for (const format of Object.values(ContentFormat)) {
    mix[format] = percents[CONTENT_MIX_PERCENT_KEYS[format]];
  }

  return mix;
}

function splitThreadSegments(content: string): string[] {
  const segments = content
    .split(/\n{2,}/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [content];
}

/**
 * Media / AI generation tools extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentMediaGenerationToolHandler {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly internalApi: AgentToolInternalApiService,
    private readonly aiActionsService: AiActionsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly onboardingHandler: AgentOnboardingToolHandler,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
    @Optional()
    private readonly credentialsService?: CredentialsService & {
      findByHandle?: (
        handle: string,
        organizationId: string,
      ) => Promise<{ brand?: unknown } | null>;
    },
    @Optional()
    private readonly streamPublisher?: AgentStreamPublisherService,
    @Optional()
    private readonly contentQualityScorerService?: ContentQualityScorerService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly batchCreditsService?: BatchGenerationCreditsService,
    @Optional()
    private readonly batchStreamService?: BatchGenerationStreamService,
    @Optional()
    private readonly batchGenerationQueueService?: BatchGenerationQueueService,
    @Optional()
    private readonly harnessGenerationService?: HarnessGenerationService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  private async applyBrandHarnessToPrompt(params: {
    contentType: 'image' | 'video';
    ctx: ToolExecutionContext;
    prompt: string;
    topic?: string;
  }): Promise<string> {
    const harnessGenerationService = this.resolveHarnessGenerationService();
    if (!harnessGenerationService || !params.ctx.brandId) {
      return params.prompt;
    }
    try {
      return await harnessGenerationService.applyToMediaPrompt({
        brandId: params.ctx.brandId,
        contentType: params.contentType,
        organizationId: params.ctx.organizationId,
        prompt: params.prompt,
        topic: params.topic,
      });
    } catch {
      return params.prompt;
    }
  }

  private resolveHarnessGenerationService():
    | HarnessGenerationService
    | undefined {
    if (this.harnessGenerationService) {
      return this.harnessGenerationService;
    }
    try {
      return this.moduleRef?.get(HarnessGenerationService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private resolveBatchPricingOptions(ctx: ToolExecutionContext): {
    includeMedia: boolean;
    qualityTier?: string | null;
  } {
    // Caption-first pipeline: no media assets yet → packaging rates, not full
    // media gen. When items gain mediaUrl, charge uses hasMedia: true instead.
    return {
      includeMedia: false,
      qualityTier: ctx.qualityTier,
    };
  }

  private async chargeBatchCredits(params: {
    amount: number;
    batchId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    if (!this.creditsUtilsService || params.amount <= 0) {
      return;
    }
    // Serializable deduction + reference claim so concurrent batch starts
    // cannot over-commit the same balance (#2696).
    await this.creditsUtilsService.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      params.amount,
      `Batch generation ${params.batchId}`,
      ActivitySource.SCRIPT,
      {
        referenceId: params.batchId,
        referenceType: 'batch-generation:upfront',
      },
    );
  }

  private publishTokenEffect(data: {
    runId?: string;
    threadId: string;
    token: string;
    userId: string;
  }) {
    if (!this.streamPublisher) {
      return Effect.void;
    }
    return this.streamPublisher.publishTokenEffect(data);
  }

  private publishWorkEventEffect(data: Record<string, unknown>) {
    if (!this.streamPublisher) {
      return Effect.void;
    }
    return this.streamPublisher.publishWorkEventEffect(data as never);
  }

  private publishToolProgressEffect(data: {
    message: string;
    progress: number;
    threadId: string;
    toolName: string;
    userId: string;
  }) {
    if (!this.streamPublisher) {
      return Effect.void;
    }
    return this.streamPublisher.publishToolProgressEffect(data);
  }
  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  private readResponseEnvelopeString(
    response: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const data = this.isPlainRecord(response.data) ? response.data : undefined;
    const attributes = this.isPlainRecord(data?.attributes)
      ? data.attributes
      : undefined;
    return readOptionalString(
      attributes?.[key] ?? data?.[key] ?? response[key],
    );
  }

  /**
   * Normalise a `POST /v1/articles/generations` body to a single JSON:API
   * resource. The route answers with a collection for `type: 'standard'` and a
   * single resource for `type: 'x-article'`, so both shapes reach this handler.
   */
  private readArticleResource(
    response: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const payload = response.data ?? response;

    if (Array.isArray(payload)) {
      const first = payload[0];
      return this.isPlainRecord(first) ? first : undefined;
    }

    return this.isPlainRecord(payload) ? payload : undefined;
  }

  private readResponseAssetUrl(
    response: Record<string, unknown>,
    endpoint: string,
    id?: string,
  ): string | undefined {
    const explicitUrl =
      this.readResponseEnvelopeString(response, 'cdnUrl') ??
      this.readResponseEnvelopeString(response, 'ingredientUrl') ??
      this.readResponseEnvelopeString(response, 'url');

    if (explicitUrl) {
      return explicitUrl;
    }

    const s3Key = this.readResponseEnvelopeString(response, 's3Key');
    if (s3Key) {
      const cdnBaseUrl = this.configService.ingredientsEndpoint.replace(
        /\/ingredients\/?$/,
        '',
      );
      return `${cdnBaseUrl}/${s3Key.replace(/^\/+/, '')}`;
    }

    // Do not invent a gallery path from id alone — that is not a renderable
    // media URL and produces blank preview squares in chat.
    void endpoint;
    void id;
    return undefined;
  }
  async aiAction(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const actionMap: Record<string, AiActionType> = {
      'adapt-platform': AiActionType.ADAPT_PLATFORM,
      'add-hashtags': AiActionType.ADD_HASHTAGS,
      'analytics-insight': AiActionType.ANALYTICS_INSIGHT,
      'content-suggest': AiActionType.CONTENT_SUGGEST,
      enhance: AiActionType.ENHANCE_PROMPT,
      'enhance-prompt': AiActionType.ENHANCE_PROMPT,
      expand: AiActionType.EXPAND,
      'explain-metric': AiActionType.EXPLAIN_METRIC,
      'grammar-check': AiActionType.GRAMMAR_CHECK,
      hashtags: AiActionType.ADD_HASHTAGS,
      'hook-generator': AiActionType.HOOK_GENERATOR,
      rewrite: AiActionType.REWRITE,
      'seo-optimize': AiActionType.SEO_OPTIMIZE,
      shorten: AiActionType.SHORTEN,
      'suggest-keywords': AiActionType.SUGGEST_KEYWORDS,
      'tone-adjust': AiActionType.TONE_ADJUST,
      translate: AiActionType.ADAPT_PLATFORM,
    };

    const requestedAction = String(params.action || '')
      .trim()
      .toLowerCase();
    const action = actionMap[requestedAction] ?? AiActionType.ENHANCE_PROMPT;
    const content =
      (params.text as string | undefined) ??
      (params.content as string | undefined) ??
      '';

    const dto: ExecuteAiActionDto = {
      action,
      content,
      context: params.language
        ? { platform: params.language as string }
        : undefined,
    };

    const result: AiActionResult = await this.aiActionsService.execute(
      ctx.organizationId,
      dto,
    );

    return {
      creditsUsed: 1,
      data: { result: result.result, tokensUsed: result.tokensUsed },
      success: true,
    };
  }

  async generateContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const requestedType = String(
      params.type || params.contentType || '',
    ).trim();
    const normalizedType = requestedType.toLowerCase();
    const shouldGenerateArticle =
      normalizedType === 'article' ||
      normalizedType === 'x-article' ||
      params.longForm === true;

    if (normalizedType === 'newsletter') {
      const response = await this.internalApi.callInternalApi(
        'POST',
        '/v1/newsletters/generate-draft',
        {
          angle: readOptionalString(params.angle),
          instructions: readOptionalString(params.instructions),
          topic:
            readOptionalString(params.topic) ??
            readOptionalString(params.prompt) ??
            '',
        },
        ctx,
      );
      const newsletterId = this.readResponseEnvelopeString(response, 'id');
      const content =
        this.readResponseEnvelopeString(response, 'content') ?? '';
      const subject =
        this.readResponseEnvelopeString(response, 'label') ??
        this.readResponseEnvelopeString(response, 'topic') ??
        'Newsletter draft';
      const preheader = this.readResponseEnvelopeString(response, 'summary');

      return {
        creditsUsed: 2,
        data: { content, newsletterId, preheader, subject },
        nextActions: newsletterId
          ? [
              {
                contentFormat: 'newsletter',
                ctas: [
                  {
                    href: `/edit/newsletter/${newsletterId}`,
                    label: 'Open newsletter',
                  },
                ],
                description: 'Newsletter draft ready for review.',
                id: `newsletter-gen-${newsletterId}`,
                platform: 'newsletter',
                preheader,
                subject,
                textContent: content,
                title: subject,
                type: 'content_preview_card',
              },
            ]
          : [],
        success: true,
      };
    }

    if (shouldGenerateArticle) {
      const articleType =
        normalizedType === 'x-article' ? 'x-article' : 'standard';
      const response = await this.internalApi.callInternalApi(
        'POST',
        '/v1/articles/generations',
        {
          count: articleType === 'standard' ? 1 : undefined,
          generateHeaderImage:
            articleType === 'x-article'
              ? Boolean(params.generateHeaderImage ?? true)
              : undefined,
          keywords: Array.isArray(params.keywords)
            ? (params.keywords as string[])
            : undefined,
          ...(ctx.generationModelOverride
            ? { model: ctx.generationModelOverride }
            : {}),
          prompt: (params.topic as string) || (params.prompt as string) || '',
          targetWordCount:
            articleType === 'x-article'
              ? (params.targetWordCount as number | undefined)
              : undefined,
          tone:
            articleType === 'x-article'
              ? (params.tone as string | undefined)
              : undefined,
          type: articleType,
        },
        ctx,
      );

      const resource = this.readArticleResource(response);
      const attributes = this.isPlainRecord(resource?.attributes)
        ? resource.attributes
        : (resource ?? {});
      const articleId =
        readOptionalString(resource?.id) ?? readOptionalString(attributes.id);
      const articleContent = readOptionalString(attributes.content) ?? '';
      const articleTitle = readOptionalString(attributes.label) ?? '';

      return {
        creditsUsed: 2,
        data: {
          articleId,
          content: articleContent,
          summary: (attributes.summary as string) || '',
          title: articleTitle,
          type: articleType,
        },
        nextActions: articleId
          ? [
              {
                contentFormat: 'article',
                ctas: [
                  {
                    href: `/content/articles/${articleId}`,
                    label: 'Open article',
                  },
                ],
                description:
                  articleType === 'x-article'
                    ? 'X Article generated with review cycle.'
                    : 'Article generated with review cycle.',
                id: `article-gen-${articleId}`,
                textContent: articleContent,
                title:
                  articleTitle ||
                  (articleType === 'x-article'
                    ? 'X Article generated'
                    : 'Article generated'),
                type: 'content_preview_card',
              },
            ]
          : [],
        success: true,
      };
    }

    const platform = readOptionalString(params.platform) ?? 'twitter';
    const results = await this.contentGeneratorService.generateContent(
      ctx.organizationId,
      {
        additionalContext: params.additionalContext as string[] | undefined,
        brandId: params.brandId ? (params.brandId as string) : undefined,
        platform,
        topic: params.topic as string,
        variationsCount: 1,
      } as never,
    );

    const generated = results[0];
    const threadSegments =
      normalizedType === 'thread' && generated?.content
        ? splitThreadSegments(generated.content)
        : undefined;

    return {
      creditsUsed: 2,
      data: {
        content: generated?.content ?? '',
        hashtags: generated?.hashtags ?? [],
        hook: generated?.hook,
        patternUsed: generated?.patternUsed,
      },
      nextActions: generated?.content
        ? [
            {
              contentFormat:
                normalizedType === 'thread' ? 'thread' : 'social_post',
              description: `${formatPlatformLabel(platform)} draft ready for review.`,
              id: `content-gen-${Date.now()}`,
              platform,
              textContent: threadSegments?.[0] ?? generated.content,
              title: `${formatPlatformLabel(platform)} ${normalizedType === 'thread' ? 'thread' : 'post'}`,
              tweets: threadSegments,
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  // GENERATION TOOLS — call ingredient creation endpoints
  // Provider-agnostic (Replicate, fal, genfeedai, ElevenLabs, etc.)
  // Credits handled by the endpoint's CreditsInterceptor.

  async generateImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // Call the real POST /v1/images endpoint which handles:
    // - Model selection (auto or default)
    // - Provider routing (Replicate, ComfyUI, etc.)
    // - Credit deduction via CreditsInterceptor
    // - Synchronous polling (3min timeout, 2s interval)

    const rawPrompt =
      (params.prompt as string | undefined) ??
      (params.description as string | undefined) ??
      (params.text as string | undefined) ??
      '';
    const prompt = await this.applyBrandHarnessToPrompt({
      contentType: 'image',
      ctx,
      prompt: rawPrompt,
      topic: rawPrompt.slice(0, 120),
    });
    const aspectRatio = (params.aspectRatio as string) || '1:1';
    const dimensions = this.aspectRatioToDimensions(aspectRatio);
    const promptPreview = rawPrompt.substring(0, 80);

    // Use attachment as reference image when no explicit imageUrl is provided
    const imageUrl =
      (params.imageUrl as string | undefined) ||
      (ctx.attachmentUrls?.length ? ctx.attachmentUrls[0] : undefined);

    const requestedOutputs =
      typeof params.outputs === 'number' && Number.isFinite(params.outputs)
        ? Math.min(8, Math.max(1, Math.round(params.outputs)))
        : undefined;

    const body: Record<string, unknown> = {
      height: dimensions.height,
      prompt,
      text: prompt,
      waitForCompletion: true,
      width: dimensions.width,
      ...(requestedOutputs ? { outputs: requestedOutputs } : {}),
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
      ...(imageUrl ? { references: [imageUrl] } : {}),
    };

    if (ctx.generationModelOverride) {
      body.model = ctx.generationModelOverride;
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || RouterPriority.QUALITY;
    }

    let response: Record<string, unknown>;
    try {
      response = await this.internalApi.callInternalApi(
        'POST',
        '/v1/images',
        body,
        ctx,
      );
    } catch (error) {
      // Timeout / hard failure: do NOT report success with an empty preview —
      // that produced "Image generated." + a blank square in chat.
      const message = (error as Error).message || 'Image generation failed';
      this.loggerService.warn(
        `generateImage failed for org=${ctx.organizationId}: ${message}`,
      );

      return this.buildImageGenerationIncompleteResult({
        error: message,
        promptPreview,
        status: Status.PROCESSING,
      });
    }

    const id = this.readResponseEnvelopeString(response, 'id');
    const cdnUrl = this.readResponseAssetUrl(response, 'images', id);

    if (!id || !cdnUrl) {
      this.loggerService.warn(
        `generateImage returned no renderable asset for org=${ctx.organizationId} id=${id ?? 'none'}`,
      );
      return this.buildImageGenerationIncompleteResult({
        error: id
          ? 'Image generation finished without a usable CDN URL.'
          : 'Image generation did not return an asset id.',
        promptPreview,
        status: Status.PROCESSING,
      });
    }

    // Fire-and-forget quality check — don't block the generation response
    if (this.contentQualityScorerService) {
      this.contentQualityScorerService
        .scoreAndTag(id, 'image', {
          organizationId: ctx.organizationId,
        })
        .catch((err) =>
          this.loggerService.error('Auto quality check failed for image', err),
        );
    }

    await this.onboardingHandler.completeJourneyMission(
      ctx,
      'generate_first_image',
    );

    const onboardingStatus =
      await this.onboardingHandler.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0, // endpoint handles credits via CreditsInterceptor
      data: { id, status: Status.GENERATED, url: cdnUrl },
      isBillingDelegated: true,
      nextActions: [
        {
          ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
          description: `Image generated from: "${promptPreview}"`,
          id: `image-gen-${id}`,
          images: [cdnUrl],
          title: 'Image generated',
          type: 'content_preview_card',
        },
        ...(onboardingStatus.nextActions ?? []),
      ],
      success: true,
    };
  }

  /**
   * Incomplete image generation must not mint a content_preview_card without
   * images — the completion-summary builder treats those as "Generated content"
   * and the UI paints a blank square under "Image generated."
   */
  private buildImageGenerationIncompleteResult(params: {
    error: string;
    promptPreview: string;
    status: string;
  }): AgentToolResult {
    return {
      creditsUsed: 0,
      data: { status: params.status },
      error: params.error,
      isBillingDelegated: true,
      nextActions: [
        {
          id: `image-gen-incomplete-${Date.now()}`,
          primaryCta: {
            href: '/library/images',
            label: 'Check gallery',
          },
          status: 'failed',
          summaryText: `Image was not ready: "${params.promptPreview}". ${params.error}`,
          title: 'Image not ready',
          type: 'completion_summary_card',
        },
      ],
      success: false,
    };
  }

  async reframeImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const imageId = String(params.imageId || '');
    const aspectRatio = String(params.aspectRatio || '1:1');
    const dimensions = this.aspectRatioToDimensions(aspectRatio);

    const response = await this.internalApi.callInternalApi(
      'POST',
      `/images/${imageId}/reframe`,
      {
        format:
          aspectRatio === '1:1'
            ? 'square'
            : aspectRatio === '9:16' || aspectRatio === '3:4'
              ? 'portrait'
              : 'landscape',
        height: dimensions.height,
        text: `Reframe to ${aspectRatio}`,
        waitForCompletion: true,
        width: dimensions.width,
      },
      ctx,
    );

    const id = this.readResponseEnvelopeString(response, 'id');
    const cdnUrl = this.readResponseAssetUrl(response, 'images', id);

    return {
      creditsUsed: 0,
      data: { id, sourceImageId: imageId, status: Status.GENERATED },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
              description: `Reframed to ${aspectRatio}`,
              id: `image-reframe-${id}`,
              images: cdnUrl ? [cdnUrl] : [],
              title: 'Image reframed',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  async upscaleImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // Image upscale goes through the same images endpoint
    // with a specific upscale model

    const body = {
      model: 'replicate-topaz-video-upscale',
      prompt: 'upscale',
      referenceImages: [params.imageUrl as string],
      text: 'upscale',
      waitForCompletion: true,
    };

    const response = await this.internalApi.callInternalApi(
      'POST',
      '/v1/images',
      body,
      ctx,
    );

    const id = this.readResponseEnvelopeString(response, 'id');
    const cdnUrl = this.readResponseAssetUrl(response, 'images', id);

    return {
      creditsUsed: 0, // endpoint handles credits
      data: { id, status: Status.GENERATED, url: cdnUrl },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
              description: 'Image upscaled',
              id: `image-upscale-${id}`,
              images: cdnUrl ? [cdnUrl] : [],
              title: 'Image upscaled',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  async generateVideo(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const aspectRatio = (params.aspectRatio as string) || '16:9';
    const dimensions = this.aspectRatioToDimensions(aspectRatio);
    const duration = (params.duration as number) || 10;
    // Fall back to first chat attachment when no explicit imageUrl is provided
    const imageUrl =
      (params.imageUrl as string | undefined) ||
      (ctx.attachmentUrls?.length ? ctx.attachmentUrls[0] : undefined);
    const audioUrl = params.audioUrl as string | undefined;
    const rawPrompt = String(params.prompt ?? '');
    const prompt = await this.applyBrandHarnessToPrompt({
      contentType: 'video',
      ctx,
      prompt: rawPrompt,
      topic: rawPrompt.slice(0, 120),
    });

    const body: Record<string, unknown> = {
      duration,
      height: dimensions.height,
      prompt,
      text: prompt,
      waitForCompletion: true,
      width: dimensions.width,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    };

    // Avatar mode: image + audio → Kling Avatar V2 (skip autoSelectModel)
    if (audioUrl && imageUrl) {
      body.model = 'kwaivgi/kling-avatar-v2';
      body.audioUrl = audioUrl;
      body.references = [imageUrl];
    } else if (ctx.generationModelOverride) {
      body.model = ctx.generationModelOverride;
      if (imageUrl) {
        body.references = [imageUrl];
      }
    } else if (imageUrl) {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || RouterPriority.QUALITY;
      body.references = [imageUrl];
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || RouterPriority.QUALITY;
    }

    const response = await this.internalApi.callInternalApi(
      'POST',
      '/v1/videos',
      body,
      ctx,
    );

    const id = this.readResponseEnvelopeString(response, 'id');
    const cdnUrl = this.readResponseAssetUrl(response, 'videos', id);

    // Fire-and-forget quality check — don't block the generation response
    if (id && this.contentQualityScorerService) {
      this.contentQualityScorerService
        .scoreAndTag(id, 'video', {
          organizationId: ctx.organizationId,
        })
        .catch((err) =>
          this.loggerService.error('Auto quality check failed for video', err),
        );
    }

    if (id) {
      await this.onboardingHandler.completeJourneyMission(
        ctx,
        'generate_first_video',
      );
    }

    const onboardingStatus =
      await this.onboardingHandler.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0,
      data: { id, status: Status.GENERATED, url: cdnUrl },
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/video/${id}`, label: 'View in gallery' }],
              description: `Video generated from: "${(params.prompt as string).substring(0, 80)}"`,
              id: `video-gen-${id}`,
              title: 'Video generated',
              type: 'content_preview_card',
              videos: cdnUrl ? [cdnUrl] : [],
            },
            ...(onboardingStatus.nextActions ?? []),
          ]
        : [],
      success: true,
    };
  }

  async generateMusic(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const duration = (params.duration as number) || 10;

    const body: Record<string, unknown> = {
      autoSelectModel: true,
      duration,
      text: params.text as string,
      waitForCompletion: true,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    };

    const response = await this.internalApi.callInternalApi(
      'POST',
      '/v1/musics',
      body,
      ctx,
    );

    const id = this.readResponseEnvelopeString(response, 'id');
    const cdnUrl = this.readResponseAssetUrl(response, 'musics', id);

    return {
      creditsUsed: 0,
      data: { id, status: Status.GENERATED, url: cdnUrl },
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              audio: cdnUrl ? [cdnUrl] : [],
              ctas: [{ href: `/g/music/${id}`, label: 'View in gallery' }],
              description: `Music generated from: "${(params.text as string).substring(0, 80)}"`,
              id: `music-gen-${id}`,
              title: 'Music generated',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  async generateVoice(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const body = {
      text: params.text as string,
      voiceId: params.voiceId as string,
      waitForCompletion: true,
    };

    const response = await this.internalApi.callInternalApi(
      'POST',
      '/v1/voices/generate',
      body,
      ctx,
    );

    const id = this.readResponseEnvelopeString(response, 'id');
    const audioUrl = this.readResponseEnvelopeString(response, 'audioUrl');
    const cdnUrl =
      audioUrl ?? this.readResponseAssetUrl(response, 'voices', id);

    return {
      creditsUsed: 0,
      data: { id, status: Status.GENERATED, url: cdnUrl },
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              audio: cdnUrl ? [cdnUrl] : [],
              ctas: [{ href: `/g/voice/${id}`, label: 'View in gallery' }],
              description: `Speech generated: "${(params.text as string).substring(0, 80)}"`,
              id: `voice-gen-${id}`,
              title: 'Voice generated',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  async generateContentBatch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    let brandId =
      (params.brandId as string | undefined) ?? ctx.brandId ?? undefined;
    const handle = params.handle as string | undefined;

    // Resolve @handle to brandId if provided
    if (handle && !brandId && this.credentialsService) {
      const credential = this.credentialsService.findByHandle
        ? await this.credentialsService.findByHandle(handle, ctx.organizationId)
        : null;

      if (credential) {
        brandId = credential.brandId ?? undefined;
      } else {
        return {
          creditsUsed: 0,
          error: `No connected credential found for handle "${handle}"`,
          success: false,
        };
      }
    }

    if (!brandId) {
      const selectedBrand = await this.brandsService.findOne({
        isDeleted: false,
        isSelected: true,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      } as never);

      if (selectedBrand?.id) {
        brandId = String(selectedBrand.id);
      }
    }

    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'brandId or handle is required',
        success: false,
      };
    }

    const count = (params.count as number) || 10;
    const platforms = (params.platforms as string[]) || ['instagram'];
    const pricingOptions = this.resolveBatchPricingOptions(ctx);
    const contentMix = parseContentMixPercents(params.contentMix);
    const estimatedCredits = estimateBatchGenerationCredits(
      {
        contentMix: toContentFormatMix(contentMix),
        count,
        platforms,
      },
      pricingOptions,
    );

    const dateRange = (params.dateRange as Record<string, string>) || {
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      start: new Date().toISOString(),
    };

    // createBatch validates platforms against the domain enum before any
    // generation work or credit movement (#2696).
    let batch: Awaited<ReturnType<BatchGenerationService['createBatch']>>;
    try {
      batch = await this.batchGenerationService.createBatch(
        {
          brandId,
          contentMix,
          count,
          dateRange: {
            end: dateRange.end,
            start: dateRange.start,
          },
          platforms,
          style: params.style as string | undefined,
          topics: params.topics as string[] | undefined,
        },
        ctx.userId,
        ctx.organizationId,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to create batch';
      return {
        creditsUsed: 0,
        error: message,
        success: false,
      };
    }

    const batchId = String(batch.id);
    const totalCount = batch.totalCount;
    const platformLabel = this.formatBatchPlatformsLabel(platforms);

    // Atomic reserve before any generation starts. The balance check alone is
    // racy under concurrent batch starts; deduction is serializable and keyed
    // by batch id so a second attempt cannot spend past available credits.
    try {
      await this.chargeBatchCredits({
        amount: estimatedCredits,
        batchId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
    } catch (error: unknown) {
      // createBatch already persisted items. Without compensation a failed
      // reserve leaves an orphan PENDING batch the operator cannot run (#2696).
      try {
        await this.batchGenerationService.cancelBatch(
          batchId,
          ctx.organizationId,
        );
      } catch (cancelError: unknown) {
        this.loggerService.warn(
          `${this.constructorName} failed to cancel batch after credit reserve failure`,
          { batchId, cancelError, organizationId: ctx.organizationId },
        );
      }
      const message =
        error instanceof Error
          ? error.message
          : `Insufficient credits. This batch needs about ${estimatedCredits} credits.`;
      return {
        creditsUsed: 0,
        error: message,
        success: false,
      };
    }

    // Pin the pricing + charged estimate on the batch before any item runs so
    // settlement (streamed or worker) prices the delta only.
    await this.batchCreditsService?.recordUpfrontCharge({
      batchId,
      credits: estimatedCredits,
      organizationId: ctx.organizationId,
      pricingOptions,
    });
    const streamedItems: Array<{
      error?: string;
      format?: string;
      hasMedia?: boolean;
      index: number;
      platform?: string;
      postId?: string;
      previewText?: string;
      status: 'completed' | 'failed';
      topic: string;
    }> = [];

    if (ctx.streamBatchToUser && ctx.threadId && ctx.userId) {
      let streamedTranscript =
        `Creating ${totalCount} ${platformLabel} post${totalCount === 1 ? '' : 's'}. ` +
        `I will stream each draft as soon as it is ready.`;

      await runEffectPromise(
        this.publishTokenEffect({
          runId: ctx.runId,
          threadId: ctx.threadId,
          token: streamedTranscript,
          userId: ctx.userId,
        }),
      );

      await runEffectPromise(
        this.publishWorkEventEffect({
          detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
          event: 'started',
          label: 'Batch generation started',
          progress: 0,
          runId: ctx.runId,
          startedAt: new Date().toISOString(),
          status: 'running',
          threadId: ctx.threadId,
          userId: ctx.userId,
        }),
      );

      const summary = await this.batchGenerationService.processBatch(
        batchId,
        ctx.organizationId,
        {
          onItemCompleted: async ({
            completedCount,
            index,
            item,
            postId,
            previewText,
            topic,
            totalCount: total,
          }) => {
            const block =
              `\n\nPost ${index + 1}/${total} ready` +
              `${item.platform ? ` (${item.platform})` : ''}` +
              `\n${(previewText || topic).trim()}`;
            streamedTranscript += block;
            streamedItems.push({
              format: item.format,
              hasMedia: Boolean(item.mediaUrl),
              index,
              platform: item.platform,
              postId,
              previewText,
              status: 'completed',
              topic,
            });

            await runEffectPromise(
              this.publishWorkEventEffect({
                detail: `Draft ${completedCount}/${total} is ready.`,
                event: 'tool_completed',
                label: `Generated post ${index + 1}`,
                parameters: {
                  batchId,
                  platform: item.platform,
                  postId,
                  previewText,
                  topic,
                },
                progress: Math.round((completedCount / total) * 100),
                resultSummary: previewText || topic,
                runId: ctx.runId,
                status: 'completed',
                threadId: ctx.threadId!,
                toolName: AgentToolName.GENERATE_CONTENT_BATCH,
                userId: ctx.userId!,
              }),
            );
            await runEffectPromise(
              this.publishTokenEffect({
                runId: ctx.runId,
                threadId: ctx.threadId!,
                token: block,
                userId: ctx.userId!,
              }),
            );
          },
          onItemFailed: async ({
            failedCount,
            index,
            item,
            error,
            topic,
            totalCount: total,
          }) => {
            const block =
              `\n\nPost ${index + 1}/${total} failed` +
              `${item.platform ? ` (${item.platform})` : ''}` +
              `\n${error || 'Unknown error'}`;
            streamedTranscript += block;
            streamedItems.push({
              error,
              format: item.format,
              hasMedia: Boolean(item.mediaUrl),
              index,
              platform: item.platform,
              status: 'failed',
              topic,
            });

            await runEffectPromise(
              this.publishWorkEventEffect({
                detail: error || 'Draft generation failed.',
                event: 'tool_completed',
                label: `Failed post ${index + 1}`,
                parameters: {
                  batchId,
                  platform: item.platform,
                  topic,
                },
                progress: Math.round(
                  ((failedCount +
                    streamedItems.filter(
                      (entry) => entry.status === 'completed',
                    ).length) /
                    total) *
                    100,
                ),
                resultSummary: error || 'Unknown error',
                runId: ctx.runId,
                status: 'failed',
                threadId: ctx.threadId!,
                toolName: AgentToolName.GENERATE_CONTENT_BATCH,
                userId: ctx.userId!,
              }),
            );
            await runEffectPromise(
              this.publishTokenEffect({
                runId: ctx.runId,
                threadId: ctx.threadId!,
                token: block,
                userId: ctx.userId!,
              }),
            );
          },
          onItemStarted: async ({
            completedCount,
            failedCount,
            index,
            item,
            totalCount: total,
          }) => {
            await runEffectPromise(
              this.publishWorkEventEffect({
                detail: `Generating draft ${index + 1}/${total}.`,
                event: 'tool_started',
                label: `Generating post ${index + 1}`,
                parameters: {
                  batchId,
                  format: item.format,
                  platform: item.platform,
                },
                progress: Math.round(
                  ((completedCount + failedCount) / Math.max(total, 1)) * 100,
                ),
                runId: ctx.runId,
                status: 'running',
                threadId: ctx.threadId!,
                toolName: AgentToolName.GENERATE_CONTENT_BATCH,
                userId: ctx.userId!,
              }),
            );
          },
        },
      );

      const summaryText =
        `\n\nBatch complete. ${summary.completedCount} of ${summary.totalCount} ` +
        `post${summary.totalCount === 1 ? '' : 's'} ready` +
        `${summary.failedCount > 0 ? `, ${summary.failedCount} failed.` : '.'}`;
      streamedTranscript += summaryText;
      await runEffectPromise(
        this.publishTokenEffect({
          runId: ctx.runId,
          threadId: ctx.threadId,
          token: summaryText,
          userId: ctx.userId,
        }),
      );

      const { previews, remainingCount } = takeBatchPostPreviews(
        streamedItems,
        { limit: BATCH_POST_PREVIEW_LIMIT },
      );
      const reviewHref = `/publish/review?batch=${batchId}&filter=ready`;
      const readyCount = summary.completedCount;
      const viewAllLabel =
        readyCount > BATCH_POST_PREVIEW_LIMIT
          ? `View all ${readyCount} posts`
          : readyCount > 0
            ? 'Open reviews'
            : 'Open Review Queue';

      // Estimate was reserved up front; settle to the media-aware cost of
      // drafts that actually landed so partial failures refund the unused
      // reservation (#2696).
      const settlement = await this.batchCreditsService?.settleBatchCredits({
        batchId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      const creditsUsed =
        settlement?.settledCredits ??
        chargeBatchGenerationCredits(
          streamedItems
            .filter((entry) => entry.status === 'completed' && entry.postId)
            .map((entry) => ({
              format: entry.format ?? 'image',
              hasMedia: Boolean(entry.hasMedia),
            })),
          pricingOptions,
        );

      return {
        creditsUsed,
        data: {
          batchId,
          completedCount: summary.completedCount,
          creditsUsed,
          estimatedCredits,
          failedCount: summary.failedCount,
          message:
            summary.failedCount > 0
              ? `Batch finished with ${summary.completedCount} ready and ${summary.failedCount} failed.`
              : `Batch finished with ${summary.completedCount} generated post${summary.completedCount === 1 ? '' : 's'}.`,
          previewLimit: BATCH_POST_PREVIEW_LIMIT,
          remainingCount,
          status: summary.status,
          streamedItems,
          streamedTranscript,
          totalCount: summary.totalCount,
        },
        isBillingDelegated: true,
        nextActions: [
          {
            batchCount: totalCount,
            completedCount: summary.completedCount,
            creditEstimate: creditsUsed,
            creditsUsed,
            ctas: [
              { href: reviewHref, label: viewAllLabel },
              { href: '/calendar/posts', label: 'Open Calendar' },
            ],
            description:
              summary.completedCount > 0
                ? `Generated ${summary.completedCount} ${platformLabel} draft${summary.completedCount === 1 ? '' : 's'}${summary.failedCount > 0 ? ` (${summary.failedCount} failed)` : ''} · ${creditsUsed} credits.`
                : `Batch finished with 0 ready drafts${summary.failedCount > 0 ? `; ${summary.failedCount} failed` : ''}.`,
            failedCount: summary.failedCount,
            id: `batch-generation-${batchId}`,
            // Already limited server-side via takeBatchPostPreviews({ limit }).
            items: previews,
            platforms,
            remainingCount,
            title: 'Batch generation complete',
            // Result card (previews + review link), not the configure/generate form.
            type: 'batch_generation_result_card',
          },
        ],
        success: true,
      };
    }

    // Async path: estimate already reserved + ledgered above. Settlement later
    // prices what actually landed and moves only the delta.

    // Hand the run to the workers process. It used to be a bare in-process
    // promise, so an API reload mid-batch killed it and stranded every
    // remaining item in PROCESSING with no way to re-run it (issue #2501).
    const queuedJobId = await this.batchGenerationQueueService?.queueBatch({
      batchId,
      organizationId: ctx.organizationId,
      runId: ctx.runId,
      threadId: ctx.threadId,
      userId: ctx.userId,
    });

    if (!queuedJobId) {
      // No queue configured (single-process self-hosted): run in-process as
      // before, and settle here since no worker will.
      this.runBatchInProcess({
        batchId,
        organizationId: ctx.organizationId,
        runId: ctx.runId,
        threadId: ctx.threadId,
        userId: ctx.userId,
      });
    }

    return {
      creditsUsed: estimatedCredits,
      data: {
        batchId,
        estimatedCredits,
        message: `Batch created with ${batch.totalCount} items. Processing started.`,
        status: batch.status,
        totalCount: batch.totalCount,
      },
      isBillingDelegated: true,
      success: true,
    };
  }

  /**
   * Fallback for deployments without a workers process.
   *
   * Deliberately not awaited — the tool result returns as soon as the batch is
   * created, exactly as it did before batches moved onto the queue.
   */
  private runBatchInProcess(context: {
    batchId: string;
    organizationId: string;
    runId?: string;
    threadId?: string;
    userId: string;
  }): void {
    if (!this.batchGenerationService) {
      return;
    }

    const streamOptions =
      context.threadId && this.batchStreamService
        ? this.batchStreamService.buildProcessOptions({
            batchId: context.batchId,
            runId: context.runId,
            threadId: context.threadId,
            userId: context.userId,
          })
        : undefined;

    this.batchGenerationService
      .processBatch(context.batchId, context.organizationId, streamOptions)
      .catch((err: Error) => {
        this.loggerService.error(
          `Batch processing failed: ${err.message}`,
          this.constructorName,
        );
      })
      // Settles on failure too: the estimate is already charged, so a batch
      // that dies half-done must still be priced down to what landed.
      .then(async () => {
        await this.batchCreditsService?.settleBatchCredits({
          batchId: context.batchId,
          organizationId: context.organizationId,
          userId: context.userId,
        });
      })
      .catch((err: Error) => {
        this.loggerService.error(
          `Batch settlement failed: ${err.message}`,
          this.constructorName,
        );
      });
  }

  private formatBatchPlatformsLabel(platforms: string[]): string {
    if (platforms.length === 0) {
      return 'content';
    }

    if (platforms.length === 1) {
      return formatPlatformLabel(platforms[0]) ?? platforms[0];
    }

    return platforms
      .map((platform) => formatPlatformLabel(platform) ?? platform)
      .join(', ');
  }
  async generateAsIdentity(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const text = params.text as string;

    if (!text) {
      return {
        creditsUsed: 0,
        error: 'text is required',
        success: false,
      };
    }

    const response = await this.internalApi.callInternalApi(
      'POST',
      '/v1/videos/avatar',
      {
        text,
        useIdentity: true,
      },
      ctx,
    );

    const id = this.readResponseEnvelopeString(response, 'id');

    return {
      creditsUsed: 0,
      data: {
        id,
        message:
          'Avatar video generation started using your identity (avatar + cloned voice).',
        status: 'processing',
      },
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              ctas: [{ href: `/library/videos`, label: 'View in Library' }],
              description: `Avatar video generating: "${text.substring(0, 80)}"`,
              id: `identity-gen-${id}`,
              title: 'Identity video generating',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }
  private aspectRatioToDimensions(ratio: string): {
    width: number;
    height: number;
  } {
    const map: Record<string, { width: number; height: number }> = {
      '1:1': { height: 1024, width: 1024 },
      '3:4': { height: 1365, width: 1024 },
      '4:3': { height: 768, width: 1024 },
      '9:16': { height: 1024, width: 576 },
      '16:9': { height: 576, width: 1024 },
    };
    return map[ratio] || map['1:1'];
  }
}
