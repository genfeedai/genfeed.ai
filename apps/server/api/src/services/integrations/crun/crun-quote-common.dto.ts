import { KnowledgeSelectionDto } from '@api/collections/contexts/dto/knowledge-selection.dto';
import {
  IsEntityId,
  isEntityId,
} from '@api/helpers/validation/entity-id.validator';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { z } from 'zod';

/**
 * Validation shared by the Crun image and video quote requests: everything
 * that does not depend on the media kind. Per-kind DTOs keep their model
 * list, text limit, controls and reference fields.
 */
export abstract class CrunQuoteCommonDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  brandId?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  folderId?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  promptId?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(4)
  outputs?: number;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  style?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  mood?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  camera?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  lens?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  scene?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  lighting?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  fontFamily?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(256, { each: true })
  blacklist?: string[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['off', 'brand'])
  brandingMode?: 'off' | 'brand';
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isBrandingEnabled?: boolean;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(160)
  promptTemplate?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  useTemplate?: boolean;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  harness?: boolean;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { each: true })
  requestedSkillSlugs?: string[];
  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => KnowledgeSelectionDto)
  knowledge?: KnowledgeSelectionDto;
}

export const crunQuoteEntityId = z.string().refine(isEntityId);
const context = z
  .string()
  .trim()
  .max(256)
  .transform((value) => value || undefined)
  .optional();

/** Zod fields shared by both quote intent schemas (media-kind-neutral). */
export const crunQuoteCommonShape = {
  brandId: crunQuoteEntityId.optional(),
  folderId: crunQuoteEntityId.optional(),
  promptId: crunQuoteEntityId.optional(),
  outputs: z.number().int().min(1).max(4).default(1),
  style: context,
  mood: context,
  camera: context,
  lens: context,
  scene: context,
  lighting: context,
  fontFamily: context,
  blacklist: z.array(z.string().trim().min(1).max(256)).max(50).default([]),
  brandingMode: z.enum(['off', 'brand']).optional(),
  isBrandingEnabled: z.boolean().optional(),
  promptTemplate: z.string().trim().min(1).max(160).optional(),
  useTemplate: z.boolean().default(true),
  harness: z.boolean().default(false),
  requestedSkillSlugs: z
    .array(
      z
        .string()
        .max(160)
        .regex(/^[a-z0-9][a-z0-9-]*$/i),
    )
    .max(8)
    .default([]),
  knowledge: z
    .object({
      sourceIds: z.array(z.string()).max(50).optional(),
      spaceIds: z.array(z.string()).max(50).optional(),
      purposes: z.array(z.enum(KnowledgeSourcePurpose)).optional(),
    })
    .strict()
    .optional(),
};

interface CrunQuoteCommonFields {
  brandingMode?: 'off' | 'brand';
  isBrandingEnabled?: boolean;
  knowledge?: Record<string, readonly unknown[] | undefined>;
  promptTemplate?: string;
  useTemplate: boolean;
}

export function refineCrunQuoteCommon(
  value: CrunQuoteCommonFields,
  ctx: z.RefinementCtx,
): void {
  if (
    value.brandingMode &&
    value.isBrandingEnabled !== undefined &&
    (value.brandingMode === 'brand') !== value.isBrandingEnabled
  )
    ctx.addIssue({
      code: 'custom',
      path: ['brandingMode'],
      message: 'Conflicting branding controls',
    });
  if (!value.useTemplate && value.promptTemplate)
    ctx.addIssue({
      code: 'custom',
      path: ['promptTemplate'],
      message: 'Disabled template cannot be selected',
    });
}

/** Branding and knowledge normalization applied to every parsed quote intent. */
export function finalizeCrunQuoteCommon<TValue extends CrunQuoteCommonFields>(
  value: TValue,
) {
  const brandingMode =
    value.brandingMode ?? (value.isBrandingEnabled ? 'brand' : 'off');
  return {
    isBrandingEnabled: brandingMode === 'brand',
    knowledge:
      value.knowledge &&
      Object.values(value.knowledge).some(
        (values) => values && values.length > 0,
      )
        ? value.knowledge
        : undefined,
    brandingMode,
  } as const;
}
