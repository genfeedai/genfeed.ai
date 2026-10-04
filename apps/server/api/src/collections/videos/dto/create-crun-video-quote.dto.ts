import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CrunQuoteCommonDto,
  crunQuoteCommonShape,
  crunQuoteEntityId,
  finalizeCrunQuoteCommon,
  refineCrunQuoteCommon,
} from '@api/services/integrations/crun/crun-quote-common.dto';
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

export class CreateCrunVideoQuoteDto
  extends CrunQuoteCommonDto
  implements CrunVideoQuoteRequest
{
  @IsString()
  @IsIn(['crun/kling/v2-5-turbo-pro', 'crun/google/veo3-1-fast-t2v'])
  model!: CrunVideoQuoteRequest['model'];
  @IsString() @MinLength(1) @MaxLength(5000) text!: string;
  @IsObject()
  @ValidateNested()
  @Type(() => CrunVideoQuoteControlsDto)
  crunControls!: CrunVideoQuoteControlsDto;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1)
  @IsEntityId({ each: true })
  references?: string[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  endFrame?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEntityId()
  parentId?: string;
}

export const crunVideoQuoteIntentSchema = z
  .object({
    model: z.enum(['crun/kling/v2-5-turbo-pro', 'crun/google/veo3-1-fast-t2v']),
    text: z.string().trim().min(1).max(5000),
    references: z
      .array(crunQuoteEntityId)
      .max(1)
      .default([])
      .refine((values) => new Set(values).size === values.length),
    endFrame: crunQuoteEntityId.optional(),
    parentId: crunQuoteEntityId.optional(),
    ...crunQuoteCommonShape,
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
    refineCrunQuoteCommon(value, ctx);
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
    ...finalizeCrunQuoteCommon(value),
  }));
export type CrunVideoQuoteIntent = z.infer<typeof crunVideoQuoteIntentSchema>;
