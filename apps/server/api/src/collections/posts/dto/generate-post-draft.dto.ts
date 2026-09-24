import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { Platform, PostFormat } from '@genfeedai/contracts';
import type { PostDraftGenerationInput } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
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
}
