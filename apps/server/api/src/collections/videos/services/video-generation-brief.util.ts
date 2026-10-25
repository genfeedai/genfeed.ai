import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { TemplatesService } from '@api/collections/templates/services/templates.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { resolveAdPresetBriefReferences } from '@api/collections/videos/services/ad-preset-submit.util';
import { attachAvatarAudioToCompiledDispatch } from '@api/collections/videos/services/avatar-compiled-dispatch.util';
import { assertMinimaxH3ReferenceDurations } from '@api/collections/videos/services/minimax-h3-reference.util';
import { assertSeedanceReferenceVideoDuration } from '@api/collections/videos/services/seedance-reference-evidence.util';
import type {
  ResolvedVideoGenerationRequest,
  VideoGenerationResolvedBrand,
} from '@api/collections/videos/services/video-generation.types';
import { buildVideoDirection } from '@api/collections/videos/services/video-generation-direction.util';
import {
  brandPromptLabel,
  optionalBrandString,
} from '@api/collections/videos/services/video-generation-model.util';
import {
  resolveCompiledAudioReferences,
  resolveStoredVideoReference,
} from '@api/collections/videos/services/video-generation-reference.util';
import type { VideoReferenceUrlService } from '@api/collections/videos/services/video-reference-url.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  GenerationBriefCompileError,
  resolveGenerationBriefBrandContext,
  resolveIsGenerationBriefBrandVoiceOn,
  runVideoGenerationBrief,
} from '@api/services/generation-brief';
import { rawPromptBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import type {
  GenerationBriefReference,
  VideoGenerationBrief,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { buildVideoGenerationBriefExemptionSource } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

export interface BriefBrandContextDeps {
  loggerService: LoggerService;
  templatesService: TemplatesService;
}

export interface CompiledDispatchReferenceDeps {
  configService: ConfigService;
  filesClientService: FilesClientService;
  ingredientsService: IngredientsService;
  referenceUrls: VideoReferenceUrlService;
}

/**
 * Brand voice must reach every model, including brief-compiled ones — see
 * `resolveGenerationBriefBrandContext`. Gated solely on the Brand voice
 * setting, never on the fidelity mode `avoid` terms can also force. A
 * template-lookup failure (e.g. a database error) must never fail the
 * whole generation (#4676) — proceed without brand context instead.
 */
export async function resolveBriefBrandContext(
  brand: VideoGenerationResolvedBrand,
  createVideoDto: CreateVideoDto,
  organizationId: string,
  { loggerService, templatesService }: BriefBrandContextDeps,
): Promise<string | undefined> {
  if (
    !resolveIsGenerationBriefBrandVoiceOn({
      brandingMode: createVideoDto.brandingMode,
      isBrandingEnabled: createVideoDto.isBrandingEnabled,
    })
  ) {
    return undefined;
  }

  try {
    return await resolveGenerationBriefBrandContext({
      brand: {
        description: optionalBrandString(brand.description),
        label: brandPromptLabel(brand.label),
        text: optionalBrandString(brand.text),
      },
      branding: buildPromptBrandingFromBrand(brand),
      organizationId,
      templatesService,
    });
  } catch (error: unknown) {
    loggerService.error(
      'Failed to resolve brand context for the generation brief; proceeding without it',
      { error, organizationId },
    );
    return undefined;
  }
}

export function compileVideoGenerationBrief(params: {
  briefBrandContext?: string;
  createVideoDto: CreateVideoDto;
  height: number;
  model: string;
  generationHarness: GenerationHarnessReceipt;
  referenceIds: string[];
  runReferences?: readonly GenerationBriefReference[];
  width: number;
}): {
  brief?: VideoGenerationBrief;
  dispatch?: Record<string, unknown>;
  evidence: VideoGenerationBriefPersistedEvidence;
  generationSource: string;
} {
  const direction = buildVideoDirection(params.createVideoDto).brief;
  const avoid = [
    ...(params.createVideoDto.blacklist ?? []),
    ...(params.createVideoDto.negativePrompt
      ? [params.createVideoDto.negativePrompt]
      : []),
  ];

  try {
    const compiled = runVideoGenerationBrief({
      audioDirection: params.createVideoDto.speech,
      audioReferenceIds: params.createVideoDto.audioReferences,
      avoid,
      brandContext: params.briefBrandContext,
      brandingMode: params.createVideoDto.brandingMode,
      composition: direction.composition,
      durationSeconds: params.createVideoDto.duration,
      fidelityMode: params.createVideoDto.fidelityMode,
      endFrameId: params.createVideoDto.endFrame,
      height: params.height,
      isBrandingEnabled: params.createVideoDto.isBrandingEnabled,
      lighting: direction.lighting,
      model: params.model,
      motion: direction.motion,
      objective: params.generationHarness.enhancedPrompt,
      referenceIds: params.referenceIds,
      references: resolveAdPresetBriefReferences(params),
      resolution: params.createVideoDto.resolution,
      scene: direction.scene,
      seed: params.createVideoDto.seed,
      surface: 'studio',
      visualDirection: direction.visualDirection,
      videoReferenceIds: params.createVideoDto.videoReferences,
      width: params.width,
    });
    if (params.generationHarness.status === 'skipped') {
      compiled.evidence = {
        ...rawPromptBriefEvidence(compiled.evidence),
        actionVerb: compiled.evidence.actionVerb,
        dispatchMode: compiled.evidence.dispatchMode,
      };
      compiled.generationSource = buildVideoGenerationBriefExemptionSource(
        'raw_prompt_requested',
      );
    }
    attachAvatarAudioToCompiledDispatch(
      params.model,
      compiled.dispatch,
      params.createVideoDto.audioUrl,
    );
    return compiled;
  } catch (error: unknown) {
    if (error instanceof GenerationBriefCompileError) {
      throw new HttpException(
        {
          detail: error.message,
          title: 'Generation brief compilation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    throw error;
  }
}

export async function resolveCompiledDispatchReferenceUrls(
  deps: CompiledDispatchReferenceDeps,
  dispatch: Record<string, unknown>,
  organizationId: string,
  grantedOwners?: ReadonlyMap<string, string>,
  model?: string,
  audioReferenceUrls: ReadonlyMap<string, string> = new Map(),
): Promise<Record<string, unknown>> {
  const resolveUrl = async (
    referenceId: string,
    role: string,
  ): Promise<string> => {
    const url = await deps.referenceUrls.resolveUrl({
      grantedOwners,
      organizationId,
      referenceId,
    });
    if (!url) {
      throw new HttpException(
        {
          detail: `Could not resolve a source URL for the ${role} reference`,
          title: 'Generation brief reference resolution failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return url;
  };

  const stringFields = [
    'first_frame_image',
    'last_frame_image',
    'image',
    'image_url',
    'start_image',
    'input_reference',
    'last_frame',
    'end_image',
    'last_image',
  ] as const;
  const videoStringFields = ['reference_video'] as const;
  const arrayFields = [
    'image_urls',
    'reference_image_urls',
    'reference_images',
  ] as const;
  const videoArrayFields = [
    'reference_video_urls',
    'reference_videos',
  ] as const;

  const resolved: Record<string, unknown> = { ...dispatch };

  for (const field of stringFields) {
    const value = dispatch[field];
    if (typeof value === 'string' && value.length > 0) {
      resolved[field] = await resolveUrl(value, field);
    }
  }

  for (const field of arrayFields) {
    const value = dispatch[field];
    if (Array.isArray(value)) {
      resolved[field] = await Promise.all(
        value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => resolveUrl(entry, field)),
      );
    }
  }

  for (const field of videoStringFields) {
    const value = dispatch[field];
    if (typeof value === 'string' && value.length > 0) {
      resolved[field] = (
        await resolveStoredVideoReference(
          deps.ingredientsService,
          deps.filesClientService,
          deps.configService,
          value,
          organizationId,
          field,
        )
      ).url;
    }
  }

  for (const field of videoArrayFields) {
    const value = dispatch[field];
    if (Array.isArray(value)) {
      const references = await Promise.all(
        value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) =>
            resolveStoredVideoReference(
              deps.ingredientsService,
              deps.filesClientService,
              deps.configService,
              entry,
              organizationId,
              field,
            ),
          ),
      );
      if (model === MODEL_KEYS.REPLICATE_MINIMAX_H3) {
        assertMinimaxH3ReferenceDurations(
          references.map((reference) => reference.duration),
          'video',
        );
      }
      if (field === 'reference_videos') {
        assertSeedanceReferenceVideoDuration(
          references.map((reference) => reference.duration),
        );
      }
      resolved[field] = references.map((reference) => reference.url);
    }
  }

  const audioIds = dispatch.reference_audio_urls;
  if (Array.isArray(audioIds)) {
    resolved.reference_audio_urls = resolveCompiledAudioReferences(
      audioIds,
      audioReferenceUrls,
    );
  }
  return resolved;
}

/**
 * The brief step of preparation: brand context, compiled brief and dispatch,
 * then the dispatch's reference ids resolved to URLs.
 */
export async function prepareGenerationBrief(
  deps: BriefBrandContextDeps & CompiledDispatchReferenceDeps,
  params: {
    generationHarness: GenerationHarnessReceipt;
    height: number;
    resolved: ResolvedVideoGenerationRequest;
    runReferences?: readonly GenerationBriefReference[];
    width: number;
  },
): Promise<{
  brief?: VideoGenerationBrief;
  compiledDispatch?: Record<string, unknown>;
  evidence: VideoGenerationBriefPersistedEvidence;
  generationSource: string;
}> {
  const { brand, createVideoDto, model, referenceIds, user } = params.resolved;
  const briefBrandContext = await resolveBriefBrandContext(
    brand,
    createVideoDto,
    user.organizationId,
    deps,
  );
  const {
    brief,
    dispatch: rawCompiledDispatch,
    evidence,
    generationSource,
  } = compileVideoGenerationBrief({
    briefBrandContext,
    createVideoDto,
    generationHarness: params.generationHarness,
    height: params.height,
    model,
    referenceIds,
    runReferences: params.runReferences,
    width: params.width,
  });
  const compiledDispatch = rawCompiledDispatch
    ? await resolveCompiledDispatchReferenceUrls(
        deps,
        rawCompiledDispatch,
        user.organizationId,
        params.resolved.grantedAvatarOwners,
        model,
        params.resolved.audioReferenceUrls,
      )
    : undefined;
  return { brief, compiledDispatch, evidence, generationSource };
}

/** Every ingredient the generation draws on, each listed once. */
export function collectGenerationSourceIds(
  createVideoDto: CreateVideoDto,
  referenceIds: readonly string[],
): string[] {
  return [
    ...new Set([
      ...referenceIds,
      ...(createVideoDto.endFrame ? [createVideoDto.endFrame] : []),
      ...(createVideoDto.videoReferences ?? []),
      ...(createVideoDto.audioReferences ?? []),
    ]),
  ];
}
