import { KnowledgeSelectionDto } from '@api/collections/contexts/dto/knowledge-selection.dto';
import {
  IsEntityId,
  isEntityId,
} from '@api/helpers/validation/entity-id.validator';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import type {
  CrunImageQuoteControls,
  CrunImageQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
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

export class CrunImageQuoteControlsDto implements CrunImageQuoteControls {
  @IsString() @MinLength(1) @MaxLength(128) contractVersion!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  aspectRatio?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['1K', '2K', '4K'])
  resolution?: '1K' | '2K' | '4K';
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['png', 'jpg'])
  outputFormat?: 'png' | 'jpg';
}

export class CreateCrunImageQuoteDto implements CrunImageQuoteRequest {
  @IsString()
  @IsIn(['crun/google/nano-banana-pro', 'crun/bytedance/seedream-4-5'])
  model!: string;
  @IsString() @MinLength(1) @MaxLength(20000) text!: string;
  @IsObject()
  @ValidateNested()
  @Type(() => CrunImageQuoteControlsDto)
  crunControls!: CrunImageQuoteControlsDto;
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
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(14)
  @IsEntityId({ each: true })
  references?: string[];
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

const entityId = z.string().refine(isEntityId);
const context = z
  .string()
  .trim()
  .max(256)
  .transform((value) => value || undefined)
  .optional();
export const crunImageQuoteIntentSchema = z
  .object({
    model: z.enum([
      'crun/google/nano-banana-pro',
      'crun/bytedance/seedream-4-5',
    ]),
    text: z.string().trim().min(1).max(20000),
    brandId: entityId.optional(),
    folderId: entityId.optional(),
    promptId: entityId.optional(),
    references: z
      .array(entityId)
      .max(14)
      .default([])
      .refine((values) => new Set(values).size === values.length),
    outputs: z.number().int().min(1).max(4).default(1),
    crunControls: z
      .object({
        contractVersion: z.string().min(1).max(128),
        aspectRatio: z.string().optional(),
        resolution: z.enum(['1K', '2K', '4K']).optional(),
        outputFormat: z.enum(['png', 'jpg']).optional(),
      })
      .strict(),
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
  })
  .strict()
  .superRefine((value, ctx) => {
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
  })
  .transform((value) => ({
    ...value,
    crunControls: {
      ...value.crunControls,
      aspectRatio:
        value.crunControls.aspectRatio ??
        (value.model === 'crun/bytedance/seedream-4-5' ? '16:9' : '1:1'),
      resolution:
        value.crunControls.resolution ??
        (value.model === 'crun/bytedance/seedream-4-5' ? '2K' : '1K'),
      ...(value.model === 'crun/google/nano-banana-pro'
        ? { outputFormat: value.crunControls.outputFormat ?? 'png' }
        : {}),
    },
    isBrandingEnabled:
      (value.brandingMode ?? (value.isBrandingEnabled ? 'brand' : 'off')) ===
      'brand',
    knowledge:
      value.knowledge &&
      Object.values(value.knowledge).some(
        (values) => values && values.length > 0,
      )
        ? value.knowledge
        : undefined,
    brandingMode:
      value.brandingMode ?? (value.isBrandingEnabled ? 'brand' : 'off'),
  }));
export type CrunImageQuoteIntent = z.infer<typeof crunImageQuoteIntentSchema>;
