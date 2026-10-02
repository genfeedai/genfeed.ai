import { KnowledgeSelectionDto } from '@api/collections/contexts/dto/knowledge-selection.dto';
import {
  IsEntityId,
  isEntityId,
} from '@api/helpers/validation/entity-id.validator';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import type {
  CrunVideoQuoteControls,
  CrunVideoQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
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

export class CrunVideoQuoteControlsDto implements CrunVideoQuoteControls {
  @IsString() @MinLength(1) @MaxLength(128) contractVersion!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  aspectRatio?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['720p', '1080p', '4k'])
  resolution?: '720p' | '1080p' | '4k';
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @IsIn([4, 5, 6, 8, 10])
  duration?: 4 | 5 | 6 | 8 | 10;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @Max(1)
  guidanceScale?: number;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  translatePrompt?: boolean;
}

export class CreateCrunVideoQuoteDto implements CrunVideoQuoteRequest {
  @IsString()
  @IsIn(['crun/kling/v2-5-turbo-pro', 'crun/google/veo3-1-fast-t2v'])
  model!: CrunVideoQuoteRequest['model'];
  @IsString() @MinLength(1) @MaxLength(5000) text!: string;
  @IsObject()
  @ValidateNested()
  @Type(() => CrunVideoQuoteControlsDto)
  crunControls!: CrunVideoQuoteControlsDto;
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
  @ArrayMaxSize(1)
  @IsEntityId({ each: true })
  references?: string[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(4)
  outputs?: number;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  endFrame?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  parentId?: string;
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
export const crunVideoQuoteIntentSchema = z
  .object({
    model: z.enum(['crun/kling/v2-5-turbo-pro', 'crun/google/veo3-1-fast-t2v']),
    text: z.string().trim().min(1).max(5000),
    brandId: entityId.optional(),
    folderId: entityId.optional(),
    promptId: entityId.optional(),
    references: z
      .array(entityId)
      .max(1)
      .default([])
      .refine((values) => new Set(values).size === values.length),
    endFrame: entityId.optional(),
    parentId: entityId.optional(),
    outputs: z.number().int().min(1).max(4).default(1),
    crunControls: z
      .object({
        contractVersion: z.string().min(1).max(128),
        aspectRatio: z.string().optional(),
        resolution: z.enum(['720p', '1080p', '4k']).optional(),
        duration: z
          .union([
            z.literal(4),
            z.literal(5),
            z.literal(6),
            z.literal(8),
            z.literal(10),
          ])
          .optional(),
        negativePrompt: z
          .string()
          .trim()
          .max(2000)
          .transform((value) => value || undefined)
          .optional(),
        guidanceScale: z.number().min(0).max(1).optional(),
        translatePrompt: z.boolean().optional(),
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
    const kling = value.model === 'crun/kling/v2-5-turbo-pro';
    const error = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    if (value.endFrame && !value.references.length)
      error('endFrame', 'End frame requires start frame');
    if (value.endFrame && value.endFrame === value.references[0])
      error('endFrame', 'Frames must be distinct');
    if (value.parentId && (!kling || value.parentId !== value.references[0]))
      error('parentId', 'Parent must be the start frame');
    if (!kling && (value.references.length || value.endFrame))
      error('references', 'Veo accepts text only');
    for (const field of kling
      ? (['resolution', 'translatePrompt'] as const)
      : (['negativePrompt', 'guidanceScale'] as const))
      if (value.crunControls[field] !== undefined)
        error(`crunControls.${field}`, 'Unsupported control');
    if (
      value.crunControls.duration !== undefined &&
      !(kling ? [5, 10] : [4, 6, 8]).includes(value.crunControls.duration)
    )
      error('crunControls.duration', 'Unsupported duration');
    if (
      value.crunControls.aspectRatio !== undefined &&
      !(kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16']).includes(
        value.crunControls.aspectRatio,
      )
    )
      error('crunControls.aspectRatio', 'Unsupported aspect ratio');
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
    crunControls:
      value.model === 'crun/kling/v2-5-turbo-pro'
        ? {
            contractVersion: value.crunControls.contractVersion,
            duration: value.crunControls.duration ?? 5,
            guidanceScale: value.crunControls.guidanceScale ?? 0.5,
            ...(value.crunControls.negativePrompt
              ? { negativePrompt: value.crunControls.negativePrompt }
              : {}),
            ...(value.references.length
              ? {}
              : { aspectRatio: value.crunControls.aspectRatio ?? '16:9' }),
          }
        : {
            contractVersion: value.crunControls.contractVersion,
            duration: value.crunControls.duration ?? 8,
            resolution: value.crunControls.resolution ?? '720p',
            aspectRatio: value.crunControls.aspectRatio ?? '16:9',
            translatePrompt: value.crunControls.translatePrompt ?? true,
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
export type CrunVideoQuoteIntent = z.infer<typeof crunVideoQuoteIntentSchema>;
