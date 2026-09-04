import { PersonasService } from '@api/collections/personas/services/personas.service';
import { IMAGE_GENERATION_RESULT_ERROR } from '@api/services/agent-orchestrator/agent-image-generation-result.constant';
import {
  AGENT_GENERATION_GATEWAY,
  type AgentGenerationPrincipal,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import {
  readMediaAssetUrl,
  readMediaResponseString,
  readUsableCdnAssetUrl,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import {
  IngredientCategory,
  RouterPriority,
  Status,
} from '@genfeedai/contracts';
import {
  createLibraryAssetRoute,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class AgentMediaAssetGenerationService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
    private readonly onboardingHandler: AgentOnboardingToolHandler,
    @Optional()
    private readonly contentQualityScorerService?: ContentQualityScorerService,
    @Optional()
    private readonly harnessGenerationService?: HarnessGenerationService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
    @Optional()
    private readonly personasService?: PersonasService,
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

  private readStringArray(value: unknown, max: number): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, max);
  }

  private capReferences(references: string[], modelKey?: string): string[] {
    const catalogLimit =
      modelKey && modelKey in MODEL_OUTPUT_CAPABILITIES
        ? MODEL_OUTPUT_CAPABILITIES[
            modelKey as keyof typeof MODEL_OUTPUT_CAPABILITIES
          ].maxReferences
        : undefined;
    const cap =
      typeof catalogLimit === 'number' && catalogLimit > 0
        ? Math.min(8, catalogLimit)
        : 8;
    return references.slice(0, cap);
  }

  async resolveGenerationReferences(params: {
    attachmentFallback?: string;
    ctx: ToolExecutionContext;
    explicitReferences?: unknown;
    handles?: unknown;
    modelKey?: string;
  }): Promise<{ error?: AgentToolResult; references: string[] }> {
    const handles = this.readStringArray(params.handles, 4);
    const explicit = this.readStringArray(params.explicitReferences, 8);
    const unresolved: string[] = [];
    const resolved: string[] = [];

    if (handles.length > 0) {
      if (!this.personasService) {
        return {
          error: {
            creditsUsed: 0,
            error: `Unresolved character handles: ${handles.join(', ')}`,
            success: false,
          },
          references: [],
        };
      }
      const characters = await this.personasService.listCharacterMentions({
        brandId: params.ctx.brandId,
        organizationId: params.ctx.organizationId,
      });
      const byHandle = new Map(
        characters.map((character) => [character.handle, character]),
      );
      for (const handle of handles) {
        const character = byHandle.get(handle.toLowerCase());
        if (!character?.avatarIngredientId) {
          unresolved.push(handle);
          continue;
        }
        resolved.push(character.avatarIngredientId);
      }
    }

    if (unresolved.length > 0) {
      return {
        error: {
          creditsUsed: 0,
          data: { unresolvedHandles: unresolved },
          error: `Unresolved character handles: ${unresolved.join(', ')}`,
          success: false,
        },
        references: [],
      };
    }

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [
      ...resolved,
      ...explicit,
      ...(params.attachmentFallback ? [params.attachmentFallback] : []),
    ]) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      merged.push(id);
    }

    return { references: this.capReferences(merged, params.modelKey) };
  }

  async generateImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
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
    const dimensions = this.aspectRatioToDimensions(
      ctx.generationSettings?.aspectRatio ||
        (params.aspectRatio as string) ||
        '1:1',
    );
    const promptPreview = rawPrompt.substring(0, 80);
    const imageUrl =
      (params.imageUrl as string | undefined) || ctx.attachmentUrls?.[0];
    const resolvedReferences = await this.resolveGenerationReferences({
      attachmentFallback: imageUrl,
      ctx,
      explicitReferences: params.references,
      handles: params.characterHandles,
      modelKey:
        ctx.generationSettings?.model ??
        (typeof params.model === 'string' ? params.model : undefined) ??
        ctx.generationModelOverride ??
        undefined,
    });
    if (resolvedReferences.error) {
      return resolvedReferences.error;
    }
    const rawRequestedOutputs =
      ctx.generationSettings?.outputs ?? params.outputs;
    const requestedOutputs =
      typeof rawRequestedOutputs === 'number' &&
      Number.isFinite(rawRequestedOutputs)
        ? Math.min(8, Math.max(1, Math.round(rawRequestedOutputs)))
        : undefined;
    const body: Record<string, unknown> = {
      height: dimensions.height,
      prompt,
      text: prompt,
      waitForCompletion: false,
      width: dimensions.width,
      ...(requestedOutputs ? { outputs: requestedOutputs } : {}),
      ...(ctx.brandId ? { brandId: ctx.brandId } : {}),
      ...(ctx.runId ? { workflowExecutionId: ctx.runId } : {}),
      ...(ctx.sourceActionId ? { sourceActionId: ctx.sourceActionId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
      ...(resolvedReferences.references.length > 0
        ? { references: resolvedReferences.references }
        : {}),
    };

    const requestedModel =
      ctx.generationSettings?.model ??
      (typeof params.model === 'string' && params.model.trim().length > 0
        ? params.model.trim()
        : ctx.generationModelOverride);
    if (requestedModel) {
      body.model = requestedModel;
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || RouterPriority.QUALITY;
    }

    let response: Record<string, unknown>;
    try {
      response = toMediaResponseRecord(
        await this.generationGateway.generateImage({
          body,
          principal: this.toPrincipal(ctx),
        }),
      );
    } catch (error) {
      // Timeout/hard failure must not produce a successful empty preview card.
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
      return this.buildImageGenerationIncompleteResult({
        error: IMAGE_GENERATION_RESULT_ERROR.MISSING_ASSET_ID,
        promptPreview,
        status: Status.PROCESSING,
      });
    }

    if (!cdnUrl && responseStatus !== Status.PROCESSING) {
      this.loggerService.warn(
        `generateImage returned no usable CDN asset for org=${ctx.organizationId} id=${id}`,
      );
      return this.buildImageGenerationIncompleteResult({
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
    const status = cdnUrl ? Status.GENERATED : Status.PROCESSING;

    return {
      creditsUsed: 0,
      data: buildMediaAssetData(id, status, cdnUrl),
      isBillingDelegated: true,
      nextActions: [
        {
          ctas: [{ href: '/library/assets', label: 'View in Library' }],
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
    const aspectRatio = String(params.aspectRatio || '1:1');
    const dimensions = this.aspectRatioToDimensions(aspectRatio);
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
              ctas: [{ href: '/library/assets', label: 'View in Library' }],
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
    const requestedModel =
      ctx.generationSettings?.model ??
      (typeof params.model === 'string' && params.model.trim().length > 0
        ? params.model.trim()
        : (ctx.generationModelOverride ?? undefined));
    const dimensions = this.aspectRatioToDimensions(
      ctx.generationSettings?.aspectRatio ||
        (params.aspectRatio as string) ||
        '16:9',
    );
    const imageUrl =
      (params.imageUrl as string | undefined) || ctx.attachmentUrls?.[0];
    const resolvedReferences = await this.resolveGenerationReferences({
      ctx,
      explicitReferences: params.references,
      handles: params.characterHandles,
      modelKey: requestedModel,
    });
    if (resolvedReferences.error) {
      return resolvedReferences.error;
    }
    const audioUrl = params.audioUrl as string | undefined;
    const rawPrompt = String(params.prompt ?? '');
    const prompt = await this.applyBrandHarnessToPrompt({
      contentType: 'video',
      ctx,
      prompt: rawPrompt,
      topic: rawPrompt.slice(0, 120),
    });
    const body = this.buildVideoBody({
      audioUrl,
      ctx,
      dimensions,
      duration:
        ctx.generationSettings?.duration || (params.duration as number) || 10,
      endFrame:
        typeof params.endFrame === 'string' ? params.endFrame : undefined,
      extraReferences: resolvedReferences.references,
      imageUrl,
      model: requestedModel,
      prompt,
      resolution:
        typeof params.resolution === 'string' ? params.resolution : undefined,
      videoReferences: this.readStringArray(params.videoReferences, 10),
    });
    const response = toMediaResponseRecord(
      await this.generationGateway.generateVideo({
        body,
        principal: this.toPrincipal(ctx),
      }),
    );
    const id = readMediaResponseString(response, 'id');
    const cdnUrl = readMediaAssetUrl(
      response,
      this.configService.ingredientsEndpoint,
    );

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

    return {
      creditsUsed: 0,
      data: buildMediaAssetData(id, status, cdnUrl),
      isBillingDelegated: true,
      nextActions: id
        ? [
            {
              ctas: [{ href: '/library/assets', label: 'View in Library' }],
              assetId: id,
              assetKind: 'video',
              description: `Video ${cdnUrl ? 'generated' : 'is generating'} from: "${(params.prompt as string).substring(0, 80)}"`,
              id: `video-gen-${id}`,
              status: cdnUrl ? 'completed' : 'processing',
              title: cdnUrl ? 'Video generated' : 'Video generating',
              type: 'content_preview_card',
              videos: cdnUrl ? [cdnUrl] : [],
            },
            ...(onboardingNextActions ?? []),
          ]
        : [],
      success: true,
    };
  }

  async generateMusic(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
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
              ctas: [{ href: '/library/videos', label: 'View in Library' }],
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

  /** Never mint an empty content preview for incomplete image generation. */
  private buildImageGenerationIncompleteResult(params: {
    assetId?: string;
    error: string;
    promptPreview: string;
    status: string;
  }): AgentToolResult {
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
            ? { assetId: params.assetId, assetKind: 'image' as const }
            : {}),
          id: `image-gen-incomplete-${Date.now()}`,
          primaryCta: params.assetId
            ? {
                href: '/library/assets',
                label: 'View in Library',
              }
            : { href: '/library/assets', label: 'Open Library' },
          status: 'failed',
          summaryText: `Image was not ready: "${params.promptPreview}". ${params.error}`,
          title: 'Image not ready',
          type: 'completion_summary_card',
        },
      ],
      success: false,
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

  private aspectRatioToDimensions(ratio: string): {
    height: number;
    width: number;
  } {
    const map: Record<string, { height: number; width: number }> = {
      '1:1': { height: 1024, width: 1024 },
      '3:4': { height: 1365, width: 1024 },
      '4:3': { height: 768, width: 1024 },
      '9:16': { height: 1024, width: 576 },
      '16:9': { height: 576, width: 1024 },
    };
    return map[ratio] || map['1:1'];
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
