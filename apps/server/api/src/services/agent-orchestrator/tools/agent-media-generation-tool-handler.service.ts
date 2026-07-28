import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  type AiActionResult,
  AiActionsService,
} from '@api/endpoints/ai-actions/ai-actions.service';
import {
  AiActionType,
  type ExecuteAiActionDto,
} from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { formatPlatformLabel, Status } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
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
  ) {}

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

    return id
      ? `${this.configService.ingredientsEndpoint}/${endpoint}/${id}`
      : undefined;
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

    if (shouldGenerateArticle) {
      const articleType =
        normalizedType === 'x-article' ? 'x-article' : 'standard';
      const response = await this.internalApi.callInternalApi(
        'POST',
        '/v1/articles/generate',
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

      const data = (response.data ?? response) as Record<string, unknown>;
      const attributes = (data.attributes ?? data) as Record<string, unknown>;
      const articleId =
        (data.id as string | undefined) ||
        (attributes.id as string | undefined);

      return {
        creditsUsed: 2,
        data: {
          articleId,
          content: (attributes.content as string) || '',
          summary: (attributes.summary as string) || '',
          title: (attributes.label as string) || '',
          type: articleType,
        },
        nextActions: articleId
          ? [
              {
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
                title:
                  articleType === 'x-article'
                    ? 'X Article generated'
                    : 'Article generated',
                type: 'content_preview_card',
              },
            ]
          : [],
        success: true,
      };
    }

    const results = await this.contentGeneratorService.generateContent(
      ctx.organizationId,
      {
        additionalContext: params.additionalContext as string[] | undefined,
        brandId: params.brandId ? (params.brandId as string) : undefined,
        platform: params.platform as string,
        topic: params.topic as string,
        variationsCount: 1,
      } as never,
    );

    const generated = results[0];

    return {
      creditsUsed: 2,
      data: {
        content: generated?.content ?? '',
        hashtags: generated?.hashtags ?? [],
        hook: generated?.hook,
        patternUsed: generated?.patternUsed,
      },
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

    const prompt =
      (params.prompt as string | undefined) ??
      (params.description as string | undefined) ??
      (params.text as string | undefined) ??
      '';
    const aspectRatio = (params.aspectRatio as string) || '1:1';
    const dimensions = this.aspectRatioToDimensions(aspectRatio);
    const promptPreview = prompt.substring(0, 80);

    // Use attachment as reference image when no explicit imageUrl is provided
    const imageUrl =
      (params.imageUrl as string | undefined) ||
      (ctx.attachmentUrls?.length ? ctx.attachmentUrls[0] : undefined);

    const body: Record<string, unknown> = {
      height: dimensions.height,
      prompt,
      text: prompt,
      waitForCompletion: true,
      width: dimensions.width,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
      ...(imageUrl ? { references: [imageUrl] } : {}),
    };

    if (ctx.generationModelOverride) {
      body.model = ctx.generationModelOverride;
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || 'quality';
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
      // Graceful timeout handling: if the 3-minute polling times out or
      // the endpoint errors, return a partial result with a gallery link
      this.loggerService.warn(
        `generateImage failed for org=${ctx.organizationId}: ${(error as Error).message}`,
      );

      return {
        creditsUsed: 0,
        data: { status: Status.PROCESSING },
        isBillingDelegated: true,
        nextActions: [
          {
            ctas: [{ href: '/library/images', label: 'Check gallery' }],
            description: `Image is still processing: "${promptPreview}"`,
            id: `image-gen-pending-${Date.now()}`,
            title: 'Image processing',
            type: 'content_preview_card',
          },
        ],
        success: true,
      };
    }

    const id = this.readResponseEnvelopeString(response, 'id');
    const cdnUrl = this.readResponseAssetUrl(response, 'images', id);

    // Fire-and-forget quality check — don't block the generation response
    if (id && this.contentQualityScorerService) {
      this.contentQualityScorerService
        .scoreAndTag(id, 'image', {
          organizationId: ctx.organizationId,
        })
        .catch((err) =>
          this.loggerService.error('Auto quality check failed for image', err),
        );
    }

    if (id) {
      await this.onboardingHandler.completeJourneyMission(
        ctx,
        'generate_first_image',
      );
    }

    const onboardingStatus =
      await this.onboardingHandler.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0, // endpoint handles credits via CreditsInterceptor
      data: { id, status: Status.GENERATED, url: cdnUrl },
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
              description: `Image generated from: "${promptPreview}"`,
              id: `image-gen-${id}`,
              images: cdnUrl ? [cdnUrl] : [],
              title: 'Image generated',
              type: 'content_preview_card',
            },
            ...(onboardingStatus.nextActions ?? []),
          ]
        : [],
      success: true,
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

    const body: Record<string, unknown> = {
      duration,
      height: dimensions.height,
      prompt: params.prompt as string,
      text: params.prompt as string,
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
      body.prioritize = ctx.generationPriority || 'quality';
      body.references = [imageUrl];
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || 'quality';
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
        brandId = String(credential.brand);
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
        organization: ctx.organizationId,
        user: ctx.userId,
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

    const dateRange = (params.dateRange as Record<string, string>) || {
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      start: new Date().toISOString(),
    };

    const batch = await this.batchGenerationService.createBatch(
      {
        brandId,
        contentMix: params.contentMix as never,
        count: (params.count as number) || 10,
        dateRange: {
          end: dateRange.end,
          start: dateRange.start,
        },
        platforms: (params.platforms as string[]) || ['instagram'],
        style: params.style as string | undefined,
        topics: params.topics as string[] | undefined,
      },
      ctx.userId,
      ctx.organizationId,
    );

    const batchId = String(batch.id);
    const totalCount = batch.totalCount;
    const platforms = (params.platforms as string[]) || ['instagram'];
    const platformLabel = this.formatBatchPlatformsLabel(platforms);
    const streamedItems: Array<{
      error?: string;
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

      return {
        creditsUsed: 5,
        data: {
          batchId,
          completedCount: summary.completedCount,
          failedCount: summary.failedCount,
          message:
            summary.failedCount > 0
              ? `Batch finished with ${summary.completedCount} ready and ${summary.failedCount} failed.`
              : `Batch finished with ${summary.completedCount} generated post${summary.completedCount === 1 ? '' : 's'}.`,
          status: summary.status,
          streamedItems,
          streamedTranscript,
          totalCount: summary.totalCount,
        },
        nextActions: [
          {
            batchCount: totalCount,
            ctas: [
              { href: '/review', label: 'Open Review Queue' },
              { href: '/calendar/posts', label: 'Open Calendar' },
            ],
            description: `Generated ${totalCount} ${platformLabel} draft${totalCount === 1 ? '' : 's'}.`,
            id: `batch-generation-${batchId}`,
            title: 'Batch generation complete',
            type: 'batch_generation_card',
          },
        ],
        success: true,
      };
    }

    // Trigger async processing
    this.batchGenerationService
      .processBatch(batchId, ctx.organizationId, {
        onBatchStarted: async ({ batchId: currentBatchId, totalCount }) => {
          await runEffectPromise(
            this.publishWorkEventEffect({
              detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
              event: 'started',
              label: 'Batch generation started',
              progress: 0,
              runId: ctx.runId,
              startedAt: new Date().toISOString(),
              status: 'running',
              threadId: ctx.threadId!,
              toolCallId: `batch:${currentBatchId}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
        onItemCompleted: async ({
          completedCount,
          index,
          item,
          postId,
          previewText,
          topic,
          totalCount: total,
        }) => {
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
              toolCallId: `batch:${batchId}:item:${String(item._id)}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
        onItemFailed: async ({
          completedCount,
          failedCount,
          index,
          item,
          error,
          topic,
          totalCount: total,
        }) => {
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
                ((completedCount + failedCount) / Math.max(total, 1)) * 100,
              ),
              resultSummary: error || 'Unknown error',
              runId: ctx.runId,
              status: 'failed',
              threadId: ctx.threadId!,
              toolCallId: `batch:${batchId}:item:${String(item._id)}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
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
              toolCallId: `batch:${batchId}:item:${String(item._id)}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
      })
      .catch((err: Error) => {
        this.loggerService.error(
          `Batch processing failed: ${err.message}`,
          this.constructorName,
        );
      });

    return {
      creditsUsed: 5,
      data: {
        batchId,
        message: `Batch created with ${batch.totalCount} items. Processing started.`,
        status: batch.status,
        totalCount: batch.totalCount,
      },
      success: true,
    };
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
