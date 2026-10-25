import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import {
  type AdPresetReference,
  adPresetSchema,
  adPresetSubmissionSchema,
} from '@genfeedai/contracts/api-types/contracts/ad-preset.contract';
import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { minimaxH3DispatchSchema } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  AdPresetCompileError,
  compileAdPreset,
} from '@genfeedai/contracts/constants/ad-preset-compiler';
import { BadRequestException } from '@nestjs/common';

type AdPresetSubmitInput = {
  dto: CreateVideoDto;
  ingredients: Pick<IngredientsService, 'findOne' | 'prisma'>;
  organizationId: string;
  brandId: string;
  model: string;
};

type AdPresetBriefReferenceInput = {
  createVideoDto: Pick<CreateVideoDto, 'adPreset'>;
  referenceIds: string[];
  runReferences?: readonly GenerationBriefReference[];
};

/** Positional preset images occupy reference_image_urls, never a dedicated frame field. */
export function resolveAdPresetBriefReferences(
  input: AdPresetBriefReferenceInput,
): readonly GenerationBriefReference[] | undefined {
  return input.createVideoDto.adPreset
    ? input.referenceIds.map(
        (assetId): GenerationBriefReference => ({ assetId, role: 'subject' }),
      )
    : input.runReferences;
}

/** Recompile saved templates before output admission. No reference audio preservation is promised. */
export async function compileSubmittedAdPreset(
  input: AdPresetSubmitInput,
): Promise<CreateVideoDto> {
  if (input.dto.adPreset === undefined) return input.dto;
  if (
    input.dto.endFrame ||
    input.dto.maskId != null ||
    input.dto.editMask != null
  )
    throw new BadRequestException({
      code: 'UNSUPPORTED_REFERENCE_ROLE',
      message:
        'Ad presets use positional references; dedicated end-frame and edit-mask inputs have no supported token binding.',
    });
  const images = input.dto.references ?? [];
  const ids = [
    ...images,
    ...(input.dto.videoReferences ?? []),
    ...(input.dto.audioReferences ?? []),
  ];
  if (
    !minimaxH3DispatchSchema.shape.reference_image_urls.safeParse(images)
      .success ||
    new Set(ids.map((id) => id.trim())).size !== ids.length
  )
    throw new BadRequestException({
      code: 'REFERENCE_ROLE_MISMATCH',
      message:
        'Preset reference IDs must be unique, with at most nine positional images.',
    });
  const submission = adPresetSubmissionSchema.safeParse(input.dto.adPreset);
  if (!submission.success)
    throw new BadRequestException({
      code: 'INVALID_PARAMS',
      message: 'Invalid ad preset submission.',
    });
  const row = await input.ingredients.prisma.preset.findFirst({
    where: {
      id: submission.data.presetId,
      isDeleted: false,
      isActive: true,
      category: ModelCategory.VIDEO,
      OR: [
        {
          organizationId: input.organizationId,
          OR: [{ brandId: null }, { brandId: input.brandId }],
        },
        { organizationId: null, brandId: null },
      ],
    },
    select: { config: true },
  });
  const config = row?.config;
  const preset = adPresetSchema.safeParse(
    config && typeof config === 'object' && !Array.isArray(config)
      ? config.adPreset
      : undefined,
  );
  if (!preset.success)
    throw new BadRequestException({
      code: 'INVALID_PRESET',
      message: 'Choose an active, accessible ad preset.',
    });
  const references: AdPresetReference[] = [
    ...(input.dto.references ?? []).map(
      (_id, index): AdPresetReference => ({
        token: `@Image${index + 1}`,
        kind: 'image',
      }),
    ),
    ...(input.dto.videoReferences ?? []).map(
      (_id, index): AdPresetReference => ({
        token: `@Video${index + 1}`,
        kind: 'video',
      }),
    ),
  ];
  for (const [index, id] of (input.dto.audioReferences ?? []).entries()) {
    const audio = await input.ingredients.findOne(
      {
        id,
        organizationId: input.organizationId,
        isDeleted: false,
        category: {
          in: [
            IngredientCategory.AUDIO,
            IngredientCategory.VOICE,
            IngredientCategory.MUSIC,
          ],
        },
      },
      [{ path: 'metadata', select: ['duration'] }],
    );
    references.push({
      token: `@Audio${index + 1}`,
      kind: 'audio',
      duration: audio?.metadata?.duration ?? undefined,
    });
  }
  try {
    const compiled = compileAdPreset({
      preset: preset.data,
      params: {
        ...submission.data.params,
        duration: input.dto.duration ?? submission.data.params.duration,
      },
      references,
      model: input.model,
    });
    const [horizontal, vertical] = submission.data.params.aspectRatio
      .split(':')
      .map(Number);
    return {
      ...input.dto,
      text: compiled.prompt,
      duration: compiled.duration,
      width: horizontal * 120,
      height: vertical * 120,
      // Preserve verbatim dialogue through the existing raw-prompt pipeline.
      promptId: undefined,
      harness: false,
      brandMode: 'raw',
      brandingMode: 'off',
      fidelityMode: 'off',
      isBrandingEnabled: false,
      useTemplate: false,
      requestedSkillSlugs: undefined,
      knowledge: undefined,
      camera: undefined,
      lens: undefined,
      cameraMovement: undefined,
      style: undefined,
      mood: undefined,
      scene: undefined,
      lighting: undefined,
      speech: undefined,
      blacklist: [],
      negativePrompt: undefined,
    };
  } catch (error) {
    if (error instanceof AdPresetCompileError)
      throw new BadRequestException({
        code: error.code,
        message: error.message,
      });
    throw error;
  }
}
