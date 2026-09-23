import { PersonasService } from '@api/collections/personas/services/personas.service';
import { IMAGE_GENERATION_RESULT_ERROR } from '@api/services/agent-orchestrator/agent-image-generation-result.constant';
import {
  AGENT_GENERATION_GATEWAY,
  type AgentGenerationPrincipal,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import { AgentGenerationScopeService } from '@api/services/agent-orchestrator/tools/agent-generation-scope.service';
import {
  readMediaReferenceStrings,
  resolveGenerationReferences,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-references';
import {
  readMediaAssetUrl,
  readMediaResponseString,
  readMediaResponseValue,
  readUsableCdnAssetUrl,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import {
  IngredientCategory,
  RouterPriority,
  Status,
} from '@genfeedai/contracts';
import {
  createLibraryAssetRoute,
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

@Injectable()
export class AgentMediaAssetGenerationService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
    private readonly onboardingHandler: AgentOnboardingToolHandler,
    @Inject('AGENT_BRANDS_SERVICE')
    readonly _brandsService: AgentBrandsServiceLike,
    @Optional()
    private readonly contentQualityScorerService?: ContentQualityScorerService,
    @Optional()
    private readonly personasService?: PersonasService,
    @Optional()
    private readonly scopeService?: AgentGenerationScopeService,
  ) {}

  /**
   * Tool context is the agent's principal: the signed-in user the turn runs as,
   * inside the organization the run was validated against.
   */
  private toPrincipal(ctx: ToolExecutionContext): AgentGenerationPrincipal {
    return {
      brandId: ctx.brandId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    };
  }

  private async resolveMediaBrandContext(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ context: ToolExecutionContext } | { error: AgentToolResult }> {
    if (this.scopeService) {
      const resolved = await this.scopeService.resolveBrand(params, ctx);
      if ('error' in resolved) {
        return { error: resolved.error };
      }
      return { context: { ...ctx, brandId: resolved.brandId } };
    }

    const explicitId =
      typeof params.brandId === 'string' && params.brandId.trim().length > 0
        ? params.brandId.trim()
        : ctx.brandId;
    if (!explicitId) {
      return {
        error: {
          creditsUsed: 0,
          error:
            'Select a brand before generating. Pass brandId from list_brands; the first organization brand is not used automatically.',
          success: false,
        },
      };
    }

    return { context: { ...ctx, brandId: explicitId } };
  }

  private readRequestedModel(
    ctx: ToolExecutionContext,
    params: Record<string, unknown>,
  ): string | undefined {
    return (
      ctx.generationSettings?.model ??
      (typeof params.model === 'string' && params.model.trim().length > 0
        ? params.model.trim()
        : (ctx.generationModelOverride ?? undefined))
    );
  }

  async generateImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const resolvedContext = await this.resolveMediaBrandContext(params, ctx);
    if ('error' in resolvedContext) {
      return resolvedContext.error;
    }
    ctx = resolvedContext.context;

    const rawPrompt =
      (params.prompt as string | undefined) ??
      (params.description as string | undefined) ??
      (params.text as string | undefined) ??
      '';
    const scopedPrompt = this.scopeService
      ? await this.scopeService.applySelectedContext({
          ctx,
          params,
          prompt: rawPrompt,
        })
      : { prompt: rawPrompt, receipt: undefined };
    if ('error' in scopedPrompt) {
      return scopedPrompt.error;
    }
    const prompt = scopedPrompt.prompt;
    const promptPreview = rawPrompt.substring(0, 80);
    const imageUrl =
      (params.imageUrl as string | undefined) || ctx.attachmentUrls?.[0];
    const resolvedReferences = await resolveGenerationReferences({
      attachmentFallback: imageUrl,
      ctx,
      explicitReferences: params.references,
      handles: params.characterHandles,
      modelKey:
        ctx.generationSettings?.model ??
        (typeof params.model === 'string' ? params.model : undefined) ??
        ctx.generationModelOverride ??
        undefined,
      personasService: this.personasService,
    });
    if (resolvedReferences.error) {
      return resolvedReferences.error;
    }
    const body = this.buildImageGenerationBody({
      ctx,
      params,
      prompt,
      references: resolvedReferences.references,
    });

    let response: Record<string, unknown>;
    try {
      response = toMediaResponseRecord(
        await this.generationGateway.generateImage({
          body,
          ...(prompt !== rawPrompt ? { originalPrompt: rawPrompt } : {}),
          principal: this.toPrincipal(ctx),
        }),
      );
    } catch (error) {
      // Timeout/hard failure must not produce a successful empty preview card.
      const message = (error as Error).message || 'Image generation failed';
      this.loggerService.warn(
        `generateImage failed for org=${ctx.organizationId}: ${message}`,
      );
      return this.buildMediaGenerationIncompleteResult({
        assetKind: 'image',
        error: message,
        promptPreview,
        status: Status.PROCESSING,
      });
    }

    const id = readMediaResponseString(response, 'id');
    const cdnUrl = readUsableCdnAssetUrl(
      response,
      this.configService.ingredientsEndpoint,
    );
    const responseStatus = readMediaResponseString(response, 'status')
      ?.trim()
      .toLowerCase();
    if (!id) {
      this.loggerService.warn(
        `generateImage returned no renderable asset for org=${ctx.organizationId} id=${id ?? 'none'}`,
      );
      return this.buildMediaGenerationIncompleteResult({
        assetKind: 'image',
        error: IMAGE_GENERATION_RESULT_ERROR.MISSING_ASSET_ID,
        promptPreview,
        status: Status.PROCESSING,
      });
    }

    if (!cdnUrl && responseStatus !== Status.PROCESSING) {
      this.loggerService.warn(
        `generateImage returned no usable CDN asset for org=${ctx.organizationId} id=${id}`,
      );
      return this.buildMediaGenerationIncompleteResult({
        assetKind: 'image',
        assetId: id,
        error: IMAGE_GENERATION_RESULT_ERROR.UNUSABLE_CDN_URL,
        promptPreview,
        status: Status.FAILED,
      });
    }

    if (cdnUrl) {
      this.scoreAsset(id, 'image', ctx.organizationId);
      await this.onboardingHandler.completeJourneyMission(
        ctx,
        'generate_first_image',
      );
    }
    const onboardingNextActions = cdnUrl
      ? (await this.onboardingHandler.checkOnboardingStatus(ctx)).nextActions
      : undefined;
    const result = this.buildImageGenerationResult(
      id,
      cdnUrl,
      promptPreview,
      onboardingNextActions,
    );
    return this.withGenerationReceipt(
      result,
      scopedPrompt.receipt,
      'image',
      response,
    );
  }

  private buildImageGenerationBody(input: {
    ctx: ToolExecutionContext;
    params: Record<string, unknown>;
    prompt: string;
    references: string[];
  }): Record<string, unknown> {
    const dimensions = resolveAgentGenerationDimensions(
      input.ctx.generationSettings?.aspectRatio ||
        (input.params.aspectRatio as string) ||
        DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    const rawRequestedOutputs =
      input.ctx.generationSettings?.outputs ?? input.params.outputs;
    const requestedOutputs =
      typeof rawRequestedOutputs === 'number' &&
      Number.isFinite(rawRequestedOutputs)
        ? Math.min(8, Math.max(1, Math.round(rawRequestedOutputs)))
        : undefined;
    const body: Record<string, unknown> = {
      height: dimensions.height,
      prompt: input.prompt,
      text: input.prompt,
      waitForCompletion: false,
      width: dimensions.width,
      ...(typeof input.params.harness === 'boolean'
        ? { harness: input.params.harness }
        : {}),
      ...(requestedOutputs ? { outputs: requestedOutputs } : {}),
      ...(input.ctx.brandId ? { brandId: input.ctx.brandId } : {}),
      ...(input.ctx.runId ? { workflowExecutionId: input.ctx.runId } : {}),
      ...(input.ctx.sourceActionId
        ? { sourceActionId: input.ctx.sourceActionId }
        : {}),
      ...(input.ctx.strategyId
        ? { agentStrategyId: input.ctx.strategyId }
        : {}),
      ...(input.references.length > 0 ? { references: input.references } : {}),
    };
    const requestedModel =
      input.ctx.generationSettings?.model ??
      (typeof input.params.model === 'string' &&
      input.params.model.trim().length > 0
        ? input.params.model.trim()
        : input.ctx.generationModelOverride);
    if (requestedModel) {
      body.model = requestedModel;
    } else {
      body.autoSelectModel = true;
      body.prioritize = input.ctx.generationPriority || RouterPriority.QUALITY;
    }
    return body;
  }

  private buildImageGenerationResult(
    id: string,
    cdnUrl: string | undefined,
    promptPreview: string,
    onboardingNextActions: AgentToolResult['nextActions'],
  ): AgentToolResult {
    const status = cdnUrl ? Status.GENERATED : Status.PROCESSING;

    return {
      creditsUsed: 0,
      data: buildMediaAssetData(id, status, cdnUrl),
      isBillingDelegated: true,
      nextActions: [
        {
          ctas: [
            {
              href: createLibraryAssetRoute(IngredientCategory.IMAGE, id),
              label: 'View in Library',
            },
          ],
          assetId: id,
          assetKind: 'image',
          description: `Image ${cdnUrl ? 'generated' : 'is generating'} from: "${promptPreview}"`,
          id: `image-gen-${id}`,
          images: cdnUrl ? [cdnUrl] : [],
          status: cdnUrl ? 'completed' : 'processing',
          title: cdnUrl ? 'Image generated' : 'Image generating',
          type: 'content_preview_card',
        },
        ...(onboardingNextActions ?? []),
      ],
      success: true,
    };
  }

  async reframeImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const imageId = String(params.imageId || '');
    const aspectRatio = String(
      params.aspectRatio || DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    const dimensions = resolveAgentGenerationDimensions(aspectRatio);
    const response = toMediaResponseRecord(
      await this.generationGateway.reframeImage({
        body: {
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
        principal: this.toPrincipal(ctx),
        resourceId: imageId,
      }),
    );
    const id = readMediaResponseString(response, 'id');
    const cdnUrl = readMediaAssetUrl(
      response,
      this.configService.ingredientsEndpoint,
    );

    return {
      creditsUsed: 0,
      data: { id, sourceImageId: imageId, status: Status.GENERATED },
      nextActions: id
        ? [
            {
              assetId: id,
              assetKind: 'image',
              ctas: [
                {
                  href: createLibraryAssetRoute(IngredientCategory.IMAGE, id),
                  label: 'View in Library',
                },
              ],
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
    const response = toMediaResponseRecord(
      await this.generationGateway.generateImage({
        body: {
          model: 'replicate-topaz-video-upscale',
          prompt: 'upscale',
          referenceImages: [params.imageUrl as string],
          text: 'upscale',
          waitForCompletion: true,
        },
        principal: this.toPrincipal(ctx),
      }),
    );
    return this.buildSimpleAssetResult({
      billingDelegated: true,
      description: 'Image upscaled',
      endpoint: 'image',
      idPrefix: 'image-upscale',
      mediaKey: 'images',
      response,
      title: 'Image upscaled',
    });
  }

  async generateVideo(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const resolvedContext = await this.resolveMediaBrandContext(params, ctx);
    if ('error' in resolvedContext) {
      return resolvedContext.error;
    }
    ctx = resolvedContext.context;

    const requestedModel = this.readRequestedModel(ctx, params);
    const dimensions = resolveAgentGenerationDimensions(
      ctx.generationSettings?.aspectRatio ||
        (params.aspectRatio as string) ||
        DEFAULT_AGENT_VIDEO_ASPECT_RATIO,
    );
    const imageUrl =
      (params.imageUrl as string | undefined) || ctx.attachmentUrls?.[0];
    const resolvedReferences = await resolveGenerationReferences({
      ctx,
      explicitReferences: params.references,
      handles: params.characterHandles,
      modelKey: requestedModel,
      personasService: this.personasService,
    });
    if (resolvedReferences.error) {
      return resolvedReferences.error;
    }
    const audioUrl = params.audioUrl as string | undefined;
    const rawPrompt = String(params.prompt ?? '');
    const scopedPrompt = this.scopeService
      ? await this.scopeService.applySelectedContext({
          ctx,
          params,
          prompt: rawPrompt,
        })
      : { prompt: rawPrompt, receipt: undefined };
    if ('error' in scopedPrompt) {
      return scopedPrompt.error;
    }
    const prompt = scopedPrompt.prompt;
    const body = this.buildVideoBody({
      audioUrl,
      ctx,
      dimensions,
      duration:
        ctx.generationSettings?.duration ||
        (params.duration as number) ||
        DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
      endFrame:
        typeof params.endFrame === 'string' ? params.endFrame : undefined,
      extraReferences: resolvedReferences.references,
      imageUrl,
      model: requestedModel,
      prompt,
      resolution:
        typeof params.resolution === 'string' ? params.resolution : undefined,
      videoReferences: readMediaReferenceStrings(params.videoReferences, 10),
    });
    const promptPreview = rawPrompt.substring(0, 80);
    let response: Record<string, unknown>;
    if (typeof params.harness === 'boolean') body.harness = params.harness;
    try {
      response = toMediaResponseRecord(
        await this.generationGateway.generateVideo({
          body,
          ...(prompt !== rawPrompt ? { originalPrompt: rawPrompt } : {}),
          principal: this.toPrincipal(ctx),
        }),
      );
    } catch (error) {
      const message = (error as Error).message || 'Video generation failed';
      this.loggerService.warn(
        `generateVideo failed for org=${ctx.organizationId}: ${message}`,
      );
      return this.buildMediaGenerationIncompleteResult({
        assetKind: 'video',
        error: message,
        promptPreview,
        status: Status.PROCESSING,
      });
    }
    const id = readMediaResponseString(response, 'id');
    const cdnUrl = readMediaAssetUrl(
      response,
      this.configService.ingredientsEndpoint,
    );

    if (!id) {
      const error = 'Video generation returned no asset id.';
      this.loggerService.warn(
        `generateVideo returned no asset for org=${ctx.organizationId}`,
      );
      return this.buildMediaGenerationIncompleteResult({
        assetKind: 'video',
        error,
        promptPreview,
        status: Status.PROCESSING,
      });
    }

    if (id && cdnUrl) {
      // Fire-and-forget quality scoring must not delay the generation result.
      this.scoreAsset(id, 'video', ctx.organizationId);
      await this.onboardingHandler.completeJourneyMission(
        ctx,
        'generate_first_video',
      );
    }
    const onboardingNextActions = cdnUrl
      ? (await this.onboardingHandler.checkOnboardingStatus(ctx)).nextActions
      : undefined;
    const status = cdnUrl ? Status.GENERATED : Status.PROCESSING;

    return this.withGenerationReceipt(
      {
        creditsUsed: 0,
        data: buildMediaAssetData(id, status, cdnUrl),
        isBillingDelegated: true,
        nextActions: [
          {
            ctas: [
              {
                href: createLibraryAssetRoute(IngredientCategory.VIDEO, id),
                label: 'View in Library',
              },
            ],
            assetId: id,
            assetKind: 'video',
            description: `Video ${cdnUrl ? 'generated' : 'is generating'} from: "${promptPreview}"`,
            id: `video-gen-${id}`,
            status: cdnUrl ? 'completed' : 'processing',
            title: cdnUrl ? 'Video generated' : 'Video generating',
            type: 'content_preview_card',
            videos: cdnUrl ? [cdnUrl] : [],
          },
          ...(onboardingNextActions ?? []),
        ],
        success: true,
      },
      scopedPrompt.receipt,
      'video',
      response,
    );
  }

  async generateMusic(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const resolvedContext = await this.resolveMediaBrandContext(params, ctx);
    if ('error' in resolvedContext) {
      return resolvedContext.error;
    }
    ctx = resolvedContext.context;
    const response = toMediaResponseRecord(
      await this.generationGateway.generateMusic({
        body: {
          autoSelectModel: true,
          duration: (params.duration as number) || 10,
          text: params.text as string,
          waitForCompletion: true,
          ...(ctx.runId ? { workflowExecutionId: ctx.runId } : {}),
          ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
        },
        principal: this.toPrincipal(ctx),
      }),
    );
    return this.buildSimpleAssetResult({
      billingDelegated: true,
      description: `Music generated from: "${(params.text as string).substring(0, 80)}"`,
      endpoint: 'music',
      mediaKey: 'audio',
      response,
      title: 'Music generated',
    });
  }

  async generateVoice(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const resolvedContext = await this.resolveMediaBrandContext(params, ctx);
    if ('error' in resolvedContext) {
      return resolvedContext.error;
    }
    ctx = resolvedContext.context;
    const response = toMediaResponseRecord(
      await this.generationGateway.generateVoice({
        body: {
          text: params.text as string,
          voiceId: params.voiceId as string,
          waitForCompletion: false,
          ...(ctx.sourceActionId ? { sourceActionId: ctx.sourceActionId } : {}),
        },
        principal: this.toPrincipal(ctx),
      }),
    );
    const id = readMediaResponseString(response, 'id');
    const cdnUrl =
      readMediaResponseString(response, 'audioUrl') ??
      readMediaAssetUrl(response, this.configService.ingredientsEndpoint);

    const status = cdnUrl ? Status.GENERATED : Status.PROCESSING;
    return {
      creditsUsed: 0,
      data: id ? buildMediaAssetData(id, status, cdnUrl) : { status },
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              assetId: id,
              assetKind: 'voice',
              audio: cdnUrl ? [cdnUrl] : [],
              ctas: [
                {
                  href: createLibraryAssetRoute(IngredientCategory.VOICE, id),
                  label: 'View in Library',
                },
              ],
              description: `Speech ${cdnUrl ? 'generated' : 'is generating'}: "${(params.text as string).substring(0, 80)}"`,
              id: `voice-gen-${id}`,
              status: cdnUrl ? 'completed' : 'processing',
              title: cdnUrl ? 'Voice generated' : 'Voice generating',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: Boolean(id),
    };
  }

  async generateAsIdentity(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const text = params.text as string;
    if (!text) {
      return { creditsUsed: 0, error: 'text is required', success: false };
    }
    const response = toMediaResponseRecord(
      await this.generationGateway.generateAvatarVideo({
        body: { text, useIdentity: true },
        principal: this.toPrincipal(ctx),
      }),
    );
    const id = readMediaResponseString(response, 'id');

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
              assetId: id,
              assetKind: 'video',
              ctas: [
                {
                  href: createLibraryAssetRoute(IngredientCategory.VIDEO, id),
                  label: 'View in Library',
                },
              ],
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

  private buildVideoBody(params: {
    audioUrl?: string;
    ctx: ToolExecutionContext;
    dimensions: { height: number; width: number };
    duration: number;
    endFrame?: string;
    extraReferences?: string[];
    imageUrl?: string;
    model?: string;
    prompt: string;
    resolution?: string;
    videoReferences?: string[];
  }): Record<string, unknown> {
    const body: Record<string, unknown> = {
      duration: params.duration,
      height: params.dimensions.height,
      prompt: params.prompt,
      text: params.prompt,
      waitForCompletion: false,
      width: params.dimensions.width,
      ...(params.ctx.brandId ? { brandId: params.ctx.brandId } : {}),
      ...(params.ctx.runId ? { workflowExecutionId: params.ctx.runId } : {}),
      ...(params.ctx.sourceActionId
        ? { sourceActionId: params.ctx.sourceActionId }
        : {}),
      ...(params.ctx.strategyId
        ? { agentStrategyId: params.ctx.strategyId }
        : {}),
      ...(params.endFrame ? { endFrame: params.endFrame } : {}),
      ...(params.resolution ? { resolution: params.resolution } : {}),
      ...(params.videoReferences && params.videoReferences.length > 0
        ? { videoReferences: params.videoReferences }
        : {}),
    };
    if (params.audioUrl && params.imageUrl) {
      // Avatar mode is selected only for the paired image + audio payload.
      body.model = 'kwaivgi/kling-avatar-v2';
      body.audioUrl = params.audioUrl;
      body.references = [params.imageUrl];
    } else if (params.model) {
      body.model = params.model;
      if (params.imageUrl) body.references = [params.imageUrl];
    } else {
      body.autoSelectModel = true;
      body.prioritize = params.ctx.generationPriority || RouterPriority.QUALITY;
      if (params.imageUrl) body.references = [params.imageUrl];
    }
    if (params.extraReferences && params.extraReferences.length > 0) {
      const existing = Array.isArray(body.references)
        ? (body.references as string[])
        : [];
      const seen = new Set(existing);
      const merged = [...existing];
      for (const reference of params.extraReferences) {
        if (seen.has(reference)) {
          continue;
        }
        seen.add(reference);
        merged.push(reference);
      }
      body.references = merged;
    }
    return body;
  }

  private buildSimpleAssetResult(params: {
    assetUrl?: string;
    billingDelegated: boolean;
    description: string;
    endpoint: 'image' | 'music' | 'voice';
    id?: string;
    idPrefix?: string;
    mediaKey: 'audio' | 'images';
    response: Record<string, unknown>;
    title: string;
  }): AgentToolResult {
    const id = params.id ?? readMediaResponseString(params.response, 'id');
    const assetUrl =
      params.assetUrl ??
      readMediaAssetUrl(
        params.response,
        this.configService.ingredientsEndpoint,
      );
    return {
      creditsUsed: 0,
      data: id
        ? buildMediaAssetData(id, Status.GENERATED, assetUrl)
        : { status: Status.GENERATED },
      ...(params.billingDelegated ? { isBillingDelegated: true } : {}),
      nextActions: id
        ? [
            {
              ctas: [
                {
                  href: createLibraryAssetRoute(
                    mediaAssetLibraryCategory(params.endpoint),
                    id,
                  ),
                  label: 'View in Library',
                },
              ],
              description: params.description,
              id: `${params.idPrefix ?? `${params.endpoint}-gen`}-${id}`,
              [params.mediaKey]: assetUrl ? [assetUrl] : [],
              title: params.title,
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  /** Never mint an empty content preview for incomplete media generation. */
  private buildMediaGenerationIncompleteResult(params: {
    assetKind: 'image' | 'video';
    assetId?: string;
    error: string;
    promptPreview: string;
    status: string;
  }): AgentToolResult {
    const assetLabel = params.assetKind === 'video' ? 'Video' : 'Image';
    const category =
      params.assetKind === 'video'
        ? IngredientCategory.VIDEO
        : IngredientCategory.IMAGE;

    return {
      creditsUsed: 0,
      data: {
        ...(params.assetId ? { id: params.assetId } : {}),
        status: params.status,
      },
      error: params.error,
      isBillingDelegated: true,
      nextActions: [
        {
          ...(params.assetId
            ? { assetId: params.assetId, assetKind: params.assetKind }
            : {}),
          id: `${params.assetKind}-gen-incomplete-${Date.now()}`,
          primaryCta: params.assetId
            ? {
                href: createLibraryAssetRoute(category, params.assetId),
                label: 'View in Library',
              }
            : { href: '/library/assets', label: 'Open Library' },
          status: 'failed',
          summaryText: `${assetLabel} was not ready: "${params.promptPreview}". ${params.error}`,
          title: `${assetLabel} not ready`,
          type: 'completion_summary_card',
        },
      ],
      success: false,
    };
  }

  private withGenerationReceipt(
    result: AgentToolResult,
    receipt:
      | { brandId: string; isPersisted: false; sources: unknown[] }
      | undefined,
    kind: 'image' | 'video',
    response: Record<string, unknown>,
  ): AgentToolResult {
    return {
      ...result,
      data: {
        ...(result.data ?? {}),
        kind,
        generationHarness: readMediaResponseValue(
          response,
          'generationHarness',
        ),
        ...(receipt ? { contextReceipt: receipt } : {}),
      },
    };
  }

  private scoreAsset(
    id: string,
    type: 'image' | 'video',
    organizationId: string,
  ): void {
    this.contentQualityScorerService
      ?.scoreAndTag(id, type, { organizationId })
      .catch((error) =>
        this.loggerService.error(
          `Auto quality check failed for ${type}`,
          error,
        ),
      );
  }
}

function buildMediaAssetData(
  id: string,
  status: Status,
  url?: string,
): Record<string, unknown> {
  return url ? { id, status, url } : { id, status };
}

function mediaAssetLibraryCategory(
  endpoint: 'image' | 'music' | 'voice',
): IngredientCategory {
  switch (endpoint) {
    case 'music':
      return IngredientCategory.MUSIC;
    case 'voice':
      return IngredientCategory.VOICE;
    default:
      return IngredientCategory.IMAGE;
  }
}
