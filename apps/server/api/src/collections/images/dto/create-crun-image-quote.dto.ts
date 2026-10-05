import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CrunQuoteCommonDto,
  crunQuoteCommonShape,
  crunQuoteEntityId,
  finalizeCrunQuoteCommon,
  refineCrunQuoteCommon,
} from '@api/services/integrations/crun/crun-quote-common.dto';
import {
  CRUN_IMAGE_MODEL_KEYS,
  type CrunImageQuoteControls,
  type CrunImageQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  MaxLength,
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

export class CreateCrunImageQuoteDto
  extends CrunQuoteCommonDto
  implements CrunImageQuoteRequest
{
  @IsString()
  @IsIn(CRUN_IMAGE_MODEL_KEYS)
  model!: string;
  @IsString() @MinLength(1) @MaxLength(20000) text!: string;
  @IsObject()
  @ValidateNested()
  @Type(() => CrunImageQuoteControlsDto)
  crunControls!: CrunImageQuoteControlsDto;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(14)
  @IsEntityId({ each: true })
  references?: string[];
}

export const crunImageQuoteIntentSchema = z
  .object({
    model: z.enum(CRUN_IMAGE_MODEL_KEYS),
    text: z.string().trim().min(1).max(20000),
    references: z
      .array(crunQuoteEntityId)
      .max(14)
      .default([])
      .refine((values) => new Set(values).size === values.length),
    ...crunQuoteCommonShape,
    crunControls: z
      .object({
        contractVersion: z.string().min(1).max(128),
        aspectRatio: z.string().optional(),
        resolution: z.enum(['1K', '2K', '4K']).optional(),
        outputFormat: z.enum(['png', 'jpg']).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    refineCrunQuoteCommon(value, ctx);
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
    ...finalizeCrunQuoteCommon(value),
  }));
export type CrunImageQuoteIntent = z.infer<typeof crunImageQuoteIntentSchema>;
