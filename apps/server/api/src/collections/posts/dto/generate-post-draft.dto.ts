import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { Platform, PostFormat } from '@genfeedai/contracts';
import type { PostDraftGenerationInput } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GeneratePostDraftDto implements PostDraftGenerationInput {
  @IsEntityId()
  @ApiProperty({ description: 'The selected workspace brand' })
  readonly brandId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  @ApiProperty({ description: 'What to write about' })
  readonly prompt!: string;

  @IsEnum(Platform)
  @ApiProperty({ enum: Platform, enumName: 'Platform' })
  readonly platform!: Platform;

  @IsOptional()
  @IsIn([PostFormat.STANDARD, PostFormat.LONG_FORM])
  @ApiProperty({ enum: PostFormat, enumName: 'PostFormat', required: false })
  readonly format?: PostFormat;

  @IsOptional()
  @IsIn(['approved_brand'])
  @ApiProperty({
    description:
      'Generate with the approved brand and save a receipt. Requires requestKey.',
    enum: ['approved_brand'],
    required: false,
  })
  readonly brandMode?: 'approved_brand';

  @IsOptional()
  @IsUUID('4')
  @ApiProperty({
    description: 'Idempotency key for branded generation (UUID v4)',
    required: false,
  })
  readonly requestKey?: string;
}
