import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import {
  remixAvatarAspectRatio,
  remixDimensions,
  remixErrorMessage,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import type { RemixCreditsRequest } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  ContentIntelligencePlatform,
  ContentRunStatus,
} from '@genfeedai/contracts';
import {
  type BrandRemixDraft,
  type BrandRemixExecution,
  type BrandRemixRunConfig,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { ImageGenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  AVATAR_GENERATION_CREDIT_COST,
  sourcePostVariationCredits,
} from '@genfeedai/contracts/constants';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixRunProviderDispatchService {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly videoGenerationService: VideoGenerationService,
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly state: BrandRemixRunStateService,
  ) {}

  async dispatchVariant(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    onPlaceholderCreated: GenerationPlaceholderCreatedCallback;
    onCreditsPrepared: () => Promise<void>;
    placeholderScope: GenerationPlaceholderScope;
    request: Request;
    user: User;
  }): Promise<string> {
    const draft = params.config.draft;
    if (draft.output.kind === 'copy') {
      throw new ConflictException(
        'Copy variants use the text generation path.',
      );
    }
    const references = draft.references.map((reference) => reference.assetId);
    const runReferences = params.config.execution?.generationBrief.references;
    if (!runReferences) {
      throw new ConflictException(
        'Canonical generation references are missing.',
      );
    }
    const imageRunReferences: ImageGenerationBriefReference[] =
      runReferences.flatMap((reference) =>
        reference.role === 'first_frame' ||
        reference.role === 'last_frame' ||
        reference.role === 'reference_video'
          ? []
          : [{ ...reference, role: reference.role }],
      );
    const dimensions = remixDimensions(draft.output.aspectRatio);
    const prompt = this.compileProviderPrompt(params.config);

    if (draft.output.kind === 'image') {
      const response = await this.imageGenerationService.generateImage(
        params.user,
        {
          brandId: params.brandId,
          brandingMode: 'brand',
          fidelityMode: draft.fidelityMode,
          height: dimensions.height,
          isBrandingEnabled: true,
          outputs: 1,
          references,
          style: draft.intent.visualDirection,
          text: prompt,
          waitForCompletion: false,
          width: dimensions.width,
        } as CreateImageDto,
        params.request,
        params.onPlaceholderCreated,
        params.placeholderScope,
        params.onCreditsPrepared,
        imageRunReferences,
      );
      return this.generatedAssetId(response);
    }

    if (draft.output.kind === 'video') {
      const response = await this.videoGenerationService.generateVideo(
        params.user,
        {
          brandId: params.brandId,
          brandingMode: 'brand',
          duration:
            ('durationSeconds' in draft.output &&
              draft.output.durationSeconds) ||
            8,
          fidelityMode: draft.fidelityMode,
          height: dimensions.height,
          isBrandingEnabled: true,
          outputs: 1,
          references,
          style: draft.intent.visualDirection,
          text: prompt,
          width: dimensions.width,
        } as CreateVideoDto,
        params.request,
        params.onPlaceholderCreated,
        params.placeholderScope,
        params.onCreditsPrepared,
        runReferences,
      );
      return this.generatedAssetId(response);
    }

    if (!('avatarAssetId' in draft.identity)) {
      throw new ConflictException('Avatar identity is not configured.');
    }
    const result = await this.avatarVideoGenerationService.generateAvatarVideo(
      {
        aspectRatio: remixAvatarAspectRatio(draft.output.aspectRatio),
        clonedVoiceId: draft.identity.speechVoiceId,
        photoIngredientId: draft.identity.avatarAssetId,
        text: this.compileAvatarSpeech(params.config),
      },
      {
        brandId: params.brandId,
        organizationId: params.user.organizationId,
        userId: params.user.userId ?? params.user.id,
      },
      params.onPlaceholderCreated,
      params.placeholderScope,
      params.onCreditsPrepared,
    );
    return result.ingredientId;
  }

  compileAvatarSpeech(config: BrandRemixRunConfig): string {
    const speech = config.draft.intent.objective.trim();
    if (!speech) {
      throw new ConflictException('Avatar spoken script is missing.');
    }
    return speech;
  }

  compileProviderPrompt(config: BrandRemixRunConfig): string {
    const brief = config.execution?.generationBrief;
    if (!brief) {
      throw new ConflictException('Canonical generation brief is missing.');
    }

    const lines = [
      `Objective: ${brief.intent.objective}`,
      brief.intent.subjects.length
        ? `Brand subjects: ${brief.intent.subjects.join(', ')}`
        : undefined,
      brief.intent.composition
        ? `Composition: ${brief.intent.composition}`
        : undefined,
      brief.intent.scene ? `Scene: ${brief.intent.scene}` : undefined,
      brief.intent.lighting ? `Lighting: ${brief.intent.lighting}` : undefined,
      brief.intent.visualDirection
        ? `Visual direction: ${brief.intent.visualDirection}`
        : undefined,
      brief.intent.requestedText.length
        ? `Requested on-creative text: ${brief.intent.requestedText.join(' | ')}`
        : undefined,
      ...brief.references.map(
        (reference, index) =>
          `Reference ${index + 1} role: ${reference.role}${reference.description ? `. Purpose: ${reference.description}` : ''}`,
      ),
      ...brief.constraints.map(
        (constraint) =>
          `${constraint.required ? 'Required' : 'Optional'} ${constraint.kind.replaceAll('_', ' ')} constraint: ${constraint.value}`,
      ),
      brief.output.aspectRatio
        ? `Output aspect ratio: ${brief.output.aspectRatio}`
        : undefined,
      brief.output.width && brief.output.height
        ? `Output dimensions: ${brief.output.width}x${brief.output.height}`
        : undefined,
      brief.mediaKind === 'video' && brief.output.durationSeconds
        ? `Maximum duration: ${brief.output.durationSeconds} seconds`
        : undefined,
      brief.mediaKind === 'video' && brief.intent.motion
        ? `Motion: ${brief.intent.motion}`
        : undefined,
      brief.mediaKind === 'video' && brief.intent.cinematography
        ? `Cinematography: ${brief.intent.cinematography}`
        : undefined,
      brief.mediaKind === 'video' && brief.intent.audioDirection
        ? `Audio direction: ${brief.intent.audioDirection}`
        : undefined,
      config.draft.output.kind === 'avatar'
        ? 'Identity: use the selected saved brand avatar and saved brand voice.'
        : undefined,
    ].filter((line): line is string => Boolean(line));

    return lines.join('\n');
  }

  resolveVariantCredits(params: {
    avatarByokBypass: boolean;
    config: BrandRemixRunConfig;
    request: Request;
    variant: BrandRemixExecution['variants'][number];
  }): {
    amount: number;
    isByokBypass: boolean;
    variantId: string;
  } {
    const requested = (params.request as RemixCreditsRequest).creditsConfig;
    if (params.config.draft.output.kind === 'copy') {
      return {
        amount: sourcePostVariationCredits(1),
        isByokBypass: false,
        variantId: params.variant.id,
      };
    }
    if (params.config.draft.output.kind === 'avatar') {
      const amount =
        typeof requested?.amount === 'number' &&
        Number.isFinite(requested.amount) &&
        requested.amount > 0
          ? requested.amount
          : AVATAR_GENERATION_CREDIT_COST;
      return {
        amount: params.avatarByokBypass ? 0 : amount,
        isByokBypass: params.avatarByokBypass,
        variantId: params.variant.id,
      };
    }
    const amount =
      typeof requested?.amount === 'number' && Number.isFinite(requested.amount)
        ? requested.amount
        : 0;
    const isByokBypass = requested?.isByokBypass === true;
    return {
      amount: isByokBypass ? 0 : amount,
      isByokBypass,
      variantId: params.variant.id,
    };
  }

  async generateOneCopyVariant(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    seen: Set<string>;
    variant: BrandRemixExecution['variants'][number];
  }): Promise<{ config: BrandRemixRunConfig; succeeded: boolean }> {
    await this.state.patchGeneratingVariant({
      organizationId: params.organizationId,
      patch: { error: undefined, status: 'processing' },
      recipeRevision: params.variant.recipeRevision,
      runId: params.runId,
      status: ContentRunStatus.RUNNING,
      variantId: params.variant.id,
    });
    let succeeded = false;
    try {
      const generated = await this.contentGeneratorService.generateContent(
        params.organizationId,
        {
          additionalContext: [
            `Source pattern: ${JSON.stringify(params.config.sourceSnapshot.pattern)}`,
            `Target platform: ${params.config.draft.target.platform}`,
            'Create original brand-owned copy. Never quote, name, or closely paraphrase the source.',
          ],
          brandId: params.brandId,
          platform: this.contentIntelligencePlatform(
            params.config.draft.target.platform,
          ),
          topic: this.compileProviderPrompt(params.config),
          variationsCount: 1,
        },
      );
      const content = generated[0]?.content.trim();
      if (!content || params.seen.has(content)) {
        throw new ConflictException(
          'The content engine returned no distinct usable copy.',
        );
      }
      params.seen.add(content);
      succeeded = true;
      return {
        config: await this.state.patchGeneratingVariant({
          organizationId: params.organizationId,
          patch: { content, error: undefined, status: 'ready' },
          recipeRevision: params.variant.recipeRevision,
          runId: params.runId,
          status: ContentRunStatus.RUNNING,
          variantId: params.variant.id,
        }),
        succeeded,
      };
    } catch (error: unknown) {
      return {
        config: await this.state.patchGeneratingVariant({
          organizationId: params.organizationId,
          patch: {
            content: undefined,
            error: remixErrorMessage(error),
            status: 'failed',
          },
          recipeRevision: params.variant.recipeRevision,
          runId: params.runId,
          status: ContentRunStatus.RUNNING,
          variantId: params.variant.id,
        }),
        succeeded,
      };
    }
  }

  private generatedAssetId(response: JsonApiSingleResponse): string {
    const id = response.data?.id;
    if (!id) {
      throw new ConflictException(
        'Generation did not return a durable Ingredient ID.',
      );
    }
    return id;
  }

  private contentIntelligencePlatform(
    platform: BrandRemixDraft['target']['platform'],
  ): ContentIntelligencePlatform {
    return platform === 'tiktok'
      ? ContentIntelligencePlatform.TIKTOK
      : ContentIntelligencePlatform.INSTAGRAM;
  }
}
